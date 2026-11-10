"""共用基礎：設定檔、檔案分類、路徑檢查。本工具只讀取與開啟檔案，不搬移、不刪除。"""
from __future__ import annotations

import json
import os
import stat
import sys
import tempfile
import threading
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
    "PDF": {".pdf"},
    "文件": {".doc", ".docx", ".txt", ".rtf", ".odt", ".md", ".pages", ".epub"},
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

# 不該被搬動的檔案：捷徑、下載中、暫存檔、鎖定檔、系統檔
SKIP_EXT = {
    ".lnk", ".url", ".crdownload", ".part", ".partial", ".download", ".tmp",
    ".dwl", ".dwl2", ".ini", ".sys", ".lock",
}
SKIP_NAMES = {"thumbs.db", "desktop.ini", ".ds_store"}

_EXT_TO_CAT = {ext: cat for cat, exts in CATEGORIES.items() for ext in exts}


class ProtectedFolderError(Exception):
    """該資料夾不適合加入（系統資料夾、磁碟根目錄等）。"""


# ---------------------------------------------------------------- 基本工具
def data_dir() -> Path:
    d = Path(os.environ.get("DESKTOP_PET_HOME") or Path.home() / ".desktop_pet")
    d.mkdir(parents=True, exist_ok=True)
    return d


_LOCK = threading.RLock()          # 寵物與面板在同一個程式裡，讀改寫設定要排隊
_cache: dict = {"stamp": None, "cfg": None}
config_problem = ""                 # 設定檔壞掉時，給畫面顯示的一句話
# 各欄位應有的型別；型別不對的欄位當作沒設定，不讓它弄壞其他功能
_TYPES = {"project_roots": list, "projects": list, "hidden_projects": list, "pinned": list,
          "github_repos": list, "ai_branch_prefixes": list, "merged": dict, "opened": dict,
          "github_token": str, "walk": bool}


def _stamp(path: Path):
    try:
        st = path.stat()
        return (st.st_mtime_ns, st.st_size)
    except OSError:
        return None


def load_config() -> dict:
    """讀設定。檔案沒變就用上次讀到的（慢速磁碟上不必每次重讀）。回傳的是副本，可以放心修改。"""
    global config_problem
    path = data_dir() / "config.json"
    with _LOCK:
        stamp = _stamp(path)
        if _cache["cfg"] is None or _cache["stamp"] != stamp:
            cfg = {"walk": True}
            if stamp is not None:
                try:
                    raw = json.loads(path.read_text("utf-8-sig"))
                    if not isinstance(raw, dict):
                        raise ValueError("not an object")
                    cfg.update({k: v for k, v in raw.items() if k not in _TYPES or isinstance(v, _TYPES[k])})
                    for key in ("merged", "opened"):   # 內層的值型別也要對
                        if key in cfg:
                            want = str if key == "merged" else int
                            cfg[key] = {k: v for k, v in cfg[key].items() if isinstance(v, want) and not isinstance(v, bool)}
                    for key in ("project_roots", "projects", "hidden_projects", "pinned", "github_repos", "ai_branch_prefixes"):
                        if key in cfg:
                            cfg[key] = [x for x in cfg[key] if isinstance(x, str)]
                except (OSError, ValueError):
                    # 設定檔壞了：不要默默蓋掉它，先另存一份再從頭開始
                    backup = path.with_name("config.bad.json")
                    try:
                        os.replace(path, backup)
                        config_problem = f"原本的設定檔讀不懂，已另存為 {backup}，目前從空白設定開始。"
                    except OSError:
                        config_problem = "設定檔讀不懂，目前從空白設定開始。"
                    stamp = None
            _cache.update(stamp=stamp, cfg=cfg)
        return json.loads(json.dumps(_cache["cfg"]))


def save_config(cfg: dict) -> None:
    with _LOCK:
        _write_json(data_dir() / "config.json", cfg)
        _cache.update(stamp=None, cfg=None)


def set_config(**changes) -> dict:
    """重新讀檔後只改指定欄位再存回。整段上鎖，同時發生的修改不會互相蓋掉。"""
    with _LOCK:
        cfg = load_config()
        cfg.update(changes)
        save_config(cfg)
        return cfg


def config_int(key: str, default: int) -> int:
    try:
        return int(load_config().get(key, default))
    except (TypeError, ValueError):
        return default


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
        raise ProtectedFolderError("不能直接加入磁碟根目錄，請選擇裡面的資料夾。")
    if folder == Path.home().resolve():
        raise ProtectedFolderError("不能直接加入使用者主目錄，請選擇裡面的子資料夾。")
    protected = [os.environ.get(k) for k in ("WINDIR", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMDATA")]
    if sys.platform != "win32":
        protected += ["/bin", "/sbin", "/usr", "/etc", "/lib", "/boot", "/dev",
                      "/proc", "/sys", "/System", "/Library", "/Applications"]
    for p in filter(None, protected):
        p = Path(p).resolve()
        if folder == p or p in folder.parents:
            raise ProtectedFolderError(f"「{folder}」是系統資料夾，不能加入。")
    return folder


def _write_json(path: Path, obj) -> None:
    """先寫到唯一的暫存檔再換過去：寫到一半當機也不會留下半個設定檔。"""
    fd, tmp = tempfile.mkstemp(prefix=path.stem + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False, indent=1))
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
