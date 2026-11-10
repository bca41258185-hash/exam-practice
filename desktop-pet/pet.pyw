"""檔案管家桌面寵物 —— 看牠就知道 AI 助手做到哪了。雙擊本檔執行（Python 3.9+，免裝套件）。

  睡覺      沒有任務在跑
  敲筆電    有助手正在執行（腳下是目前任務的進度條）
  舉牌「!」 有助手做完一輪，等你看
  冒汗      有助手出錯（自動檢查失敗）
  頭上的標籤寫出各狀態的任務數量（執行／等你／出錯）。

操作：點一下看任務清單｜雙擊開啟副螢幕觸控面板｜拖曳移動｜右鍵設定
"""
from __future__ import annotations

import queue
import random
import re
import sys
import threading
import time
import tkinter as tk
import webbrowser
from pathlib import Path
from tkinter import filedialog, messagebox

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ai_tasks  # noqa: E402
import panel  # noqa: E402
import pet_core as core  # noqa: E402

W, H = 150, 168
KEY = "#ff00fe"  # Windows 上用來挖空背景的顏色
FONT = {"win32": "Microsoft JhengHei UI", "darwin": "PingFang TC"}.get(sys.platform, "TkDefaultFont")
COLORS = {"running": "#5aa9e6", "waiting": "#f4b860", "failed": "#ef6b60", "done": "#62c483", "idle": "#8b93a1"}
LABELS = {"running": "執行", "waiting": "等你", "failed": "出錯"}
POLL_SECONDS = 15


def mood_of(counts: dict) -> str:
    """需要你處理的優先：出錯 > 等你 > 執行中 > 睡覺。"""
    for state in ("failed", "waiting", "running"):
        if counts.get(state):
            return state
    return "sleep"


class Pet:
    def __init__(self, start_server: bool = True) -> None:
        self.cfg = core.load_config()
        self.root = root = tk.Tk()
        root.title("檔案管家")
        root.overrideredirect(True)
        root.attributes("-topmost", True)
        bg = "#dfe7ee"
        if sys.platform == "win32":
            bg = KEY
            root.attributes("-transparentcolor", KEY)
        elif sys.platform == "darwin":
            try:
                root.attributes("-transparent", True)
                bg = "systemTransparent"
            except tk.TclError:
                pass
        root.config(bg=bg)
        self.canvas = tk.Canvas(root, width=W, height=H, bg=bg, highlightthickness=0)
        self.canvas.pack()
        root.geometry(f"{W}x{H}+{root.winfo_screenwidth() - W - 60}+{root.winfo_screenheight() - H - 90}")

        self.frame = 0
        self.tasks: list[dict] = []
        self.counts: dict = {}
        self.error = ""
        self.known: dict[str, str] | None = None  # 上一輪各任務的狀態，用來偵測轉變
        self.happy_until = 0.0
        self.walk_dx = 0
        self.dragging = False
        self.moved = False
        self.modal = 0
        self.results: queue.Queue = queue.Queue()
        self.notes: queue.Queue = queue.Queue()
        self.bubble: tk.Toplevel | None = None
        self.bubble_job = None
        self.popup: tk.Toplevel | None = None
        self.walk_var = tk.BooleanVar(value=bool(self.cfg.get("walk", True)))

        self._build_menu()
        c = self.canvas
        c.bind("<ButtonPress-1>", self._press)
        c.bind("<B1-Motion>", self._drag)
        c.bind("<ButtonRelease-1>", self._release)
        c.bind("<Double-Button-1>", lambda e: self.open_panel())
        for seq in ("<Button-3>", "<Button-2>", "<Control-Button-1>"):
            c.bind(seq, self._menu_popup)

        if start_server:
            panel.start_in_background()
            threading.Thread(target=self._poll_loop, daemon=True).start()
        self._tick()
        self._drain()
        root.after(1200, lambda: self.say("我會幫你盯著 AI 助手的進度。\n點我看清單，雙擊開觸控面板，\n按右鍵可以設定。", seconds=9))

    # ------------------------------------------------------------ 資料
    def _poll_loop(self) -> None:
        while True:
            try:
                self.results.put(ai_tasks.all_tasks())
            except Exception as e:  # 背景執行緒不可讓程式掛掉
                self.results.put({"tasks": [], "counts": {}, "error": str(e)})
            time.sleep(POLL_SECONDS)

    def _drain(self) -> None:
        try:
            while True:
                self.update_tasks(self.results.get_nowait())
        except queue.Empty:
            pass
        try:
            self.say(self.notes.get_nowait(), seconds=20)
        except queue.Empty:
            pass
        self.root.after(500, self._drain)

    def update_tasks(self, data: dict) -> None:
        self.tasks, self.counts, self.error = data["tasks"], data.get("counts", {}), data.get("error", "")
        now = {t["id"]: t["state"] for t in self.tasks}
        if self.known is not None:  # 第一輪只記錄，不通知
            news = ai_tasks.changes(self.known, self.tasks)
            if news:
                t = news[0][0]
                text = {"waiting": "做完一輪了，等你看！", "failed": "出錯了，需要你看一下。", "done": "已經合併完成！"}[t["state"]]
                extra = f"\n（另外還有 {len(news) - 1} 件有新進度）" if len(news) > 1 else ""
                self.say(f"「{t['title'][:22]}」\n{text}{extra}", seconds=12)
                if t["state"] == "done":
                    self.happy_until = time.time() + 6
        self.known = now
        if self.popup:
            self._fill_popup()

    @property
    def mood(self) -> str:
        return "happy" if time.time() < self.happy_until else mood_of(self.counts)

    # ------------------------------------------------------------ 外觀
    def _draw(self) -> None:
        c, f, mood = self.canvas, self.frame, self.mood
        c.delete("all")
        fur, line, pink = "#f4b860", "#5b3a1e", "#f28fa0"
        # 頭上的狀態標籤：寫出文字，不必記顏色
        shown = [(COLORS[s], f"{LABELS[s]} {self.counts[s]}") for s in ("running", "waiting", "failed") if self.counts.get(s)]
        if self.error:  # 連不上或設定有問題：不要讓人以為「沒事」
            shown = shown[:2] + [("#d7dbe2", "連線?")]
        x = W / 2 - len(shown) * 24 + 1
        for color, text in shown:
            c.create_rectangle(x, 4, x + 46, 26, fill=color, outline="white", width=2)
            c.create_text(x + 23, 15, text=text, font=(FONT, 9, "bold"), fill="#1c1c1c")
            x += 48

        bob = {"sleep": (0, 0, 1, 1, 1, 1, 0, 0)[f // 4 % 8], "waiting": (0, 2, 4, 2)[f // 2 % 4],
               "failed": f % 2, "happy": (0, 3, 5, 3)[f // 2 % 4]}.get(mood, (0, 1, 2, 1)[f // 3 % 4])
        y = 36 + bob
        ox = 4  # 貓身水平位移
        # 尾巴、耳朵、身體
        c.create_arc(ox + 84, y + 62, ox + 126, y + 112, start=-70, extent=200, style="arc", outline=fur, width=9)
        for x0, x1, x2 in ((22, 30, 52), (108, 100, 78)):
            s = 1 if x0 < 60 else -1
            c.create_polygon(ox + x0, y + 4, ox + x1, y + 44, ox + x2, y + 24, fill=fur, outline=line, width=2)
            c.create_polygon(ox + x0 + 6 * s, y + 14, ox + x1 + 4 * s, y + 36, ox + x2 - 6 * s, y + 26, fill=pink, outline="")
        c.create_oval(ox + 14, y + 16, ox + 116, y + 112, fill=fur, outline=line, width=2)
        c.create_oval(ox + 38, y + 66, ox + 92, y + 112, fill="#fde9c9", outline="")
        # 眼睛
        for ex in (ox + 46, ox + 84):
            if mood == "sleep":
                c.create_arc(ex - 8, y + 48, ex + 8, y + 60, start=200, extent=140, style="arc", outline=line, width=3)
            elif mood == "happy":
                c.create_arc(ex - 8, y + 46, ex + 8, y + 62, start=20, extent=140, style="arc", outline=line, width=3)
            elif mood != "failed" and f % 40 in (0, 1):
                c.create_line(ex - 7, y + 54, ex + 7, y + 54, fill=line, width=3)
            else:
                dx, dy = ((-2, 0, 2, 0)[f // 2 % 4], 3) if mood == "running" else (0, 0)
                c.create_oval(ex - 7, y + 45, ex + 7, y + 63, fill=line, outline="")
                c.create_oval(ex - 3 + dx, y + 48 + dy, ex + 2 + dx, y + 53 + dy, fill="white", outline="")
        if mood == "failed":  # 八字眉與汗滴
            c.create_line(ox + 36, y + 42, ox + 54, y + 37, fill=line, width=3)
            c.create_line(ox + 94, y + 42, ox + 76, y + 37, fill=line, width=3)
            c.create_polygon(ox + 22, y + 34, ox + 16, y + 48, ox + 28, y + 48, fill="#7cc4f0", outline="")
            c.create_oval(ox + 16, y + 42, ox + 28, y + 54, fill="#7cc4f0", outline="")
        # 腮紅、鼻子、嘴
        c.create_oval(ox + 26, y + 62, ox + 40, y + 70, fill=pink, outline="")
        c.create_oval(ox + 90, y + 62, ox + 104, y + 70, fill=pink, outline="")
        c.create_polygon(ox + 61, y + 62, ox + 69, y + 62, ox + 65, y + 67, fill=line)
        if mood == "failed":
            c.create_arc(ox + 57, y + 68, ox + 73, y + 80, start=20, extent=140, style="arc", outline=line, width=2)
        else:
            c.create_arc(ox + 55, y + 62, ox + 65, y + 74, start=180, extent=180, style="arc", outline=line, width=2)
            c.create_arc(ox + 65, y + 62, ox + 75, y + 74, start=180, extent=180, style="arc", outline=line, width=2)

        if mood == "sleep":
            for i, (zx, zy, size) in enumerate(((112, 22, 10), (124, 8, 13), (136, -8, 16))):
                if (f // 5) % 4 > i:
                    c.create_text(ox + zx, y + zy, text="z", font=(FONT, size, "bold"), fill="#6b7a99")
            for px in (ox + 48, ox + 82):
                c.create_oval(px - 9, y + 98, px + 9, y + 112, fill=fur, outline=line, width=2)
        elif mood == "running":  # 筆電與輪流敲鍵盤的爪子
            c.create_polygon(ox + 34, y + 112, ox + 96, y + 112, ox + 90, y + 84, ox + 40, y + 84,
                             fill="#3b4252", outline="#1f2430", width=2)
            glow = ("#8fd3ff", "#b7e3ff")[f // 2 % 2]
            c.create_polygon(ox + 44, y + 106, ox + 86, y + 106, ox + 84, y + 90, ox + 46, y + 90, fill=glow, outline="")
            for i, px in enumerate((ox + 36, ox + 94)):
                up = 4 if (f + i) % 2 else 0
                c.create_oval(px - 8, y + 96 - up, px + 8, y + 110 - up, fill=fur, outline=line, width=2)
        else:  # 舉牌
            alert = mood in ("waiting", "failed")
            col = COLORS["failed"] if mood == "failed" else COLORS["waiting"] if alert else COLORS["done"]
            wave = (0, -2, 0, 2)[f // 2 % 4] if alert else 0
            c.create_line(ox + 112, y + 98, ox + 122 + wave, y + 56, fill="#8a5a2b", width=4)
            c.create_rectangle(ox + 104 + wave, y + 22, ox + 142 + wave, y + 58, fill=col, outline=line, width=2)
            c.create_text(ox + 123 + wave, y + 40, text="!" if alert else "✓", font=(FONT, 18, "bold"), fill="#1c1c1c")
            c.create_oval(ox + 102, y + 88, ox + 120, y + 104, fill=fur, outline=line, width=2)
            c.create_oval(ox + 30, y + 96, ox + 48, y + 110, fill=fur, outline=line, width=2)

        # 腳下的進度條：優先代表「正在執行」的任務；沒有的話才是等你或出錯的那一件
        withbar = [t for t in self.tasks if t["progress"][1] and t["state"] in ("running", "waiting", "failed")]
        top = next((t for t in withbar if t["state"] == "running"), withbar[0] if withbar else None)
        if top:
            done, total = top["progress"]
            c.create_rectangle(14, H - 12, W - 14, H - 3, fill="#2d323c", outline="white")
            if done:
                c.create_rectangle(15, H - 11, 15 + (W - 30) * done / total, H - 4, fill=COLORS[top["state"]], outline="")

    def _tick(self) -> None:
        self.frame += 1
        self._walk()
        self._draw()
        self.root.after(130, self._tick)

    def _walk(self) -> None:
        if self.dragging or self.modal or self.popup or not self.walk_var.get() or self.mood in ("sleep", "running"):
            self.walk_dx = 0
            return
        if self.walk_dx == 0:
            if random.random() < 0.006:
                self.walk_dx = random.choice((-2, 2))
            return
        x = self.root.winfo_x() + self.walk_dx
        if random.random() < 0.03 or not 0 <= x <= self.root.winfo_screenwidth() - W:
            self.walk_dx = 0
            return
        self.root.geometry(f"+{x}+{self.root.winfo_y()}")
        self._place(self.bubble)

    # ------------------------------------------------------------ 泡泡與任務清單
    def say(self, text: str, seconds: float = 6) -> None:
        self._hide_bubble()
        if self.popup:
            return
        b = self.bubble = tk.Toplevel(self.root)
        b.overrideredirect(True)
        b.attributes("-topmost", True)
        tk.Label(b, text=text, font=(FONT, 10), bg="#fffbe6", fg="#3b2a12", justify="left",
                 padx=10, pady=6, relief="solid", bd=1, wraplength=280).pack()
        b.bind("<Button-1>", lambda e: self._hide_bubble())
        self._place(b)
        self.bubble_job = self.root.after(int(seconds * 1000), self._hide_bubble)

    def _place(self, win: tk.Toplevel | None) -> None:
        if not win:
            return
        win.update_idletasks()
        bw, bh = win.winfo_reqwidth(), win.winfo_reqheight()
        x = max(4, min(self.root.winfo_x() + W // 2 - bw // 2, self.root.winfo_screenwidth() - bw - 4))
        y = self.root.winfo_y() - bh - 4
        win.geometry(f"+{x}+{y if y >= 0 else self.root.winfo_y() + H + 4}")

    def _hide_bubble(self) -> None:
        if self.bubble_job:
            self.root.after_cancel(self.bubble_job)
            self.bubble_job = None
        if self.bubble:
            self.bubble.destroy()
            self.bubble = None

    def toggle_popup(self) -> None:
        if self.popup:
            self.popup.destroy()
            self.popup = None
            return
        self._hide_bubble()
        p = self.popup = tk.Toplevel(self.root)
        p.overrideredirect(True)
        p.attributes("-topmost", True)
        p.config(bg="#343a45", padx=1, pady=1)
        self._fill_popup()

    def _fill_popup(self) -> None:
        p = self.popup
        for child in p.winfo_children():
            child.destroy()
        box = tk.Frame(p, bg="#1a1d23", padx=10, pady=8)
        box.pack()
        rows = [t for t in self.tasks if t["state"] != "idle"][:6] or self.tasks[:3]
        if not rows:
            hint = ("目前沒有進行中的 AI 任務。" if core.load_config().get("github_repos")
                    else "還沒設定要看哪裡的 AI 助手。\n在我身上按右鍵 →\n「追蹤 AI 助手的 GitHub 專案…」")
            if not self.error:
                tk.Label(box, text=hint, font=(FONT, 10), bg="#1a1d23", fg="#9aa0ab", justify="left").pack(anchor="w")
        for t in rows:
            done, total = t["progress"]
            row = tk.Frame(box, bg="#1a1d23", cursor="hand2" if t.get("url") else "")
            row.pack(fill="x", anchor="w", pady=3)
            tk.Label(row, text="●", font=(FONT, 12), bg="#1a1d23", fg=COLORS[t["state"]]).pack(side="left", anchor="n")
            text = tk.Frame(row, bg="#1a1d23")
            text.pack(side="left", padx=(4, 0))
            tk.Label(text, text=t["title"][:26], font=(FONT, 10, "bold"), bg="#1a1d23", fg="#ecebe6").pack(anchor="w")
            detail = t["state_text"] + (f"・{done}/{total}" if total else "")
            if t.get("doing") and t["state"] == "running":
                detail += f"\n正在：{t['doing'][:24]}"
            if t.get("where"):
                detail += f"\n在 {t['where']}"
            tk.Label(text, text=detail, font=(FONT, 9), bg="#1a1d23", fg=COLORS[t["state"]], justify="left").pack(anchor="w")
            if t.get("url"):
                for w in (row, text, *row.winfo_children(), *text.winfo_children()):
                    w.bind("<Button-1>", lambda e, u=t["url"]: webbrowser.open(u))
        if self.error:
            tk.Label(box, text=self.error, font=(FONT, 9), bg="#1a1d23", fg=COLORS["failed"], wraplength=280,
                     justify="left").pack(anchor="w", pady=(4, 0))
        self._place(p)

    # ------------------------------------------------------------ 滑鼠與選單
    def _press(self, e) -> None:
        self.dragging, self.moved, self._off = True, False, (e.x, e.y)

    def _drag(self, e) -> None:
        if abs(e.x - self._off[0]) + abs(e.y - self._off[1]) > 4:
            self.moved = True
        if self.moved:
            self.root.geometry(f"+{e.x_root - self._off[0]}+{e.y_root - self._off[1]}")
            self._place(self.bubble)
            self._place(self.popup)

    def _release(self, e) -> None:
        self.dragging = False
        if not self.moved:
            self.toggle_popup()

    def _menu_popup(self, e) -> None:
        self.dragging = False
        try:
            self.menu.tk_popup(e.x_root, e.y_root)
        finally:
            self.menu.grab_release()

    def _build_menu(self) -> None:
        m = self.menu = tk.Menu(self.root, tearoff=0, font=(FONT, 10))
        m.add_command(label="開啟觸控面板（副螢幕）", command=self.open_panel)
        m.add_separator()
        m.add_command(label="加入一整批專案…（選總資料夾）", command=lambda: self.add_project(True))
        m.add_command(label="加入一個專案…", command=lambda: self.add_project(False))
        m.add_separator()
        m.add_command(label="追蹤 AI 助手的 GitHub 專案…", command=self.add_repo)
        m.add_command(label="管理追蹤的 GitHub 專案…", command=self.manage_repos)
        m.add_command(label="設定 GitHub 權杖…（不公開的專案才需要）", command=self.set_token)
        m.add_separator()
        m.add_checkbutton(label="到處走走", variable=self.walk_var,
                          command=lambda: core.set_config(walk=self.walk_var.get()))
        m.add_command(label="結束檔案管家（面板也會停止）", command=self.root.destroy)

    def _dialog(self, fn, *args, **kw):
        self.modal += 1
        try:
            return fn(*args, parent=self.root, **kw)
        finally:
            self.modal -= 1

    # ------------------------------------------------------------ 功能
    def open_panel(self) -> None:
        if self.popup:
            self.toggle_popup()
        panel.launch_browser()
        self.say("觸控面板開好了。\n拖到副螢幕後按右上角的全螢幕。")

    def add_project(self, as_root: bool) -> None:
        title = "加入一整批專案：請選總資料夾（裡面每個子資料夾是一個專案）" if as_root else "加入一個專案：請選那個專案的資料夾"
        folder = self._dialog(filedialog.askdirectory, title=title)
        if not folder:
            return
        try:
            added = panel.add_project(folder, as_root)
        except core.ProtectedFolderError as e:
            return self._dialog(messagebox.showwarning, "檔案管家", str(e))
        self.say(f"已加入「{Path(added).name}」。\n已經開著的觸控面板會在半分鐘內更新。", seconds=9)

    def ask_text(self, title: str, message: str, secret: bool = False) -> str | None:
        """中文按鈕的輸入視窗。按「取消」或關閉回傳 None。"""
        self.modal += 1
        win = tk.Toplevel(self.root)
        win.title(title)
        win.attributes("-topmost", True)
        win.resizable(False, False)
        tk.Label(win, text=message, font=(FONT, 10), justify="left", wraplength=460, padx=16, pady=12).pack(anchor="w")
        entry = tk.Entry(win, font=(FONT, 11), width=52, show="*" if secret else "")
        entry.pack(padx=16)
        result: list[str | None] = [None]
        bar = tk.Frame(win)
        bar.pack(fill="x", padx=16, pady=12)

        def ok(*_):
            result[0] = entry.get()
            win.destroy()
        tk.Button(bar, text="取消", font=(FONT, 10), width=8, command=win.destroy).pack(side="right")
        tk.Button(bar, text="確定", font=(FONT, 10), width=8, command=ok).pack(side="right", padx=8)
        entry.bind("<Return>", ok)
        win.bind("<Escape>", lambda e: win.destroy())
        self._last_dialog = win  # 測試用
        entry.focus_set()
        if not getattr(self, "headless", False):
            win.grab_set()
            self.root.wait_window(win)
        self.modal -= 1
        return result[0]

    def add_repo(self, repo: str | None = None) -> None:
        repo = repo or self.ask_text(
            "追蹤 AI 助手的 GitHub 專案",
            "AI 助手寫程式時，成果會放在 GitHub 網站上的某個「專案」（英文叫 repo）裡。\n"
            "請把那個專案的網址貼在下面，我就能告訴你它做到哪了。\n\n"
            "怎麼找：打開 AI 助手給你的成果連結，網址開頭像這樣：\n"
            "https://github.com/你的帳號/專案名稱\n（貼整個網址，或只打「你的帳號/專案名稱」都可以）")
        if not repo:
            return
        m = re.search(r"(?:github\.com/)?([\w.-]+)/([\w.-]+?)(?:\.git|/.*)?$", repo.strip())
        if not m:
            return self._dialog(messagebox.showwarning, "檔案管家",
                                "看不出是哪個專案。\n請貼上像 https://github.com/你的帳號/專案名稱 這樣的網址。")
        name = f"{m.group(1)}/{m.group(2)}"
        cur = core.load_config().get("github_repos", [])
        if name not in cur:
            core.set_config(github_repos=cur + [name])
        self.say(f"已加入「{name}」，正在連線確認…", seconds=20)

        def check():
            ok, text = ai_tasks.check_repo(name)   # 在背景連線；結果交回主執行緒顯示
            self.notes.put(text if ok else text + "\n（可在右鍵「管理追蹤的 GitHub 專案」移除）")
        threading.Thread(target=check, daemon=True).start()

    def manage_repos(self) -> None:
        self.modal += 1
        win = tk.Toplevel(self.root)
        win.title("管理追蹤的 GitHub 專案")
        win.attributes("-topmost", True)
        win.resizable(False, False)
        body = tk.Frame(win, padx=16, pady=12)
        body.pack()

        def closed(e):
            if e.widget is win:
                self.modal -= 1
        win.bind("<Destroy>", closed)

        def redraw():
            for child in body.winfo_children():
                child.destroy()
            cfg = core.load_config()
            repos = cfg.get("github_repos", [])
            tk.Label(body, text="目前追蹤這些 GitHub 專案：" if repos else "目前沒有追蹤任何 GitHub 專案。",
                     font=(FONT, 10)).grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 6))
            for i, repo in enumerate(repos, 1):
                tk.Label(body, text=repo, font=(FONT, 10, "bold")).grid(row=i, column=0, sticky="w", padx=(0, 20))
                tk.Button(body, text="停止追蹤", font=(FONT, 9), command=lambda r=repo: remove(r)).grid(row=i, column=1, pady=2)
            row = len(repos) + 1
            tk.Label(body, text="GitHub 權杖：" + ("已設定" if cfg.get("github_token") else "未設定（公開的專案不需要）"),
                     font=(FONT, 10)).grid(row=row, column=0, sticky="w", pady=(10, 0))
            if cfg.get("github_token"):
                tk.Button(body, text="清除權杖", font=(FONT, 9), command=clear_token).grid(row=row, column=1, pady=(10, 0))
            tk.Label(body, text="停止追蹤只是不再顯示，不會影響 GitHub 上的任何東西。", font=(FONT, 9),
                     fg="#666").grid(row=row + 1, column=0, columnspan=2, sticky="w", pady=(10, 0))
            tk.Button(body, text="關閉", font=(FONT, 10), width=8, command=win.destroy).grid(row=row + 2, column=1, pady=(10, 0))

        def remove(repo):
            core.set_config(github_repos=[r for r in core.load_config().get("github_repos", []) if r != repo])
            redraw()

        def clear_token():
            core.set_config(github_token="")
            redraw()
        redraw()
        self._last_dialog = win

    def set_token(self) -> None:
        token = self.ask_text(
            "設定 GitHub 權杖",
            "只有「不公開」的 GitHub 專案才需要這一步；公開的專案可以直接按取消。\n"
            "權杖是一串讓我「只能讀取」你專案進度的通行碼。取得方式：\n\n"
            "1. 登入 github.com，點右上角頭像 → Settings\n"
            "2. 左側最下面 Developer settings → Personal access tokens → Fine-grained tokens\n"
            "3. 按 Generate new token；Repository access 選你要追蹤的專案\n"
            "4. Permissions 裡把 Contents 和 Pull requests 設成 Read-only\n"
            "5. 按最下面的 Generate token，把產生的那串字複製貼到下面\n\n"
            "這串字只會存在這台電腦裡（未加密），請不要給別人。\n"
            "要清除已存的權杖，請到「管理追蹤的 GitHub 專案」。", secret=True)
        if token is None or not token.strip():
            return  # 留空或取消都不會動到已存的權杖
        core.set_config(github_token=token.strip())
        ai_tasks._gh_cache["at"] = 0.0
        self.say("權杖已存好，稍後就會更新進度。")


if __name__ == "__main__":
    Pet().root.mainloop()
