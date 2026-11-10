"""觸控面板：給副螢幕（如 Corsair Xeneon Edge 2560×720）用的本機網頁。

設計出發點：同時管五六個專案、每個專案上百個檔案時，痛點不是「搜尋」，而是
  1. 每次切換專案都要重新鑽資料夾   → 以專案為入口，點專案直接看到「最近在動的檔案」
  2. 一個專案的資料散在兩三個地方   → 專案可由多個資料夾組成，合併顯示
  3. 分不清哪個是最新版             → 同一份文件的多個版本自動收合，只顯示最新
  4. 向同事報告時要立刻叫出資料     → 「今天／本週」一點就列出這段時間動過的檔案
  5. 副螢幕上不方便打字             → 用類型、子資料夾、時間一點就篩，不必輸入

只聽 127.0.0.1，API 需要頁面內嵌的權杖；只能開啟專案資料夾內的檔案；只讀取與開啟，不搬移不刪除。
"""
from __future__ import annotations

import functools
import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ai_tasks  # noqa: E402
import pet_core as core  # noqa: E402

SKIP_DIRS = {"node_modules", "__pycache__", "appdata", "$recycle.bin", "system volume information",
             "site-packages", "venv", ".git"}
# 這些類型不直接執行，改為「顯示所在位置」
NO_LAUNCH = {".exe", ".msi", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".scr", ".com", ".reg", ".lnk",
             ".sh", ".py", ".pyw", ".jar", ".app", ".dmg", ".pkg", ".deb", ".rpm", ".appimage", ".hta"}
MAX_PER_PROJECT = 50_000
MAX_LIMIT = 2000   # 一次最多顯示幾張卡片
OLD_DIRS = {"old", "舊版", "舊檔", "舊", "備份", "backup", "bak", "archive", "歷史", "歷史版本", "history", "_old"}


# ---------------------------------------------------------------- 專案
def _norm(p) -> str | None:
    try:
        r = Path(p).expanduser().resolve()
    except OSError:
        return None
    return str(r) if r.is_dir() else None


def _skip_name(name: str) -> bool:
    low = name.lower()
    return name.startswith((".", "~$", "$")) or low in core.SKIP_NAMES or os.path.splitext(low)[1] in core.SKIP_EXT


_folder_cache: dict = {"key": None, "at": 0.0, "val": []}
_EXT = re.compile(r"\.(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{1,6}$")   # 真正的副檔名至少含一個英文字母（「圖說 1.5版」不算）


def ext_of(name: str) -> str:
    m = _EXT.search(name)
    return m.group(0)[1:].upper()[:5] if m else ""


def _folders(fresh: bool = False) -> list[str]:
    """所有候選資料夾：「專案總資料夾」底下的每個子資料夾，加上個別加入的資料夾。
    結果快取 3 秒（設定一變就失效），避免在慢速網路磁碟上每次點擊都重列目錄。"""
    cfg = core.load_config()
    key = json.dumps([cfg.get("project_roots", []), cfg.get("projects", [])], ensure_ascii=False)
    if not fresh and _folder_cache["key"] == key and time.time() - _folder_cache["at"] < 3:
        return list(_folder_cache["val"])
    out: list[str] = []
    for root in cfg.get("project_roots", []):
        r = _norm(root)
        if not r:
            continue
        try:
            with os.scandir(r) as it:
                kids = sorted(e.path for e in it if e.is_dir() and not _skip_name(e.name)
                              and e.name.lower() not in SKIP_DIRS)
        except OSError:
            continue
        out += [k for k in kids if k not in out]
    for p in cfg.get("projects", []):
        r = _norm(p)
        if r and r not in out:
            out.append(r)
    _folder_cache.update(key=key, at=time.time(), val=list(out))
    return out


class FolderOffline(Exception):
    """加入過的資料夾目前讀不到（網路磁碟斷線、外接硬碟沒接）。設定還在，不是使用者做錯了什麼。"""

    def __init__(self) -> None:
        super().__init__("目前讀不到這個資料夾（網路磁碟或外接硬碟可能沒連上）。設定都還在，接上後會自動恢復。")


def _configured(path: str) -> bool:
    """這個路徑是否位於使用者加入過的資料夾之下（不論現在讀不讀得到）。"""
    return any(path == s["path"] or path.startswith(s["path"] + os.sep) for s in sources())


def _locked(fn):
    """「讀設定 → 改 → 存」整段上鎖，同時發生的操作不會互相蓋掉。"""
    @functools.wraps(fn)
    def wrapper(*args, **kw):
        with core._LOCK:
            return fn(*args, **kw)
    return wrapper


def _clean(p) -> str:
    """設定裡的路徑：正規化但不要求它現在存在（網路磁碟可能暫時沒連上）。"""
    try:
        return str(Path(p).expanduser().resolve())
    except OSError:
        return str(p)


def sources() -> list[dict]:
    """使用者加入過的資料夾：整批（裡面每個子資料夾是一個專案）或單一專案。"""
    cfg = core.load_config()
    out = [{"path": _clean(p), "batch": True} for p in cfg.get("project_roots", [])]
    out += [{"path": _clean(p), "batch": False} for p in cfg.get("projects", [])]
    for s in out:
        s["missing"] = not os.path.isdir(s["path"])
        s["name"] = os.path.basename(s["path"]) or s["path"]
    return out


def missing_folders() -> list[str]:
    return [s["path"] for s in sources() if s["missing"]]


@_locked
def remove_source(path: str) -> None:
    """不再顯示某個加入過的資料夾。只改設定，不動檔案。"""
    cfg = core.load_config()
    keep = lambda items: [p for p in items if _clean(p) != path]  # noqa: E731
    merged = {f: into for f, into in cfg.get("merged", {}).items()
              if not (f == path or into == path or f.startswith(path + os.sep) or into.startswith(path + os.sep))}
    core.set_config(project_roots=keep(cfg.get("project_roots", [])), projects=keep(cfg.get("projects", [])), merged=merged)


def _overlap(folder: str) -> str | None:
    """若這個資料夾與已加入的資料夾重疊，回傳給使用者看的說明；沒有重疊回傳 None。"""
    for src in sources():   # 它把加過的某一列包在裡面：名稱用「已加入的資料夾」清單上那一列的
        if src["path"].startswith(folder + os.sep):
            return (f"這個資料夾裡面已經有加過的「{src['name']}」。"
                    "請先到「⋯」→「已加入的資料夾」把它移除，再加這一層。")
    for f in _folders():    # 它在某個已加入的專案裡面（或就是它）
        if folder == f or folder.startswith(f + os.sep):
            return f"這個資料夾已經包含在「{os.path.basename(f)}」裡，不需要再加一次。"
    return None


def _merged(folders: list[str]) -> dict[str, str]:
    """{資料夾: 它併入的專案}。一個專案的資料常分散在兩三個地方（本機、NAS、雲端硬碟）。"""
    raw = core.load_config().get("merged", {})
    return {f: into for f, into in raw.items() if f in folders and into in folders and into not in raw and f != into}


def projects(include_hidden: bool = False) -> list[str]:
    """專案代號 = 主資料夾路徑。已併入其他專案的資料夾不單獨列出。"""
    folders = _folders()
    merged = _merged(folders)
    out = [f for f in folders if f not in merged]
    hidden = set(core.load_config().get("hidden_projects", []))
    return out if include_hidden else [p for p in out if p not in hidden]


def folders_of(project: str) -> list[str]:
    folders = _folders()
    merged = _merged(folders)
    return [project] + [f for f in folders if merged.get(f) == project]


def _inside(path: str, folder: str) -> bool:
    return path == folder or path.startswith(folder.rstrip(os.sep) + os.sep)


def project_of(path) -> str | None:
    """這個路徑屬於哪個專案。專案資料夾本身可以是連結或捷徑；
    但檔案的真實位置也必須落在該專案的真實位置裡，避免透過連結開到專案以外的東西。"""
    p = os.path.abspath(str(path))
    folders = _folders()
    merged = _merged(folders)
    for f in folders:
        if _inside(p, f):
            try:
                if _inside(os.path.realpath(p), os.path.realpath(f)):
                    return merged.get(f, f)
            except OSError:
                pass
    return None


@_locked
def merge(folder: str, into: str) -> None:
    """把一個專案（連同它底下已併入的資料夾）併進另一個專案。只改設定，不動檔案。"""
    current = projects(include_hidden=True)
    if folder not in current or into not in current or folder == into:
        raise PermissionError("無法合併這兩個專案")
    merged = dict(core.load_config().get("merged", {}))
    for f in folders_of(folder):
        merged[f] = into
    core.set_config(merged=merged)


@_locked
def unmerge(folder: str) -> str:
    """把併入的資料夾拿掉。單獨加入的資料夾直接移除（'removed'）；
    原本就是清單上的專案則恢復成獨立專案（'split'）。都只改設定。"""
    cfg = core.load_config()
    merged = dict(cfg.get("merged", {}))
    merged.pop(folder, None)
    singles = [p for p in cfg.get("projects", []) if _clean(p) != folder]
    removed = len(singles) != len(cfg.get("projects", []))
    core.set_config(merged=merged, projects=singles)
    return "removed" if removed else "split"


def folder_info(project: str) -> list[dict]:
    cfg = core.load_config()
    singles = {_clean(p) for p in cfg.get("projects", [])}
    out = [{"path": f, "main": i == 0, "single": f in singles, "missing": not os.path.isdir(f)}
           for i, f in enumerate(folders_of(project))]
    known = {o["path"] for o in out}
    # 併入這個專案、但目前讀不到的資料夾（例如網路磁碟沒連上）也要列出來
    out += [{"path": f, "main": False, "single": True, "missing": True}
            for f, into in cfg.get("merged", {}).items() if into == project and f not in known and not os.path.isdir(f)]
    return out


@_locked
def add_folder(project: str, folder: str) -> str:
    """把任意位置的資料夾加進既有專案。"""
    if project not in projects(include_hidden=True):
        raise PermissionError("不是已加入的專案")
    p = add_project(folder, False)   # 與任何已加入的專案重疊時會被擋下並說明
    merge(p, project)
    return p


@_locked
def add_project(folder: str, as_root: bool) -> str:
    p = str(core.check_folder_allowed(Path(folder)))
    key = "project_roots" if as_root else "projects"
    cur = core.load_config().get(key, [])
    if p in [_clean(x) for x in cur]:
        return p
    hit = _overlap(p)
    if hit:
        raise core.ProtectedFolderError(hit)
    core.set_config(**{key: cur + [p]})
    return p


@_locked
def toggle(key: str, value: str, on: bool | None = None) -> bool:
    """在設定裡的清單加入或拿掉某個值（釘選、隱藏專案）。on 沒給才是「切換」。
    畫面可能已經過期（另一個視窗先按過），所以畫面一律明確說要開還是關。"""
    cur = list(core.load_config().get(key, []))
    if on is None:
        on = value not in cur
    core.set_config(**{key: [x for x in cur if x != value] + ([value] if on else [])})
    return on


def pick_folder(title: str) -> str:
    """跳出系統的資料夾選擇視窗（另開程序，避免卡住伺服器）。"""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "picked.txt"
        code = ("import sys, tkinter as tk\nfrom tkinter import filedialog\nr = tk.Tk(); r.withdraw()\n"
                "r.attributes('-topmost', True)\nd = filedialog.askdirectory(title=sys.argv[2]) or ''\n"
                "open(sys.argv[1], 'w', encoding='utf-8').write(d)\n")
        try:
            subprocess.run([sys.executable, "-c", code, str(out), title], timeout=600)
            return out.read_text("utf-8").strip()
        except (OSError, subprocess.SubprocessError):
            return ""


# ---------------------------------------------------------------- 版本收合
# 明確的版本標記：任何類型的檔案都適用
_STRONG = re.compile(r"""[\s_\-.,]*(?:
      \([1-9]\)                                            # (1)…(9)：複製或重複下載
    | (?<![a-z])v(?:er)?\.?\d+(?:\.\d+)*(?![a-z\d])        # v2 ver.3 v1.2
    | (?<![a-z])rev\.?(?:\d{1,2}|[a-z])?(?![a-z\d])        # rev rev2 revA（不會誤吃 Revit）
    | (?<![a-z])(?:final|copy|backup|bak|old|new|latest|draft)(?![a-z])
    | 最終版?|最新版?|定稿版?|修正版?|修改版?|修訂版?|更新版?|新版|舊版|備份|副本|複本|草稿|初稿|確認版?
    | 第?[一二三四五六七八九十\d]+版
    )""", re.I | re.X)
_DIGITS = re.compile(r"[\s_\-.,]*(?<!\d)(\d{4}|\d{6,8})(?!\d)")
# 只差日期的檔案：圖面、PDF、簡報、試算表視為同一系列；文件（如各次會議紀錄）與照片是各自獨立的東西，不收合
DATE_SERIES_KINDS = {"圖面與模型", "PDF", "簡報", "試算表"}


def _strip_dates(stem: str, mtime: float | None) -> str:
    """去掉看起來是日期的數字。有修改時間時，日期要與它相近才算（避免把圖號 0101、0102 當成日期）。"""
    def repl(m: re.Match) -> str:
        d = m.group(1)
        if len(d) == 4 and (m.start(1) == 0 or stem[m.start(1) - 1] not in " _-."):
            return m.group(0)
        if len(d) == 8 and d[:2] not in ("19", "20"):
            return m.group(0)
        if len(d) == 7 and d[0] != "1":
            return m.group(0)
        month, day = int(d[-4:-2]), int(d[-2:])
        if not (1 <= month <= 12 and 1 <= day <= 31):
            return m.group(0)
        if mtime is not None:
            t = time.localtime(mtime)
            gap = abs((month - t.tm_mon) * 30.4 + day - t.tm_mday)
            if min(gap, 365 - gap) > 45:
                return m.group(0)
        return ""
    return _DIGITS.sub(repl, stem)


def version_key(name: str, kind: str | None = None, mtime: float | None = None) -> str:
    """去掉檔名中的版本標記（與適用時的日期）。'平面圖_v3_1101修正.dwg' → '平面圖.dwg'"""
    stem, ext = os.path.splitext(name)
    original, prev = stem, None
    while prev != stem:
        prev = stem
        stem = _STRONG.sub("", stem)
        if kind is None or kind in DATE_SERIES_KINDS:
            stem = _strip_dates(stem, mtime)
    stem = stem.strip(" _-.,()（）")
    return ((stem or original) + ext).lower()


_VNUM = re.compile(r"(?<![a-z])v(?:er)?\.?(\d+(?:\.\d+)?)", re.I)


def version_number(name: str) -> float:
    """檔名上寫的版號（v7 → 7.0）；沒有就回傳 -1。"""
    m = _VNUM.search(os.path.splitext(name)[0])
    return float(m.group(1)) if m else -1.0


def has_version_marker(name: str) -> bool:
    return bool(_STRONG.search(os.path.splitext(name)[0]))


def _group_dir(d: str) -> str:
    """「舊版」「old」「備份」這類子資料夾裡的檔案，視為與上一層同組。"""
    while os.path.basename(d).lower() in OLD_DIRS:
        d = os.path.dirname(d)
    return d


def collapse_versions(entries: list[tuple]) -> list[tuple[tuple, list[tuple], str]]:
    """回傳 [(代表檔, [同組其他檔…], 類型)]，依代表檔的修改時間由新到舊。
    類型：version 有明確版本標記｜series 只差日期的同系列｜batch 同資料夾同一天的一批照片｜'' 單獨一個"""
    groups: dict[tuple, list[tuple]] = {}
    for e in entries:
        groups.setdefault((_group_dir(e[2]), version_key(e[1], e[5], e[3])), []).append(e)
    out, photos = [], {}
    for g in groups.values():
        g.sort(key=lambda e: (-e[3], -version_number(e[1])))  # 修改時間相同時，版號大的算新
        if len(g) > 1:
            in_old = any(os.path.basename(e[2]).lower() in OLD_DIRS for e in g)
            strong = in_old or any(has_version_marker(e[1]) for e in g)
            out.append((g[0], g[1:], "version" if strong else "series"))
        elif g[0][5] == "圖片":
            photos.setdefault((g[0][2], time.localtime(g[0][3])[:3]), []).append(g[0])
        else:
            out.append((g[0], [], ""))
    for batch in photos.values():
        batch.sort(key=lambda e: -e[3])
        if len(batch) >= 4:
            out.append((batch[0], batch[1:], "batch"))
        else:
            out += [(e, [], "") for e in batch]
    out.sort(key=lambda g: -g[0][3])
    return out


# ---------------------------------------------------------------- 索引
class Index:
    """每個資料夾一份檔案清單。entry: (小寫檔名, 檔名, 所在資料夾, 修改時間, 大小, 分類, 建立時間)

    blocking=False（面板伺服器用）時採「先給上次的結果，背景再更新」：
    慢速網路磁碟上掃一次可能要十幾秒，不能讓畫面等。"""

    def __init__(self, blocking: bool = True) -> None:
        self.data: dict[str, tuple[float, list[tuple]]] = {}
        self.meta: dict[str, dict] = {}          # 每個資料夾：讀不到的子資料夾數、是否超過上限
        self.blocking = blocking
        self.indexing = False
        self._lock = threading.Lock()            # refresh_all 同時只跑一個
        self._scanning: dict[str, threading.Lock] = {}
        self._guard = threading.Lock()

    @staticmethod
    def _walk(top: str) -> tuple[list[tuple], dict]:
        out, stack, denied, now = [], [top], 0, time.time()
        while stack and len(out) < MAX_PER_PROJECT:
            d = stack.pop()
            try:
                with os.scandir(d) as it:
                    for e in it:
                        name = e.name
                        if _skip_name(name):
                            continue
                        try:
                            if e.is_dir(follow_symlinks=False):
                                if name.lower() not in SKIP_DIRS:
                                    stack.append(e.path)
                            elif e.is_file(follow_symlinks=False):
                                st = e.stat()
                                born = getattr(st, "st_birthtime", None) or (st.st_ctime if sys.platform == "win32" else 0)
                                mtime = st.st_mtime
                                if not 0 < mtime <= now + 86400:   # 時鐘錯誤造成的未來或遠古時間：標成「日期異常」
                                    mtime = 0.0
                                out.append((name.lower(), name, d, mtime, st.st_size,
                                            core.category_of(Path(name)), born))
                        except OSError:
                            continue
            except OSError:
                denied += 1
        return out, {"denied": denied, "truncated": bool(stack)}

    def _lock_for(self, folder: str) -> threading.Lock:
        with self._guard:
            return self._scanning.setdefault(folder, threading.Lock())

    def is_scanning(self, folder: str) -> bool:
        return self._lock_for(folder).locked()

    def _scan(self, folder: str) -> list[tuple]:
        """掃描一個資料夾。同一個資料夾同時只跑一趟；後到的等前一趟的結果。"""
        lock = self._lock_for(folder)
        if not lock.acquire(blocking=False):
            with lock:
                pass
            return self.data.get(folder, (0, []))[1]
        try:
            rows, meta = self._walk(folder)
            self.data[folder], self.meta[folder] = (time.time(), rows), meta
            return rows
        finally:
            lock.release()

    def entries(self, folder: str, max_age: float = 20) -> list[tuple]:
        """取得資料夾檔案清單。超過 max_age 秒就重新掃描：
        blocking 時等它掃完；否則先回傳上次的結果，並在背景更新。"""
        cached = self.data.get(folder)
        if cached and time.time() - cached[0] < max_age:
            return cached[1]
        if self.blocking or max_age == 0:
            return self._scan(folder)
        if not self.is_scanning(folder):
            threading.Thread(target=self._scan, args=(folder,), daemon=True).start()
        return cached[1] if cached else []

    def refresh_all(self) -> None:
        if not self._lock.acquire(blocking=False):
            return
        self.indexing = True
        try:
            _folders(fresh=True)
            current = [f for p in projects() for f in folders_of(p)]
            for f in current:
                self.entries(f, max_age=0)
            for gone in set(self.data) - set(current):
                self.data.pop(gone, None)
                self.meta.pop(gone, None)
        finally:
            self.indexing = False
            self._lock.release()

    def _scope(self, project: str, fresh: bool) -> list[tuple[str, tuple]]:
        """專案內所有檔案：[(顯示用相對路徑, entry)]。主資料夾以外的檔案，路徑以該資料夾名稱開頭。"""
        folders = folders_of(project)
        out = []
        for root in folders:
            rows = self.entries(root) if fresh else self.data.get(root, (0, []))[1]
            label = os.path.basename(root) if root != project else ""
            n = len(root) + 1
            for e in rows:
                rel = e[2][n:]
                out.append((os.path.join(label, rel) if label and rel else label or rel, e))
        return out

    # -------- 查詢
    def project_list(self) -> list[dict]:
        """順序固定：近兩週有動的在上、其餘在下，各自依名稱排序，讓每個專案的位置不會天天變。"""
        midnight = _midnight()
        out = []
        for p in projects():
            rows = [e for _, e in self._scope(p, fresh=False)]
            last = max((e[3] for e in rows), default=0)
            out.append({"path": p, "name": os.path.basename(p) or p, "folders": len(folders_of(p)),
                        "count": len(rows), "today": any(e[3] >= midnight for e in rows),
                        "active": last >= midnight - 14 * 86400, "last": last})
        out.sort(key=lambda d: (not d["active"], d["name"].lower()))
        return out

    def files(self, project: str = "", kind: str = "", sub: str = "", q: str = "",
              since: str = "", limit: int = 120) -> dict:
        cfg = core.load_config()
        opened, pinned = cfg.get("opened", {}), set(cfg.get("pinned", []))
        if project:
            if project not in projects(include_hidden=True):
                if _configured(project):
                    raise FolderOffline()
                raise PermissionError("不是已加入的專案")
            if not os.path.isdir(project):
                raise FolderOffline()
            watched = folders_of(project)
            # 先記下「這次拿到的是不是舊的」，再去取清單：背景掃描可能在這一瞬間剛好做完
            behind = not self.blocking and any(f not in self.data or time.time() - self.data[f][0] >= 20 for f in watched)
            scope = [(project, rel, e) for rel, e in self._scope(project, fresh=True)]
        else:
            watched = [f for p in projects() for f in folders_of(p)]
            behind = any(f not in self.data for f in watched)
            scope = [(p, rel, e) for p in projects() for rel, e in self._scope(p, fresh=False)]

        subs: dict[str, int] = {}
        if project:  # 目前所在層的下一層子資料夾（最上層時，併入的其他資料夾各算一個）
            if sub:
                scope = [x for x in scope if x[1] == sub or x[1].startswith(sub + os.sep)]
            skip = len(sub) + 1 if sub else 0
        terms = q.lower().split()
        if terms:
            scope = [x for x in scope if all(t in x[2][0] or t in x[1].lower() for t in terms)]

        # 先收合再篩選：畫面上的數字一律是「卡片數」，與看到的一致
        info = {id(x[2]): x for x in scope}
        groups = collapse_versions([x[2] for x in scope])
        if project:  # 子資料夾旁的數字也用卡片數，與類型鈕、清單一致
            for g in groups:
                key = info[id(g[0])][1][skip:].split(os.sep)[0]
                if key:
                    name = os.path.join(sub, key) if sub else key
                    subs[name] = subs.get(name, 0) + 1
        midnight = _midnight()
        monday = midnight - time.localtime().tm_wday * 86400
        ranges = {"today": (midnight, float("inf")), "week": (monday, float("inf")),
                  "lastweek": (monday - 7 * 86400, monday)}
        def within(g, lo, hi):  # 組內任一版本落在期間內就算（上週改過、這週又改的檔案，上週也要看得到）
            return [e for e in (g[0], *g[1]) if lo <= e[3] < hi]
        times = {k: sum(bool(within(g, lo, hi)) for g in groups) for k, (lo, hi) in ranges.items()}
        later: dict[int, int] = {}
        if since in ranges:
            lo, hi = ranges[since]
            picked = []
            for g in groups:
                hit = within(g, lo, hi)
                if hit:  # 以期間內最新的那一版當代表，並記下之後還有幾個更新的版本
                    members = [g[0], *g[1]]
                    later[id(hit[0])] = members.index(hit[0])
                    picked.append((hit[0], [e for e in members if e is not hit[0]], g[2]))
            groups = sorted(picked, key=lambda g: -g[0][3])
        kinds: dict[str, int] = {}
        for g in groups:
            kinds[g[0][5]] = kinds.get(g[0][5], 0) + 1
        if kind:
            groups = [g for g in groups if g[0][5] == kind]
        new_from = ranges.get(since, (monday - 7 * 86400, 0))[0]

        def card(e: tuple) -> dict:
            p, rel, _ = info[id(e)]
            return {"name": e[1], "path": os.path.join(e[2], e[1]), "rel": rel, "project": os.path.basename(p),
                    "mtime": e[3], "size": e[4], "kind": e[5], "frequent": False, "new": e[6] >= new_from,
                    "pinned": os.path.join(e[2], e[1]) in pinned,
                    "ext": ext_of(e[1])}

        rows = []
        plain = not (kind or since or terms or sub)
        # 釘選的檔案只要符合目前的篩選，就固定在最上面（即使它很舊、排在第一頁之外）
        # 被釘選的若是某份文件的較舊版本，另外給它一張自己的卡片
        lo, hi = ranges.get(since, (0, float("inf")))
        older_pins = [(o, [], "") for g in groups for o in g[1]
                      if os.path.join(o[2], o[1]) in pinned and lo <= o[3] < hi]
        old_ids = {id(g[0]) for g in older_pins}
        groups = older_pins + [g for g in groups if os.path.join(g[0][2], g[0][1]) in pinned] + \
                 [g for g in groups if os.path.join(g[0][2], g[0][1]) not in pinned]
        for head, others, gtype in groups[:limit]:
            d = card(head)
            d.update(group=gtype, versions=[card(o) for o in others[:60]], more=max(0, len(others) - 60),
                     later=later.get(id(head), 0), oldpin=id(head) in old_ids,
                     # 版號與時間矛盾的提醒只放在「真正最新」的那張卡上（時間篩選下的舊版卡不重複提醒）
                     check=gtype == "version" and not later.get(id(head), 0)
                     and 0 <= version_number(head[1]) < max(version_number(o[1]) for o in others))
            rows.append(d)
        if plain:  # 沒有篩選時，釘選之後接「常用」（開過兩次以上，最多 4 個），其餘依時間
            often = sorted((d for d in rows if not d["pinned"] and opened.get(d["path"], 0) >= 2),
                           key=lambda d: -opened[d["path"]])[:4]
            for d in often:
                d["frequent"] = True
            rows.sort(key=lambda d: (0, 0) if d["pinned"] else (1, -opened[d["path"]]) if d["frequent"] else (2, 0))
        return {"files": rows, "total": len(groups), "kinds": kinds, "times": times,
                "new": sum(g[0][6] >= new_from for g in groups),
                "subs": sorted(({"name": k, "count": v} for k, v in subs.items() if k), key=lambda s: s["name"]),
                "projects": len(projects()), "missing": missing_folders(), "indexing": self.indexing,
                # 還在讀第一次的清單、或背景正在更新：畫面會自己再問一次
                "scanning": behind or any(self.is_scanning(f) for f in watched),
                "denied": sum(self.meta.get(f, {}).get("denied", 0) for f in watched),
                "truncated": any(self.meta.get(f, {}).get("truncated") for f in watched),
                "capped": limit >= MAX_LIMIT and len(groups) > limit}


def _midnight() -> float:
    return time.mktime(time.localtime()[:3] + (0, 0, 0, 0, 0, -1))


def open_file(path: str, reveal: bool = False) -> str:
    """開啟檔案或在檔案總管顯示位置。回傳實際做的事：'opened' 或 'revealed'。"""
    p = Path(os.path.abspath(str(path)))   # 不解析連結：專案資料夾本身可以是連結
    owner = project_of(p)
    if not owner:
        if _configured(str(p)):   # 專案加過，只是資料夾現在讀不到
            raise FolderOffline()
        raise PermissionError("這個檔案不在已加入的專案資料夾裡")
    if not p.exists():
        if not all(os.path.isdir(f) for f in folders_of(owner) if _inside(str(p), f)):
            raise FolderOffline()
        raise FileNotFoundError("這個檔案已被移走或刪除")
    program = p.is_file() and p.suffix.lower() in NO_LAUNCH and not reveal
    if program:
        reveal = True
    if reveal:
        if sys.platform == "win32":
            subprocess.Popen(["explorer", "/select,", str(p)] if p.is_file() else ["explorer", str(p)])
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-R", str(p)])
        else:
            subprocess.Popen(["xdg-open", str(p if p.is_dir() else p.parent)])
        return "program" if program else "revealed"
    if sys.platform == "win32":
        os.startfile(str(p))  # type: ignore[attr-defined]
    else:
        subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", str(p)])
    with core._LOCK:
        counts = dict(core.load_config().get("opened", {}))
        counts[str(p)] = counts.get(str(p), 0) + 1
        core.set_config(opened=dict(sorted(counts.items(), key=lambda kv: -kv[1])[:300]))
    return "opened"


# ---------------------------------------------------------------- HTTP 伺服器
class Handler(BaseHTTPRequestHandler):
    index: Index
    token: str
    picker = staticmethod(pick_folder)

    def log_message(self, *a) -> None:
        pass

    def _send(self, code: int, body, ctype: str = "application/json") -> None:
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _guard(self, api: bool) -> bool:
        port = self.server.server_address[1]
        if self.headers.get("Host") not in (f"127.0.0.1:{port}", f"localhost:{port}"):
            self._send(403, {"error": "bad host"})  # 擋 DNS rebinding
            return False
        if api and not secrets.compare_digest(self.headers.get("X-Token", ""), self.token):
            self._send(403, {"error": "bad token"})
            return False
        return True

    def do_GET(self) -> None:
        url = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(url.query).items()}
        if url.path == "/":
            if self._guard(False):
                html = Path(__file__).with_name("panel.html").read_text("utf-8")
                self._send(200, html.replace("__TOKEN__", self.token).encode(), "text/html")
            return
        if not self._guard(True):
            return
        try:
            if url.path == "/api/ping":
                self._send(200, {"ok": True})
            elif url.path == "/api/projects":
                shown = set(projects())
                hidden = [{"path": p, "name": os.path.basename(p)} for p in projects(include_hidden=True) if p not in shown]
                self._send(200, {"projects": self.index.project_list(), "hidden": hidden,
                                 "missing": missing_folders(), "indexing": self.index.indexing,
                                 "notice": core.config_problem})
            elif url.path == "/api/sources":
                self._send(200, {"sources": sources()})
            elif url.path == "/api/files":
                try:
                    limit = min(max(int(q.get("limit") or 120), 1), MAX_LIMIT)
                except ValueError:
                    limit = 120
                self._send(200, self.index.files(q.get("project", ""), q.get("kind", ""),
                                                 q.get("sub", ""), q.get("q", "")[:200], q.get("since", ""), limit))
            elif url.path == "/api/folders":
                if q.get("project") not in projects(include_hidden=True):
                    raise PermissionError("不是已加入的專案")
                self._send(200, {"folders": folder_info(q["project"])})
            elif url.path == "/api/tasks":
                try:
                    self._send(200, ai_tasks.all_tasks())
                except Exception:   # AI 進度讀不到，不該拖垮找檔案的功能
                    self._send(200, {"tasks": [], "counts": {}, "github_configured": True,
                                     "error": "暫時讀不到 AI 助手的進度，稍後會自動再試。"})
            else:
                self._send(404, {"error": "not found"})
        except FolderOffline as e:
            self._send(409, {"error": str(e), "offline": True})
        except (PermissionError, FileNotFoundError) as e:
            self._send(400, {"error": str(e)})
        except Exception:   # 任何沒料到的狀況都回一句人話，不讓連線中斷
            self._send(500, {"error": "暫時讀不到，請再試一次。"})

    def do_POST(self) -> None:
        if not self._guard(True):
            return
        try:
            body = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length") or 0), 1 << 20)) or b"{}")
            if not isinstance(body, dict) or any(k in body and not isinstance(body[k], str)
                                                 for k in ("path", "into", "folder", "project", "url")):
                raise ValueError("格式不對")
            path = self.path
            if path == "/api/open":
                try:
                    self._send(200, {"did": open_file(body["path"], bool(body.get("reveal")))})
                except FileNotFoundError:   # 檔案被移走了：讓下一次查詢重新掃描，清單才不會留著它
                    self.index.data = {k: (0, rows) for k, (_, rows) in self.index.data.items()}
                    raise
            elif path == "/api/pin":
                if not project_of(body["path"]):
                    raise PermissionError("不在專案資料夾範圍內")
                self._send(200, {"on": toggle("pinned", body["path"], body.get("on"))})
            elif path == "/api/hide_project":
                if body["path"] not in projects(include_hidden=True):
                    raise PermissionError("不是已加入的專案")
                self._send(200, {"on": toggle("hidden_projects", body["path"], body.get("on"))})
            elif path == "/api/add_project":
                as_root = bool(body.get("as_root"))
                folder = self.picker("加入一整批專案：請選總資料夾（裡面每個子資料夾是一個專案）" if as_root
                                     else "加入一個專案：請選那個專案的資料夾")
                if folder:
                    add_project(folder, as_root)
                    self.index.refresh_all()
                self._send(200, {"added": bool(folder)})
            elif path == "/api/merge":
                merge(body["path"], body["into"])
                self.index.refresh_all()
                self._send(200, {"ok": True})
            elif path == "/api/unmerge":
                did = unmerge(body["folder"])
                self.index.refresh_all()
                self._send(200, {"did": did})
            elif path == "/api/remove_source":
                if body["path"] not in [s["path"] for s in sources()]:
                    raise PermissionError("不是加入過的資料夾")
                remove_source(body["path"])
                self.index.refresh_all()
                self._send(200, {"ok": True})
            elif path == "/api/add_folder":
                folder = self.picker("選擇要加進這個專案的資料夾")
                if folder:
                    add_folder(body["project"], folder)
                    self.index.refresh_all()
                self._send(200, {"added": bool(folder)})
            elif path == "/api/open_url":
                if not str(body.get("url", "")).startswith("https://github.com/"):
                    raise PermissionError("只允許開啟 GitHub 連結")
                webbrowser.open(body["url"])
                self._send(200, {"ok": True})
            elif path == "/api/reindex":
                threading.Thread(target=self.index.refresh_all, daemon=True).start()
                self._send(200, {"ok": True})
            else:
                self._send(404, {"error": "not found"})
        except FolderOffline as e:
            self._send(409, {"error": str(e), "offline": True})
        except (PermissionError, FileNotFoundError, core.ProtectedFolderError) as e:
            self._send(400, {"error": str(e)})
        except (KeyError, ValueError, TypeError):
            self._send(400, {"error": "這個操作的內容不完整，請再試一次。"})
        except Exception:
            self._send(500, {"error": "沒有成功，請再試一次。"})


def make_server(port: int = 0) -> ThreadingHTTPServer:
    index = Index(blocking=False)   # 先顯示上次的清單，背景再更新
    handler = type("PanelHandler", (Handler,), {"index": index, "token": secrets.token_urlsafe(24)})
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    server.daemon_threads = True

    def keep_fresh():
        while True:
            index.refresh_all()
            time.sleep(max(1, core.config_int("reindex_minutes", 5)) * 60)
    threading.Thread(target=keep_fresh, daemon=True).start()
    return server


def panel_url() -> str:
    return f"http://127.0.0.1:{core.config_int('panel_port', 8765)}/"


def start_in_background() -> bool:
    """在背景執行緒啟動伺服器。若連接埠已被佔用（面板已在執行）回傳 False。"""
    try:
        server = make_server(core.config_int("panel_port", 8765))
    except OSError:
        return False
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return True


def launch_browser(url: str | None = None) -> None:
    """優先用 Edge／Chrome 的 app 模式（無網址列）；找不到就用預設瀏覽器。"""
    url = url or panel_url()
    cfg = core.load_config()
    candidates = []
    if sys.platform == "win32":
        for base in (os.environ.get("PROGRAMFILES(X86)"), os.environ.get("PROGRAMFILES"), os.environ.get("LOCALAPPDATA")):
            if base:
                candidates += [Path(base) / "Microsoft/Edge/Application/msedge.exe",
                               Path(base) / "Google/Chrome/Application/chrome.exe"]
    elif sys.platform == "darwin":
        candidates = [Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
                      Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge")]
    for exe in candidates:
        if exe.exists():
            args = [str(exe), f"--app={url}", f"--user-data-dir={core.data_dir() / 'browser'}", "--no-first-run"]
            pos = cfg.get("panel_position")  # 例如 [0, 1080]：副螢幕左上角的桌面座標
            if isinstance(pos, list) and len(pos) == 2:
                args += [f"--window-position={int(pos[0])},{int(pos[1])}", "--start-fullscreen"]
            try:
                subprocess.Popen(args)
                return
            except OSError:
                continue
    webbrowser.open(url)


def main() -> None:
    if not start_in_background():  # 已經在執行：直接開視窗
        launch_browser()
        return
    if "--no-browser" not in sys.argv:
        launch_browser()
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
