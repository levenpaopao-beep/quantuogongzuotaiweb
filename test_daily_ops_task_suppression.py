import tempfile
import unittest
from pathlib import Path

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


if __name__ == "__main__":
    unittest.main()
