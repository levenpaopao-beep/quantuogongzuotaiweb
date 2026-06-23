import unittest
import json
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import daily_ops_app
from PIL import Image


ROOT = Path(__file__).resolve().parent


class DesktopAppTest(unittest.TestCase):
    def test_electron_desktop_entrypoint_exists_and_does_not_start_web_server(self):
        main_source = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertEqual(package["main"], "electron/main.js")
        self.assertEqual(package["productName"], "PETCIRCLE 运营工作台")
        self.assertIn("BrowserWindow", main_source)
        self.assertIn("daily_ops_cli.py", main_source)
        self.assertNotIn("http://127.0.0.1", main_source)
        self.assertNotIn("listen(", main_source)

    def test_petcircle_branding_and_icons_are_wired_into_desktop_app(self):
        main_source = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")
        html = (ROOT / "electron" / "renderer.html").read_text(encoding="utf-8")
        css = (ROOT / "electron" / "renderer.css").read_text(encoding="utf-8")
        self.assertTrue((ROOT / "electron" / "assets" / "petcircle-app-icon.png").exists())
        self.assertTrue((ROOT / "electron" / "assets" / "petcircle-app-icon.icns").exists())
        self.assertIn("PETCIRCLE 运营工作台", main_source)
        self.assertIn("app.dock.setIcon", main_source)
        self.assertIn("petcircle-app-icon.icns", main_source)
        self.assertIn("petcircle-app-icon.png", html)
        self.assertIn("PETCIRCLE 运营工作台", html)
        self.assertIn("brand-logo", css)

    def test_petcircle_dock_icon_uses_transparent_rounded_corners(self):
        icon_path = ROOT / "electron" / "assets" / "petcircle-app-icon.png"
        with Image.open(icon_path) as image:
            self.assertEqual(image.mode, "RGBA")
            width, height = image.size
            for point in [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]:
                self.assertEqual(image.getpixel(point)[3], 0)

    def test_macos_app_launcher_opens_without_terminal(self):
        app_dir = ROOT / "PETCIRCLE 运营工作台.app"
        plist = app_dir / "Contents" / "Info.plist"
        launcher = app_dir / "Contents" / "MacOS" / "launcher"
        icon = app_dir / "Contents" / "Resources" / "petcircle-app-icon.icns"
        self.assertTrue(app_dir.exists())
        self.assertTrue(plist.exists())
        self.assertTrue(launcher.exists())
        self.assertTrue(icon.exists())
        self.assertTrue(launcher.stat().st_mode & 0o111)
        plist_text = plist.read_text(encoding="utf-8")
        launcher_source = (ROOT / "electron" / "macos_launcher.c").read_text(encoding="utf-8")
        self.assertIn("PETCIRCLE 运营工作台", plist_text)
        self.assertIn("petcircle-app-icon", plist_text)
        self.assertIn("node_modules/electron", launcher_source)
        self.assertNotIn("Terminal", launcher_source)

    def test_desktop_adapter_upload_records_pending_batch_without_http(self):
        import daily_ops_desktop_adapter as adapter

        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source.xlsx"
            source.write_bytes(b"xlsx")
            target_dir = root / "uploads"
            target_dir.mkdir()
            manifest = root / "manifest.json"

            with patch.dict(daily_ops_app.UPLOAD_TARGETS, {"demo": ("测试数据源", target_dir)}, clear=True), \
                 patch.object(daily_ops_app, "DATA_SOURCE_MANIFEST", manifest):
                result = adapter.import_source_files("demo", [source])

            self.assertEqual(result["count"], 1)
            self.assertEqual(result["files"][0]["file"], "source.xlsx")
            self.assertTrue((target_dir / "source.xlsx").exists())
            self.assertIn("pending_batches", manifest.read_text(encoding="utf-8"))

    def test_mac_launcher_uses_desktop_entrypoint_not_local_url(self):
        text = (ROOT / "启动日常运营工作台.command").read_text(encoding="utf-8")
        self.assertIn("npm start", text)
        self.assertIn("package.json", text)
        self.assertNotIn("http://127.0.0.1", text)
        self.assertNotIn("lsof -ti tcp", text)

    def test_electron_renderer_matches_selected_workbench_reference(self):
        html = (ROOT / "electron" / "renderer.html").read_text(encoding="utf-8")
        css = (ROOT / "electron" / "renderer.css").read_text(encoding="utf-8")
        js = (ROOT / "electron" / "renderer.js").read_text(encoding="utf-8")
        for text in ["PETCIRCLE 运营工作台", "数据源状态", "本周生成队列", "数据源", "生成报表", "输出记录"]:
            self.assertIn(text, html + js)
        self.assertIn("sidebar", html)
        self.assertIn("source-table", html)
        self.assertIn("queue-panel", html)
        self.assertIn("--system-blue", css)
        self.assertIn("grid-template-columns: 224px 1fr", css)

    def test_weekly_workflow_uses_table_workbench_layout(self):
        source = (ROOT / "electron" / "renderer.js").read_text(encoding="utf-8")
        self.assertIn("renderSources", source)
        self.assertIn("selectFiles", source)
        self.assertIn("uploadSource", source)
        self.assertIn("finishUpload", source)
        self.assertIn("renderReportQueue", source)

    def test_source_upload_state_is_visible_in_table_rows(self):
        source = (ROOT / "electron" / "renderer.js").read_text(encoding="utf-8")
        css = (ROOT / "electron" / "renderer.css").read_text(encoding="utf-8")
        self.assertIn("sourceProgress", source)
        self.assertIn("renderSourceProgress", source)
        self.assertIn("已选择", source)
        self.assertIn("上传成功", source)
        self.assertIn("上传失败", source)
        self.assertIn("待结束上传", source)
        self.assertIn("source-progress", css)

    def test_report_cards_include_direct_download_actions(self):
        source = (ROOT / "electron" / "renderer.js").read_text(encoding="utf-8")
        css = (ROOT / "electron" / "renderer.css").read_text(encoding="utf-8")
        self.assertIn("latestOutputForReport", source)
        self.assertIn("download-report", source)
        self.assertIn("打开表格", source)
        self.assertIn("打开所在文件夹", source)
        self.assertIn("download-actions", css)

    def test_weekly_report_queue_shows_completion_status_compactly(self):
        source = (ROOT / "electron" / "renderer.js").read_text(encoding="utf-8")
        css = (ROOT / "electron" / "renderer.css").read_text(encoding="utf-8")
        html = (ROOT / "electron" / "renderer.html").read_text(encoding="utf-8")
        self.assertIn("completionSummary", source)
        self.assertIn("queue-item-done", source)
        self.assertIn("queue-item-todo", source)
        self.assertIn("已完成", source)
        self.assertIn("未完成", source)
        self.assertIn("本周完成状态", html)
        self.assertIn("queue-progress", css)
        self.assertIn("min-height: 58px", css)

    def test_weekly_report_queue_shows_task_badges(self):
        source = (ROOT / "electron" / "renderer.js").read_text(encoding="utf-8")
        css = (ROOT / "electron" / "renderer.css").read_text(encoding="utf-8")
        self.assertIn("reportTaskBadges", source)
        self.assertIn("queue-task-badges", source)
        self.assertIn("queue-task-badge", css)
        for text in ["任务", "待店长", "待审核"]:
            self.assertIn(text, source)

    def test_desktop_shell_matches_workbench_reference(self):
        source = (ROOT / "electron" / "renderer.html").read_text(encoding="utf-8")
        self.assertIn('data-page="weekly"', source)
        self.assertIn('data-mode="sources"', source)
        self.assertIn('data-mode="reports"', source)
        self.assertIn('data-mode="outputs"', source)

    def test_python_cli_returns_json_for_electron(self):
        result = subprocess.run(
            [sys.executable, str(ROOT / "daily_ops_cli.py"), "reports"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        payload = json.loads(result.stdout)
        self.assertTrue(payload["ok"])
        self.assertIn("data", payload)


if __name__ == "__main__":
    unittest.main()
