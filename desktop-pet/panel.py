"""觸控面板：給副螢幕（如 Corsair Xeneon Edge 2560×720）用的本機網頁。

  1. 快速找檔案：背景建立檔名索引，輸入即搜尋，點一下就開啟。
  2. AI 任務進度：彙整本機 Claude Code 工作階段與 GitHub PR 狀態。

只聽 127.0.0.1，API 需要頁面內嵌的權杖；只能開啟「搜尋資料夾」範圍內的檔案。
"""
from __future__ import annotations

import json
import os
import secrets
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pet_core as core  # noqa: E402

FOLDER = "資料夾"
SKIP_DIRS = {"node_modules", "__pycache__", "appdata", "$recycle.bin", "system volume information",
             "site-packages", "venv", ".git"}
# 這些類型不直接執行，改為「顯示所在位置」
NO_LAUNCH = {".exe", ".msi", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".scr", ".com", ".reg", ".lnk",
             ".sh", ".py", ".pyw", ".jar", ".app", ".dmg", ".pkg", ".deb", ".rpm", ".appimage", ".hta"}
MAX_ENTRIES = 500_000


# ---------------------------------------------------------------- 設定
def roots() -> list[Path]:
    cfg = core.load_config()
    paths = cfg.get("search_roots")
    if not paths:
        home = Path.home()
        paths = [str(p) for p in (home / "Desktop", home / "Documents", home / "Downloads") if p.is_dir()]
    out = []
    for p in paths:
        try:
            r = Path(p).expanduser().resolve()
        except OSError:
            continue
        if r.is_dir() and r not in out:
            out.append(r)
    return out


def is_allowed(path: Path) -> bool:
    """路徑必須位於某個搜尋資料夾之內。"""
    try:
        p = Path(path).resolve()
    except OSError:
        return False
    return any(p == r or r in p.parents for r in roots())


def pins() -> list[str]:
    saved = [p for p in core.load_config().get("pins", []) if Path(p).is_dir() and is_allowed(Path(p))]
    return saved or [str(r) for r in roots()]


def _skip_name(name: str) -> bool:
    low = name.lower()
    return name.startswith((".", "~$", "$")) or low in core.SKIP_NAMES or os.path.splitext(low)[1] in core.SKIP_EXT


# ---------------------------------------------------------------- 檔名索引
class Index:
    """記憶體中的檔名索引。entries: (小寫檔名, 檔名, 所在資料夾, 修改時間, 大小, 分類)"""

    def __init__(self) -> None:
        self.entries: list[tuple] = []
        self.built_at = 0.0
        self.indexing = False
        self.truncated = False
        self._lock = threading.Lock()

    def rebuild(self) -> None:
        if not self._lock.acquire(blocking=False):
            return
        self.indexing = True
        try:
            out: list[tuple] = []
            for root in roots():
                self._walk(str(root), out)
            self.truncated = len(out) >= MAX_ENTRIES
            self.entries, self.built_at = out, time.time()
        finally:
            self.indexing = False
            self._lock.release()

    @staticmethod
    def _walk(top: str, out: list) -> None:
        stack = [top]
        while stack and len(out) < MAX_ENTRIES:
            d = stack.pop()
            try:
                with os.scandir(d) as it:
                    for e in it:
                        name = e.name
                        if _skip_name(name):
                            continue
                        try:
                            if e.is_dir(follow_symlinks=False):
                                if name.lower() in SKIP_DIRS or name == core.QUARANTINE:
                                    continue
                                stack.append(e.path)
                                out.append((name.lower(), name, d, e.stat().st_mtime, 0, FOLDER))
                            elif e.is_file(follow_symlinks=False):
                                st = e.stat()
                                out.append((name.lower(), name, d, st.st_mtime, st.st_size,
                                            core.category_of(Path(name))))
                        except OSError:
                            continue
            except OSError:
                continue

    def search(self, query: str = "", kind: str = "", limit: int = 60) -> list[dict]:
        terms = query.lower().split()
        hits = []
        for e in self.entries:
            if kind and e[5] != kind:
                continue
            if not terms:
                if e[5] != FOLDER or kind == FOLDER:
                    hits.append((0, -e[3], e))
                continue
            key = e[0]
            if all(t in key for t in terms):
                hits.append((0 if key.startswith(terms[0]) else 1, -e[3], e))
            else:
                full = e[2].lower() + os.sep + key  # 也比對所在路徑，例如「專案名 平面」
                if all(t in full for t in terms):
                    hits.append((2, -e[3], e))
        hits.sort(key=lambda h: h[:2])
        return [entry_dict(h[2]) for h in hits[:limit]]

    def status(self) -> dict:
        return {"count": len(self.entries), "indexing": self.indexing, "built_at": self.built_at,
                "truncated": self.truncated, "roots": [str(r) for r in roots()]}


def entry_dict(e: tuple) -> dict:
    return {"name": e[1], "dir": e[2], "path": os.path.join(e[2], e[1]), "mtime": e[3], "size": e[4],
            "kind": e[5], "ext": "" if e[5] == FOLDER else os.path.splitext(e[1])[1][1:].upper()[:5]}


def browse(folder: str) -> dict:
    p = Path(folder).resolve()
    if not p.is_dir() or not is_allowed(p):
        raise PermissionError("不在搜尋資料夾範圍內")
    rows = []
    with os.scandir(p) as it:
        for e in it:
            if _skip_name(e.name):
                continue
            try:
                st = e.stat()
                is_dir = e.is_dir()
            except OSError:
                continue
            kind = FOLDER if is_dir else core.category_of(Path(e.name))
            rows.append((e.name.lower(), e.name, str(p), st.st_mtime, 0 if is_dir else st.st_size, kind))
    rows.sort(key=lambda r: (r[5] != FOLDER, r[0]))
    parent = str(p.parent) if is_allowed(p.parent) else None
    return {"path": str(p), "name": p.name or str(p), "parent": parent, "pinned": str(p) in pins(),
            "entries": [entry_dict(r) for r in rows[:500]], "more": max(0, len(rows) - 500)}


def toggle_pin(folder: str) -> list[str]:
    p = str(Path(folder).resolve())
    if not Path(p).is_dir() or not is_allowed(Path(p)):
        raise PermissionError("不在搜尋資料夾範圍內")
    cur = pins()
    cur = [x for x in cur if x != p] if p in cur else cur + [p]
    core.set_config(pins=cur)
    return pins()


def open_file(path: str, reveal: bool = False) -> str:
    """開啟檔案或顯示所在位置。回傳實際做的事：'opened' 或 'revealed'。"""
    p = Path(path).resolve()
    if not p.exists() or not is_allowed(p):
        raise PermissionError("檔案不存在，或不在搜尋資料夾範圍內")
    if p.is_file() and p.suffix.lower() in NO_LAUNCH:
        reveal = True
    if reveal:
        if sys.platform == "win32":
            subprocess.Popen(["explorer", "/select,", str(p)])
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-R", str(p)])
        else:
            subprocess.Popen(["xdg-open", str(p if p.is_dir() else p.parent)])
        return "revealed"
    if sys.platform == "win32":
        os.startfile(str(p))  # type: ignore[attr-defined]
    else:
        subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", str(p)])
    if p.is_file():
        recent = [x for x in core.load_config().get("recent_opened", []) if x != str(p)]
        core.set_config(recent_opened=([str(p)] + recent)[:24])
    return "opened"


def recent_opened() -> list[dict]:
    out = []
    for s in core.load_config().get("recent_opened", []):
        p = Path(s)
        try:
            st = p.stat()
        except OSError:
            continue
        if is_allowed(p):
            out.append(entry_dict((p.name.lower(), p.name, str(p.parent), st.st_mtime, st.st_size,
                                   core.category_of(p))))
    return out


# ---------------------------------------------------------------- AI 任務：本機 Claude Code
_session_cache: dict[str, tuple] = {}


def _read_slices(path: Path, head: int = 60_000, tail: int = 400_000) -> list[dict]:
    size = path.stat().st_size
    with open(path, "rb") as f:
        chunks = [f.read()] if size <= head + tail else [f.read(head), (f.seek(size - tail), f.read())[1]]
    rows = []
    for chunk in chunks:
        for line in chunk.decode("utf-8", "replace").splitlines():
            if line.startswith("{"):
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    pass  # 被切斷的行
    return rows


def _text_of(message) -> str:
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        return " ".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text").strip()
    return ""


def parse_session(path: Path, now: float | None = None) -> dict | None:
    """把一份 Claude Code 對話紀錄（.jsonl）摘要成一張任務卡。格式有變動時盡量容錯。"""
    st = path.stat()
    cached = _session_cache.get(str(path))
    if cached and cached[0] == (st.st_mtime, st.st_size):
        info = dict(cached[1])
    else:
        title = prompt = reply = cwd = branch = ""
        todos: list[dict] = []
        last_kind = ""
        for o in _read_slices(path):
            t = o.get("type")
            cwd, branch = o.get("cwd") or cwd, o.get("gitBranch") or branch
            if t == "ai-title":
                title = o.get("aiTitle") or title
            elif t == "summary":
                title = title or o.get("summary", "")
            elif t == "last-prompt":
                prompt = o.get("lastPrompt") or prompt
            elif t == "user" and not o.get("isSidechain"):
                txt = _text_of(o.get("message"))
                if txt and not txt.startswith("<"):
                    prompt, last_kind = txt, "user"
            elif t == "assistant" and not o.get("isSidechain"):
                msg = o.get("message") or {}
                txt = _text_of(msg)
                if txt:
                    reply = txt
                blocks = msg.get("content") if isinstance(msg.get("content"), list) else []
                tools = [b for b in blocks if isinstance(b, dict) and b.get("type") == "tool_use"]
                for b in tools:
                    items = (b.get("input") or {}).get("todos")
                    if b.get("name") == "TodoWrite" and isinstance(items, list):
                        todos = [{"text": str(i.get("content", ""))[:80], "status": i.get("status", "pending")}
                                 for i in items if isinstance(i, dict)]
                last_kind = "tool" if tools else ("reply" if txt else last_kind)
        if not (title or prompt):
            return None
        info = {"id": path.stem, "source": "本機 Claude Code", "title": (title or prompt)[:60],
                "prompt": prompt[:300], "reply": reply[:400], "todos": todos, "last_kind": last_kind,
                "where": Path(cwd).name if cwd else "", "branch": branch, "updated": st.st_mtime}
        _session_cache[str(path)] = ((st.st_mtime, st.st_size), dict(info))
    age = (now or time.time()) - info["updated"]
    if age < 120:
        info["state"], info["state_text"] = "running", "執行中"
    elif info.pop("last_kind", "") == "reply":
        info["state"], info["state_text"] = "waiting", "已回覆，等你看"
    else:
        info["state"], info["state_text"] = "idle", "已停止"
    info.pop("last_kind", None)
    return info


def local_sessions(days: float = 7, limit: int = 15) -> list[dict]:
    base = Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude") / "projects"
    cutoff = time.time() - days * 86400
    files = []
    try:
        for f in base.glob("*/*.jsonl"):
            try:
                m = f.stat().st_mtime
            except OSError:
                continue
            if m >= cutoff:
                files.append((m, f))
    except OSError:
        return []
    out = []
    for _, f in sorted(files, reverse=True)[:limit]:
        try:
            info = parse_session(f)
        except (OSError, ValueError):
            info = None
        if info:
            out.append(info)
    return out


# ---------------------------------------------------------------- AI 任務：GitHub PR
_gh_cache = {"at": 0.0, "key": None, "tasks": [], "error": ""}


def _gh_get(url: str, token: str):
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json",
                                               "User-Agent": "file-butler-panel"})
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)


def _ts(iso: str) -> float:
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()
    except (ValueError, AttributeError):
        return 0.0


def pr_task(repo: str, pr: dict, checks: list[dict] | None = None, now: float | None = None) -> dict | None:
    updated = _ts(pr.get("updated_at", ""))
    merged = bool(pr.get("merged_at"))
    if pr.get("state") != "open" and (now or time.time()) - updated > 3 * 86400:
        return None  # 太久以前結束的不顯示
    if merged:
        state, text = "done", "已合併"
    elif pr.get("state") != "open":
        state, text = "idle", "已關閉"
    else:
        state, text = ("waiting", "草稿，等你審閱") if pr.get("draft") else ("waiting", "等待審閱／合併")
        concl = [c.get("conclusion") for c in checks or []]
        if any(c.get("status") != "completed" for c in checks or []):
            state, text = "running", "檢查執行中"
        elif any(c in ("failure", "timed_out", "cancelled") for c in concl):
            state, text = "failed", "檢查失敗"
        elif concl:
            text += "・檢查通過"
    return {"id": f"{repo}#{pr.get('number')}", "source": f"GitHub {repo}", "title": pr.get("title", "")[:80],
            "state": state, "state_text": text, "updated": updated, "url": pr.get("html_url", ""),
            "where": repo.split("/")[-1], "branch": (pr.get("head") or {}).get("ref", ""),
            "prompt": "", "reply": (pr.get("body") or "")[:400], "todos": []}


def github_tasks() -> tuple[list[dict], str]:
    cfg = core.load_config()
    repos = [r for r in cfg.get("github_repos", []) if isinstance(r, str) and r.count("/") == 1]
    token = cfg.get("github_token", "")
    if not repos:
        return [], ""
    key, ttl = (tuple(repos), bool(token)), (120 if token else 600)  # 未登入每小時只有 60 次額度
    if _gh_cache["key"] == key and time.time() - _gh_cache["at"] < ttl:
        return _gh_cache["tasks"], _gh_cache["error"]
    tasks, error = [], ""
    for repo in repos:
        try:
            prs = _gh_get(f"https://api.github.com/repos/{repo}/pulls?state=all&sort=updated&direction=desc&per_page=8", token)
            for pr in prs:
                checks = None
                if pr.get("state") == "open":
                    try:
                        sha = pr["head"]["sha"]
                        checks = _gh_get(f"https://api.github.com/repos/{repo}/commits/{sha}/check-runs", token).get("check_runs")
                    except (urllib.error.URLError, KeyError, ValueError, OSError):
                        pass
                t = pr_task(repo, pr, checks)
                if t:
                    tasks.append(t)
        except urllib.error.HTTPError as e:
            error = f"{repo}：GitHub 回應 {e.code}" + ("（私有 repo 需在設定填入 github_token）" if e.code in (401, 403, 404) else "")
        except (urllib.error.URLError, ValueError, OSError) as e:
            error = f"{repo}：連不上 GitHub（{getattr(e, 'reason', e)}）"
    _gh_cache.update(at=time.time(), key=key, tasks=tasks, error=error)
    return tasks, error


def all_tasks() -> dict:
    gh, err = github_tasks()
    order = {"running": 0, "failed": 1, "waiting": 2, "idle": 3, "done": 4}
    tasks = sorted(local_sessions() + gh, key=lambda t: (order.get(t["state"], 9), -t["updated"]))
    return {"tasks": tasks, "error": err, "github_configured": bool(core.load_config().get("github_repos"))}


# ---------------------------------------------------------------- HTTP 伺服器
class Handler(BaseHTTPRequestHandler):
    index: Index
    token: str

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
                html = (Path(__file__).with_name("panel.html")).read_text("utf-8")
                self._send(200, html.replace("__TOKEN__", self.token).encode(), "text/html")
            return
        if not self._guard(True):
            return
        try:
            if url.path == "/api/search":
                self._send(200, {"results": self.index.search(q.get("q", ""), q.get("kind", "")),
                                 "status": self.index.status()})
            elif url.path == "/api/home":
                self._send(200, {"pins": [{"path": p, "name": Path(p).name or p} for p in pins()],
                                 "recent": recent_opened(), "status": self.index.status()})
            elif url.path == "/api/browse":
                self._send(200, browse(q.get("path", "")))
            elif url.path == "/api/tasks":
                self._send(200, all_tasks())
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
            if self.path == "/api/open":
                self._send(200, {"did": open_file(body["path"], bool(body.get("reveal")))})
            elif self.path == "/api/pin":
                toggle_pin(body["path"])
                self._send(200, {"ok": True})
            elif self.path == "/api/open_url":
                if not str(body.get("url", "")).startswith("https://github.com/"):
                    raise PermissionError("只允許開啟 GitHub 連結")
                webbrowser.open(body["url"])
                self._send(200, {"ok": True})
            elif self.path == "/api/reindex":
                threading.Thread(target=self.index.rebuild, daemon=True).start()
                self._send(200, {"ok": True})
            else:
                self._send(404, {"error": "not found"})
        except (PermissionError, FileNotFoundError, KeyError, ValueError) as e:
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
            index.rebuild()
            time.sleep(int(core.load_config().get("reindex_minutes", 10)) * 60)
    threading.Thread(target=keep_fresh, daemon=True).start()
    return server


def launch_browser(url: str) -> None:
    """優先用 Edge／Chrome 的 app 模式（無網址列）；找不到就用預設瀏覽器。"""
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
    port = int(core.load_config().get("panel_port", 8765))
    url = f"http://127.0.0.1:{port}/"
    try:
        server = make_server(port)
    except OSError:  # 已經在執行：直接開視窗
        launch_browser(url)
        return
    if "--no-browser" not in sys.argv:
        launch_browser(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
