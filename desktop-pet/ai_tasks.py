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
MSG_CHARS, MSG_KEEP = 900, 40   # 每則訊息最多幾個字、每段對話最多留幾則


NEXT_STEP = {
    "running": "助手還在做，不需要你處理。",
    "waiting": "輪到你了：回到你交代這件事的對話，看它的回覆。",
    "failed": "成果沒通過自動檢查。回到你交代這件事的對話，請助手修正即可。",
    "done": "這件事已經完成，成果已經收進正式版本。",
    "idle": "這件事目前停著。需要的話，回到原本的對話請助手繼續。",
}
_SEE = "輪到你了：按下面的「在 GitHub 開啟」看成果。沒問題的話，在那個頁面最下方"
_ELSE = "有問題就回到原本的對話請助手修改。"
NEXT_STEP_GITHUB = {   # 依 PR 是否仍是草稿，頁面上會看到的按鈕不同
    "waiting_draft": _SEE + "先按「Ready for review」，再按綠色的「Merge pull request」，就是同意採用；" + _ELSE,
    "waiting": _SEE + "按綠色的「Merge pull request」，就是同意採用；" + _ELSE,
}


def _finish(task: dict) -> dict:
    by_source = NEXT_STEP_GITHUB if task.get("source") == "GitHub" else {}
    key = task.get("state", "") + ("_draft" if task.pop("draft", False) and task.get("state") == "waiting" else "")
    task["next"] = by_source.get(key) or by_source.get(task.get("state")) or NEXT_STEP.get(task.get("state"), "")
    if "images" not in task:   # GitHub：圖片在各則留言裡
        task["images"] = [x for m in task.get("messages") or [] for x in m.pop("images", [])][-IMAGES_KEEP:]
    todos = task.get("todos") or []
    task["progress"] = [sum(t["status"] == "completed" for t in todos), len(todos)]
    doing = next((t["text"] for t in todos if t["status"] == "in_progress"), "")
    task["doing"] = doing or next((t["text"] for t in todos if t["status"] == "pending"), "")
    return task


# ---------------------------------------------------------------- 對話裡的圖片
# 只記「在哪裡」，要看的時候才去讀，不把圖片整個放在記憶體裡。
#   b64：對話紀錄某一行裡的第 n 張圖（你貼給 AI 的、或 AI 截圖／看過的圖）
#   file：AI 說「存成 xxx.png」而且檔案真的存在
#   url：GitHub 留言裡的圖片網址
IMAGE_EXT = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"}
IMAGES_KEEP = 8                        # 每段對話最多記幾張（最新的）
_IMAGE_REF: dict[str, tuple] = {}      # 圖片編號 → 在哪裡
_img_scan: dict[str, tuple] = {}       # 對話紀錄 → (已掃到的位置, 檔案大小, 找到的圖片)
_PATH_RE = re.compile(r"""(?:[A-Za-z]:[\\/]|[\\/]|\.{1,2}[\\/])?[^\s"'`<>|*?()（）「」『』，。、；：]+\.(?:png|jpe?g|gif|webp)\b""", re.I)
_MD_IMG = re.compile(r"""!\[[^\]]*\]\((https?://[^)\s]+)\)|<img[^>]+src=["'](https?://[^"']+)["']""", re.I)


def _img_id(*parts) -> str:
    import hashlib
    return hashlib.sha1("|".join(map(str, parts)).encode("utf-8", "replace")).hexdigest()[:16]


def _image_blocks(row: dict):
    """一行對話紀錄裡的圖片，依出現順序：(誰給的, base64 區塊)。直接貼的算你，工具結果裡的算 AI。"""
    msg = row.get("message") if isinstance(row.get("message"), dict) else {}
    content = msg.get("content") if isinstance(msg.get("content"), list) else []
    for b in content:
        if not isinstance(b, dict):
            continue
        if b.get("type") == "image":
            yield "user" if row.get("type") == "user" else "ai", b
        elif b.get("type") == "tool_result" and isinstance(b.get("content"), list):
            for c in b["content"]:
                if isinstance(c, dict) and c.get("type") == "image":
                    yield "ai", c


def scan_images(path: Path) -> list[dict]:
    """找出對話紀錄裡貼上的圖片。只讀上次之後新增的部分，長對話也不會越來越慢。"""
    st = path.stat()
    offset, _, found = _img_scan.get(str(path), (0, 0, []))
    if offset > st.st_size:   # 檔案被改短了：從頭來
        offset, found = 0, []
    if offset == st.st_size:
        return found
    found = list(found)
    with open(path, "rb") as f:
        f.seek(offset)
        pos = offset
        for raw in f:
            if not raw.endswith(b"\n"):   # 還在寫的最後一行：下次再讀
                break
            if b'"image"' in raw and b'"base64"' in raw and not b'"isSidechain":true' in raw:
                try:
                    row = json.loads(raw)
                except ValueError:
                    row = None
                if isinstance(row, dict) and not row.get("isSidechain"):
                    when = _ts(row.get("timestamp")) if isinstance(row.get("timestamp"), str) else st.st_mtime
                    for n, (role, b) in enumerate(_image_blocks(row)):
                        src = b.get("source") if isinstance(b.get("source"), dict) else {}
                        if src.get("type") != "base64" or not isinstance(src.get("data"), str):
                            continue
                        iid = _img_id(path, pos, n)
                        _IMAGE_REF[iid] = ("b64", str(path), pos, n)
                        found.append({"id": iid, "ts": when, "role": role, "name": "貼上的圖片" if role == "user" else "AI 看過的圖"})
            pos += len(raw)
    found = found[-IMAGES_KEEP:]
    _img_scan[str(path)] = (pos, st.st_size, found)
    return found


def file_images(text: str, cwd: str, ts: float, role: str = "ai") -> list[dict]:
    """訊息裡提到、而且真的存在的圖片檔。"""
    out = []
    for m in _PATH_RE.finditer(text or ""):
        raw = m.group(0).strip()
        p = Path(raw).expanduser()
        if not p.is_absolute() and cwd:
            p = Path(cwd) / p
        try:
            if p.suffix.lower() in IMAGE_EXT and p.is_file() and p.stat().st_size < 30 << 20:
                iid = _img_id("file", p.resolve())
                _IMAGE_REF[iid] = ("file", str(p.resolve()))
                if all(x["id"] != iid for x in out):
                    out.append({"id": iid, "ts": ts, "role": role, "name": p.name})
        except OSError:
            continue
    return out


def url_images(text: str, ts: float, role: str) -> list[dict]:
    out = []
    for m in _MD_IMG.finditer(text or ""):
        url = m.group(1) or m.group(2)
        iid = _img_id("url", url)
        _IMAGE_REF[iid] = ("url", url)
        out.append({"id": iid, "ts": ts, "role": role, "name": "GitHub 上的圖", "url": url})
    return out


def load_image(iid: str) -> tuple[bytes, str]:
    """依編號取出圖片內容與格式。只給得出對話裡出現過的圖。"""
    import base64
    ref = _IMAGE_REF.get(iid)
    if not ref or ref[0] == "url":
        raise KeyError(iid)
    if ref[0] == "file":
        p = Path(ref[1])
        return p.read_bytes(), IMAGE_EXT.get(p.suffix.lower(), "application/octet-stream")
    _, path, pos, n = ref
    with open(path, "rb") as f:
        f.seek(pos)
        row = json.loads(f.readline())
    for i, (_, b) in enumerate(_image_blocks(row)):
        if i == n:
            src = b["source"]
            return base64.b64decode(src["data"]), str(src.get("media_type") or "image/png")
    raise KeyError(iid)


def image_ref(iid: str) -> tuple | None:
    return _IMAGE_REF.get(iid)


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
                    row = json.loads(line)
                except ValueError:
                    continue  # 被切斷的行
                if isinstance(row, dict):
                    rows.append(row)
    return rows


def _text_of(message) -> str:
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        return " ".join(str(b.get("text") or "") for b in content if isinstance(b, dict) and b.get("type") == "text").strip()
    return ""


def parse_session(path: Path, now: float | None = None) -> dict | None:
    """把一份 Claude Code 對話紀錄（.jsonl）摘要成任務卡。格式有變動時盡量容錯。"""
    st = path.stat()
    cached = _session_cache.get(str(path))
    if cached and cached[0] == (st.st_mtime, st.st_size):
        info = dict(cached[1])
    else:
        title = custom = prompt = reply = cwd = branch = last_kind = ""
        todos: list[dict] = []
        messages: list[dict] = []   # 你和助手的對話（只留文字，不含它執行工具的過程）
        for o in _read_slices(path):
            t = o.get("type")
            when = _ts(o.get("timestamp")) if isinstance(o.get("timestamp"), str) else 0.0
            if isinstance(o.get("cwd"), str):
                cwd = o["cwd"] or cwd
            if isinstance(o.get("gitBranch"), str):
                branch = o["gitBranch"] or branch
            if t == "custom-title":   # 你在 Claude 裡用 /rename 改的名字，優先
                custom = o.get("customTitle") if isinstance(o.get("customTitle"), str) and o.get("customTitle") else custom
            elif t == "ai-title":
                title = o.get("aiTitle") if isinstance(o.get("aiTitle"), str) and o.get("aiTitle") else title
            elif t == "summary":
                title = title or str(o.get("summary") or "")
            elif t == "last-prompt":
                prompt = o.get("lastPrompt") if isinstance(o.get("lastPrompt"), str) and o.get("lastPrompt") else prompt
            elif t == "user" and not o.get("isSidechain"):
                txt = _text_of(o.get("message"))
                if txt and not txt.startswith("<"):
                    prompt, last_kind = txt, "user"
                    messages.append({"role": "user", "text": txt[:MSG_CHARS], "ts": when})
            elif t == "assistant" and not o.get("isSidechain"):
                msg = o.get("message") if isinstance(o.get("message"), dict) else {}
                txt = _text_of(msg)
                reply = txt or reply
                if txt:
                    if messages and messages[-1]["role"] == "ai" and when - messages[-1]["ts"] < 5:
                        messages[-1]["text"] = (messages[-1]["text"] + "\n" + txt)[:MSG_CHARS]   # 同一輪回覆的幾段合成一則
                    else:
                        messages.append({"role": "ai", "text": txt[:MSG_CHARS], "ts": when})
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
        # 名稱跟 Claude 裡顯示的一樣：自己改的名字 → Claude 自動取的名字 → 第一句話
        info = {"id": path.stem, "source": "本機", "title": (custom or title or prompt)[:60], "started": messages[0]["ts"] if messages else st.st_mtime, "prompt": prompt[:300],
                "reply": reply[:400], "todos": todos, "last_kind": last_kind, "url": "",
                "where": Path(cwd).name if cwd else "", "cwd": cwd, "branch": branch, "updated": st.st_mtime,
                "messages": messages[-MSG_KEEP:]}
        pics = [x for m in messages[-MSG_KEEP:] if m["role"] == "ai" for x in file_images(m["text"], cwd, m["ts"])]
        info["file_images"] = pics
        _session_cache[str(path)] = ((st.st_mtime, st.st_size), dict(info))
    try:
        found = scan_images(path)
    except OSError:
        found = []
    seen, pics = set(), []
    for x in sorted(found + info.pop("file_images", []), key=lambda x: x["ts"]):
        if x["id"] not in seen:
            seen.add(x["id"])
            pics.append(x)
    info["images"] = pics[-IMAGES_KEEP:]
    last_kind = info.pop("last_kind", "")
    if (now or time.time()) - info["updated"] < 120:
        info["state"], info["state_text"] = "running", "正在做"
    elif last_kind == "reply":
        info["state"], info["state_text"] = "waiting", "已回覆，等你看"
    else:
        info["state"], info["state_text"] = "idle", "已停止"
    return _finish(info)


_child_cache: dict[str, tuple] = {}


def _last_say(rows: list[dict]) -> str:
    """子助手最後說的話：一般是文字；交回成果時則放在工具呼叫的 message 裡。"""
    for o in reversed(rows):
        if o.get("type") != "assistant":
            continue
        msg = o.get("message") if isinstance(o.get("message"), dict) else {}
        txt = _text_of(msg)
        if txt:
            return txt
        for b in msg.get("content") if isinstance(msg.get("content"), list) else []:
            said = (b.get("input") or {}).get("message") if isinstance(b, dict) and b.get("type") == "tool_use" else None
            if isinstance(said, str) and said.strip():
                return said.strip()
    return ""


def sub_conversations(session_file: Path, now: float | None = None) -> list[dict]:
    """這段對話裡，助手另外派出去的子助手（子對話）。
    Claude Code 把它們存在「<對話代號>/subagents/agent-*.jsonl」，旁邊的 .meta.json 有任務名稱與是否做完。"""
    folder = session_file.with_suffix("") / "subagents"
    out = []
    try:
        files = sorted(folder.glob("agent-*.jsonl"))
    except OSError:
        return out
    for f in files:
        try:
            st = f.stat()
            cached = _child_cache.get(str(f))
            if cached and cached[0] == (st.st_mtime, st.st_size):
                info = dict(cached[1])
            else:
                meta = {}
                try:
                    meta = json.loads(f.with_name(f.stem + ".meta.json").read_text("utf-8"))
                except (OSError, ValueError):
                    pass
                rows = _read_slices(f, head=20_000, tail=200_000)
                ask = next((_text_of(o.get("message")) for o in rows if o.get("type") == "user"), "")
                title = meta.get("description") if isinstance(meta, dict) and isinstance(meta.get("description"), str) else ""
                info = {"id": f.stem.replace("agent-", ""), "title": (title or ask or "子對話")[:60], "ask": ask[:MSG_CHARS],
                        "last": _last_say(rows)[:MSG_CHARS], "finished": bool(isinstance(meta, dict) and meta.get("finished")),
                        "updated": st.st_mtime}
                _child_cache[str(f)] = ((st.st_mtime, st.st_size), dict(info))
            fresh = (now or time.time()) - info["updated"] < 120
            info["state"] = "running" if fresh and not info["finished"] else "done" if info["finished"] else "idle"
            info["state_text"] = {"running": "正在做", "done": "做完了", "idle": "停著"}[info["state"]]
            out.append(info)
        except Exception:   # 單一子對話格式不對就跳過
            continue
    return sorted(out, key=lambda c: c["updated"])


def local_sessions(days: float = 30, limit: int = 40) -> list[dict]:
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
        except Exception:   # 這份紀錄格式不對就跳過，不影響其他的
            info = None
        if info:
            info["children"] = sub_conversations(f)
            if any(c["state"] == "running" for c in info["children"]) and info["state"] != "running":
                info["state"], info["state_text"] = "running", "子助手正在做"   # 主對話停著，但它派出去的還在忙
            out.append(info)
    return out


# ---------------------------------------------------------------- 用到的與收起來的
SHELVE_AFTER = 3 * 86400   # 做完或停著超過三天的對話自動收起來


def is_shelved(task: dict, cfg: dict, now: float | None = None) -> bool:
    """這段對話是不是「收起來的」：不佔畫面、不算進數字、不通知。
    手動收起來的，之後有新動靜會自己回來；做完或停著超過三天的自動收起來，除非你把它放回來過。"""
    now = now or time.time()
    put_away = cfg.get("shelved", {}).get(task["id"])
    if isinstance(put_away, (int, float)) and not isinstance(put_away, bool) and task["updated"] <= put_away + 1:
        return True
    kept = cfg.get("kept", {}).get(task["id"])
    kept = kept if isinstance(kept, (int, float)) and not isinstance(kept, bool) else 0
    # GitHub 上還開著等你的成果不會自動收（那是真的待辦）；這台電腦上「回覆完就沒下文」的對話則會
    unused = task["state"] in ("idle", "done") or (task["state"] == "waiting" and task.get("source") != "GitHub")
    return unused and now - max(task["updated"], kept) > SHELVE_AFTER


def set_shelved(thread_id: str, on: bool) -> None:
    with core._LOCK:
        cfg = core.load_config()
        shelved, kept = dict(cfg.get("shelved", {})), dict(cfg.get("kept", {}))
        shelved.pop(thread_id, None)
        kept.pop(thread_id, None)
        if on:
            shelved[thread_id] = time.time()
        else:
            kept[thread_id] = time.time()   # 放回來：從現在起再算三天
        core.set_config(shelved=dict(list(shelved.items())[-300:]), kept=dict(list(kept.items())[-300:]))


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


_SESSION = re.compile(r"claude\.ai/code/(session_[A-Za-z0-9]{6,})")


def session_id(*texts) -> str:
    """助手在成果說明或提交訊息的結尾會附上它那段雲端對話的連結；有了它才能把回覆送進去。"""
    for text in texts:
        m = _SESSION.search(text) if isinstance(text, str) else None
        if m:
            return m.group(1)
    return ""


_FOOTER = re.compile(r"\n+-{3,}\s*\n_?Generated (?:by|with) \[?Claude Code.*$|\n+🤖 Generated with.*$"
                     r"|\n+(?:Co-Authored-By|Claude-Session):.*$|\n*https?://claude\.ai/code/session_\S+\s*$", re.S)


def pr_messages(pr: dict, comments: list[dict] | None) -> list[dict]:
    """GitHub 上看得到的對話：助手寫的成果說明，加上之後的留言。
    助手的留言結尾有「Generated by Claude Code」字樣，其餘視為你（或同事）說的話。"""
    out = []
    body = _CHECKBOX.sub("", pr.get("body") or "")
    if body.strip():
        out.append({"role": "ai", "text": _FOOTER.sub("", body).strip()[:MSG_CHARS], "ts": _ts(pr.get("created_at", "")),
                    "images": url_images(body, _ts(pr.get("created_at", "")), "ai")})
    for c in comments or []:
        text = c.get("body") if isinstance(c, dict) else None
        if not isinstance(text, str) or not text.strip():
            continue
        bot = "Claude Code" in text[-200:] or (c.get("user") or {}).get("type") == "Bot"
        out.append({"role": "ai" if bot else "user", "text": _FOOTER.sub("", text).strip()[:MSG_CHARS],
                    "ts": _ts(c.get("created_at", "")), "images": url_images(text, _ts(c.get("created_at", "")), "ai" if bot else "user")})
    return out[-MSG_KEEP:]


def pr_task(repo: str, pr: dict, checks: list[dict] | None = None, now: float | None = None,
            comments: list[dict] | None = None) -> dict | None:
    now = now or time.time()
    updated = _ts(pr.get("updated_at", ""))
    if pr.get("state") != "open" and now - updated > 2 * 86400:
        return None  # 結束超過兩天的不再顯示
    body = pr.get("body") or ""
    todos = [{"text": m.group(2).strip()[:80], "status": "completed" if m.group(1) != " " else "pending"}
             for m in _CHECKBOX.finditer(body)]
    if pr.get("merged_at"):
        state, text = "done", "已完成並採用"
    elif pr.get("state") != "open":
        state, text = "idle", "已關閉，沒有採用"
    else:
        concl = [c.get("conclusion") for c in checks or []]
        if any(c.get("status") != "completed" for c in checks or []):
            state, text = "running", "自動檢查中"
        elif any(c in ("failure", "timed_out") for c in concl):
            state, text = "failed", "檢查沒通過，要請助手修正"
        elif now - updated < 300:
            state, text = "running", "剛更新，還在做"
        else:
            state, text = "waiting", "做完了，等你看過" if pr.get("draft") else "等你同意採用"
    return _finish({"id": f"{repo}#{pr.get('number')}", "source": "GitHub", "title": pr.get("title", "")[:80],
                    "state": state, "state_text": text, "updated": updated, "url": pr.get("html_url", ""),
                    "where": repo.split("/")[-1], "branch": (pr.get("head") or {}).get("ref", ""),
                    "draft": bool(pr.get("draft")), "repo": repo, "messages": pr_messages(pr, comments),
                    "started": _ts(pr.get("created_at", "")) or updated,
                    "session": session_id(body, *[c.get("body") for c in comments or [] if isinstance(c, dict)]),
                    "prompt": "", "reply": _CHECKBOX.sub("", body).strip()[:400], "todos": todos})


def branch_task(repo: str, name: str, commit: dict, now: float | None = None) -> dict | None:
    """還沒開 PR 的助手分支：用最後一次提交判斷是否仍在進行。"""
    c = commit.get("commit") or {}
    updated = _ts((c.get("committer") or {}).get("date", ""))
    age = (now or time.time()) - updated
    if age > 2 * 86400:
        return None
    state, text = ("running", "正在做（還沒送出成果）") if age < 900 else ("idle", "已停止（還沒送出成果）")
    msg = (c.get("message") or "").strip()
    return _finish({"id": f"{repo}@{name}", "source": "GitHub", "title": msg.splitlines()[0][:80] if msg else name,
                    "state": state, "state_text": text, "updated": updated, "url": commit.get("html_url", ""),
                    "where": repo.split("/")[-1], "branch": name, "prompt": "", "reply": msg[:400], "todos": [],
                    "repo": repo, "session": session_id(c.get("message")),
                    "messages": [{"role": "ai", "text": _FOOTER.sub("", msg)[:MSG_CHARS], "ts": updated}] if msg else []})


def _fetch_repo(repo: str, token: str, prefixes: tuple[str, ...]) -> list[dict]:
    api = f"https://api.github.com/repos/{repo}"
    tasks, seen = [], set()
    for pr in _gh_get(f"{api}/pulls?state=all&sort=updated&direction=desc&per_page=8", token):
        seen.add((pr.get("head") or {}).get("ref"))
        checks = comments = None
        if pr.get("state") == "open":
            try:
                checks = _gh_get(f"{api}/commits/{pr['head']['sha']}/check-runs", token).get("check_runs")
            except (urllib.error.URLError, KeyError, ValueError, OSError):
                pass
            try:   # 留言：有的話才算得上「對話」；讀不到就只顯示成果說明
                comments = _gh_get(f"{api}/issues/{pr['number']}/comments?per_page=30", token)
            except (urllib.error.URLError, KeyError, ValueError, OSError):
                pass
        t = pr_task(repo, pr, checks, comments=comments if isinstance(comments, list) else None)
        if t:
            tasks.append(t)
    loose = [b for b in _gh_get(f"{api}/branches?per_page=100", token)
             if b.get("name", "").startswith(prefixes) and b["name"] not in seen]
    for b in loose[:4]:
        t = branch_task(repo, b["name"], _gh_get(f"{api}/commits/{b['commit']['sha']}", token))
        if t:
            tasks.append(t)
    return tasks


def explain_http(repo: str, code: int, has_token: bool) -> str:
    if code == 404:
        return (f"找不到「{repo}」這個 GitHub 專案，或它是不公開的。請確認名稱有沒有打錯；"
                + ("若名稱正確，請確認權杖有這個專案的讀取權限。" if has_token else "若是不公開的專案，請在寵物上按右鍵 →「設定 GitHub 權杖」。"))
    if code == 401:
        return "GitHub 權杖無效或已過期。請在寵物上按右鍵 →「設定 GitHub 權杖」重新貼上。"
    if code in (403, 429):
        return ("GitHub 暫時限制了查詢次數，稍後會自動恢復。" + ("" if has_token else "設定 GitHub 權杖可以避免這個限制。"))
    return f"GitHub 暫時有狀況（代碼 {code}），會自動再試。"


def check_repo(repo: str) -> tuple[bool, str]:
    """加入追蹤時立刻連線確認，回傳 (是否連得上, 給使用者看的一句話)。"""
    token = core.load_config().get("github_token", "")
    prefixes = tuple(core.load_config().get("ai_branch_prefixes") or ["claude/"])
    try:
        tasks = _fetch_repo(repo, token, prefixes)
    except urllib.error.HTTPError as e:
        return False, explain_http(repo, e.code, bool(token))
    except (urllib.error.URLError, ValueError, KeyError, TypeError, OSError):
        return False, "目前連不上 GitHub，稍後會自動再試。"
    _gh_cache["at"] = 0.0  # 讓面板與寵物馬上重新整理
    doing = sum(t["state"] == "running" for t in tasks)
    yours = sum(t["state"] in ("waiting", "failed") for t in tasks)
    if not (doing or yours):
        return True, f"連得上「{repo}」，目前沒有進行中的事情。"
    return True, f"連得上「{repo}」：{doing} 件正在做、{yours} 件等你處理。"


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
            error = explain_http(repo, e.code, bool(token))
        except (urllib.error.URLError, ValueError, KeyError, TypeError, OSError):
            error = "目前連不上 GitHub（可能是網路問題），顯示的是上次的結果。會自動再試。"
    if error and not tasks and _gh_cache["key"] == key:
        tasks = _gh_cache["tasks"]  # 暫時連不上就沿用上次結果
    _gh_cache.update(at=time.time(), key=key, tasks=tasks, error=error)
    return tasks, error


# ---------------------------------------------------------------- 彙整
def all_tasks() -> dict:
    try:
        gh, err = github_tasks()
    except Exception:
        gh, err = [], "暫時讀不到 GitHub 上的進度，稍後會自動再試。"
    try:
        local = local_sessions()
    except Exception:
        local = []
    cfg = core.load_config()
    since = cfg.get("read_since") if isinstance(cfg.get("read_since"), (int, float)) else 0
    if not since:   # 第一次用：在這之前的訊息都算看過，不要一開始就滿畫面「新訊息」
        since = time.time()
        core.set_config(read_since=since)
        cfg = core.load_config()
    every = sorted(local + gh, key=lambda t: (ORDER.get(t["state"], 9), -t["updated"]))
    for t in every:
        mark_unread(t, cfg, since)
    tasks = [t for t in every if not is_shelved(t, cfg)]
    shelved = sorted((t for t in every if is_shelved(t, cfg)), key=lambda t: -t["updated"])
    counts = {s: sum(t["state"] == s for t in tasks) for s in ORDER}
    return {"tasks": tasks, "shelved": shelved, "counts": counts, "error": err,
            "github_configured": bool(core.load_config().get("github_repos"))}


# ---------------------------------------------------------------- 已讀
def mark_unread(task: dict, cfg: dict, since: float) -> None:
    """算出這段對話有幾則你還沒看過的 AI 訊息／圖片。看過到哪裡記在設定的 read 裡（時間）。"""
    seen = cfg.get("read", {}).get(task["id"])
    seen = seen if isinstance(seen, (int, float)) and not isinstance(seen, bool) else since
    new_msgs = [m for m in task.get("messages") or [] if m.get("role") == "ai" and m.get("ts", 0) > seen]
    new_pics = [x for x in task.get("images") or [] if x.get("role") == "ai" and x.get("ts", 0) > seen]
    task["read_at"], task["unread"] = seen, len(new_msgs) + len(new_pics)


def last_ai_time(task: dict) -> float:
    times = [m.get("ts", 0) for m in task.get("messages") or [] if m.get("role") == "ai"]
    times += [x.get("ts", 0) for x in task.get("images") or [] if x.get("role") == "ai"]
    return max(times, default=0)


def set_read(thread_id: str, upto: float | None) -> None:
    """upto：看到哪個時間為止（None 表示看到現在）。要標回「未讀」就給最後一則 AI 訊息之前的時間。"""
    with core._LOCK:
        read = dict(core.load_config().get("read", {}))
        read.pop(thread_id, None)
        read[thread_id] = time.time() if upto is None else float(upto)
        core.set_config(read=dict(list(read.items())[-500:]))


def changes(old: dict[str, str], tasks: list[dict]) -> list[tuple[dict, str]]:
    """比對前後狀態，回傳值得通知的轉變：(任務, 之前的 state)。"""
    out = []
    for t in tasks:
        before = old.get(t["id"])
        if before and before != t["state"] and t["state"] in ("waiting", "failed", "done"):
            out.append((t, before))
    return out
