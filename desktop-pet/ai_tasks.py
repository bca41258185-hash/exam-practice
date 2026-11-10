"""彙整「派出去的 AI 助手」目前做到哪裡。寵物與觸控面板共用。

來源：
  1. GitHub：claude/* 分支、PR 狀態、檢查結果、PR 說明裡的核取清單（雲端助手的足跡都在這裡）
  2. 本機 Claude Code 對話紀錄（~/.claude/projects），可讀到逐項待辦進度

每張任務卡的 state：running 執行中｜waiting 等你｜failed 出錯｜done 完成｜idle 已停止
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

import pet_core as core

ORDER = {"failed": 0, "waiting": 1, "running": 2, "done": 3, "idle": 4}


def _finish(task: dict) -> dict:
    todos = task.get("todos") or []
    task["progress"] = [sum(t["status"] == "completed" for t in todos), len(todos)]
    doing = next((t["text"] for t in todos if t["status"] == "in_progress"), "")
    task["doing"] = doing or next((t["text"] for t in todos if t["status"] == "pending"), "")
    return task


# ---------------------------------------------------------------- 本機 Claude Code
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
    """把一份 Claude Code 對話紀錄（.jsonl）摘要成任務卡。格式有變動時盡量容錯。"""
    st = path.stat()
    cached = _session_cache.get(str(path))
    if cached and cached[0] == (st.st_mtime, st.st_size):
        info = dict(cached[1])
    else:
        title = prompt = reply = cwd = branch = last_kind = ""
        todos: list[dict] = []
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
                reply = txt or reply
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
        info = {"id": path.stem, "source": "本機", "title": (title or prompt)[:60], "prompt": prompt[:300],
                "reply": reply[:400], "todos": todos, "last_kind": last_kind, "url": "",
                "where": Path(cwd).name if cwd else "", "branch": branch, "updated": st.st_mtime}
        _session_cache[str(path)] = ((st.st_mtime, st.st_size), dict(info))
    last_kind = info.pop("last_kind", "")
    if (now or time.time()) - info["updated"] < 120:
        info["state"], info["state_text"] = "running", "執行中"
    elif last_kind == "reply":
        info["state"], info["state_text"] = "waiting", "已回覆，等你看"
    else:
        info["state"], info["state_text"] = "idle", "已停止"
    return _finish(info)


def local_sessions(days: float = 3, limit: int = 12) -> list[dict]:
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


# ---------------------------------------------------------------- GitHub
_gh_cache = {"at": 0.0, "key": None, "tasks": [], "error": ""}
_CHECKBOX = re.compile(r"^\s*[-*]\s+\[([ xX])\]\s+(.+)$", re.M)


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
    now = now or time.time()
    updated = _ts(pr.get("updated_at", ""))
    if pr.get("state") != "open" and now - updated > 2 * 86400:
        return None  # 結束超過兩天的不再顯示
    body = pr.get("body") or ""
    todos = [{"text": m.group(2).strip()[:80], "status": "completed" if m.group(1) != " " else "pending"}
             for m in _CHECKBOX.finditer(body)]
    if pr.get("merged_at"):
        state, text = "done", "已合併"
    elif pr.get("state") != "open":
        state, text = "idle", "已關閉"
    else:
        concl = [c.get("conclusion") for c in checks or []]
        if any(c.get("status") != "completed" for c in checks or []):
            state, text = "running", "自動檢查執行中"
        elif any(c in ("failure", "timed_out") for c in concl):
            state, text = "failed", "自動檢查失敗"
        elif now - updated < 300:
            state, text = "running", "剛更新，仍在進行"
        else:
            state, text = "waiting", "草稿完成，等你審閱" if pr.get("draft") else "等你審閱／合併"
    return _finish({"id": f"{repo}#{pr.get('number')}", "source": "GitHub", "title": pr.get("title", "")[:80],
                    "state": state, "state_text": text, "updated": updated, "url": pr.get("html_url", ""),
                    "where": repo.split("/")[-1], "branch": (pr.get("head") or {}).get("ref", ""),
                    "prompt": "", "reply": _CHECKBOX.sub("", body).strip()[:400], "todos": todos})


def branch_task(repo: str, name: str, commit: dict, now: float | None = None) -> dict | None:
    """還沒開 PR 的助手分支：用最後一次提交判斷是否仍在進行。"""
    c = commit.get("commit") or {}
    updated = _ts((c.get("committer") or {}).get("date", ""))
    age = (now or time.time()) - updated
    if age > 2 * 86400:
        return None
    state, text = ("running", "撰寫中（尚未開 PR）") if age < 900 else ("idle", "已停止（尚未開 PR）")
    msg = (c.get("message") or "").strip()
    return _finish({"id": f"{repo}@{name}", "source": "GitHub", "title": msg.splitlines()[0][:80] if msg else name,
                    "state": state, "state_text": text, "updated": updated, "url": commit.get("html_url", ""),
                    "where": repo.split("/")[-1], "branch": name, "prompt": "", "reply": msg[:400], "todos": []})


def _fetch_repo(repo: str, token: str, prefixes: tuple[str, ...]) -> list[dict]:
    api = f"https://api.github.com/repos/{repo}"
    tasks, seen = [], set()
    for pr in _gh_get(f"{api}/pulls?state=all&sort=updated&direction=desc&per_page=8", token):
        seen.add((pr.get("head") or {}).get("ref"))
        checks = None
        if pr.get("state") == "open":
            try:
                checks = _gh_get(f"{api}/commits/{pr['head']['sha']}/check-runs", token).get("check_runs")
            except (urllib.error.URLError, KeyError, ValueError, OSError):
                pass
        t = pr_task(repo, pr, checks)
        if t:
            tasks.append(t)
    loose = [b for b in _gh_get(f"{api}/branches?per_page=100", token)
             if b.get("name", "").startswith(prefixes) and b["name"] not in seen]
    for b in loose[:4]:
        t = branch_task(repo, b["name"], _gh_get(f"{api}/commits/{b['commit']['sha']}", token))
        if t:
            tasks.append(t)
    return tasks


def github_tasks() -> tuple[list[dict], str]:
    cfg = core.load_config()
    repos = [r for r in cfg.get("github_repos", []) if isinstance(r, str) and r.count("/") == 1]
    token = cfg.get("github_token", "")
    if not repos:
        return [], ""
    # 未登入每小時只有 60 次查詢額度，依 repo 數量拉長間隔；有權杖則每分鐘更新
    key, ttl = (tuple(repos), bool(token)), (60 if token else max(600, len(repos) * 480))
    if _gh_cache["key"] == key and time.time() - _gh_cache["at"] < ttl:
        return _gh_cache["tasks"], _gh_cache["error"]
    tasks, error = [], ""
    prefixes = tuple(cfg.get("ai_branch_prefixes") or ["claude/"])
    for repo in repos:
        try:
            tasks += _fetch_repo(repo, token, prefixes)
        except urllib.error.HTTPError as e:
            hint = "；私有 repo 或額度用完時，請在設定填入 github_token" if e.code in (401, 403, 404, 429) else ""
            error = f"{repo}：GitHub 回應 {e.code}{hint}"
        except (urllib.error.URLError, ValueError, KeyError, TypeError, OSError) as e:
            error = f"{repo}：連不上 GitHub（{getattr(e, 'reason', e)}）"
    if error and not tasks and _gh_cache["key"] == key:
        tasks = _gh_cache["tasks"]  # 暫時連不上就沿用上次結果
    _gh_cache.update(at=time.time(), key=key, tasks=tasks, error=error)
    return tasks, error


# ---------------------------------------------------------------- 彙整
def all_tasks() -> dict:
    gh, err = github_tasks()
    tasks = sorted(local_sessions() + gh, key=lambda t: (ORDER.get(t["state"], 9), -t["updated"]))
    counts = {s: sum(t["state"] == s for t in tasks) for s in ORDER}
    return {"tasks": tasks, "counts": counts, "error": err,
            "github_configured": bool(core.load_config().get("github_repos"))}


def changes(old: dict[str, str], tasks: list[dict]) -> list[tuple[dict, str]]:
    """比對前後狀態，回傳值得通知的轉變：(任務, 之前的 state)。"""
    out = []
    for t in tasks:
        before = old.get(t["id"])
        if before and before != t["state"] and t["state"] in ("waiting", "failed", "done"):
            out.append((t, before))
    return out
