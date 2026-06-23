import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import daily_ops_app


class StoreOwnerAssignmentTest(unittest.TestCase):
    def test_saving_duplicate_store_on_same_platform_deduplicates(self):
        with tempfile.TemporaryDirectory() as tmp:
            owner_map = Path(tmp) / "store_owner_map.json"
            with patch.object(daily_ops_app, "STORE_OWNER_MAP_FILE", owner_map):
                rows = daily_ops_app.save_store_owner_assignments([
                    {"platform": "Temu", "store": "七弟", "owner": "小琴"},
                    {"platform": "Temu", "store": "七弟", "owner": "小琴"},
                ])

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["platform"], "Temu")
        self.assertEqual(rows[0]["store"], "七弟")

    def test_saving_same_store_on_different_platforms_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            owner_map = Path(tmp) / "store_owner_map.json"
            with patch.object(daily_ops_app, "STORE_OWNER_MAP_FILE", owner_map):
                with self.assertRaisesRegex(ValueError, "不能同时归属"):
                    daily_ops_app.save_store_owner_assignments([
                        {"platform": "Temu", "store": "七弟", "owner": "小琴"},
                        {"platform": "Shein", "store": "七弟", "owner": "洁琳"},
                    ])

            self.assertFalse(owner_map.exists())

    def test_saving_store_without_platform_is_ignored(self):
        with tempfile.TemporaryDirectory() as tmp:
            owner_map = Path(tmp) / "store_owner_map.json"
            with patch.object(daily_ops_app, "STORE_OWNER_MAP_FILE", owner_map):
                rows = daily_ops_app.save_store_owner_assignments([
                    {"platform": "", "store": "七弟", "owner": "小琴"},
                    {"platform": "TK", "store": "海外店", "owner": "小琴"},
                ])

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["platform"], "TK")
        self.assertEqual(rows[0]["store"], "海外店")

    def test_saving_custom_platform_is_allowed(self):
        with tempfile.TemporaryDirectory() as tmp:
            owner_map = Path(tmp) / "store_owner_map.json"
            with patch.object(daily_ops_app, "STORE_OWNER_MAP_FILE", owner_map):
                rows = daily_ops_app.save_store_owner_assignments([
                    {"platform": "Amazon", "store": "北美店", "owner": "小琴"},
                ])

        self.assertEqual(rows[0]["platform"], "Amazon")
        self.assertEqual(rows[0]["store"], "北美店")


if __name__ == "__main__":
    unittest.main()
