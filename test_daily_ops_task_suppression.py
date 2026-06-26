import tempfile
import json
import unittest
from pathlib import Path
from unittest.mock import patch

import daily_ops_app
from daily_ops_task_suppression import TaskSuppressionStore


class TaskSuppressionStoreTest(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.store = TaskSuppressionStore(Path(self.tmpdir.name) / "suppressions.json")
        self.row = {
            "platform": "Temu",
            "store": "七弟",
            "task_type": "爆旺冲突",
            "merchant_code": "A001",
            "skc": "SKC1",
            "spu": "SPU1",
            "system_action": "下架重复款",
            "product_name": "测试商品",
        }

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_filter_rows_skips_active_suppression(self):
        self.store.add_from_rows([self.row], actor="管理员", reason="重复提醒")

        kept, skipped = self.store.filter_rows([dict(self.row), {**self.row, "skc": "SKC2"}])

        self.assertEqual(len(kept), 1)
        self.assertEqual(len(skipped), 1)
        self.assertEqual(skipped[0]["skc"], "SKC1")

    def test_list_task_suppressions_adds_owner_from_store_mapping(self):
        with tempfile.TemporaryDirectory() as tmp:
            suppression_file = Path(tmp) / "suppressions.json"
            owner_file = Path(tmp) / "store_owner_map.json"
            TaskSuppressionStore(suppression_file).add_from_rows([self.row], actor="管理员", reason="重复提醒")
            owner_file.write_text(json.dumps({
                "assignments": [
                    {"platform": "Temu", "store": "七弟", "owner": "小王", "enabled": True},
                ]
            }, ensure_ascii=False), encoding="utf-8")

            with patch.object(daily_ops_app, "TASK_SUPPRESSION_FILE", suppression_file), \
                    patch.object(daily_ops_app, "STORE_OWNER_MAP_FILE", owner_file):
                result = daily_ops_app.list_task_suppressions()

        self.assertEqual(result["items"][0]["store"], "七弟")
        self.assertEqual(result["items"][0]["owner"], "小王")


if __name__ == "__main__":
    unittest.main()
