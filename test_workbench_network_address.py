import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import daily_ops_app
import generate_shein_inventory_abnormal
import generate_shein_price_abnormal


ROOT = Path(__file__).resolve().parent
SCRIPT_FILES = [
    ROOT / "启动日常运营工作台.command",
    ROOT / "停止日常运营工作台.command",
    ROOT / "启动日常运营工作台.bat",
    ROOT / "停止日常运营工作台.bat",
]


class WorkbenchNetworkAddressTest(unittest.TestCase):
    def test_daily_workbench_uses_dedicated_port(self):
        self.assertEqual(daily_ops_app.PORT, 8876)

    def test_launch_and_stop_scripts_use_dedicated_address(self):
        for path in SCRIPT_FILES:
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                self.assertNotIn("127.0.0.1:8765", text)
                self.assertNotIn("127.0.0.1:8766", text)
                self.assertNotIn("127.0.0.1:8876", text)
                self.assertNotIn("tcp:8765", text)
                self.assertNotIn("tcp:8766", text)
                self.assertNotIn("tcp:8876", text)

    def test_launch_scripts_use_desktop_entrypoint(self):
        for path in [ROOT / "启动日常运营工作台.command", ROOT / "启动日常运营工作台.bat"]:
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                self.assertIn("npm start", text)
                self.assertIn("package.json", text)
                self.assertNotIn("daily_ops_app.py", text)

    def test_mac_launcher_uses_electron_runtime(self):
        text = (ROOT / "启动日常运营工作台.command").read_text(encoding="utf-8")
        self.assertIn("node_modules/electron", text)
        self.assertIn("ELECTRON_MIRROR", text)
        self.assertIn("npm install", text)

    def test_browser_navigation_does_not_auto_shutdown_workbench(self):
        text = (ROOT / "daily_ops_app.py").read_text(encoding="utf-8")
        self.assertNotIn("navigator.sendBeacon('/api/client-close'", text)
        self.assertNotIn("schedule_shutdown_after_client_close(self.server)", text)

    def test_upload_entry_is_consolidated_into_weekly_workflow(self):
        html = daily_ops_app.HTML_PAGE
        self.assertNotIn('data-tab="upload"', html)
        self.assertNotIn('id="upload"', html)
        self.assertNotIn("上传数据源</h2>", html)
        self.assertIn('id="weeklySources"', html)
        self.assertIn("weekly-source-card", html)

    def test_uploaded_xls_is_converted_to_xlsx_before_recording(self):
        with TemporaryDirectory() as tmp:
            folder = Path(tmp)
            source = folder / "宝宝.xls"
            source.write_bytes(b"legacy-xls")
            expected = folder / "宝宝.xlsx"

            with patch.object(daily_ops_app, "convert_xls_to_xlsx", return_value=expected) as convert:
                normalized = daily_ops_app.normalize_uploaded_workbook(source)

            self.assertEqual(normalized, expected)
            convert.assert_called_once_with(source, expected)

    def test_uploaded_xlsx_keeps_original_path(self):
        with TemporaryDirectory() as tmp:
            source = Path(tmp) / "宝宝.xlsx"
            source.write_bytes(b"xlsx")
            self.assertEqual(daily_ops_app.normalize_uploaded_workbook(source), source)

    def test_recent_outputs_marks_matching_report(self):
        with TemporaryDirectory() as tmp:
            folder = Path(tmp)
            output = folder / "260609-Shein申报价异常-V1.xlsx"
            output.write_bytes(b"xlsx")

            with patch.object(daily_ops_app, "OUTPUT_DIR", folder):
                files = daily_ops_app.recent_outputs()

            self.assertEqual(files[0]["report"], "shein_price")

    def test_owner_map_adds_di_suffix_alias_for_numbered_store(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "店铺负责人对应表.xlsx"
            wb = daily_ops_app.Workbook()
            ws = wb.active
            ws.append(["店铺", "业务"])
            ws.append(["十二", "胡娟"])
            wb.save(path)

            with patch.object(daily_ops_app, "owner_files", return_value=[path]), \
                 patch.object(daily_ops_app, "load_store_owner_assignments", return_value=[]):
                owners = daily_ops_app.load_owners()

            self.assertEqual(owners["十二"], "胡娟")
            self.assertEqual(owners["十二弟"], "胡娟")
            self.assertEqual(owners["12"], "胡娟")

    def test_shein_owner_defaults_can_be_overridden_by_owner_file(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "店铺负责人对应表.xlsx"
            wb = daily_ops_app.Workbook()
            ws = wb.active
            ws.append(["店铺", "业务"])
            ws.append(["牛牛", "新负责人"])
            wb.save(path)

            with patch.object(daily_ops_app, "owner_files", return_value=[path]), \
                 patch.object(daily_ops_app, "load_store_owner_assignments", return_value=[]):
                owners = daily_ops_app.load_owners()

            merged = {**generate_shein_inventory_abnormal.OWNERS, **owners}
            self.assertEqual(merged["牛牛"], "新负责人")

    def test_size_order_map_converts_rule_list_to_rank_map(self):
        self.assertEqual(daily_ops_app.size_order_map(["XS", "S", "M"]), {"XS": 0, "S": 1, "M": 2})

    def test_shein_active_listing_uses_listing_status_only(self):
        self.assertTrue(daily_ops_app.is_shein_active_listing("正常供货", "已上架"))
        self.assertTrue(daily_ops_app.is_shein_active_listing("停产", "已上架"))
        self.assertFalse(daily_ops_app.is_shein_active_listing("正常供货", "已下架"))
        self.assertFalse(daily_ops_app.is_shein_active_listing("正常供货", ""))

    def test_shein_price_summary_counts_listed_skc_even_when_supply_stopped(self):
        path = ROOT / "shein数据源表" / "加加.xlsx"
        if not path.exists():
            self.skipTest("需要本地 Shein 加加数据源")
        summary = generate_shein_price_abnormal.summarize_source_files([path])
        self.assertEqual(summary["加加"]["active_skc_count"], 100)

    def test_shein_inventory_summary_counts_listed_skc_even_when_supply_stopped(self):
        path = ROOT / "shein数据源表" / "加加.xlsx"
        if not path.exists():
            self.skipTest("需要本地 Shein 加加数据源")
        summary = generate_shein_inventory_abnormal.summarize_source_files([path])
        self.assertNotIn("加加", summary)

    def test_shein_inventory_excludes_purchase_stores(self):
        with TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            shein_dir = tmp_root / "shein数据源表"
            shein_dir.mkdir()
            headers = ["SKC", "商家SKU", "SHEIN仓库存", "近30天销量", "近7天销量", "商品标签", "上架状态"]
            for store, skc, sku in [("琪琪", "skc-q", "SKU-Q-S"), ("加加", "skc-j", "SKU-J-S")]:
                wb = daily_ops_app.Workbook()
                ws = wb.active
                ws.append(headers)
                ws.append([skc, sku, 100, 10, 1, "", "已上架"])
                wb.save(shein_dir / f"{store}.xlsx")

            records = {
                "SKU-Q-S": {"商家编码": "SKU-Q-S", "货品名称": "琪琪商品", "货品规格": "S", "来源": "test"},
                "SKU-J-S": {"商家编码": "SKU-J-S", "货品名称": "加加商品", "货品规格": "S", "来源": "test"},
            }
            with patch.object(generate_shein_inventory_abnormal, "SHEIN_DIR", shein_dir), \
                 patch.object(generate_shein_inventory_abnormal, "SHEIN_FILES", None):
                summary, gt_2x, gt_1x, source_rows, skipped = generate_shein_inventory_abnormal.read_shein(records)

            self.assertEqual(source_rows, 1)
            self.assertEqual(summary["琪琪"]["gt_2x_skc"], {"skc-q"})
            self.assertNotIn("加加", summary)
            self.assertFalse(any(row["店铺"] in {"加加", "宝宝"} for row in gt_2x + gt_1x))


if __name__ == "__main__":
    unittest.main()
