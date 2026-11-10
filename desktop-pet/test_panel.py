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
                "平面圖_rev2.DWG", "平面圖 - 複本.dwg", "平面圖_R1.dwg"]
        self.assertEqual({panel.version_key(n) for n in same}, {"平面圖.dwg"})

    def test_keeps_meaningful_differences(self):
        distinct = ["A1.dwg", "A2.dwg", "A1-01.dwg", "A1-02.dwg", "1F平面圖.dwg", "2F平面圖.dwg",
                    "B1結構.dwg", "平面圖.pdf", "立面圖.dwg", "review.docx", "newton.pdf", "river.jpg", "v.dwg"]
        self.assertEqual(len({panel.version_key(n) for n in distinct}), len(distinct))

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
        self.assertEqual([p["name"] for p in plist], ["信義住宅", "大安辦公室"], "最近有動的專案排前面")
        self.assertEqual((plist[0]["count"], plist[0]["today"]), (6, 1))

        proj = str(self.root / "信義住宅")
        res = idx.files(proj)
        self.assertEqual(res["files"][0]["path"], new)
        self.assertEqual([v["name"] for v in res["files"][0]["versions"]], ["平面圖_v2.dwg", "平面圖_v1.dwg"])
        self.assertEqual(res["total"], 4)
        self.assertEqual(res["kinds"], {"圖面與模型": 5, "試算表": 1})
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
                         ["信義住宅_業主提供/測量", "信義案渲染", "圖面"])
        self.assertEqual([f["name"] for f in idx.files(main, sub="信義住宅_業主提供/測量")["files"]], ["地籍圖.pdf"])
        self.assertEqual([f["name"] for f in idx.files(main, sub="信義案渲染")["files"]], ["日景.png"])
        self.assertEqual([f["name"] for f in idx.files(main, q="業主 地籍")["files"]], ["地籍圖.pdf"])
        with self.assertRaises(PermissionError):
            panel.merge(extra, main)  # 已併入的不能再併
        panel.unmerge(extra)
        self.assertEqual(panel.projects(), [main, extra])

    def test_since_filter_for_reporting(self):
        self.put("甲案/今天改的.dwg", 0)
        self.put("甲案/三天前.pdf", 3)
        self.put("甲案/今天改的_v1.dwg", 20)
        self.put("甲案/上個月.pdf", 40)
        idx = panel.Index()
        proj = str(self.root / "甲案")
        res = idx.files(proj)
        self.assertEqual(res["times"], {"today": 1, "week": 2})
        self.assertEqual([f["name"] for f in idx.files(proj, since="today")["files"]], ["今天改的.dwg"])
        self.assertEqual(len(idx.files(proj, since="week")["files"]), 2)
        self.assertEqual(len(idx.files(proj, since="today")["files"][0]["versions"]), 1, "報告時仍看得到舊版")
        self.assertEqual(idx.files(proj, since="week")["kinds"], {"圖面與模型": 1, "PDF": 1})

    def test_new_file_shows_up_without_waiting(self):
        self.put("甲案/a.pdf", 1)
        idx = panel.Index()
        idx.refresh_all()
        proj = str(self.root / "甲案")
        self.put("甲案/b.pdf", 0)
        self.assertEqual(len(idx.files(proj)["files"]), 1, "20 秒內用快取")
        idx.data[proj] = (0, idx.data[proj][1])
        self.assertEqual(idx.files(proj)["files"][0]["name"], "b.pdf")

    def test_star_and_hide(self):
        a = self.put("甲案/重要.pdf", 50)
        self.put("甲案/新的.pdf", 0)
        self.put("乙案/x.pdf", 0)
        idx = panel.Index()
        idx.refresh_all()
        panel.toggle("starred_files", a)
        self.assertEqual(idx.files(str(self.root / "甲案"))["files"][0]["name"], "重要.pdf")
        panel.toggle("starred_projects", str(self.root / "甲案"))
        self.assertEqual(idx.project_list()[0]["name"], "甲案")
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
            self.assertEqual(panel.open_file(exe), "revealed")
        finally:
            panel.subprocess.Popen = orig
        self.assertTrue(calls)

    def test_add_project_rejects_protected(self):
        with self.assertRaises(core.ProtectedFolderError):
            panel.add_project(str(Path.home()), True)
        single = Path(self.tmp.name) / "單獨案"
        single.mkdir()
        panel.add_project(str(single), False)
        self.assertIn(str(single.resolve()), panel.projects())


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
        proj = urllib.request.quote(str(self.root / "甲案"))
        self.assertEqual(self.call("/api/folders?project=" + proj)[1]["folders"], [str(self.root / "甲案")])
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
        self.assertEqual((t["title"], t["state"], t["progress"], t["doing"], t["where"]),
                         ("法規檢討表", "running", [1, 3], "計算容積", "信義住宅"))
        t = ai_tasks.parse_session(f, now=time.time() + 600)
        self.assertEqual(t["state"], "idle")
        with open(f, "a", encoding="utf-8") as fh:
            fh.write("\n" + json.dumps({"type": "assistant", "message": {"content": [{"type": "text", "text": "完成了"}]}}))
        t = ai_tasks.parse_session(f, now=time.time() + 600)
        self.assertEqual((t["state"], t["reply"]), ("waiting", "完成了"))
        self.assertEqual(ai_tasks.local_sessions()[0]["id"], "s1")

    def test_pr_states(self):
        now = time.time()
        iso = lambda ago: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now - ago))  # noqa: E731
        pr = {"number": 1, "title": "桌面寵物", "state": "open", "draft": True, "updated_at": iso(3600),
              "html_url": "https://github.com/o/r/pull/1", "head": {"ref": "claude/x"},
              "body": "說明\n- [x] 後端\n- [X] 測試\n- [ ] 簡報\n"}
        t = ai_tasks.pr_task("o/r", pr, [], now)
        self.assertEqual((t["state"], t["progress"], t["doing"]), ("waiting", [2, 3], "簡報"))
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
