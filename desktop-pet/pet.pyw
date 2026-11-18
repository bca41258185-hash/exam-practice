"""檔案管家桌面寵物（一隻史萊姆）—— 看牠就知道 AI 助手做到哪了。雙擊本檔執行（Python 3.9+，免裝套件）。

  攤平睡覺        沒有任務在跑
  一下一下地彈    有助手正在執行（腳下是目前任務的進度條）
  頭上冒「!」搖晃  有助手做完一輪，等你看
  發抖冒汗        有助手出錯
  有事情時，牠會跳到滑鼠游標旁邊告訴你是哪一件，說完再回原位。
  頭上的標籤寫出各狀態的任務數量（執行／等你／出錯）。

操作：點一下看任務清單｜雙擊開啟副螢幕觸控面板｜拖曳移動｜右鍵設定
"""
from __future__ import annotations

import math
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

W, H = 150, 168   # 標準大小；實際大小再乘上設定的百分比


def _scale_font(font: str, k: float) -> str:
    """把 Tk 字型描述裡的字級乘上 k（例如 '{Noto Sans} 9 bold'）。"""
    parts = font.rsplit(" ", 2) if font.endswith((" bold", " normal")) else font.rsplit(" ", 1) + [""]
    try:
        size = int(parts[1])
    except (ValueError, IndexError):
        return font
    return f"{parts[0]} {max(6, round(size * k))} {parts[2]}".strip()
KEY = "#ff00fe"  # Windows 上用來挖空背景的顏色
FONT = {"win32": "Microsoft JhengHei UI", "darwin": "PingFang TC"}.get(sys.platform, "TkDefaultFont")
# 史萊姆的膚色（身體、輪廓）隨狀態改變
SKINS = {"sleep": ("#a9c1ea", "#5d77a8"), "idle": ("#8fd0ff", "#2f79b5"), "running": ("#7fc2f5", "#2f79b5"),
         "waiting": ("#f9cf8c", "#b9791b"), "failed": ("#f59a91", "#b23a30"), "happy": ("#93dba9", "#2f8a4f")}
COLORS = {"running": "#5aa9e6", "waiting": "#f4b860", "failed": "#ef6b60", "done": "#62c483", "idle": "#8b93a1"}
LABELS = {"running": "執行", "waiting": "等你", "failed": "出錯"}
POLL_SECONDS = 15


def clip(text: str, n: int) -> str:
    return text if len(text) <= n else text[:n - 1] + "…"


def pick_rows(tasks: list[dict], n: int) -> list[dict]:
    """任務很多時每種狀態輪流取，免得清單被同一種狀態（例如全是出錯）佔滿。"""
    groups = [[t for t in tasks if t["state"] == s] for s in ("failed", "waiting", "running", "done")]
    out: list[dict] = []
    while len(out) < n and any(groups):
        for g in groups:
            if g and len(out) < n:
                out.append(g.pop(0))
    return sorted(out, key=lambda t: ai_tasks.ORDER.get(t["state"], 9))


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
        self.size = core.load_config().get("pet_size", 100)
        if self.size not in panel.PET_SIZES:
            self.size = 100
        self.visible = True
        self.canvas = tk.Canvas(root, width=self.w, height=self.h, bg=bg, highlightthickness=0)
        self.canvas.pack()
        root.geometry(f"{self.w}x{self.h}+{root.winfo_screenwidth() - self.w - 60}+{root.winfo_screenheight() - self.h - 90}")

        self.frame = 0
        self.tasks: list[dict] = []
        self.counts: dict = {}
        self.error = ""
        self.known: dict[str, str] | None = None  # 上一輪各任務的狀態，用來偵測轉變
        self.happy_until = 0.0
        self.walk_dx = 0
        self.target: tuple[int, int] | None = None   # 正要跑去的位置
        self.home: tuple[int, int] | None = None     # 跑出去之前待的地方
        self.arrived = None                          # 抵達後要做的事
        self.hop = 0.0                               # 跳躍動畫的進度（0 表示沒在跳）
        self.chasing = False                         # 正跟著游標跑（有事要告訴你的那段時間）
        self.dragging = False
        self.moved = False
        self.modal = 0
        self.results: queue.Queue = queue.Queue()
        self.notes: queue.Queue = queue.Queue()
        self.bubble: tk.Toplevel | None = None
        self.bubble_job = None
        self.popup: tk.Toplevel | None = None
        self.walk_var = tk.BooleanVar(value=bool(self.cfg.get("walk", True)))
        self.size_var = tk.IntVar(value=self.size)

        self._build_menu()
        c = self.canvas
        c.bind("<ButtonPress-1>", self._press)
        c.bind("<B1-Motion>", self._drag)
        c.bind("<ButtonRelease-1>", self._release)
        c.bind("<Double-Button-1>", lambda e: self.open_panel())
        c.bind("<Control-MouseWheel>", lambda e: self.step_size(1 if e.delta > 0 else -1))   # Ctrl＋滾輪調大小
        c.bind("<Control-Button-4>", lambda e: self.step_size(1))    # Linux 的滾輪
        c.bind("<Control-Button-5>", lambda e: self.step_size(-1))
        for seq in ("<Button-3>", "<Button-2>", "<Control-Button-1>"):
            c.bind(seq, self._menu_popup)

        if start_server:
            panel.PET_ATTACHED = True
            panel.start_in_background()
            threading.Thread(target=self._poll_loop, daemon=True).start()
        self._tick()
        self._drain()
        hello = "我會幫你盯著 AI 助手的進度。\n點我看清單，雙擊開觸控面板，\n按右鍵可以設定。"
        if core.config_problem:   # 設定檔壞了：說清楚發生什麼事，不要讓人以為設定憑空消失
            hello = core.config_problem + "\n請重新加入專案資料夾。"
        root.after(1200, lambda: self.say(hello, seconds=15 if core.config_problem else 9))

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
                text = {"waiting": "做完一輪了，等你看！", "failed": "出錯了，需要你看一下。", "done": "已經完成並採用！"}[t["state"]]
                extra = f"\n（另外還有 {len(news) - 1} 件有新進度）" if len(news) > 1 else ""
                if t["state"] == "done":
                    self.happy_until = time.time() + 8

                def tell(msg=f"「{t['title'][:22]}」\n{text}{extra}"):   # 先跑到滑鼠旁邊，到了再說是哪一件；說完回原位
                    self.say(msg, seconds=12)
                    self.root.after(12500, self.go_home)
                self.run_to_pointer(tell)
        self.known = now
        if self.popup:
            self._fill_popup()

    @property
    def mood(self) -> str:
        return "happy" if time.time() < self.happy_until else mood_of(self.counts)

    # ------------------------------------------------------------ 外觀
    @property
    def w(self) -> int:
        return round(W * self.size / 100)

    @property
    def h(self) -> int:
        return round(H * self.size / 100)

    def resize(self, size: int, save: bool = True) -> None:
        """改變史萊姆大小，腳底中心位置不動。"""
        if size not in panel.PET_SIZES or size == self.size:
            return
        x, y, ow, oh = self.root.winfo_x(), self.root.winfo_y(), self.w, self.h
        self.size = size
        self.size_var.set(size)
        self.target = self.home = None
        self.chasing = False
        nx = max(0, min(x + ow // 2 - self.w // 2, self.root.winfo_screenwidth() - self.w))
        ny = max(0, min(y + oh - self.h, self.root.winfo_screenheight() - self.h))
        self.canvas.config(width=self.w, height=self.h)
        self.root.geometry(f"{self.w}x{self.h}+{nx}+{ny}")
        self._place(self.bubble)
        self._place(self.popup)
        if save:
            core.set_config(pet_size=size)

    def step_size(self, delta: int) -> None:
        i = panel.PET_SIZES.index(self.size) + delta
        if 0 <= i < len(panel.PET_SIZES):
            self.resize(panel.PET_SIZES[i])

    def set_visible(self, on: bool) -> None:
        """副螢幕上的開關：關掉時整隻收起來，也不會跑來找你。"""
        if on == self.visible:
            return
        self.visible = on
        self.target = self.home = None
        self.chasing = False
        if on:
            self.root.deiconify()
            self.root.attributes("-topmost", True)
        else:
            self._hide_bubble()
            if self.popup:
                self.toggle_popup()
            self.root.withdraw()

    def _sync_config(self) -> None:
        """面板改的開關與大小，寵物這邊跟上。"""
        cfg = core.load_config()
        size = cfg.get("pet_size", 100)
        self.resize(size if size in panel.PET_SIZES else 100, save=False)
        self.set_visible(cfg.get("pet_visible", True))

    def _draw(self) -> None:
        """畫史萊姆。身體會隨狀態變形：睡覺時攤平、工作時一下一下彈、等你時左右搖、出錯時發抖、完成時跳起來。"""
        c, mood, t = self.canvas, self.mood, time.time()
        c.delete("all")
        ink = "#1b2230"
        # 頭上的狀態標籤：寫出文字，不必記顏色
        shown = [(COLORS[s], f"{LABELS[s]} {self.counts[s]}") for s in ("running", "waiting", "failed") if self.counts.get(s)]
        if self.error:  # 連不上或設定有問題：不要讓人以為「沒事」
            if len(shown) == 3:   # 放不下四個時，犧牲最不需要你處理的「執行」，保留「等你」「出錯」
                shown = shown[1:]
            shown.append(("#d7dbe2", "連線?"))
        x = W / 2 - len(shown) * 24 + 1
        for color, text in shown:
            c.create_rectangle(x, 4, x + 46, 26, fill=color, outline="white", width=2)
            c.create_text(x + 23, 15, text=text, font=(FONT, 9, "bold"), fill=ink)
            x += 48

        # 各狀態的形變：sx、sy 是寬高倍率，lift 是離地高度，lean 是左右偏移
        sx, sy, lift, lean = 1.0, 1.0, 0.0, 0.0
        if self.hop:                      # 正跑向滑鼠：每一步都跳起來
            phase = math.sin(self.hop * math.pi)
            sx, sy, lift = 1 - .1 * phase, 1 + .14 * phase, 26 * phase
        elif mood == "sleep":
            wave = math.sin(t * 1.6)
            sx, sy = 1.16 + .03 * wave, .74 - .03 * wave
        elif mood == "running":
            phase = abs(math.sin(t * 4.6))
            sx, sy, lift = 1.08 - .14 * phase, .9 + .18 * phase, 12 * phase
        elif mood == "waiting":
            lean = 5 * math.sin(t * 4.4)
            sx, sy = 1 + .03 * math.sin(t * 8.8), 1 - .03 * math.sin(t * 8.8)
        elif mood == "failed":
            lean = 1.6 * (1 if int(t * 14) % 2 else -1)
            sx, sy = 1.05, .93
        elif mood == "happy":
            phase = abs(math.sin(t * 5.2))
            sx, sy, lift = 1.1 - .18 * phase, .88 + .24 * phase, 22 * phase
        else:
            wave = math.sin(t * 2.4)
            sx, sy = 1 + .05 * wave, 1 - .05 * wave

        skin, edge = SKINS.get(mood, SKINS["idle"])
        cx, base = W / 2 + lean, H - 22
        bw, bh = 104 * sx, 88 * sy
        top = base - lift - bh
        shadow = 1 - min(lift, 26) / 60
        c.create_oval(cx - 44 * shadow, base - 3, cx + 44 * shadow, base + 5, fill="#aab4c4", outline="")
        body = [cx - bw / 2, base - lift - 8, cx - bw / 2, top + bh * .5, cx - bw * .3, top, cx + bw * .3, top,
                cx + bw / 2, top + bh * .5, cx + bw / 2, base - lift - 8, cx + bw * .34, base - lift, cx - bw * .34, base - lift]
        c.create_polygon(body, smooth=True, fill=skin, outline=edge, width=3)
        c.create_oval(cx - bw * .32, top + bh * .16, cx - bw * .12, top + bh * .3, fill="white", outline="")   # 反光
        ey = top + bh * .56
        blink = mood not in ("sleep", "happy") and int(t * 10) % 42 < 2
        for ex in (cx - bw * .17, cx + bw * .17):
            if mood == "sleep":
                c.create_arc(ex - 8, ey - 8, ex + 8, ey + 6, start=200, extent=140, style="arc", outline=ink, width=3)
            elif mood == "happy":
                c.create_arc(ex - 8, ey - 4, ex + 8, ey + 10, start=20, extent=140, style="arc", outline=ink, width=3)
            elif blink:
                c.create_line(ex - 6, ey, ex + 6, ey, fill=ink, width=3)
            else:
                c.create_oval(ex - 5.5, ey - 8, ex + 5.5, ey + 7, fill=ink, outline="")
                c.create_oval(ex - 3, ey - 6, ex + 1, ey - 2, fill="white", outline="")
        my = top + bh * .76
        if mood == "failed":
            c.create_arc(cx - 9, my, cx + 9, my + 12, start=20, extent=140, style="arc", outline=ink, width=3)
            drop = (t * 1.3) % 1   # 汗滴往下流
            c.create_oval(cx + bw * .36, top + bh * .2 + 16 * drop, cx + bw * .36 + 8, top + bh * .2 + 11 + 16 * drop, fill="#8fd3ff", outline="")
        elif mood != "sleep":
            c.create_arc(cx - 9, my - 8, cx + 9, my + 6, start=200, extent=140, style="arc", outline=ink, width=3)
        if mood in ("waiting", "failed"):   # 頭上的驚嘆號，一跳一跳
            pop = 3 * abs(math.sin(t * 5))
            bx, by = cx + bw * .36, top - 6 - pop
            c.create_oval(bx - 12, by - 12, bx + 12, by + 12, fill=COLORS[mood], outline="white", width=2)
            c.create_text(bx, by, text="!", font=(FONT, 14, "bold"), fill=ink)
        elif mood == "sleep":
            for i, size in enumerate((10, 13, 16)):
                if int(t * 1.6) % 4 > i:
                    c.create_text(cx + bw * .34 + i * 10, top + 4 - i * 14, text="z", font=(FONT, size, "bold"), fill="#6b7a99")
        elif mood == "running":   # 冒出小光點，表示正在忙
            for i in range(3):
                rise = (t * .9 + i / 3) % 1
                c.create_oval(cx - 30 + i * 30 - 3, top - 4 - 16 * rise - 3, cx - 30 + i * 30 + 3, top - 4 - 16 * rise + 3,
                              fill=COLORS["running"], outline="")

        # 腳下的進度條：優先代表「正在執行」的任務；沒有的話才是等你或出錯的那一件
        withbar = [task for task in self.tasks if task["progress"][1] and task["state"] in ("running", "waiting", "failed")]
        top_task = next((task for task in withbar if task["state"] == "running"), withbar[0] if withbar else None)
        if top_task:
            done, total = top_task["progress"]
            c.create_rectangle(14, H - 12, W - 14, H - 3, fill="#2d323c", outline="white")
            if done:
                c.create_rectangle(15, H - 11, 15 + (W - 30) * done / total, H - 4, fill=COLORS[top_task["state"]], outline="")
        k = self.size / 100
        if k != 1:   # 以原尺寸畫好再整體縮放；文字大小另外跟著調
            c.scale("all", 0, 0, k, k)
            for item in c.find_all():
                if c.type(item) == "text":
                    font = c.itemcget(item, "font")
                    c.itemconfigure(item, font=_scale_font(font, k))

    # ------------------------------------------------------------ 有事時跑到滑鼠旁邊
    def _screen_bounds(self) -> tuple[int, int, int, int]:
        """所有螢幕合起來的範圍（左、上、右、下）。Windows 多螢幕時游標可能在主螢幕以外，座標也可能是負的。"""
        if sys.platform == "win32":
            try:
                import ctypes
                m = ctypes.windll.user32.GetSystemMetrics
                left, top, width, height = m(76), m(77), m(78), m(79)
                if width > 0 and height > 0:
                    return left, top, left + width, top + height
            except Exception:
                pass
        return 0, 0, self.root.winfo_screenwidth(), self.root.winfo_screenheight()

    def _spot(self) -> tuple[int, int] | None:
        """游標「現在」旁邊的位置（不蓋住游標）。游標在副螢幕的觸控面板上時回傳 None：那邊由面板裡的史萊姆去找你。"""
        if panel.pointer_on_panel():
            return None
        px, py = self.root.winfo_pointerxy()
        left, top, right, bottom = self._screen_bounds()
        if not (left <= px < right and top <= py < bottom):
            return None
        x = px + 28 if px + 28 + self.w <= right else px - self.w - 28
        return max(left, min(x, right - self.w)), max(top, min(py - self.h // 2, bottom - self.h))

    def run_to_pointer(self, then=None) -> None:
        """跳到滑鼠游標旁邊，路上游標移動就跟著改方向；到了之後游標再走遠也會跟過去，直到 go_home。
        then 是抵達後要做的事，例如說出是哪一件。"""
        if not self.visible:   # 被關掉了：不出來，也不說話
            return None
        spot = None if self.dragging or self.modal else self._spot()
        if spot is None:
            return then() if then else None
        if self.target is None and self.home is None:
            self.home = (self.root.winfo_x(), self.root.winfo_y())   # 記住原本待的地方，之後回去
        self.target, self.arrived, self.chasing = spot, then, True

    def _chase(self) -> None:
        """追著游標現在的位置。游標移到觸控面板上（或移出所有螢幕）就回原位，在那裡把話說完。"""
        spot = self._spot()
        if spot is None:
            if self.home:
                self.target, self.home = self.home, None
            self.chasing = False
            return
        if self.target is not None:
            self.target = spot
        elif math.hypot(spot[0] - self.root.winfo_x(), spot[1] - self.root.winfo_y()) > 120:
            self.target = spot

    def go_home(self) -> None:
        self.chasing = False
        if self.home and not self.dragging:
            self.target, self.arrived, self.home = self.home, None, None

    def _step(self) -> None:
        """往目標前進一步。每步 22 像素，配合 _draw 裡的跳躍形變。"""
        if self.target is None:
            self.hop = 0.0
            return
        if self.dragging:
            self.target = self.home = None
            self.chasing = False
            return
        x, y = self.root.winfo_x(), self.root.winfo_y()
        dx, dy = self.target[0] - x, self.target[1] - y
        dist = math.hypot(dx, dy)
        if dist <= 22:
            self.root.geometry(f"+{self.target[0]}+{self.target[1]}")
            done, self.target, self.arrived, self.hop = self.arrived, None, None, 0.0
            if done:
                done()
            return
        self.hop = (self.hop + .17) % 1 or .01
        self.root.geometry(f"+{round(x + dx / dist * 22)}+{round(y + dy / dist * 22)}")
        self._place(self.bubble)

    def _tick(self) -> None:
        self.frame += 1
        if self.frame % 8 == 0:
            try:
                self._sync_config()
            except Exception:
                pass
        if not self.visible:
            self.root.after(60, self._tick)
            return
        if self.chasing and not self.dragging and self.frame % 3 == 0:
            self._chase()
        self._step()
        if self.target is None and self.frame % 2 == 0:
            self._walk()
        self._draw()
        self.root.after(60, self._tick)

    def _walk(self) -> None:
        if self.dragging or self.modal or self.popup or self.home or not self.walk_var.get() or self.mood in ("sleep", "running"):
            self.walk_dx = 0
            return
        if self.walk_dx == 0:
            if random.random() < 0.006:
                self.walk_dx = random.choice((-2, 2))
            return
        x = self.root.winfo_x() + self.walk_dx
        if random.random() < 0.03 or not 0 <= x <= self.root.winfo_screenwidth() - self.w:
            self.walk_dx = 0
            return
        self.root.geometry(f"+{x}+{self.root.winfo_y()}")
        self._place(self.bubble)

    # ------------------------------------------------------------ 泡泡與任務清單
    def say(self, text: str, seconds: float = 6) -> None:
        self._hide_bubble()
        if not self.visible:
            return
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
        x = max(4, min(self.root.winfo_x() + self.w // 2 - bw // 2, self.root.winfo_screenwidth() - bw - 4))
        sw, sh, px, py = self.root.winfo_screenwidth(), self.root.winfo_screenheight(), self.root.winfo_x(), self.root.winfo_y()
        y = py - bh - 4
        if y < 0:  # 上面放不下 → 放下面；上下都放不下 → 放到旁邊，不可以蓋住史萊姆（不然就點不到牠來收起清單）
            if py + self.h + 4 + bh <= sh:
                y = py + self.h + 4
            else:
                y = max(0, min(py, sh - bh - 4))
                x = px - bw - 6 if px - bw - 6 >= 0 else min(px + self.w + 6, max(0, sw - bw))
        win.geometry(f"+{x}+{y}")

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
        if not self.visible:
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
        live = [t for t in self.tasks if t["state"] != "idle"]
        rows = pick_rows(live, 6) or self.tasks[:3]
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
            tk.Label(text, text=clip(t["title"], 26), font=(FONT, 10, "bold"), bg="#1a1d23", fg="#ecebe6").pack(anchor="w")
            detail = t["state_text"] + (f"・{done}/{total}" if total else "")
            if t.get("doing") and t["state"] == "running":
                detail += f"\n正在：{clip(t['doing'], 24)}"
            if t.get("where"):
                detail += f"\n在 {clip(t['where'], 28)}"
            tk.Label(text, text=detail, font=(FONT, 9), bg="#1a1d23", fg=COLORS[t["state"]], justify="left").pack(anchor="w")
            if t.get("url"):
                for w in (row, text, *row.winfo_children(), *text.winfo_children()):
                    w.bind("<Button-1>", lambda e, u=t["url"]: webbrowser.open(u))
        if len(live) > len(rows):
            tk.Label(box, text=f"還有 {len(live) - len(rows)} 件沒列出，雙擊我開觸控面板看全部。", font=(FONT, 9),
                     bg="#1a1d23", fg="#9aa0ab").pack(anchor="w", pady=(4, 0))
        if self.error:
            tk.Label(box, text=self.error, font=(FONT, 9), bg="#1a1d23", fg=COLORS["failed"], wraplength=280,
                     justify="left").pack(anchor="w", pady=(4, 0))

        def close_on_blank(widget):   # 點清單上沒有連結的地方（空白、說明文字）也能收起清單
            if not widget.bind("<Button-1>"):
                widget.bind("<Button-1>", lambda e: self.toggle_popup())
            for child in widget.winfo_children():
                close_on_blank(child)
        close_on_blank(p)
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
        sizes = tk.Menu(m, tearoff=0, font=(FONT, 10))
        for size, name in zip(panel.PET_SIZES, ("很小", "小", "標準", "大", "很大")):
            sizes.add_radiobutton(label=name, value=size, variable=self.size_var, command=lambda v=size: self.resize(v))
        m.add_cascade(label="史萊姆大小（也可 Ctrl＋滾輪）", menu=sizes)
        m.add_command(label="收起史萊姆（副螢幕上可再打開）", command=lambda: (core.set_config(pet_visible=False), self.set_visible(False)))
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
        self.say("觸控面板開好了。\n拖到副螢幕後，點右上角「⋯」→「全螢幕」。", seconds=9)

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
        repos = core.load_config().get("github_repos", [])
        if not repos:
            return self.say("權杖已存好。\n接著請用右鍵「追蹤 AI 助手的 GitHub 專案…」加入專案。", seconds=12)
        self.say("權杖已存好，正在連線確認…", seconds=20)

        def check():   # 立刻用新權杖試連每個專案，回報第一個有問題的
            results = [ai_tasks.check_repo(r) for r in repos]
            bad = next((text for ok, text in results if not ok), None)
            self.notes.put(bad or "權杖有效。" + results[0][1])
        threading.Thread(target=check, daemon=True).start()


if __name__ == "__main__":
    Pet().root.mainloop()
