import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from openpyxl import Workbook

import daily_ops_app
import daily_ops_desktop_adapter
import daily_ops_master_data as master_data
from daily_ops_sales import DailySalesStore


class MasterDataImportTest(unittest.TestCase):
    def build_owner_workbook(self, path):
        wb = Workbook()
        ws = wb.active
        ws.title = "temu"
        ws.append(["店铺", "主账号", "店名", "业务", "仓库", "仓库密码", "上架", "上架账号", "上架密码", "备注", "平台"])
        ws.append(["一弟", "15805182150", "Apetcircle", "小琴", "", "", "小琴", "", "", "", "temu"])
        ws.append(["二弟", "13003246055", "Fur Fit", "洁琳", "", "", "陆宝宝", "", "", "", "temu"])
        ws.append(["三弟", "13585986099", "Beautiful", "小琴", "", "", "小琴", "", "", "", "temu"])
        wb.save(path)

    def build_sales_workbook(self, path):
        wb = Workbook()
        ws = wb.active
        ws.title = "总览"
        ws.append(["跳过"])
        month = wb.create_sheet("2606")
        month.append(["2026年", "汇总", "一弟", "二弟", "琪琪"])
        month.append([46174, 300, 100, 120, 80])
        month.append([46175, 330, 110, 130, 90])
        wb.save(path)

    def test_parse_owner_workbook_extracts_assignments_and_accounts(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "店铺负责人对应表.xlsx"
            self.build_owner_workbook(path)

            parsed = master_data.parse_owner_workbook(path)

        self.assertEqual(len(parsed["assignments"]), 3)
        self.assertEqual(parsed["assignments"][0]["platform"], "Temu")
        self.assertEqual(parsed["assignments"][0]["store"], "一弟")
        self.assertEqual(parsed["assignments"][0]["store_name"], "Apetcircle")
        self.assertEqual(parsed["assignments"][0]["owner"], "小琴")
        self.assertEqual([account["owner"] for account in parsed["accounts"]], ["小琴", "洁琳"])

    def test_save_operator_accounts_hashes_password_and_returns_initial_password_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "operator_accounts.json"

            result = master_data.save_operator_accounts(
                path,
                [{"owner": "小琴", "username": "小琴"}, {"owner": "洁琳", "username": "洁琳"}],
                password_factory=lambda account: f"{account['username']}123456",
            )

            payload = json.loads(path.read_text(encoding="utf-8"))

        self.assertEqual(len(result["accounts"]), 2)
        self.assertEqual(result["initial_passwords"]["小琴"], "小琴123456")
        self.assertNotIn("小琴123456", json.dumps(payload, ensure_ascii=False))
        self.assertEqual(payload["accounts"][0]["username"], "小琴")
        self.assertTrue(payload["accounts"][0]["password_hash"])

    def test_parse_crossborder_sales_workbook_normalizes_month_sheets(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "跨境运营总表new.xlsx"
            self.build_sales_workbook(path)
            assignments = [
                {"platform": "Temu", "store": "一弟", "owner": "小琴"},
                {"platform": "Temu", "store": "二弟", "owner": "洁琳"},
                {"platform": "Shein", "store": "琪琪", "owner": "胡娟"},
            ]

            rows = master_data.parse_crossborder_sales_workbook(path, assignments)

        self.assertEqual(len(rows), 6)
        self.assertEqual(rows[0]["date"], "2026-06-01")
        self.assertEqual(rows[0]["platform"], "Temu")
        self.assertEqual(rows[0]["store"], "一弟")
        self.assertEqual(rows[0]["sales"], 100)
        self.assertEqual(rows[2]["platform"], "Shein")
        self.assertEqual(rows[2]["store"], "琪琪")

    def test_import_history_sales_does_not_overwrite_manual_records(self):
        with tempfile.TemporaryDirectory() as tmp:
            sales_path = Path(tmp) / "daily_sales.json"
            store = DailySalesStore(sales_path)
            assignments = [{"platform": "Temu", "store": "一弟", "owner": "小琴"}]
            store.submit(assignments, role="admin", user="管理员", day="2026-06-01", platform="Temu", store="一弟", sales="999")

            result = master_data.import_history_sales_records(
                sales_path,
                [{"date": "2026-06-01", "platform": "Temu", "store": "一弟", "owner": "小琴", "sales": 100, "source_file": "源.xlsx", "source_sheet": "2606"}],
                actor="管理员",
            )
            payload = DailySalesStore(sales_path).load()

        self.assertEqual(result["created"], 0)
        self.assertEqual(result["skipped_existing"], 1)
        self.assertEqual(payload["records"][0]["sales"], 999)

    def test_query_sales_report_filters_and_summarizes(self):
        with tempfile.TemporaryDirectory() as tmp:
            sales_path = Path(tmp) / "daily_sales.json"
            master_data.import_history_sales_records(
                sales_path,
                [
                    {"date": "2026-06-01", "platform": "Temu", "store": "一弟", "owner": "小琴", "sales": 100},
                    {"date": "2026-06-02", "platform": "Temu", "store": "一弟", "owner": "小琴", "sales": 120},
                    {"date": "2026-06-01", "platform": "Shein", "store": "琪琪", "owner": "胡娟", "sales": 80},
                ],
                actor="管理员",
            )

            report = master_data.query_sales_report(sales_path, platform="Temu", store="一弟", date_from="2026-06-01", date_to="2026-06-30")

        self.assertEqual(report["summary"]["total_sales"], 220)
        self.assertEqual(report["summary"]["record_count"], 2)
        self.assertEqual(report["summary"]["daily_average"], 110)
        self.assertEqual(report["by_platform"][0]["platform"], "Temu")
        self.assertEqual(report["by_store"][0]["store"], "一弟")

    def test_query_sales_report_allowed_pairs_limits_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            sales_path = Path(tmp) / "daily_sales.json"
            master_data.import_history_sales_records(
                sales_path,
                [
                    {"date": "2026-06-01", "platform": "Temu", "store": "一弟", "owner": "小琴", "sales": 100},
                    {"date": "2026-06-01", "platform": "Temu", "store": "二弟", "owner": "洁琳", "sales": 120},
                    {"date": "2026-06-01", "platform": "Shein", "store": "琪琪", "owner": "胡娟", "sales": 80},
                ],
                actor="管理员",
            )

            report = master_data.query_sales_report(
                sales_path,
                date_from="2026-06-01",
                date_to="2026-06-30",
                allowed_pairs={("Temu", "一弟"), ("Shein", "琪琪")},
            )

        self.assertEqual(report["summary"]["total_sales"], 180)
        self.assertEqual({row["store"] for row in report["rows"]}, {"一弟", "琪琪"})
        self.assertNotIn("二弟", {row["store"] for row in report["rows"]})

    def test_owner_sales_report_payload_without_store_is_scoped_to_owned_stores(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sales_path = root / "daily_sales.json"
            owner_map = root / "store_owner_map.json"
            owner_map.write_text(json.dumps({
                "assignments": [
                    {"platform": "Temu", "store": "一弟", "owner": "小琴", "enabled": True, "daily_required": True},
                    {"platform": "Temu", "store": "二弟", "owner": "洁琳", "enabled": True, "daily_required": True},
                    {"platform": "Shein", "store": "琪琪", "owner": "小琴", "enabled": True, "daily_required": True},
                ],
            }, ensure_ascii=False), encoding="utf-8")
            master_data.import_history_sales_records(
                sales_path,
                [
                    {"date": "2026-06-01", "platform": "Temu", "store": "一弟", "owner": "小琴", "sales": 100},
                    {"date": "2026-06-01", "platform": "Temu", "store": "二弟", "owner": "洁琳", "sales": 120},
                    {"date": "2026-06-01", "platform": "Shein", "store": "琪琪", "owner": "小琴", "sales": 80},
                ],
                actor="管理员",
            )

            with patch.object(daily_ops_app, "DAILY_SALES_FILE", sales_path), \
                 patch.object(daily_ops_app, "STORE_OWNER_MAP_FILE", owner_map):
                report = daily_ops_desktop_adapter.sales_report_payload({
                    "role": "owner",
                    "user": "小琴",
                    "date_from": "2026-06-01",
                    "date_to": "2026-06-30",
                })

        self.assertEqual(report["summary"]["total_sales"], 180)
        self.assertEqual({row["store"] for row in report["rows"]}, {"一弟", "琪琪"})
        self.assertNotIn("二弟", {row["store"] for row in report["rows"]})

    def test_owner_sales_report_payload_rejects_other_owner_store(self):
        with tempfile.TemporaryDirectory() as tmp:
            owner_map = Path(tmp) / "store_owner_map.json"
            owner_map.write_text(json.dumps({
                "assignments": [
                    {"platform": "Temu", "store": "一弟", "owner": "小琴", "enabled": True, "daily_required": True},
                    {"platform": "Temu", "store": "二弟", "owner": "洁琳", "enabled": True, "daily_required": True},
                ],
            }, ensure_ascii=False), encoding="utf-8")

            with patch.object(daily_ops_app, "STORE_OWNER_MAP_FILE", owner_map):
                with self.assertRaisesRegex(PermissionError, "店长只能查询自己负责店铺"):
                    daily_ops_desktop_adapter.sales_report_payload({
                        "role": "owner",
                        "user": "小琴",
                        "platform": "Temu",
                        "store": "二弟",
                    })


if __name__ == "__main__":
    unittest.main()
