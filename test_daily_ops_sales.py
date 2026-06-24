import tempfile
import unittest
from pathlib import Path

from openpyxl import load_workbook

from daily_ops_sales import DailySalesStore, sales_number


class DailySalesStoreTest(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.path = Path(self.tmpdir.name) / "daily_sales.json"
        self.store = DailySalesStore(self.path)
        self.assignments = [{"platform": "Temu", "store": "七弟", "owner": "小琴"}]

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_sales_number_rejects_fractional_values(self):
        self.assertEqual(sales_number("12"), 12)
        self.assertEqual(sales_number("12.0"), 12)
        with self.assertRaisesRegex(ValueError, "必须是整数"):
            sales_number("12.8")

    def test_submit_and_update_sales(self):
        first = self.store.submit(self.assignments, role="owner", user="小琴", day="2026-06-23", platform="Temu", store="七弟", sales="12")
        second = self.store.submit(self.assignments, role="owner", user="小琴", day="2026-06-23", platform="Temu", store="七弟", sales="15", remark="后台复核")

        self.assertEqual(first["sales"], 12)
        self.assertEqual(second["sales"], 15)
        self.assertEqual(len(second["history"]), 2)

        payload = self.store.daily_payload(self.assignments, role="owner", user="小琴", day="2026-06-23")
        self.assertEqual(payload["summary"]["required"], 1)
        self.assertEqual(payload["summary"]["submitted"], 1)
        self.assertEqual(payload["summary"]["total_sales"], 15)

    def test_owner_can_only_submit_own_store(self):
        with self.assertRaises(PermissionError):
            self.store.submit(self.assignments, role="owner", user="别人", day="2026-06-23", platform="Temu", store="七弟", sales="12")

    def test_owner_recent_records_are_limited_to_own_store(self):
        assignments = [
            {"platform": "Temu", "store": "七弟", "owner": "小琴"},
            {"platform": "Shein", "store": "琪琪", "owner": "胡娟"},
        ]
        self.store.submit(assignments, role="admin", user="管理员", day="2026-06-22", platform="Temu", store="七弟", sales="12")
        self.store.submit(assignments, role="admin", user="管理员", day="2026-06-22", platform="Shein", store="琪琪", sales="88")

        owner_payload = self.store.daily_payload(assignments, role="owner", user="小琴", day="2026-06-22")
        admin_payload = self.store.daily_payload(assignments, role="admin", user="管理员", day="2026-06-22")

        self.assertEqual([row["store"] for row in owner_payload["records"]], ["七弟"])
        self.assertEqual({row["store"] for row in admin_payload["records"]}, {"七弟", "琪琪"})

    def test_disabled_or_not_required_stores_are_not_daily_entries(self):
        assignments = [
            {"platform": "Temu", "store": "七弟", "owner": "小琴", "enabled": True, "daily_required": True},
            {"platform": "Shein", "store": "琪琪", "owner": "小琴", "enabled": False, "daily_required": True},
            {"platform": "Ozon", "store": "店铺 A", "owner": "小琴", "enabled": True, "daily_required": False},
        ]

        payload = self.store.daily_payload(assignments, role="owner", user="小琴", day="2026-06-23")

        self.assertEqual(payload["summary"]["required"], 1)
        self.assertEqual(payload["entries"][0]["store"], "七弟")

    def test_abnormal_hint_uses_recent_sales(self):
        self.store.submit(self.assignments, role="admin", user="管理员", day="2026-06-22", platform="Temu", store="七弟", sales="100")
        row = self.store.submit(self.assignments, role="admin", user="管理员", day="2026-06-23", platform="Temu", store="七弟", sales="10")
        self.assertIn("波动超过 50%", row["abnormal"])

    def test_export_daily_workbook(self):
        self.store.submit(self.assignments, role="admin", user="管理员", day="2026-06-23", platform="Temu", store="七弟", sales="12")

        result = self.store.export_daily_workbook(self.assignments, Path(self.tmpdir.name), role="admin", user="管理员", day="2026-06-23")

        workbook = load_workbook(result["path"], data_only=True)
        self.assertIn("每日销量明细", workbook.sheetnames)
        self.assertIn("平台汇总", workbook.sheetnames)
        self.assertEqual(workbook["每日销量明细"]["A2"].value, "2026-06-23")
        self.assertEqual(workbook["每日销量明细"]["E2"].value, 12)


if __name__ == "__main__":
    unittest.main()
