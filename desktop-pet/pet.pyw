"""檔案管家桌面寵物 —— 直接雙擊執行（需要 Python 3.9+，不需安裝其他套件）。

操作：左鍵拖曳移動｜雙擊整理監看資料夾｜右鍵開啟選單
"""
from __future__ import annotations

import os
import queue
import random
import subprocess
import sys
import threading
import time
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pet_core as core  # noqa: E402

W, H = 130, 130
KEY = "#ff00fe"  # Windows 上用來挖空背景的顏色
FONT = {"win32": "Microsoft JhengHei UI", "darwin": "PingFang TC"}.get(sys.platform, "TkDefaultFont")


def open_path(path: Path) -> None:
    try:
        if sys.platform == "win32":
            os.startfile(path)  # type: ignore[attr-defined]
        else:
            subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", str(path)])
    except OSError as e:
        messagebox.showerror("檔案管家", f"無法開啟：{e}")


class Pet:
    def __init__(self) -> None:
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
        sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
        root.geometry(f"{W}x{H}+{sw - W - 60}+{sh - H - 90}")

        self.frame = 0
        self.mood = "idle"  # idle / busy / happy
        self.mood_until = 0.0
        self.walk_dx = 0
        self.dragging = False
        self.modal = 0  # 有對話框開啟時不亂走
        self.busy = False
        self.results: queue.Queue = queue.Queue()
        self.bubble: tk.Toplevel | None = None
        self.bubble_job = None
        self.last_notified = -1
        self.walk_var = tk.BooleanVar(value=bool(self.cfg.get("walk", True)))

        self._build_menu()
        c = self.canvas
        c.bind("<ButtonPress-1>", self._press)
        c.bind("<B1-Motion>", self._drag)
        c.bind("<ButtonRelease-1>", lambda e: setattr(self, "dragging", False))
        c.bind("<Double-Button-1>", lambda e: self.organize(self.watch_folder))
        for seq in ("<Button-3>", "<Button-2>", "<Control-Button-1>"):
            c.bind(seq, self._popup)

        self._tick()
        self._poll()
        root.after(1500, lambda: self.say("嗨！我是檔案管家。\n右鍵點我看看能做什麼～"))
        root.after(8000, self._watch)

    # ------------------------------------------------------------ 外觀
    def _draw(self) -> None:
        c, f = self.canvas, self.frame
        c.delete("all")
        bob = (0, 1, 2, 1)[f // 3 % 4] if self.mood != "busy" else f % 2 * 2
        y = 8 + bob
        fur, line, pink = "#f4b860", "#5b3a1e", "#f28fa0"
        # 尾巴、耳朵、身體
        c.create_arc(84, y + 62, 126, y + 112, start=-70, extent=200, style="arc", outline=fur, width=9)
        for x0, x1, x2 in ((22, 30, 52), (108, 100, 78)):
            c.create_polygon(x0, y + 4, x1, y + 44, x2, y + 24, fill=fur, outline=line, width=2)
            c.create_polygon(x0 + (6 if x0 < 60 else -6), y + 14, x1 + (4 if x0 < 60 else -4), y + 36,
                             x2 - (6 if x0 < 60 else -6), y + 26, fill=pink, outline="")
        c.create_oval(14, y + 16, 116, y + 112, fill=fur, outline=line, width=2)
        c.create_oval(38, y + 66, 92, y + 112, fill="#fde9c9", outline="")
        # 眼睛
        blink = self.mood == "idle" and f % 40 in (0, 1)
        for ex in (46, 84):
            if self.mood == "happy":
                c.create_arc(ex - 8, y + 46, ex + 8, y + 62, start=20, extent=140, style="arc", outline=line, width=3)
            elif blink:
                c.create_line(ex - 7, y + 54, ex + 7, y + 54, fill=line, width=3)
            else:
                dx = (-2, 0, 2, 0)[f // 2 % 4] if self.mood == "busy" else 0
                c.create_oval(ex - 7, y + 45, ex + 7, y + 63, fill=line, outline="")
                c.create_oval(ex - 3 + dx, y + 48, ex + 2 + dx, y + 53, fill="white", outline="")
        # 腮紅、鼻子、嘴
        c.create_oval(26, y + 62, 40, y + 70, fill=pink, outline="")
        c.create_oval(90, y + 62, 104, y + 70, fill=pink, outline="")
        c.create_polygon(61, y + 62, 69, y + 62, 65, y + 67, fill=line)
        c.create_arc(55, y + 62, 65, y + 74, start=180, extent=180, style="arc", outline=line, width=2)
        c.create_arc(65, y + 62, 75, y + 74, start=180, extent=180, style="arc", outline=line, width=2)
        # 抱著的資料夾
        c.create_polygon(42, y + 84, 58, y + 84, 62, y + 89, 88, y + 89, 88, y + 112, 42, y + 112,
                         fill="#f7d774", outline="#b58a1c", width=2)
        c.create_line(42, y + 94, 88, y + 94, fill="#b58a1c", width=2)
        for px in (40, 90):  # 爪子
            c.create_oval(px - 8, y + 92, px + 8, y + 106, fill=fur, outline=line, width=2)

    def _tick(self) -> None:
        self.frame += 1
        if self.mood == "happy" and time.time() > self.mood_until:
            self.mood = "idle"
        self._walk()
        self._draw()
        self.root.after(130, self._tick)

    def _walk(self) -> None:
        if self.dragging or self.modal or self.busy or not self.walk_var.get():
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
        self._place_bubble()

    def set_mood(self, mood: str, seconds: float = 0) -> None:
        self.mood, self.mood_until = mood, time.time() + seconds

    # ------------------------------------------------------------ 對話泡泡
    def say(self, text: str, seconds: float = 6) -> None:
        self._hide_bubble()
        b = self.bubble = tk.Toplevel(self.root)
        b.overrideredirect(True)
        b.attributes("-topmost", True)
        tk.Label(b, text=text, font=(FONT, 10), bg="#fffbe6", fg="#3b2a12", justify="left",
                 padx=10, pady=6, relief="solid", bd=1, wraplength=260).pack()
        b.bind("<Button-1>", lambda e: self._hide_bubble())
        b.update_idletasks()
        self._place_bubble()
        self.bubble_job = self.root.after(int(seconds * 1000), self._hide_bubble)

    def _place_bubble(self) -> None:
        b = self.bubble
        if not b:
            return
        bw, bh = b.winfo_reqwidth(), b.winfo_reqheight()
        x = self.root.winfo_x() + W // 2 - bw // 2
        x = max(4, min(x, self.root.winfo_screenwidth() - bw - 4))
        y = self.root.winfo_y() - bh - 4
        if y < 0:
            y = self.root.winfo_y() + H + 4
        b.geometry(f"+{x}+{y}")

    def _hide_bubble(self) -> None:
        if self.bubble_job:
            self.root.after_cancel(self.bubble_job)
            self.bubble_job = None
        if self.bubble:
            self.bubble.destroy()
            self.bubble = None

    # ------------------------------------------------------------ 滑鼠
    def _press(self, e) -> None:
        self.dragging, self._off = True, (e.x, e.y)

    def _drag(self, e) -> None:
        self.root.geometry(f"+{e.x_root - self._off[0]}+{e.y_root - self._off[1]}")
        self._place_bubble()

    def _popup(self, e) -> None:
        self.dragging = False
        self._refresh_menu()
        try:
            self.menu.tk_popup(e.x_root, e.y_root)
        finally:
            self.menu.grab_release()

    def _build_menu(self) -> None:
        m = self.menu = tk.Menu(self.root, tearoff=0, font=(FONT, 10))
        m.add_command(label="整理監看資料夾", command=lambda: self.organize(self.watch_folder))
        m.add_command(label="整理其他資料夾…", command=lambda: self._pick(self.organize))
        m.add_separator()
        m.add_command(label="找出重複檔案…", command=lambda: self._pick(self.duplicates))
        m.add_command(label="找出最大的檔案…", command=lambda: self._pick(self.largest))
        m.add_separator()
        m.add_command(label="還原上一次搬移", command=self.undo)
        m.add_separator()
        m.add_command(label="開啟監看資料夾", command=lambda: open_path(self.watch_folder))
        m.add_command(label="更換監看資料夾…", command=self.change_watch)
        m.add_checkbutton(label="到處走走", variable=self.walk_var, command=self._save_walk)
        m.add_separator()
        m.add_command(label="離開", command=self.root.destroy)

    def _refresh_menu(self) -> None:
        self.menu.entryconfig(0, label=f"整理「{self.watch_folder.name}」")
        last = core.last_batch()
        self.menu.entryconfig(6, state="normal" if last else "disabled",
                              label=f"還原：{last['label']}（{len(last['moves'])} 個）" if last else "還原上一次搬移")

    def _save_walk(self) -> None:
        self.cfg["walk"] = self.walk_var.get()
        core.save_config(self.cfg)

    # ------------------------------------------------------------ 共用
    @property
    def watch_folder(self) -> Path:
        return Path(self.cfg["watch_folder"])

    def _ask(self, kind: str, *args, **kw):
        """顯示訊息框；期間暫停走動。"""
        self.modal += 1
        try:
            return getattr(messagebox, kind)("檔案管家", *args, parent=self.root, **kw)
        finally:
            self.modal -= 1

    def _pick(self, then) -> None:
        self.modal += 1
        try:
            d = filedialog.askdirectory(parent=self.root, initialdir=str(self.watch_folder), title="選擇資料夾")
        finally:
            self.modal -= 1
        if d:
            then(Path(d))

    def _window(self, title: str, size: str) -> tk.Toplevel:
        win = tk.Toplevel(self.root)
        win.title(title)
        win.geometry(size)
        win.attributes("-topmost", True)
        self.modal += 1

        def closed(e):
            if e.widget is win:
                self.modal -= 1
        win.bind("<Destroy>", closed)
        return win

    @staticmethod
    def _tree(parent, columns: list[tuple[str, int]]) -> ttk.Treeview:
        box = ttk.Frame(parent)
        box.pack(fill="both", expand=True, padx=10, pady=6)
        tree = ttk.Treeview(box, columns=[c for c, _ in columns], show="headings")
        for name, width in columns:
            tree.heading(name, text=name)
            tree.column(name, width=width, anchor="w")
        sb = ttk.Scrollbar(box, command=tree.yview)
        tree.config(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        tree.pack(side="left", fill="both", expand=True)
        return tree

    def _background(self, work, done, busy_text: str) -> None:
        """在背景執行緒做耗時工作，完成後回主執行緒呼叫 done(result)。"""
        if self.busy:
            self.say("我還在忙上一件事，等我一下～")
            return
        self.busy = True
        self.set_mood("busy")
        self.say(busy_text, seconds=600)

        def run():
            try:
                self.results.put((done, work(), None))
            except Exception as e:  # 交回主執行緒顯示
                self.results.put((done, None, e))
        threading.Thread(target=run, daemon=True).start()

    def _poll(self) -> None:
        try:
            done, result, err = self.results.get_nowait()
        except queue.Empty:
            pass
        else:
            self.busy = False
            self.set_mood("idle")
            self._hide_bubble()
            if err:
                self._ask("showerror", str(err))
            else:
                done(result)
        self.root.after(150, self._poll)

    def _run_moves(self, moves, label: str, win: tk.Toplevel | None = None) -> None:
        if win:
            win.destroy()
        n, errors = core.execute(moves, label)
        self.last_notified = -1
        if n:
            self.set_mood("happy", 5)
        msg = f"完成！搬了 {n} 個檔案。\n後悔的話右鍵選「還原」。"
        if errors:
            msg = f"搬了 {n} 個，有 {len(errors)} 個沒搬成（可能正在使用中）。"
            self._ask("showwarning", msg + "\n\n" + "\n".join(errors[:15]))
        self.say(msg)

    # ------------------------------------------------------------ 功能
    def organize(self, folder: Path) -> None:
        if self.modal:  # 已有視窗開著，避免重複開啟
            return
        if self.busy:
            return self.say("我還在忙上一件事，等我一下～")
        try:
            moves = core.plan_organize(folder)
        except core.ProtectedFolderError as e:
            return self._ask("showwarning", str(e))
        if not moves:
            return self.say(f"「{folder.name}」很整齊，沒有散落的檔案！")

        win = self._window(f"整理預覽 — {folder}", "560x440")
        counts: dict[str, int] = {}
        for m in moves:
            counts[m.category] = counts.get(m.category, 0) + 1
        summary = "、".join(f"{k} {v}" for k, v in sorted(counts.items(), key=lambda kv: -kv[1]))
        ttk.Label(win, text=f"將把 {len(moves)} 個散落的檔案搬進分類子資料夾（不刪除、不覆蓋、不動既有子資料夾）：\n{summary}",
                  wraplength=530, font=(FONT, 10)).pack(anchor="w", padx=10, pady=(10, 0))
        if "圖面與模型" in counts:
            ttk.Label(win, foreground="#b45309", wraplength=530, font=(FONT, 9),
                      text="⚠ 含 CAD／模型檔：若這些檔案有外部參照（Xref、貼圖、連結模型），搬移後相對路徑會失效。專案資料夾請謹慎。"
                      ).pack(anchor="w", padx=10, pady=(4, 0))
        tree = self._tree(win, [("檔案", 330), ("搬到", 170)])
        for m in moves:
            tree.insert("", "end", values=(m.src.name, f"{m.category}/" + (m.dst.name if m.dst.name != m.src.name else "")))
        bar = ttk.Frame(win)
        bar.pack(fill="x", padx=10, pady=(0, 10))
        ttk.Button(bar, text="取消", command=win.destroy).pack(side="right")
        ttk.Button(bar, text=f"開始整理（{len(moves)}）",
                   command=lambda: self._run_moves(moves, f"整理 {folder.name}", win)).pack(side="right", padx=6)

    def duplicates(self, folder: Path) -> None:
        def show(groups):
            if not groups:
                return self.say("沒有找到內容重複的檔案！")
            moves = core.plan_quarantine(folder, groups)
            wasted = sum(m.src.stat().st_size for m in moves if m.src.exists())
            win = self._window(f"重複檔案 — {folder}", "680x460")
            ttk.Label(win, wraplength=650, font=(FONT, 10),
                      text=f"找到 {len(groups)} 組內容完全相同的檔案，多佔了 {core.human_size(wasted)}。\n"
                           f"每組保留最舊的一份；其餘可搬到「{core.QUARANTINE}」資料夾，確認無誤後再自行刪除。"
                      ).pack(anchor="w", padx=10, pady=(10, 0))
            tree = self._tree(win, [("處理", 60), ("檔案", 480), ("大小", 90)])
            tree.tag_configure("keep", foreground="#15803d")
            for g in groups:
                size = core.human_size(g[0].stat().st_size)
                for i, p in enumerate(g):
                    tree.insert("", "end", values=("保留" if i == 0 else "搬走", str(p.relative_to(folder)), size),
                                tags=("keep",) if i == 0 else ())
            bar = ttk.Frame(win)
            bar.pack(fill="x", padx=10, pady=(0, 10))
            ttk.Button(bar, text="關閉", command=win.destroy).pack(side="right")
            ttk.Button(bar, text=f"搬走 {len(moves)} 個重複檔",
                       command=lambda: self._run_moves(moves, f"隔離重複檔 {folder.name}", win)).pack(side="right", padx=6)

        try:
            folder = core.check_folder_allowed(folder)
        except core.ProtectedFolderError as e:
            return self._ask("showwarning", str(e))
        self._background(lambda: core.find_duplicates(folder), show, "比對檔案內容中…\n（檔案多的話要等一下）")

    def largest(self, folder: Path) -> None:
        def show(rows):
            if not rows:
                return self.say("這個資料夾裡沒有檔案。")
            win = self._window(f"最大的檔案 — {folder}", "680x460")
            ttk.Label(win, text="雙擊可開啟檔案所在的資料夾。", font=(FONT, 10)).pack(anchor="w", padx=10, pady=(10, 0))
            tree = self._tree(win, [("大小", 90), ("最後修改", 100), ("檔案", 450)])
            for p, size, mtime in rows:
                tree.insert("", "end", iid=str(p), values=(
                    core.human_size(size), time.strftime("%Y-%m-%d", time.localtime(mtime)), str(p.relative_to(folder))))
            tree.bind("<Double-Button-1>", lambda e: tree.focus() and open_path(Path(tree.focus()).parent))
            ttk.Button(win, text="關閉", command=win.destroy).pack(anchor="e", padx=10, pady=(0, 10))

        try:
            folder = core.check_folder_allowed(folder)
        except core.ProtectedFolderError as e:
            return self._ask("showwarning", str(e))
        self._background(lambda: core.largest_files(folder), show, "清點檔案大小中…")

    def undo(self) -> None:
        last = core.last_batch()
        if not last:
            return self.say("沒有可以還原的紀錄。")
        if not self._ask("askyesno", f"要還原「{last['label']}」（{last['time']}，{len(last['moves'])} 個檔案）嗎？"):
            return
        n, problems = core.undo_last()
        self.last_notified = -1
        if problems:
            self._ask("showwarning", f"已還原 {n} 個，{len(problems)} 個有狀況：\n\n" + "\n".join(problems[:15]))
        self.say(f"已把 {n} 個檔案放回原位。")

    def change_watch(self) -> None:
        def chosen(folder: Path):
            try:
                folder = core.check_folder_allowed(folder)
            except core.ProtectedFolderError as e:
                return self._ask("showwarning", str(e))
            self.cfg["watch_folder"] = str(folder)
            core.save_config(self.cfg)
            self.last_notified = -1
            self.say(f"好，我會幫你顧著「{folder.name}」。")
        self._pick(chosen)

    def _watch(self) -> None:
        """定時看一下監看資料夾，散落檔案太多就提醒（同一數量不重複嘮叨）。"""
        if not self.busy and not self.modal:
            n = len(core.loose_files(self.watch_folder))
            if n < int(self.cfg.get("watch_threshold", 10)):
                self.last_notified = -1
            elif n != self.last_notified:
                self.last_notified = n
                self.say(f"「{self.watch_folder.name}」有 {n} 個散落的檔案，\n雙擊我就能幫你整理！", seconds=10)
        self.root.after(60_000, self._watch)


if __name__ == "__main__":
    Pet().root.mainloop()
