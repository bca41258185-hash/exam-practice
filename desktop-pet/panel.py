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


def _folders() -> list[str]:
    """所有候選資料夾：「專案總資料夾」底下的每個子資料夾，加上個別加入的資料夾。"""
    cfg = core.load_config()
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
    return out


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


def project_of(path) -> str | None:
    try:
        p = Path(path).resolve()
    except OSError:
        return None
    folders = _folders()
    merged = _merged(folders)
    for f in folders:
        fp = Path(f)
        if p == fp or fp in p.parents:
            return merged.get(f, f)
    return None


def merge(folder: str, into: str) -> None:
    """把一個專案（連同它底下已併入的資料夾）併進另一個專案。只改設定，不動檔案。"""
    current = projects(include_hidden=True)
    if folder not in current or into not in current or folder == into:
        raise PermissionError("無法合併這兩個專案")
    merged = dict(core.load_config().get("merged", {}))
    for f in folders_of(folder):
        merged[f] = into
    core.set_config(merged=merged)


def unmerge(folder: str) -> None:
    merged = dict(core.load_config().get("merged", {}))
    merged.pop(folder, None)
    core.set_config(merged=merged)


def add_folder(project: str, folder: str) -> str:
    """把任意位置的資料夾加進既有專案。"""
    if project not in projects(include_hidden=True):
        raise PermissionError("不是已加入的專案")
    p = add_project(folder, False)
    if p == project or p in folders_of(project):
        return p
    if p not in projects(include_hidden=True):
        raise PermissionError("這個資料夾已經屬於另一個專案，請先拆出")
    merge(p, project)
    return p


def add_project(folder: str, as_root: bool) -> str:
    p = str(core.check_folder_allowed(Path(folder)))
    key = "project_roots" if as_root else "projects"
    cur = core.load_config().get(key, [])
    if p not in cur:
        core.set_config(**{key: cur + [p]})
    return p


def toggle(key: str, value: str) -> bool:
    """在設定裡的清單切換某個值（釘選／隱藏）。回傳切換後是否存在。"""
    cur = list(core.load_config().get(key, []))
    on = value not in cur
    core.set_config(**{key: cur + [value] if on else [x for x in cur if x != value]})
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
_VERSION = re.compile(r"""[\s_\-.,]*(?:
      \(\d+\)                                             # (1) (2)
    | (?<![a-z])v(?:er)?\.?\d+(?:\.\d+)*(?![a-z\d])        # v2 ver.3 v1.2
    | (?<![a-z])rev\.?[a-z\d]{0,2}(?![a-z\d])              # rev revA rev2
    | (?<![a-z\d])r\d{1,2}(?![a-z\d])                      # R1
    | (?<!\d)(?:19|20)\d{6}(?!\d)                          # 20261101
    | (?<!\d)1\d{6}(?!\d)                                  # 民國 1151101
    | (?<!\d)\d{6}(?!\d)                                   # 261101
    | (?<=[\s_\-.])(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?!\d)   # _1101
    | (?<![a-z])(?:final|copy|backup|bak|old|new|latest|draft)(?![a-z])
    | 最終版?|最新版?|定稿版?|修正版?|修改版?|修訂版?|更新版?|新版|舊版|備份|副本|複本|草稿|初稿|確認版?
    | 第?[一二三四五六七八九十\d]+版
    )""", re.I | re.X)


def version_key(name: str) -> str:
    """去掉檔名中的版本、日期、「最終版」等標記。'平面圖_v3_1101修正.dwg' → '平面圖.dwg'"""
    stem, ext = os.path.splitext(name)
    prev = None
    while prev != stem:
        prev, stem = stem, _VERSION.sub("", stem)
    stem = stem.strip(" _-.,()（）")
    return ((stem or os.path.splitext(name)[0]) + ext).lower()


def _group_dir(d: str) -> str:
    """「舊版」「old」「備份」這類子資料夾裡的檔案，視為與上一層同組。"""
    while os.path.basename(d).lower() in OLD_DIRS:
        d = os.path.dirname(d)
    return d


def collapse_versions(entries: list[tuple]) -> list[tuple[tuple, list[tuple]]]:
    """回傳 [(最新版, [較舊版本…])]，依最新版的修改時間由新到舊。"""
    groups: dict[tuple, list[tuple]] = {}
    for e in entries:
        groups.setdefault((_group_dir(e[2]), version_key(e[1])), []).append(e)
    out = []
    for g in groups.values():
        g.sort(key=lambda e: -e[3])
        out.append((g[0], g[1:]))
    out.sort(key=lambda g: -g[0][3])
    return out


# ---------------------------------------------------------------- 索引
class Index:
    """每個資料夾一份檔案清單。entry: (小寫檔名, 檔名, 所在資料夾, 修改時間, 大小, 分類, 建立時間)"""

    def __init__(self) -> None:
        self.data: dict[str, tuple[float, list[tuple]]] = {}
        self.indexing = False
        self._lock = threading.Lock()

    @staticmethod
    def _walk(top: str) -> list[tuple]:
        out, stack = [], [top]
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
                                out.append((name.lower(), name, d, st.st_mtime, st.st_size,
                                            core.category_of(Path(name)), born))
                        except OSError:
                            continue
            except OSError:
                continue
        return out

    def entries(self, folder: str, max_age: float = 20) -> list[tuple]:
        """取得資料夾檔案清單；超過 max_age 秒就重新掃描，所以點進專案看到的一定是新的。"""
        cached = self.data.get(folder)
        if cached and time.time() - cached[0] < max_age:
            return cached[1]
        rows = self._walk(folder)
        self.data[folder] = (time.time(), rows)
        return rows

    def refresh_all(self) -> None:
        if not self._lock.acquire(blocking=False):
            return
        self.indexing = True
        try:
            current = [f for p in projects() for f in folders_of(p)]
            for f in current:
                self.entries(f, max_age=0)
            for gone in set(self.data) - set(current):
                self.data.pop(gone, None)
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
        starred = set(core.load_config().get("starred_projects", []))
        midnight = _midnight()
        out = []
        for p in projects():
            rows = [e for _, e in self._scope(p, fresh=False)]
            out.append({"path": p, "name": os.path.basename(p) or p, "starred": p in starred,
                        "folders": len(folders_of(p)), "count": len(rows),
                        "today": sum(e[3] >= midnight for e in rows),
                        "week": sum(e[3] >= midnight - 6 * 86400 for e in rows),
                        "last": max((e[3] for e in rows), default=0)})
        out.sort(key=lambda d: (not d["starred"], -d["last"]))
        return out

    def files(self, project: str = "", kind: str = "", sub: str = "", q: str = "",
              since: str = "", limit: int = 150) -> dict:
        starred = set(core.load_config().get("starred_files", []))
        if project:
            if project not in projects(include_hidden=True):
                raise PermissionError("不是已加入的專案")
            scope = [(project, rel, e) for rel, e in self._scope(project, fresh=True)]
            extra = {os.path.basename(f) for f in folders_of(project)[1:]}
        else:
            scope = [(p, rel, e) for p in projects() for rel, e in self._scope(p, fresh=False)]
            extra = None

        subs: dict[str, int] = {}
        if extra is not None:
            for _, rel, _e in scope:
                parts = rel.split(os.sep)
                key = os.sep.join(parts[:2 if parts[0] in extra else 1])
                subs[key] = subs.get(key, 0) + 1
            if sub:
                scope = [x for x in scope if x[1] == sub or x[1].startswith(sub + os.sep)]
        terms = q.lower().split()
        if terms:
            scope = [x for x in scope if all(t in x[2][0] or t in x[1].lower() for t in terms)]

        midnight = _midnight()
        cut = {"today": midnight, "week": midnight - 6 * 86400}
        times = {k: sum(x[2][3] >= v for x in scope) for k, v in cut.items()}
        kinds: dict[str, int] = {}
        for x in scope:
            if since not in cut or x[2][3] >= cut[since]:
                kinds[x[2][5]] = kinds.get(x[2][5], 0) + 1
        if kind:
            scope = [x for x in scope if x[2][5] == kind]

        info = {id(x[2]): x for x in scope}
        groups = collapse_versions([x[2] for x in scope])
        if since in cut:  # 先收合再篩時間，報告時仍看得到「這是第幾版」
            groups = [g for g in groups if g[0][3] >= cut[since]]

        def card(e: tuple) -> dict:
            p, rel, _ = info[id(e)]
            path = os.path.join(e[2], e[1])
            return {"name": e[1], "path": path, "rel": rel, "project": os.path.basename(p), "mtime": e[3],
                    "size": e[4], "kind": e[5], "starred": path in starred, "new": e[6] >= cut["week"],
                    "ext": os.path.splitext(e[1])[1][1:].upper()[:5]}

        rows = []
        for head, older in groups[:limit]:
            d = card(head)
            d["versions"] = [card(o) for o in older[:20]]
            rows.append(d)
        rows.sort(key=lambda d: not d["starred"])  # 釘選的排最前，其餘維持時間順序
        return {"files": rows, "total": len(groups), "kinds": kinds, "times": times,
                "subs": sorted(({"name": k, "count": v} for k, v in subs.items() if k), key=lambda s: s["name"]),
                "indexing": self.indexing}


def _midnight() -> float:
    return time.mktime(time.localtime()[:3] + (0, 0, 0, 0, 0, -1))


def open_file(path: str, reveal: bool = False) -> str:
    """開啟檔案或在檔案總管顯示位置。回傳實際做的事：'opened' 或 'revealed'。"""
    p = Path(path).resolve()
    if not p.exists() or not project_of(p):
        raise PermissionError("檔案不存在，或不在專案資料夾範圍內")
    if p.is_file() and p.suffix.lower() in NO_LAUNCH:
        reveal = True
    if reveal:
        if sys.platform == "win32":
            subprocess.Popen(["explorer", "/select,", str(p)] if p.is_file() else ["explorer", str(p)])
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-R", str(p)])
        else:
            subprocess.Popen(["xdg-open", str(p if p.is_dir() else p.parent)])
        return "revealed"
    if sys.platform == "win32":
        os.startfile(str(p))  # type: ignore[attr-defined]
    else:
        subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", str(p)])
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
            if url.path == "/api/projects":
                hidden = len(projects(include_hidden=True)) - len(projects())
                self._send(200, {"projects": self.index.project_list(), "hidden": hidden,
                                 "indexing": self.index.indexing})
            elif url.path == "/api/files":
                self._send(200, self.index.files(q.get("project", ""), q.get("kind", ""),
                                                 q.get("sub", ""), q.get("q", ""), q.get("since", "")))
            elif url.path == "/api/folders":
                if q.get("project") not in projects(include_hidden=True):
                    raise PermissionError("不是已加入的專案")
                self._send(200, {"folders": folders_of(q["project"])})
            elif url.path == "/api/tasks":
                self._send(200, ai_tasks.all_tasks())
            else:
                self._send(404, {"error": "not found"})
        except (PermissionError, FileNotFoundError) as e:
            self._send(400, {"error": str(e)})
        except OSError as e:
            self._send(500, {"error": str(e)})

    def do_POST(self) -> None:
        if not self._guard(True):
            return
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
            path = self.path
            if path == "/api/open":
                self._send(200, {"did": open_file(body["path"], bool(body.get("reveal")))})
            elif path == "/api/star_file":
                if not project_of(body["path"]):
                    raise PermissionError("不在專案資料夾範圍內")
                self._send(200, {"on": toggle("starred_files", body["path"])})
            elif path in ("/api/star_project", "/api/hide_project"):
                if body["path"] not in projects(include_hidden=True):
                    raise PermissionError("不是已加入的專案")
                key = "starred_projects" if path == "/api/star_project" else "hidden_projects"
                self._send(200, {"on": toggle(key, body["path"])})
            elif path == "/api/unhide_all":
                core.set_config(hidden_projects=[])
                self._send(200, {"ok": True})
            elif path == "/api/add_project":
                as_root = bool(body.get("as_root"))
                folder = self.picker("選擇「專案總資料夾」（裡面每個子資料夾是一個專案）" if as_root
                                     else "選擇一個專案資料夾")
                if folder:
                    add_project(folder, as_root)
                    self.index.refresh_all()
                self._send(200, {"added": bool(folder)})
            elif path == "/api/merge":
                merge(body["path"], body["into"])
                self.index.refresh_all()
                self._send(200, {"ok": True})
            elif path == "/api/unmerge":
                unmerge(body["folder"])
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
        except (PermissionError, FileNotFoundError, KeyError, ValueError, core.ProtectedFolderError) as e:
            self._send(400, {"error": str(e)})
        except OSError as e:
            self._send(500, {"error": str(e)})


def make_server(port: int = 0) -> ThreadingHTTPServer:
    index = Index()
    handler = type("PanelHandler", (Handler,), {"index": index, "token": secrets.token_urlsafe(24)})
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    server.daemon_threads = True

    def keep_fresh():
        while True:
            index.refresh_all()
            time.sleep(int(core.load_config().get("reindex_minutes", 5)) * 60)
    threading.Thread(target=keep_fresh, daemon=True).start()
    return server


def panel_url() -> str:
    return f"http://127.0.0.1:{int(core.load_config().get('panel_port', 8765))}/"


def start_in_background() -> bool:
    """在背景執行緒啟動伺服器。若連接埠已被佔用（面板已在執行）回傳 False。"""
    try:
        server = make_server(int(core.load_config().get("panel_port", 8765)))
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
