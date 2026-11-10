"""執行：python -m unittest test_pet_core -v"""
import os
import tempfile
import unittest
from pathlib import Path

_home = tempfile.mkdtemp(prefix="pet_home_")
os.environ["DESKTOP_PET_HOME"] = _home

import pet_core as core  # noqa: E402


def snapshot(folder: Path) -> dict:
    return {str(p.relative_to(folder)): p.read_bytes() for p in sorted(folder.rglob("*")) if p.is_file()}


class CoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name).resolve() / "下載"
        self.dir.mkdir()
        hist = Path(_home) / "history.json"
        if hist.exists():
            hist.unlink()

    def tearDown(self):
        self.tmp.cleanup()

    def put(self, rel, data=b"x"):
        p = self.dir / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return p

    def test_organize_and_undo_roundtrip(self):
        for name in ("平面圖.DWG", "報告.pdf", "照片.jpg", "未知.xyz", "預算.xlsx"):
            self.put(name, name.encode())
        self.put("既有子資料夾/裡面.pdf")
        before = snapshot(self.dir)

        moves = core.plan_organize(self.dir)
        self.assertEqual(snapshot(self.dir), before, "規劃階段不得動到檔案")
        self.assertEqual({m.src.name: m.category for m in moves}, {
            "平面圖.DWG": "圖面與模型", "報告.pdf": "文件", "照片.jpg": "圖片",
            "未知.xyz": "其他", "預算.xlsx": "試算表"})

        done, errors = core.execute(moves, "整理")
        self.assertEqual((done, errors), (5, []))
        self.assertTrue((self.dir / "圖面與模型" / "平面圖.DWG").exists())
        self.assertTrue((self.dir / "既有子資料夾" / "裡面.pdf").exists(), "子資料夾不該被動")
        self.assertEqual(core.plan_organize(self.dir), [], "整理完應沒有散落檔案")

        restored, problems = core.undo_last()
        self.assertEqual((restored, problems), (5, []))
        self.assertEqual(snapshot(self.dir), before)
        self.assertFalse((self.dir / "文件").exists(), "還原後應移除空的分類資料夾")
        self.assertIsNone(core.last_batch())

    def test_never_overwrites(self):
        self.put("文件/報告.pdf", b"old")
        self.put("報告.pdf", b"new")
        core.execute(core.plan_organize(self.dir), "整理")
        self.assertEqual((self.dir / "文件" / "報告.pdf").read_bytes(), b"old")
        self.assertEqual((self.dir / "文件" / "報告 (1).pdf").read_bytes(), b"new")
        core.undo_last()
        self.assertEqual((self.dir / "報告.pdf").read_bytes(), b"new")
        self.assertTrue((self.dir / "文件").is_dir(), "原本就有的資料夾不可被刪")

    def test_skips_shortcuts_temp_and_hidden(self):
        for name in ("捷徑.lnk", "下載中.crdownload", "~$報告.docx", ".hidden", "圖.dwl", "desktop.ini"):
            self.put(name)
        self.put("ok.png")
        self.assertEqual([m.src.name for m in core.plan_organize(self.dir)], ["ok.png"])

    def test_protected_folders(self):
        for bad in (Path.home(), Path(Path.home().anchor), Path(core.__file__).parent):
            with self.assertRaises(core.ProtectedFolderError):
                core.plan_organize(bad)

    def test_undo_skips_when_original_place_taken(self):
        self.put("a.pdf", b"1")
        core.execute(core.plan_organize(self.dir), "整理")
        self.put("a.pdf", b"2")  # 使用者之後又放了同名檔
        restored, problems = core.undo_last()
        self.assertEqual(restored, 0)
        self.assertEqual(len(problems), 1)
        self.assertEqual((self.dir / "a.pdf").read_bytes(), b"2")
        self.assertEqual((self.dir / "文件" / "a.pdf").read_bytes(), b"1")
        self.assertIsNotNone(core.last_batch(), "未還原的項目應保留在紀錄中")

    def test_duplicates_quarantine_and_undo(self):
        big = os.urandom(200_000)
        a = self.put("正本.bin", big)
        os.utime(a, (1000, 1000))
        self.put("專案/複本.bin", big)
        self.put("複本2.bin", big)
        self.put("同大小不同內容.bin", big[:-1] + bytes([big[-1] ^ 1]))
        self.put("空1.txt", b"")
        self.put("空2.txt", b"")
        before = snapshot(self.dir)

        groups = core.find_duplicates(self.dir)
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0][0], a, "最舊的檔案應視為正本")
        self.assertEqual(len(groups[0]), 3)

        moves = core.plan_quarantine(self.dir, groups)
        done, errors = core.execute(moves, "隔離重複檔案")
        self.assertEqual((done, errors), (2, []))
        self.assertTrue(a.exists())
        self.assertTrue((self.dir / core.QUARANTINE / "專案" / "複本.bin").exists())
        self.assertEqual(core.find_duplicates(self.dir), [], "隔離區不應再被掃描")

        core.undo_last()
        self.assertEqual(snapshot(self.dir), before)
        self.assertFalse((self.dir / core.QUARANTINE).exists())

    def test_largest_files(self):
        self.put("小.txt", b"1")
        self.put("深/大.bin", b"1" * 5000)
        rows = core.largest_files(self.dir, n=1)
        self.assertEqual((rows[0][0].name, rows[0][1]), ("大.bin", 5000))

    def test_execute_reports_missing_source(self):
        self.put("a.pdf")
        moves = core.plan_organize(self.dir)
        (self.dir / "a.pdf").unlink()
        done, errors = core.execute(moves, "整理")
        self.assertEqual(done, 0)
        self.assertEqual(len(errors), 1)
        self.assertIsNone(core.last_batch())


if __name__ == "__main__":
    unittest.main()
