"""桌面寵物的檔案管理核心（不含介面，可獨立測試）。

安全原則：
  1. 永不刪除、永不覆蓋：一切動作都是「搬移」，同名時自動加 (1)、(2)…
  2. 先規劃再執行：plan_* 只回傳清單，execute() 才真的動檔案。
  3. 每次執行都寫入紀錄，可用 undo_last() 還原。
  4. 拒絕整理系統資料夾、磁碟根目錄與使用者主目錄本身。
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import stat
import sys
import time
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

CATEGORIES: dict[str, set[str]] = {
    "圖面與模型": {
        ".dwg", ".dxf", ".dwt", ".dgn", ".rvt", ".rfa", ".rte", ".ifc", ".skp",
        ".3dm", ".pln", ".max", ".blend", ".fbx", ".obj", ".stl", ".3ds", ".gh",
        ".ctb", ".stb", ".layout",
    },
    "圖片": {
        ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tif", ".tiff", ".webp",
        ".heic", ".svg", ".psd", ".ai", ".eps", ".raw", ".cr2", ".nef", ".hdr",
        ".exr", ".ico",
    },
    "文件": {".pdf", ".doc", ".docx", ".txt", ".rtf", ".odt", ".md", ".pages", ".epub"},
    "試算表": {".xls", ".xlsx", ".xlsm", ".csv", ".ods", ".numbers"},
    "簡報": {".ppt", ".pptx", ".key", ".odp", ".indd"},
    "影音": {
        ".mp4", ".mov", ".avi", ".mkv", ".wmv", ".webm", ".m4v",
        ".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg",
    },
    "壓縮檔": {".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".iso"},
    "安裝檔": {".exe", ".msi", ".dmg", ".pkg", ".deb", ".rpm", ".appimage", ".apk"},
    "程式與資料": {
        ".py", ".js", ".ts", ".html", ".htm", ".css", ".json", ".xml", ".yml",
        ".yaml", ".sql", ".sh", ".bat", ".ps1", ".c", ".cpp", ".h", ".java",
        ".cs", ".go", ".rs", ".ipynb", ".lsp",
    },
}
OTHER = "其他"
QUARANTINE = "_重複檔案_待確認"

# 不該被搬動的檔案：捷徑、下載中、暫存檔、鎖定檔、系統檔
SKIP_EXT = {
    ".lnk", ".url", ".crdownload", ".part", ".partial", ".download", ".tmp",
    ".dwl", ".dwl2", ".ini", ".sys", ".lock",
}
SKIP_NAMES = {"thumbs.db", "desktop.ini", ".ds_store"}

_EXT_TO_CAT = {ext: cat for cat, exts in CATEGORIES.items() for ext in exts}


@dataclass(frozen=True)
class Move:
    src: Path
    dst: Path
    category: str = ""


class ProtectedFolderError(Exception):
    """該資料夾不允許自動整理。"""


# ---------------------------------------------------------------- 基本工具
def data_dir() -> Path:
    d = Path(os.environ.get("DESKTOP_PET_HOME") or Path.home() / ".desktop_pet")
    d.mkdir(parents=True, exist_ok=True)
    return d


def load_config() -> dict:
    cfg = {"watch_folder": str(default_watch_folder()), "watch_threshold": 10, "walk": True}
    try:
        cfg.update(json.loads((data_dir() / "config.json").read_text("utf-8")))
    except (OSError, ValueError):
        pass
    return cfg


def save_config(cfg: dict) -> None:
    _write_json(data_dir() / "config.json", cfg)


def set_config(**changes) -> dict:
    """重新讀檔後只改指定欄位再存回，避免寵物與面板互相蓋掉對方的設定。"""
    cfg = load_config()
    cfg.update(changes)
    save_config(cfg)
    return cfg


def default_watch_folder() -> Path:
    d = Path.home() / "Downloads"
    return d if d.is_dir() else Path.home()


def human_size(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def category_of(path: Path) -> str:
    return _EXT_TO_CAT.get(path.suffix.lower(), OTHER)


def is_skippable(path: Path) -> bool:
    name = path.name
    if name.startswith((".", "~$", "~")) or name.lower() in SKIP_NAMES:
        return True
    if path.suffix.lower() in SKIP_EXT:
        return True
    try:
        st = path.lstat()
    except OSError:
        return True
    if not stat.S_ISREG(st.st_mode):  # 連結、裝置等一律不碰
        return True
    hidden = getattr(stat, "FILE_ATTRIBUTE_HIDDEN", 0) | getattr(stat, "FILE_ATTRIBUTE_SYSTEM", 0)
    return bool(getattr(st, "st_file_attributes", 0) & hidden)


def check_folder_allowed(folder: Path) -> Path:
    """回傳解析後的路徑；若是受保護的位置則丟出 ProtectedFolderError。"""
    folder = Path(folder).expanduser().resolve()
    if not folder.is_dir():
        raise ProtectedFolderError(f"找不到資料夾：{folder}")
    if folder == Path(folder.anchor):
        raise ProtectedFolderError("不能整理磁碟根目錄。")
    if folder == Path.home().resolve():
        raise ProtectedFolderError("不能直接整理使用者主目錄，請選擇裡面的子資料夾。")
    here = Path(__file__).resolve().parent
    if folder == here or folder in here.parents and (folder / ".git").exists():
        raise ProtectedFolderError("不能整理寵物程式自己所在的資料夾。")
    protected = [os.environ.get(k) for k in ("WINDIR", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMDATA")]
    if sys.platform != "win32":
        protected += ["/bin", "/sbin", "/usr", "/etc", "/lib", "/boot", "/dev",
                      "/proc", "/sys", "/System", "/Library", "/Applications"]
    for p in filter(None, protected):
        p = Path(p).resolve()
        if folder == p or p in folder.parents:
            raise ProtectedFolderError(f"「{folder}」是系統資料夾，不能整理。")
    return folder


def _unique(dst: Path, taken: set[Path]) -> Path:
    if not dst.exists() and dst not in taken:
        return dst
    i = 1
    while True:
        cand = dst.with_name(f"{dst.stem} ({i}){dst.suffix}")
        if not cand.exists() and cand not in taken:
            return cand
        i += 1


def _write_json(path: Path, obj) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1), "utf-8")
    os.replace(tmp, path)


# ---------------------------------------------------------------- 整理資料夾
def loose_files(folder: Path) -> list[Path]:
    """資料夾第一層中可以整理的檔案（不進入子資料夾）。"""
    try:
        return sorted(p for p in Path(folder).iterdir() if not is_skippable(p))
    except OSError:
        return []


def plan_organize(folder: Path) -> list[Move]:
    folder = check_folder_allowed(folder)
    taken: set[Path] = set()
    moves = []
    for src in loose_files(folder):
        cat = category_of(src)
        dst = _unique(folder / cat / src.name, taken)
        taken.add(dst)
        moves.append(Move(src, dst, cat))
    return moves


# ---------------------------------------------------------------- 重複檔案
def _walk_files(folder: Path, cancel=None):
    for root, dirs, files in os.walk(folder):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != QUARANTINE]
        for name in files:
            if cancel and cancel():
                return
            p = Path(root) / name
            if not is_skippable(p):
                yield p


def _digest(path: Path, limit: int | None = None) -> str | None:
    h = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            if limit:
                h.update(f.read(limit))
            else:
                for chunk in iter(lambda: f.read(1 << 20), b""):
                    h.update(chunk)
    except OSError:
        return None
    return h.hexdigest()


def find_duplicates(folder: Path, cancel=None) -> list[list[Path]]:
    """回傳內容完全相同的檔案群組（含子資料夾）。每組第一個是最舊的，視為正本。"""
    folder = check_folder_allowed(folder)
    by_size: dict[int, list[Path]] = defaultdict(list)
    for p in _walk_files(folder, cancel):
        try:
            size = p.stat().st_size
        except OSError:
            continue
        if size:  # 空檔案不算重複
            by_size[size].append(p)

    groups = []
    for same_size in (v for v in by_size.values() if len(v) > 1):
        stage = [same_size]
        for limit in (65536, None):  # 先比開頭 64KB，再比全檔
            nxt = []
            for cand in stage:
                buckets: dict[str, list[Path]] = defaultdict(list)
                for p in cand:
                    if cancel and cancel():
                        return []
                    d = _digest(p, limit)
                    if d:
                        buckets[d].append(p)
                nxt += [b for b in buckets.values() if len(b) > 1]
            stage = nxt
        groups += stage
    for g in groups:
        g.sort(key=lambda p: (p.stat().st_mtime, len(str(p)), str(p)))
    groups.sort(key=lambda g: -g[0].stat().st_size * (len(g) - 1))
    return groups


def plan_quarantine(folder: Path, groups: list[list[Path]]) -> list[Move]:
    """把每組正本以外的檔案搬到隔離資料夾（保留相對路徑），不刪除。"""
    folder = check_folder_allowed(folder)
    taken: set[Path] = set()
    moves = []
    for g in groups:
        for src in g[1:]:
            dst = _unique(folder / QUARANTINE / src.resolve().relative_to(folder), taken)
            taken.add(dst)
            moves.append(Move(src, dst, QUARANTINE))
    return moves


def largest_files(folder: Path, n: int = 30, cancel=None) -> list[tuple[Path, int, float]]:
    """(路徑, 大小, 修改時間)，由大到小。"""
    folder = check_folder_allowed(folder)
    rows = []
    for p in _walk_files(folder, cancel):
        try:
            st = p.stat()
        except OSError:
            continue
        rows.append((p, st.st_size, st.st_mtime))
    rows.sort(key=lambda r: -r[1])
    return rows[:n]


# ---------------------------------------------------------------- 執行與還原
def _history() -> list[dict]:
    try:
        return json.loads((data_dir() / "history.json").read_text("utf-8"))
    except (OSError, ValueError):
        return []


def execute(moves: list[Move], label: str) -> tuple[int, list[str]]:
    """執行搬移並寫入還原紀錄。回傳 (成功數, 錯誤訊息)。"""
    done, errors, created = [], [], []
    for m in moves:
        try:
            if m.dst.exists():
                raise FileExistsError("目的地已有同名檔案")
            for parent in reversed(m.dst.parents):
                if not parent.exists():
                    parent.mkdir()
                    created.append(str(parent))
            shutil.move(str(m.src), str(m.dst))
            done.append([str(m.src), str(m.dst)])
        except OSError as e:  # 檔案被開啟中、權限不足等：跳過並回報
            errors.append(f"{m.src.name}：{e.strerror or e}")
    if done:
        hist = _history()
        hist.append({"time": time.strftime("%Y-%m-%d %H:%M"), "label": label,
                     "moves": done, "created": created})
        _write_json(data_dir() / "history.json", hist[-20:])
    return len(done), errors


def last_batch() -> dict | None:
    hist = _history()
    return hist[-1] if hist else None


def undo_last() -> tuple[int, list[str]]:
    """還原最近一次搬移。原位置已被佔用或檔案已不在者會跳過並回報。"""
    hist = _history()
    if not hist:
        return 0, []
    batch = hist.pop()
    restored, problems, remaining = 0, [], []
    for src, dst in reversed(batch["moves"]):
        s, d = Path(src), Path(dst)
        try:
            if not d.exists():
                problems.append(f"{d.name}：已不在整理後的位置")
            elif s.exists():
                problems.append(f"{s.name}：原位置已有同名檔案，未還原")
                remaining.append([src, dst])
            else:
                s.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(d), str(s))
                restored += 1
        except OSError as e:
            problems.append(f"{d.name}：{e.strerror or e}")
            remaining.append([src, dst])
    for c in reversed(batch.get("created", [])):  # 只移除我們建立且已清空的資料夾
        try:
            os.rmdir(c)
        except OSError:
            pass
    if remaining:  # 沒還原成功的留在紀錄裡，之後可再試
        batch["moves"] = list(reversed(remaining))
        hist.append(batch)
    _write_json(data_dir() / "history.json", hist)
    return restored, problems
