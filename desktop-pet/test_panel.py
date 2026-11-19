"""執行：python -m unittest test_panel -v"""
import json
import os
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

_home = tempfile.mkdtemp(prefix="pet_home_")
os.environ["DESKTOP_PET_HOME"] = _home
os.environ["CLAUDE_CONFIG_DIR"] = tempfile.mkdtemp(prefix="claude_")

import ai_tasks  # noqa: E402
import panel  # noqa: E402
import pet_core as core  # noqa: E402


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve() / "專案"
        self.root.mkdir()
        core.save_config({"project_roots": [str(self.root)]})

    def tearDown(self):
        self.tmp.cleanup()

    def put(self, rel, age_days=0.0, data=b"x"):
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        t = time.time() - age_days * 86400
        os.utime(p, (t, t))
        return str(p)


class VersionTest(unittest.TestCase):
    def test_strips_version_markers(self):
        same = ["平面圖.dwg", "平面圖_v2.dwg", "平面圖 v3 修正.dwg", "平面圖_20261101.dwg", "平面圖-1105.dwg",
                "平面圖(1).dwg", "平面圖_final.dwg", "平面圖_最終版.dwg", "平面圖_1151101.dwg", "平面圖 第二版.dwg",
                "平面圖_rev2.DWG", "平面圖 - 複本.dwg", "平面圖_revB.dwg"]
        self.assertEqual({panel.version_key(n) for n in same}, {"平面圖.dwg"})

    def test_keeps_meaningful_differences(self):
        distinct = ["A1.dwg", "A2.dwg", "A1-01.dwg", "A1-02.dwg", "1F平面圖.dwg", "2F平面圖.dwg",
                    "B1結構.dwg", "平面圖.pdf", "立面圖.dwg", "review.docx", "newton.pdf", "river.jpg", "v.dwg",
                    "R1屋突平面圖.dwg", "R2屋突平面圖.dwg", "Revit模型.rvt", "模型.rvt", "照片 (12).jpg", "照片 (13).jpg"]
        self.assertEqual(len({panel.version_key(n) for n in distinct}), len(distinct))

    def test_dates_only_count_when_plausible_and_kind_allows(self):
        nov8 = time.mktime((2026, 11, 8, 12, 0, 0, 0, 0, -1))
        key = panel.version_key
        self.assertEqual(key("立面圖_1108.dwg", "圖面與模型", nov8), "立面圖.dwg")
        self.assertEqual(key("詳圖_0101.dwg", "圖面與模型", nov8), "詳圖_0101.dwg", "與修改時間差太遠的是圖號，不是日期")
        self.assertEqual(key("業主會議紀錄_1107.docx", "文件", nov8), "業主會議紀錄_1107.docx", "各次會議是不同文件")
        self.assertEqual(key("IMG_20261108_143001.jpg", "圖片", nov8), "img_20261108_143001.jpg")
        self.assertEqual(key("會議紀錄_v2.docx", "文件", nov8), "會議紀錄.docx", "明確的版本標記仍然收合")

    def test_group_types(self):
        now = time.time()
        def e(name, d, age, kind):
            return (name.lower(), name, d, now - age * 86400, 1, kind, 0)
        rows = [e("平面圖_v2.dwg", "/p/圖", 0, "圖面與模型"), e("平面圖_v1.dwg", "/p/圖", 3, "圖面與模型"),
                e("送審圖說_%s.pdf" % time.strftime("%Y%m%d"), "/p/送審", 0, "PDF"),
                e("送審圖說_%s.pdf" % time.strftime("%Y%m%d", time.localtime(now - 9 * 86400)), "/p/送審", 9, "PDF"),
                e("單獨.xlsx", "/p", 1, "試算表")]
        rows += [e("IMG_%04d.jpg" % i, "/p/照片", 2 + i / 10000, "圖片") for i in range(6)]
        rows += [e("日景.png", "/p/渲染", 4, "圖片"), e("夜景.png", "/p/渲染", 4, "圖片")]
        got = {g[0][1]: (len(g[1]), g[2]) for g in panel.collapse_versions(rows)}
        self.assertEqual(got["平面圖_v2.dwg"], (1, "version"))
        self.assertEqual(got["送審圖說_%s.pdf" % time.strftime("%Y%m%d")], (1, "series"))
        self.assertEqual(got["單獨.xlsx"], (0, ""))
        self.assertEqual(got["IMG_0000.jpg"], (5, "batch"), "同資料夾同一天 4 張以上的照片合成一批")
        self.assertEqual((got["日景.png"], got["夜景.png"]), ((0, ""), (0, "")))

    def test_name_that_is_only_a_marker_is_kept(self):
        self.assertEqual(panel.version_key("20261101.pdf"), "20261101.pdf")
        self.assertEqual(panel.version_key("final.docx"), "final.docx")


class IndexTest(Base):
    def test_projects_and_version_collapse(self):
        new = self.put("信義住宅/01_圖面/平面圖_v3.dwg", 0)
        self.put("信義住宅/01_圖面/平面圖_v2.dwg", 2)
        self.put("信義住宅/01_圖面/舊版/平面圖_v1.dwg", 9)
        self.put("信義住宅/01_圖面/立面圖.dwg", 1)
        self.put("信義住宅/02_法規/平面圖_v9.dwg", 5)  # 不同資料夾，不可併入
        self.put("信義住宅/03_報價/預算.xlsx", 3)
        self.put("信義住宅/~$預算.xlsx")
        self.put("信義住宅/.git/config")
        self.put("大安辦公室/簡報.pptx", 30)
        idx = panel.Index()
        idx.refresh_all()

        plist = idx.project_list()
        self.assertEqual([(p["name"], p["active"]) for p in plist], [("信義住宅", True), ("大安辦公室", False)])
        self.assertEqual((plist[0]["count"], plist[0]["today"]), (6, True))

        proj = str(self.root / "信義住宅")
        res = idx.files(proj)
        self.assertEqual(res["files"][0]["path"], new)
        self.assertEqual([v["name"] for v in res["files"][0]["versions"]], ["平面圖_v2.dwg", "平面圖_v1.dwg"])
        self.assertEqual(res["total"], 4)
        self.assertEqual(res["kinds"], {"圖面與模型": 3, "試算表": 1}, "數字是卡片數，與畫面一致")
        self.assertEqual(res["files"][0]["group"], "version")
        self.assertEqual([s["name"] for s in res["subs"]], ["01_圖面", "02_法規", "03_報價"])
        self.assertEqual(res["files"][0]["rel"], "01_圖面")

        self.assertEqual([f["name"] for f in idx.files(proj, kind="試算表")["files"]], ["預算.xlsx"])
        self.assertEqual([f["name"] for f in idx.files(proj, sub="02_法規")["files"]], ["平面圖_v9.dwg"])
        self.assertEqual([f["name"] for f in idx.files(proj, q="立面")["files"]], ["立面圖.dwg"])
        self.assertEqual(len(idx.files(proj, q="報價 預算")["files"]), 1, "可用資料夾名稱＋檔名搜尋")
        self.assertEqual(len(idx.files()["files"]), 5, "全部專案")

    def test_project_spanning_several_folders(self):
        self.put("信義住宅/圖面/平面圖.dwg", 0)
        self.put("信義住宅_業主提供/測量/地籍圖.pdf", 3)
        nas = Path(self.tmp.name).resolve() / "NAS" / "信義案渲染"
        nas.mkdir(parents=True)
        (nas / "日景.png").write_bytes(b"x")
        main, extra = str(self.root / "信義住宅"), str(self.root / "信義住宅_業主提供")
        idx = panel.Index()
        panel.merge(extra, main)
        panel.add_folder(main, str(nas))
        idx.refresh_all()

        self.assertEqual(panel.projects(), [main])
        self.assertEqual(panel.folders_of(main), [main, extra, str(nas)])
        self.assertEqual(panel.project_of(nas / "日景.png"), main)
        self.assertEqual((idx.project_list()[0]["count"], idx.project_list()[0]["folders"]), (3, 3))
        res = idx.files(main)
        self.assertEqual({f["name"] for f in res["files"]}, {"平面圖.dwg", "地籍圖.pdf", "日景.png"})
        self.assertEqual([s["name"] for s in res["subs"]],
                         ["信義住宅_業主提供", "信義案渲染", "圖面"])
        self.assertEqual([s["name"] for s in idx.files(main, sub="信義住宅_業主提供")["subs"]],
                         [os.path.join("信義住宅_業主提供", "測量")])
        self.assertEqual([f["name"] for f in idx.files(main, sub="信義住宅_業主提供/測量")["files"]], ["地籍圖.pdf"])
        self.assertEqual([f["name"] for f in idx.files(main, sub="信義案渲染")["files"]], ["日景.png"])
        self.assertEqual([f["name"] for f in idx.files(main, q="業主 地籍")["files"]], ["地籍圖.pdf"])
        with self.assertRaises(PermissionError):
            panel.merge(extra, main)  # 已併入的不能再併
        panel.unmerge(extra)
        self.assertEqual(panel.projects(), [main, extra])

    def test_since_filter_for_reporting(self):
        now = time.time()
        monday = panel._midnight() - time.localtime().tm_wday * 86400
        def at(rel, ts):
            p = self.put(rel)
            os.utime(p, (ts, ts))
        at("甲案/今天改的.dwg", now)
        at("甲案/今天改的_v1.dwg", monday - 20 * 86400)
        at("甲案/上週四.pdf", monday - 3 * 86400)
        at("甲案/上個月.pdf", monday - 30 * 86400)
        idx = panel.Index()
        proj = str(self.root / "甲案")
        res = idx.files(proj)
        self.assertEqual(res["times"], {"today": 1, "week": 1, "lastweek": 1}, "本週從週一起算，上週是前一個週一到週日")
        today = idx.files(proj, since="today")
        self.assertEqual([f["name"] for f in today["files"]], ["今天改的.dwg"])
        self.assertEqual(len(today["files"][0]["versions"]), 1, "報告時仍看得到舊版")
        last = idx.files(proj, since="lastweek")
        self.assertEqual(([f["name"] for f in last["files"]], last["kinds"]), (["上週四.pdf"], {"PDF": 1}))
        self.assertEqual(idx.files(proj, limit=1)["total"], 3)

    def test_last_week_keeps_files_updated_again_since(self):
        now = time.time()
        monday = panel._midnight() - time.localtime().tm_wday * 86400
        for name, ts in (("南向立面圖_v3.dwg", now), ("南向立面圖_v2.dwg", monday - 2 * 86400),
                         ("南向立面圖_v1.dwg", monday - 40 * 86400)):
            p = self.put("甲案/" + name)
            os.utime(p, (ts, ts))
        idx = panel.Index()
        proj = str(self.root / "甲案")
        self.assertEqual(idx.files(proj)["times"], {"today": 1, "week": 1, "lastweek": 1})
        f = idx.files(proj, since="lastweek")["files"][0]
        self.assertEqual((f["name"], f["later"]), ("南向立面圖_v2.dwg", 1), "代表檔是上週那一版，並註明之後有更新")
        self.assertFalse(f["check"], "舊版卡片不該被標成版號待確認")
        self.assertEqual({v["name"] for v in f["versions"]}, {"南向立面圖_v3.dwg", "南向立面圖_v1.dwg"})
        self.assertEqual(idx.files(proj, since="today")["files"][0]["later"], 0)

    def test_version_number_conflict_is_flagged(self):
        now = time.time()
        for name, ts in (("報告_v6.pdf", now), ("報告_v7.pdf", now - 86400), ("同時_v6.pdf", now - 500), ("同時_v7.pdf", now - 500)):
            p = self.put("甲案/" + name)
            os.utime(p, (ts, ts))
        idx = panel.Index()
        got = {f["name"]: f["check"] for f in idx.files(str(self.root / "甲案"))["files"]}
        self.assertEqual(got, {"報告_v6.pdf": True, "同時_v7.pdf": False}, "版號與修改時間矛盾要提醒；時間相同則版號大的為新")

    def test_pinned_file_stays_on_top_even_when_old(self):
        old = self.put("甲案/結構計算書.pdf", 200)
        for i in range(5):
            self.put("甲案/新檔%d.pdf" % i, i)
        idx = panel.Index()
        proj = str(self.root / "甲案")
        self.assertTrue(panel.toggle("pinned", old))
        first = idx.files(proj, limit=3)["files"][0]
        self.assertEqual((first["name"], first["pinned"]), ("結構計算書.pdf", True), "釘選的舊檔不受分頁上限影響")
        self.assertEqual(idx.files(proj, kind="PDF")["files"][0]["name"], "結構計算書.pdf", "篩選後仍符合條件就繼續置頂")
        self.assertEqual(idx.files(proj, since="today")["files"][0]["name"], "新檔0.pdf", "不符合篩選條件就不出現")
        self.assertFalse(panel.toggle("pinned", old))

    def test_pinning_an_older_version_gives_it_its_own_card(self):
        self.put("甲案/平面圖_v3.dwg", 0)
        v1 = self.put("甲案/平面圖_v1.dwg", 30)
        idx = panel.Index()
        proj = str(self.root / "甲案")
        panel.toggle("pinned", v1)
        rows = idx.files(proj)["files"]
        self.assertEqual([(r["name"], r["pinned"], r["oldpin"]) for r in rows],
                         [("平面圖_v1.dwg", True, True), ("平面圖_v3.dwg", False, False)])
        self.assertEqual(len(rows[1]["versions"]), 1, "原本的版本清單不受影響")

    def test_folder_filter_drills_down(self):
        self.put("甲案/01_圖面/平面/a.dwg")
        self.put("甲案/01_圖面/立面/b.dwg")
        self.put("甲案/02_法規/c.pdf")
        idx = panel.Index()
        proj = str(self.root / "甲案")
        self.assertEqual([s["name"] for s in idx.files(proj)["subs"]], ["01_圖面", "02_法規"])
        inner = idx.files(proj, sub="01_圖面")
        self.assertEqual([s["name"] for s in inner["subs"]], [os.path.join("01_圖面", "平面"), os.path.join("01_圖面", "立面")])
        self.assertEqual(idx.files(proj, sub=os.path.join("01_圖面", "立面"))["subs"], [])

    def test_stable_project_order(self):
        self.put("乙案/a.pdf", 0)
        self.put("甲案/a.pdf", 5)
        self.put("丙案_舊/a.pdf", 60)
        idx = panel.Index()
        idx.refresh_all()
        names = [p["name"] for p in idx.project_list()]
        self.assertEqual(names, sorted(names[:2]) + ["丙案_舊"], "進行中的依名稱固定排序，不因誰剛被修改而換位")

    def test_new_file_shows_up_without_waiting(self):
        self.put("甲案/a.pdf", 1)
        idx = panel.Index()
        idx.refresh_all()
        proj = str(self.root / "甲案")
        self.put("甲案/b.pdf", 0)
        self.assertEqual(len(idx.files(proj)["files"]), 1, "20 秒內用快取")
        idx.data[proj] = (0, idx.data[proj][1])
        self.assertEqual(idx.files(proj)["files"][0]["name"], "b.pdf")

    def test_opening_often_does_not_reorder_and_hide(self):
        often = self.put("甲案/常開的預算.xlsx", 50)
        self.put("甲案/新的.pdf", 0)
        self.put("乙案/x.pdf", 1)
        idx = panel.Index()
        idx.refresh_all()
        proj = str(self.root / "甲案")
        orig = panel.subprocess.Popen
        panel.subprocess.Popen = lambda args, **k: None
        try:
            if os.name != "nt":
                panel.open_file(often)
                self.assertEqual(idx.files(proj)["files"][0]["name"], "新的.pdf", "只開過一次還不算常用")
                panel.open_file(often)
        finally:
            panel.subprocess.Popen = orig
        if os.name != "nt":
            self.assertEqual(idx.files(proj)["files"][0]["name"], "新的.pdf", "常開的檔案不會自己插隊，順序只看時間（要固定就用釘選）")
        panel.toggle("hidden_projects", str(self.root / "乙案"))
        self.assertEqual([p["name"] for p in idx.project_list()], ["甲案"])

    def test_open_refuses_outside_and_never_launches_programs(self):
        self.put("甲案/a.pdf")
        exe = self.put("甲案/setup.exe")
        outside = Path(self.tmp.name) / "外面.pdf"
        outside.write_bytes(b"x")
        with self.assertRaises(PermissionError):
            panel.open_file(str(outside))
        with self.assertRaises(PermissionError):
            panel.open_file(str(self.root / "甲案" / ".." / ".." / "外面.pdf"))
        calls = []
        orig = panel.subprocess.Popen
        panel.subprocess.Popen = lambda args, **k: calls.append(args)
        try:
            if os.name != "nt":
                self.assertEqual(panel.open_file(str(self.root / "甲案" / "a.pdf")), "opened")
            self.assertEqual(panel.open_file(exe), "program", "程式類不執行，只顯示位置")
            self.assertEqual(panel.open_file(exe, reveal=True), "revealed")
            gone = self.root / "甲案" / "不見了.pdf"
            with self.assertRaises(FileNotFoundError):
                panel.open_file(str(gone))
        finally:
            panel.subprocess.Popen = orig
        self.assertTrue(calls)

    def test_sources_can_be_removed_and_overlaps_are_refused(self):
        self.put("甲案/01_圖面/a.dwg")
        self.put("乙案/b.pdf")
        main = str(self.root / "甲案")
        with self.assertRaises(core.ProtectedFolderError):
            panel.add_folder(main, str(self.root / "甲案" / "01_圖面"))   # 自己的子資料夾
        with self.assertRaises(core.ProtectedFolderError):
            panel.add_project(str(self.root / "乙案"), False)             # 已經是清單上的專案
        outside = Path(self.tmp.name).resolve() / "NAS" / "甲案渲染"
        outside.mkdir(parents=True)
        panel.add_folder(main, str(outside))
        self.assertEqual([f["single"] for f in panel.folder_info(main)], [False, True])
        import shutil
        shutil.move(str(outside), str(outside) + "_離線")   # 模擬網路磁碟沒連上
        self.assertEqual([(f["missing"], f["single"]) for f in panel.folder_info(main)], [(False, False), (True, True)])
        shutil.move(str(outside) + "_離線", str(outside))
        with self.assertRaisesRegex(core.ProtectedFolderError, "已經包含在"):
            panel.add_project(str(outside / "子"), False) if (outside / "子").mkdir() is None else None
        with self.assertRaisesRegex(core.ProtectedFolderError, "請先到"):
            panel.add_project(str(outside.parent), True)
        with self.assertRaisesRegex(core.ProtectedFolderError, "已經有加過的「%s」" % self.root.name):
            panel.add_project(str(self.root.parent), True)   # 名稱要用清單上那一列（總資料夾），不是裡面的專案
        self.assertEqual(panel.unmerge(str(outside)), "removed", "單獨加入的資料夾拿掉後不會變成新專案")
        self.assertEqual(sorted(panel.projects()), sorted([main, str(self.root / "乙案")]))
        panel.merge(str(self.root / "乙案"), main)
        self.assertEqual(panel.unmerge(str(self.root / "乙案")), "split")
        self.assertEqual(len(panel.projects()), 2)
        panel.remove_source(str(self.root))
        self.assertEqual((panel.projects(), panel.sources()), ([], []))

    def test_folder_going_offline_mid_use_is_explained(self):
        f = self.put("甲案/a.pdf")
        idx = panel.Index()
        proj = str(self.root / "甲案")
        idx.files(proj)
        os.rename(self.root, str(self.root) + "_斷線")   # 用到一半，整個磁碟讀不到
        try:
            with self.assertRaises(panel.FolderOffline):
                panel.open_file(f)
            with self.assertRaises(panel.FolderOffline):
                idx.files(proj)
            self.assertEqual(idx.files()["missing"], [str(self.root)])
        finally:
            os.rename(str(self.root) + "_斷線", self.root)
        self.assertEqual(len(idx.files(proj)["files"]), 1, "接回來後自動恢復")

    def test_unreachable_folder_is_reported_not_forgotten(self):
        gone = str(Path(self.tmp.name).resolve() / "沒連上的NAS")
        core.set_config(projects=[gone])
        self.assertEqual(panel.missing_folders(), [gone])
        self.assertEqual([s["missing"] for s in panel.sources()], [False, True])
        self.assertEqual(panel.Index().files()["missing"], [gone])

    def test_add_project_rejects_protected(self):
        with self.assertRaises(core.ProtectedFolderError):
            panel.add_project(str(Path.home()), True)
        single = Path(self.tmp.name) / "單獨案"
        single.mkdir()
        panel.add_project(str(single), False)
        self.assertIn(str(single.resolve()), panel.projects())


class RobustnessTest(Base):
    def test_shows_cached_list_while_slow_disk_rescans(self):
        self.put("甲案/a.pdf")
        idx = panel.Index(blocking=False)
        proj = str(self.root / "甲案")
        first = idx.files(proj)
        self.assertEqual((len(first["files"]), first["scanning"]), (1, False), "本機磁碟很快：稍等一下就直接給最新的，不必先給空的")
        empty = panel.Index(blocking=False)
        self.put("乙案空/子/.keep")
        panel._folders(fresh=True)
        res = empty.files(str(self.root / "乙案空"))
        self.assertEqual((res["files"], res["scanning"]), ([], False), "空專案掃過就是空的，不是「還在讀取」")
        idx.data[proj] = (0, idx.data[proj][1])
        self.put("甲案/剛存的.pdf")
        self.assertEqual(idx.files(proj)["files"][0]["name"], "剛存的.pdf", "剛存的檔一點就看得到")
        os.unlink(self.root / "甲案" / "剛存的.pdf")
        idx.data[proj] = (0, idx.data[proj][1])
        self.assertEqual(len(idx.files(proj)["files"]), 1)
        # 新加入、還沒掃過的專案：列清單時就排進背景掃描，而且不歸到「很久沒動」
        self.put("丙案_新加入/x.pdf", 400)
        panel._folders(fresh=True)
        row = next(p for p in idx.project_list() if p["name"] == "丙案_新加入")
        self.assertTrue(row["pending"] and row["active"])
        for _ in range(100):
            if str(self.root / "丙案_新加入") in idx.data:
                break
            time.sleep(0.02)
        row = next(p for p in idx.project_list() if p["name"] == "丙案_新加入")
        self.assertEqual((row["pending"], row["active"], row["count"]), (False, False, 1))

        self.put("甲案/b.pdf")
        real_walk, calls = panel.Index._walk, []
        def slow_walk(top):
            calls.append(top)
            time.sleep(1.0)
            return real_walk(top)
        panel.Index._walk = staticmethod(slow_walk)
        try:
            idx.data[proj] = (0, idx.data[proj][1])   # 快取過期
            t0 = time.time()
            for _ in range(5):                         # 連點五下
                res = idx.files(proj)
            self.assertLess(time.time() - t0, 0.7, "最多稍等一下就回上次的清單；之後的連點不再等")
            self.assertEqual((len(res["files"]), res["scanning"]), (1, True))
            time.sleep(1.0)
            self.assertEqual(len(calls), 1, "同一個資料夾同時只掃一趟")
            self.assertEqual(len(idx.files(proj)["files"]), 2)
        finally:
            panel.Index._walk = staticmethod(real_walk)

    def test_project_folder_that_is_a_link_can_be_opened(self):
        real = Path(self.tmp.name).resolve() / "別處" / "連結案"
        real.mkdir(parents=True)
        (real / "a.pdf").write_bytes(b"x")
        os.symlink(real, self.root / "連結案", target_is_directory=True)
        idx = panel.Index()
        proj = str(self.root / "連結案")
        path = idx.files(proj)["files"][0]["path"]
        self.assertEqual(panel.project_of(path), proj)
        os.symlink("/etc/hostname", self.root / "連結案" / "逃出去.txt") if os.path.exists("/etc/hostname") else None
        self.assertIsNone(panel.project_of(str(self.root / "連結案" / "逃出去.txt")) if os.path.exists("/etc/hostname") else None)

    def test_odd_times_names_and_unreadable_folders(self):
        future = self.put("甲案/相機.jpg")
        os.utime(future, (time.time() + 10 * 365 * 86400,) * 2)
        self.put("甲案/正常.pdf", 1)
        self.put("甲案/圖說 1.5版")
        idx = panel.Index()
        proj = str(self.root / "甲案")
        res = idx.files(proj)
        by = {f["name"]: f for f in res["files"]}
        self.assertEqual(by["相機.jpg"]["mtime"], 0, "未來的時間不當成今天")
        self.assertEqual(res["times"]["today"], 1)
        self.assertEqual(res["files"][-1]["name"], "相機.jpg")
        self.assertEqual((by["圖說 1.5版"]["ext"], by["正常.pdf"]["ext"]), ("", "PDF"))
        real_scandir = os.scandir
        def deny(path):
            if str(path).endswith("機密"):
                raise PermissionError(13, "denied")
            return real_scandir(path)
        self.put("甲案/機密/x.pdf")
        os.scandir = deny
        try:
            idx.data.clear()
            self.assertEqual(idx.files(proj)["denied"], 1)
        finally:
            os.scandir = real_scandir

    def test_explicit_toggle_and_concurrent_config_writes(self):
        self.assertTrue(panel.toggle("pinned", "/a", True))
        self.assertTrue(panel.toggle("pinned", "/a", True), "畫面過期時重複送出，結果仍然是開")
        self.assertEqual(core.load_config()["pinned"], ["/a"])
        self.assertFalse(panel.toggle("pinned", "/a", False))
        import threading
        errors = []
        def work(i):
            try:
                for j in range(20):
                    panel.toggle("pinned", f"/p{i}-{j}", True)
            except Exception as e:
                errors.append(e)
        threads = [threading.Thread(target=work, args=(i,)) for i in range(8)]
        [th.start() for th in threads]
        [th.join() for th in threads]
        cfg = core.load_config()
        self.assertEqual((errors, len(cfg["pinned"]), cfg["project_roots"]), ([], 160, [str(self.root)]), "同時寫入不會互相蓋掉")

    def test_broken_config_is_kept_aside_not_overwritten(self):
        path = core.data_dir() / "config.json"
        path.write_text("{這不是 JSON", "utf-8")
        core._cache.update(stamp=None, cfg=None)
        self.assertEqual(core.load_config(), {"walk": True})
        self.assertIn("已另存", core.config_problem)
        self.assertEqual((core.data_dir() / "config.bad.json").read_text("utf-8"), "{這不是 JSON")
        core.config_problem = ""
        path.write_text('{"opened": [1], "pinned": 5, "project_roots": ["/x", 3], "panel_port": "abc"}', "utf-8")
        core._cache.update(stamp=None, cfg=None)
        cfg = core.load_config()
        self.assertEqual((cfg.get("opened"), cfg.get("pinned"), cfg["project_roots"]), (None, None, ["/x"]), "型別不對的欄位當作沒設定")
        path.write_text('{"opened": {"/a": 2, "/b": "x"}, "shelved": {"t1": 123.5, "t2": "x"}, "merged": {"/a": "/b", "/c": 1}}', "utf-8")
        core._cache.update(stamp=None, cfg=None)
        cfg = core.load_config()
        self.assertEqual((cfg["opened"], cfg["shelved"], cfg["merged"]), ({"/a": 2}, {"t1": 123.5}, {"/a": "/b"}), "內層型別不對的項目被濾掉，其餘保留")
        self.assertEqual(core.config_int("panel_port", 8765), 8765)

    def test_dirty_ai_records_do_not_break_the_list(self):
        d = Path(os.environ["CLAUDE_CONFIG_DIR"]) / "projects" / "-dirty"
        d.mkdir(parents=True, exist_ok=True)
        (d / "bad.jsonl").write_text("\n".join([
            '{"type":"assistant","message":"字串"}', '{"type":"ai-title","aiTitle":12345}', '[1,2]',
            '{"type":"user","cwd":123,"message":{"content":"hi"}}',
            '{"type":"user","message":{"content":[{"type":"text","text":null}]}}']), "utf-8")
        got = ai_tasks.all_tasks()
        self.assertIn("tasks", got)
        orig = ai_tasks.local_sessions
        ai_tasks.local_sessions = lambda: 1 / 0
        try:
            self.assertEqual(ai_tasks.all_tasks()["tasks"], [t for t in got["tasks"] if t["source"] != "本機"])
        finally:
            ai_tasks.local_sessions = orig


class ConversationTest(Base):
    def session(self, name, cwd, rows):
        d = Path(os.environ["CLAUDE_CONFIG_DIR"]) / "projects" / "-conv"
        d.mkdir(parents=True, exist_ok=True)
        f = d / (name + ".jsonl")
        lines = [{"type": "user", "cwd": cwd, "timestamp": "2026-11-10T01:00:00Z", "message": {"content": rows[0]}}]
        for i, text in enumerate(rows[1:]):
            role = "assistant" if i % 2 == 0 else "user"
            content = [{"type": "text", "text": text}] if role == "assistant" else text
            lines.append({"type": role, "timestamp": "2026-11-10T01:%02d:00Z" % (i + 1), "message": {"content": content}})
        f.write_text("\n".join(json.dumps(x, ensure_ascii=False) for x in lines), "utf-8")
        return f

    def tearDown(self):
        import shutil
        shutil.rmtree(Path(os.environ["CLAUDE_CONFIG_DIR"]) / "projects" / "-conv", ignore_errors=True)
        super().tearDown()

    def test_local_conversation_is_kept_as_messages(self):
        self.put("甲案/a.pdf")
        f = self.session("s", str(self.root / "甲案" / "子資料夾"), ["幫我整理法規檢討表", "好的，開始整理。", "容積率也要算", "已加上容積率。"])
        task = ai_tasks.parse_session(f)
        self.assertEqual([(m["role"], m["text"]) for m in task["messages"]],
                         [("user", "幫我整理法規檢討表"), ("ai", "好的，開始整理。"), ("user", "容積率也要算"), ("ai", "已加上容積率。")])
        self.assertTrue(all(m["ts"] > 0 for m in task["messages"]))

    def test_conversations_are_grouped_by_project(self):
        self.put("甲案/a.pdf")
        self.put("乙案_tools/b.pdf")
        self.session("in_a", str(self.root / "甲案"), ["整理甲案", "完成"])
        self.session("elsewhere", "/somewhere/else", ["別的事", "好"])
        core.set_config(github_repos=["me/tools", "me/other"])
        gh = [{"id": "me/tools#1", "source": "GitHub", "repo": "me/tools", "title": "T", "state": "waiting", "updated": time.time(), "messages": []},
              {"id": "me/other#2", "source": "GitHub", "repo": "me/other", "title": "O", "state": "running", "updated": time.time(), "messages": []}]
        orig = ai_tasks.github_tasks
        ai_tasks.github_tasks = lambda: (gh, "")
        try:
            got = panel.conversations()
            cols = {c["name"]: [t["id"] for t in c["threads"]] for c in got["columns"]}
            self.assertEqual(cols, {"甲案": ["in_a"], "乙案_tools": ["me/tools#1"]}, "本機的依資料夾歸屬；GitHub 的名稱對得上就自動歸屬")
            self.assertEqual(sorted(t["id"] for t in got["loose"]), ["elsewhere", "me/other#2"])
            self.put("丙案_沒有對話/c.pdf")
            panel._folders(fresh=True)
            wide = panel.conversations([str(self.root / "丙案_沒有對話"), "/不是專案"])
            self.assertEqual([(c["name"], len(c["threads"])) for c in wide["columns"]],
                             [("丙案_沒有對話", 0), ("乙案_tools", 1), ("甲案", 1)], "進行中但沒有對話的專案也有一欄；順序固定依名稱")
            panel.link_repo("me/other", str(self.root / "甲案"))
            cols = {c["name"]: sorted(t["id"] for t in c["threads"]) for c in panel.conversations()["columns"]}
            self.assertEqual(cols["甲案"], ["in_a", "me/other#2"], "手動指定後歸到那個專案")
            panel.link_repo("me/other", "")
            self.assertIn("me/other#2", [t["id"] for t in panel.conversations()["loose"]])
            with self.assertRaises(PermissionError):
                panel.link_repo("not/tracked", str(self.root / "甲案"))
        finally:
            ai_tasks.github_tasks = orig

    def fake_cli(self, exit_code=0, output='{"ok": true}'):
        """假的 claude 指令：把收到的參數、工作目錄與標準輸入記下來。"""
        log = Path(self.tmp.name) / "cli.log"
        cli = Path(self.tmp.name) / "claude"
        cli.write_text("#!/bin/sh\nprintf '%%s\\n' \"$PWD\" \"$*\" > '%s'\ncat >> '%s'\necho '%s'\nexit %d\n"
                       % (log, log, output, exit_code), "utf-8")
        cli.chmod(0o755)
        core.set_config(claude_path=str(cli))
        return log

    @unittest.skipIf(os.name == "nt", "假指令是 shell 腳本")
    def test_reply_goes_to_cloud_or_local_session(self):
        self.put("甲案/a.pdf")
        self.session("loc1", str(self.root / "甲案"), ["整理甲案", "完成"])
        cloud = {"id": "o/r#5", "source": "GitHub", "repo": "o/r", "title": "T", "state": "waiting", "updated": time.time(),
                 "session": "session_01ABCdef234", "messages": [{"role": "ai", "text": "做好了", "ts": 5.0}]}
        nolink = dict(cloud, id="o/r#6", session="")
        orig = ai_tasks.github_tasks
        ai_tasks.github_tasks = lambda: ([cloud, nolink], "")
        try:
            which = panel.shutil.which
            panel.shutil.which = lambda name: None   # 假裝這台電腦沒裝 Claude Code
            try:
                with self.assertRaisesRegex(PermissionError, "安裝 Claude Code"):
                    panel.send_reply("o/r#5", "嗨")
            finally:
                panel.shutil.which = which
            log = self.fake_cli()
            tricky = '好，繼續。"引號" & 符號 | $(rm) `x` 換行\n第二行'
            self.assertEqual(panel.send_reply("o/r#5", tricky), "cloud")
            lines = log.read_text("utf-8").split("\n", 2)
            self.assertEqual(lines[1], "-p --cloud session_01ABCdef234 --output-format json", "訊息不放在參數裡")
            self.assertEqual(lines[2], tricky, "訊息原封不動從標準輸入送進去")
            conv = panel.conversations()
            mine = [m for c in conv["columns"] + [{"threads": conv["loose"]}] for th in c["threads"] if th["id"] == "o/r#5" for m in th["messages"]]
            self.assertEqual([(m["role"], m["text"], bool(m.get("sent"))) for m in mine], [("ai", "做好了", False), ("user", tricky, True)])
            self.assertTrue(conv["cli"])
            self.assertEqual({th["id"]: th["can_reply"] for c in conv["columns"] + [{"threads": conv["loose"]}] for th in c["threads"]},
                             {"loc1": "local", "o/r#5": "cloud", "o/r#6": ""})
            with self.assertRaisesRegex(PermissionError, "沒有可以回覆的管道"):
                panel.send_reply("o/r#6", "嗨")
            with self.assertRaises(ValueError):
                panel.send_reply("o/r#5", "   ")
            with self.assertRaisesRegex(PermissionError, "太長"):
                panel.send_reply("o/r#5", "字" * 2001)
            with self.assertRaisesRegex(PermissionError, "找不到這段對話"):
                panel.send_reply("nope", "嗨")
            # 這台電腦上的對話：在它工作的資料夾接續
            self.assertEqual(panel.send_reply("loc1", "再檢查一次"), "local")
            for _ in range(100):
                if log.exists() and "再檢查一次" in log.read_text("utf-8"):
                    break
                time.sleep(0.02)
            lines = log.read_text("utf-8").split("\n", 2)
            self.assertEqual((lines[0], lines[1], lines[2]), (str(self.root / "甲案"), "-p --resume loc1", "再檢查一次"))
            # 指令回報失敗時，說得出原因
            self.fake_cli(1, "Error: cloud session x is archived and cannot accept new messages")
            with self.assertRaisesRegex(PermissionError, "已經封存"):
                panel.send_reply("o/r#5", "嗨")
            self.fake_cli(1, "Cloud sessions need a claude.ai sign-in. Run `claude auth login`")
            with self.assertRaisesRegex(PermissionError, "claude auth login"):
                panel.send_reply("o/r#5", "嗨")
        finally:
            ai_tasks.github_tasks = orig

    def test_session_link_is_found_in_pr_body_and_commits(self):
        self.assertEqual(ai_tasks.session_id("x\n🤖 Generated\n\nhttps://claude.ai/code/session_01CoaPSFuCF4"), "session_01CoaPSFuCF4")
        commit = {"commit": {"message": "加上搜尋\n\nCo-Authored-By: X <n@a.com>\nClaude-Session: https://claude.ai/code/session_01ZZZabc999",
                             "committer": {"date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}}}
        b = ai_tasks.branch_task("o/r", "claude/y", commit)
        self.assertEqual((b["session"], b["messages"][0]["text"]), ("session_01ZZZabc999", "加上搜尋"))
        self.assertEqual(ai_tasks.session_id(None, 5, "沒有連結"), "")
        bare = {"number": 1, "title": "T", "state": "open", "updated_at": "2026-11-10T00:00:00Z", "created_at": "2026-11-09T00:00:00Z",
                "head": {"ref": "claude/x"}, "body": "輸出成表格。\n\nhttps://claude.ai/code/session_01DemoFire4567"}
        task = ai_tasks.pr_task("o/r", bare, [], time.time())
        self.assertEqual((task["session"], task["messages"][0]["text"]), ("session_01DemoFire4567", "輸出成表格。"), "連結用來回覆，不顯示在對話裡")

    def test_title_follows_claude_naming(self):
        f = self.session("named", str(self.root), ["第一句話", "好"])
        self.assertEqual(ai_tasks.parse_session(f)["title"], "第一句話", "沒有名字時用第一句話")
        with open(f, "a", encoding="utf-8") as fh:
            fh.write("\n" + json.dumps({"type": "ai-title", "aiTitle": "建蔽容積檢討"}, ensure_ascii=False))
        self.assertEqual(ai_tasks.parse_session(f)["title"], "建蔽容積檢討", "Claude 自動取的名字")
        with open(f, "a", encoding="utf-8") as fh:
            fh.write("\n" + json.dumps({"type": "custom-title", "customTitle": "信義案容積"}, ensure_ascii=False))
            fh.write("\n" + json.dumps({"type": "ai-title", "aiTitle": "後來又自動取的名字"}, ensure_ascii=False))
        self.assertEqual(ai_tasks.parse_session(f)["title"], "信義案容積", "自己用 /rename 改的名字優先")

    def test_sub_conversations_hang_under_their_parent(self):
        self.put("甲案/a.pdf")
        f = self.session("parent", str(self.root / "甲案"), ["幫我請三位審查者來看", "好，我派出去了。"])
        sub = f.with_suffix("") / "subagents"
        sub.mkdir(parents=True)
        def child(name, title, finished, rows, age):
            (sub / f"agent-{name}.jsonl").write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows), "utf-8")
            (sub / f"agent-{name}.meta.json").write_text(json.dumps({"description": title, "finished": finished}, ensure_ascii=False), "utf-8")
            when = time.time() - age
            os.utime(sub / f"agent-{name}.jsonl", (when, when))
        child("a1", "第一輪審查", True, [
            {"type": "user", "isSidechain": True, "message": {"role": "user", "content": "請審查流程"}},
            {"type": "assistant", "isSidechain": True, "message": {"content": [{"type": "tool_use", "name": "SubagentHandback", "input": {"message": "分數：10/10"}}]}}], 900)
        child("b2", "第二輪審查", False, [
            {"type": "user", "isSidechain": True, "message": {"content": "請再審一次"}},
            {"type": "assistant", "isSidechain": True, "message": {"content": [{"type": "text", "text": "正在實測…"}]}}], 10)
        (sub / "agent-bad.jsonl").write_text("不是 JSON", "utf-8")
        kids = ai_tasks.sub_conversations(f)
        self.assertEqual([(k["title"], k["state"], k["ask"], k["last"]) for k in kids if k["id"] != "bad"],
                         [("第一輪審查", "done", "請審查流程", "分數：10/10"), ("第二輪審查", "running", "請再審一次", "正在實測…")])
        os.utime(f, (time.time() - 3600,) * 2)   # 主對話一小時沒動，但子助手還在做
        parent = next(s for s in ai_tasks.local_sessions() if s["id"] == "parent")
        self.assertEqual((parent["state"], parent["state_text"], len(parent["children"])), ("running", "子助手正在做", 3))
        self.assertEqual(ai_tasks.sub_conversations(f.with_name("沒有這個.jsonl")), [])

    def test_unused_conversations_are_shelved_and_can_come_back(self):
        self.put("甲案/a.pdf")
        cwd = str(self.root / "甲案")
        old = self.session("old_done", cwd, ["舊的事", "做完了"])
        os.utime(old, (time.time() - 5 * 86400,) * 2)
        self.session("in_use", cwd, ["現在的事", "處理中"])
        ids = lambda key: sorted(t["id"] for t in ai_tasks.all_tasks()[key] if t["id"] in ("old_done", "in_use"))  # noqa: E731
        self.assertEqual((ids("tasks"), ids("shelved")), (["in_use"], ["old_done"]), "停著超過三天的自動收起來")
        col = next(c for c in panel.conversations()["columns"] if c["name"] == "甲案")
        self.assertEqual(([t["id"] for t in col["threads"]], [t["id"] for t in col["shelved"]]), (["in_use"], ["old_done"]))
        ai_tasks.set_shelved("old_done", False)     # 放回來
        self.assertEqual(ids("tasks"), ["in_use", "old_done"])
        ai_tasks.set_shelved("in_use", True)        # 手動收起來
        self.assertEqual((ids("tasks"), ids("shelved")), (["old_done"], ["in_use"]))
        self.assertEqual(ai_tasks.all_tasks()["counts"]["waiting"], sum(t["state"] == "waiting" for t in ai_tasks.all_tasks()["tasks"]), "收起來的不算進數字")
        with open(Path(os.environ["CLAUDE_CONFIG_DIR"]) / "projects" / "-conv" / "in_use.jsonl", "a", encoding="utf-8") as fh:
            fh.write("\n" + json.dumps({"type": "assistant", "message": {"content": [{"type": "text", "text": "有新進度"}]}}))
        future = time.time() + 5
        os.utime(Path(os.environ["CLAUDE_CONFIG_DIR"]) / "projects" / "-conv" / "in_use.jsonl", (future, future))
        self.assertIn("in_use", ids("tasks"), "收起來的對話有新動靜會自己回來")
        only_old = self.session("lonely", str(self.root / "乙案"), ["很久以前", "好"]) if (self.root / "乙案").mkdir() is None else None
        os.utime(only_old, (time.time() - 9 * 86400,) * 2)
        panel._folders(fresh=True)
        col = next(c for c in panel.conversations()["columns"] if c["name"] == "乙案")
        self.assertEqual((col["threads"], [t["id"] for t in col["shelved"]]), ([], ["lonely"]), "只剩收起來的對話時，專案仍有一欄可以找回來")

    def test_pr_comments_become_a_conversation(self):
        pr = {"number": 3, "title": "T", "state": "open", "draft": True, "updated_at": "2026-11-10T00:00:00Z", "created_at": "2026-11-09T00:00:00Z",
              "html_url": "https://github.com/o/r/pull/3", "head": {"ref": "claude/x"},
              "body": "做了面板\n- [x] 後端\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nhttps://claude.ai/code/session_x"}
        comments = [{"body": "按鈕太小了", "created_at": "2026-11-09T02:00:00Z", "user": {"type": "User"}},
                    {"body": "已加大。\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_", "created_at": "2026-11-09T03:00:00Z", "user": {"type": "User"}},
                    {"body": None}, "壞資料"]
        task = ai_tasks.pr_task("o/r", pr, [], time.time(), comments)
        self.assertEqual([(m["role"], m["text"]) for m in task["messages"]],
                         [("ai", "做了面板"), ("user", "按鈕太小了"), ("ai", "已加大。")])
        self.assertEqual(task["repo"], "o/r")


class ServerTest(Base):
    def setUp(self):
        super().setUp()
        self.put("甲案/a.pdf")
        self.server = panel.make_server(0)
        import threading
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.port = self.server.server_address[1]
        self.token = self.server.RequestHandlerClass.token
        self.server.RequestHandlerClass.index.refresh_all()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        super().tearDown()

    def call(self, path, body=None, token=True, host=None):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}",
                                     data=json.dumps(body).encode() if body is not None else None)
        if token:
            req.add_header("X-Token", self.token)
        if host:
            req.add_header("Host", host)
        try:
            with urllib.request.urlopen(req) as r:
                raw = r.read()
                return r.status, json.loads(raw) if r.headers["Content-Type"].startswith("application/json") else raw
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_api(self):
        code, page = self.call("/", token=False)
        self.assertEqual(code, 200)
        self.assertIn(self.token.encode(), page)
        self.assertEqual(self.call("/api/projects", token=False)[0], 403)
        self.assertEqual(self.call("/api/projects", host="evil.example:80")[0], 403)
        code, data = self.call("/api/projects")
        self.assertEqual([p["name"] for p in data["projects"]], ["甲案"])
        code, data = self.call("/api/files?project=" + urllib.request.quote(str(self.root / "甲案")))
        self.assertEqual(data["files"][0]["name"], "a.pdf")
        self.assertEqual(self.call("/api/files?project=/etc")[0], 400)
        self.assertEqual(self.call("/api/open", {"path": "/etc/passwd"})[0], 400)
        self.assertEqual(self.call("/api/open_url", {"url": "https://evil.example/"})[0], 400)
        self.assertEqual(self.call("/api/tasks")[0], 200)
        self.assertEqual(self.call("/api/ping")[1], {"ok": True})
        code, conv = self.call("/api/conversations")
        self.assertEqual((code, [(c["name"], c["threads"]) for c in conv["columns"]], [p["name"] for p in conv["projects"]]),
                         (200, [("甲案", [])], ["甲案"]), "進行中的專案即使沒有對話也有一欄")
        self.assertEqual(self.call("/api/link_repo", {"repo": "x/y", "project": ""})[0], 400)
        self.assertEqual(self.call("/api/reply", {"thread": "nope", "text": "嗨"})[0], 400)
        self.assertEqual(self.call("/api/reply", {"thread": 5, "text": "嗨"})[0], 400)
        self.assertEqual(self.call("/api/shelve", {"thread": "any", "on": True})[1], {"ok": True})
        self.assertIn("any", core.load_config()["shelved"], "收起來的紀錄有存下來")
        self.assertEqual(self.call("/api/shelve", {"thread": 3, "on": True})[0], 400)
        # 桌面史萊姆的開關與大小
        self.assertEqual(self.call("/api/pet")[1]["visible"], True)
        self.assertEqual(self.call("/api/pet", {"visible": False})[1]["visible"], False)
        self.assertIs(core.load_config()["pet_visible"], False)
        self.assertEqual(self.call("/api/pet", {"size": 130})[1]["size"], 130)
        for bad in ({"size": 77}, {"size": True}, {"size": "130"}, {"visible": "no"}):
            self.assertEqual(self.call("/api/pet", bad)[0], 400, bad)
        self.assertEqual(self.call("/api/pet")[1]["size"], 130, "錯的值不會蓋掉原本的設定")
        # 面板回報游標在不在它上面：在的時候桌面史萊姆不跑過去
        self.assertFalse(panel.pointer_on_panel())
        self.call("/api/pointer", {"inside": True})
        self.assertTrue(panel.pointer_on_panel())
        self.call("/api/pointer", {"inside": "yes"})
        self.assertFalse(panel.pointer_on_panel(), "只有 true 才算")
        # 圖片、已讀、跳到對話
        self.assertEqual(self.call("/api/image?id=nope")[0], 404)
        self.assertEqual(self.call("/api/read", {"thread": "x", "read": "yes"})[0], 400)
        self.assertEqual(self.call("/api/read", {"thread": "x", "read": True})[1]["unread"], 0)
        self.assertEqual(self.call("/api/open_image", {"id": "nope"})[0], 400)
        self.assertFalse(panel.focus_thread("t1") and False)
        self.assertEqual(self.call("/api/focus")[1]["thread"], "t1")
        self.assertEqual(self.call("/api/focus")[1]["thread"], "", "跳過一次就清掉")
        self.assertTrue(panel.focus_thread("t2"), "面板剛來問過：視為開著")
        self.assertEqual(self.call("/api/files?limit=abc")[0], 200)
        for bad in ([1, 2], "x", 7, {"path": 5}, {"path": None}, {}):
            self.assertEqual(self.call("/api/open", bad)[0], 400, bad)
        boom = panel.ai_tasks.all_tasks
        panel.ai_tasks.all_tasks = lambda: 1 / 0
        try:
            code, data = self.call("/api/tasks")
            self.assertEqual((code, data["tasks"]), (200, []))
            self.assertIn("暫時讀不到", data["error"])
        finally:
            panel.ai_tasks.all_tasks = boom
        proj = urllib.request.quote(str(self.root / "甲案"))
        self.assertEqual(self.call("/api/folders?project=" + proj)[1]["folders"],
                         [{"path": str(self.root / "甲案"), "main": True, "single": False, "missing": False}])
        self.assertEqual(self.call("/api/sources")[1]["sources"][0]["batch"], True)
        self.assertEqual(self.call("/api/remove_source", {"path": "/etc"})[0], 400)
        os.rename(self.root, str(self.root) + "_斷線")
        try:
            code, data = self.call("/api/open", {"path": str(self.root / "甲案" / "a.pdf")})
            self.assertEqual((code, data["offline"]), (409, True))
            self.assertIn("設定都還在", data["error"])
            self.assertEqual(self.call("/api/files?project=" + proj)[0], 409)
        finally:
            os.rename(str(self.root) + "_斷線", self.root)
        self.assertEqual(self.call("/api/merge", {"path": "/etc", "into": str(self.root / "甲案")})[0], 400)
        picked = Path(self.tmp.name) / "新案"
        picked.mkdir()
        self.server.RequestHandlerClass.picker = staticmethod(lambda title: str(picked))
        self.assertEqual(self.call("/api/add_project", {"as_root": False})[1], {"added": True})
        self.assertIn("新案", [p["name"] for p in self.call("/api/projects")[1]["projects"]])


class TasksTest(unittest.TestCase):
    def test_local_session(self):
        d = Path(os.environ["CLAUDE_CONFIG_DIR"]) / "projects" / "-x"
        d.mkdir(parents=True, exist_ok=True)
        f = d / "s1.jsonl"
        rows = [
            {"type": "user", "cwd": "/w/信義住宅", "message": {"role": "user", "content": "整理法規檢討表"}},
            {"type": "ai-title", "aiTitle": "法規檢討表"},
            {"type": "assistant", "message": {"content": [
                {"type": "text", "text": "開始處理"},
                {"type": "tool_use", "name": "TodoWrite", "input": {"todos": [
                    {"content": "讀取法規", "status": "completed"},
                    {"content": "計算容積", "status": "in_progress"},
                    {"content": "輸出表格", "status": "pending"}]}}]}},
            "壞掉的行",
        ]
        f.write_text("\n".join(r if isinstance(r, str) else json.dumps(r, ensure_ascii=False) for r in rows), "utf-8")
        t = ai_tasks.parse_session(f)
        self.assertIn("不需要你處理", t["next"])
        self.assertEqual((t["title"], t["state"], t["progress"], t["doing"], t["where"]),
                         ("法規檢討表", "running", [1, 3], "計算容積", "信義住宅"))
        t = ai_tasks.parse_session(f, now=time.time() + 600)
        self.assertEqual(t["state"], "idle")
        with open(f, "a", encoding="utf-8") as fh:
            fh.write("\n" + json.dumps({"type": "assistant", "message": {"content": [{"type": "text", "text": "完成了"}]}}))
        t = ai_tasks.parse_session(f, now=time.time() + 600)
        self.assertEqual((t["state"], t["reply"]), ("waiting", "完成了"))
        self.assertEqual(ai_tasks.local_sessions()[0]["id"], "s1")

    def test_images_and_read(self):
        import base64
        png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
        d = Path(os.environ["CLAUDE_CONFIG_DIR"]) / "projects" / "-img"
        d.mkdir(parents=True, exist_ok=True)
        work = Path(tempfile.mkdtemp(prefix="work_"))
        (work / "平面圖.png").write_bytes(png)
        f = d / "img1.jsonl"
        b64 = {"type": "base64", "media_type": "image/png", "data": base64.b64encode(png).decode()}
        now = time.time()
        iso = lambda ago: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now - ago))
        rows = [
            {"type": "ai-title", "aiTitle": "看圖"},
            {"type": "user", "cwd": str(work), "timestamp": iso(300), "message": {"content": [{"type": "text", "text": "看這張"}, {"type": "image", "source": b64}]}},
            {"type": "user", "timestamp": iso(200), "message": {"content": [{"type": "tool_result", "content": [{"type": "image", "source": b64}]}]}},
            {"type": "assistant", "timestamp": iso(100), "message": {"content": [{"type": "text", "text": "已存成 平面圖.png，另外 不存在.png 沒做"}]}},
        ]
        f.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", "utf-8")
        t = ai_tasks.parse_session(f)
        roles = [(x["role"], x["name"]) for x in t["images"]]
        self.assertEqual(roles, [("user", "貼上的圖片"), ("ai", "AI 看過的圖"), ("ai", "平面圖.png")], "貼的、AI 看的、AI 存的檔案；不存在的檔案不算")
        for x in t["images"]:
            self.assertEqual(ai_tasks.load_image(x["id"]), (png, "image/png"))
        # 新寫入的部分才掃描：再加一張
        with open(f, "a", encoding="utf-8") as fh:
            fh.write(json.dumps({"type": "user", "timestamp": iso(50), "message": {"content": [{"type": "image", "source": b64}]}}) + "\n")
        self.assertEqual(len(ai_tasks.parse_session(f)["images"]), 4)
        with self.assertRaises(KeyError):
            ai_tasks.load_image("not-a-real-id")
        # GitHub 留言裡的圖
        msgs = ai_tasks.pr_messages({"body": "成果 ![平面](https://example.com/a.png)", "created_at": "2026-01-01T00:00:00Z"}, [])
        self.assertEqual(msgs[0]["images"][0]["url"], "https://example.com/a.png")
        # 已讀：從第一次使用起算；之後的 AI 訊息與圖片算新的
        cfg = {"read": {}}
        ai_tasks.mark_unread(t, cfg, now - 1000)
        self.assertEqual(t["unread"], 3, "1 則 AI 訊息 + 2 張 AI 的圖")
        ai_tasks.mark_unread(t, cfg, now)
        self.assertEqual(t["unread"], 0)
        ai_tasks.set_read(t["id"], ai_tasks.last_ai_time(t) - 1)
        ai_tasks.mark_unread(t, core.load_config(), 0)
        self.assertEqual(t["unread"], 2, "標成未讀：最後一則（和它附的圖）算新的")
        ai_tasks.set_read(t["id"], None)
        ai_tasks.mark_unread(t, core.load_config(), 0)
        self.assertEqual(t["unread"], 0)

    def test_pr_states(self):
        now = time.time()
        iso = lambda ago: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now - ago))  # noqa: E731
        pr = {"number": 1, "title": "桌面寵物", "state": "open", "draft": True, "updated_at": iso(3600),
              "html_url": "https://github.com/o/r/pull/1", "head": {"ref": "claude/x"},
              "body": "說明\n- [x] 後端\n- [X] 測試\n- [ ] 簡報\n"}
        t = ai_tasks.pr_task("o/r", pr, [], now)
        self.assertEqual((t["state"], t["progress"], t["doing"]), ("waiting", [2, 3], "簡報"))
        self.assertIn("Ready for review", t["next"])
        ready = ai_tasks.pr_task("o/r", dict(pr, draft=False), [], now)
        self.assertIn("Merge pull request", ready["next"])
        self.assertNotIn("Ready for review", ready["next"], "不是草稿時頁面上沒有這顆按鈕")
        self.assertNotIn("draft", ready)
        self.assertEqual(ai_tasks.pr_task("o/r", pr, [{"status": "in_progress"}], now)["state"], "running")
        self.assertEqual(ai_tasks.pr_task("o/r", pr, [{"status": "completed", "conclusion": "failure"}], now)["state"], "failed")
        self.assertEqual(ai_tasks.pr_task("o/r", dict(pr, updated_at=iso(60)), [], now)["state"], "running")
        merged = dict(pr, state="closed", merged_at=iso(100), updated_at=iso(100))
        self.assertEqual(ai_tasks.pr_task("o/r", merged, None, now)["state"], "done")
        self.assertIsNone(ai_tasks.pr_task("o/r", dict(merged, updated_at=iso(5 * 86400)), None, now))
        commit = {"commit": {"message": "加上搜尋\n\n細節", "committer": {"date": iso(120)}}, "html_url": "https://github.com/o/r/commit/1"}
        b = ai_tasks.branch_task("o/r", "claude/y", commit, now)
        self.assertEqual((b["state"], b["title"]), ("running", "加上搜尋"))

    def test_changes(self):
        tasks = [{"id": "a", "state": "waiting"}, {"id": "b", "state": "running"}, {"id": "c", "state": "done"}]
        got = ai_tasks.changes({"a": "running", "b": "idle", "c": "done"}, tasks)
        self.assertEqual([(t["id"], before) for t, before in got], [("a", "running")])


if __name__ == "__main__":
    unittest.main()
