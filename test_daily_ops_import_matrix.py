import unittest

from daily_ops_import_matrix import build_import_matrix


class ImportMatrixTest(unittest.TestCase):
    def test_platform_requirements_and_missing_summary(self):
        assignments = [
            {"platform": "Temu", "store": "七弟", "owner": "小琴", "enabled": True},
            {"platform": "Shein", "store": "琪琪", "owner": "胡娟", "enabled": True},
        ]
        groups = [
            {"key": "erp_base", "name": "ERP 产品数据源", "status": "已有数据"},
            {"key": "temu_platform", "name": "Temu 销售表", "status": "缺少数据"},
            {"key": "temu_hot", "name": "Temu 爆旺款表", "status": "已有数据"},
            {"key": "shein_platform", "name": "Shein 销售表", "status": "待结束上传", "pending_count": 1},
        ]

        matrix = build_import_matrix(assignments, groups)

        self.assertEqual(matrix["summary"]["stores"], 2)
        self.assertEqual(matrix["summary"]["blocked_stores"], 2)
        self.assertEqual(matrix["summary"]["missing_cells"], 1)
        self.assertEqual(matrix["summary"]["pending_cells"], 1)

    def test_owner_only_sees_own_stores(self):
        assignments = [
            {"platform": "Temu", "store": "七弟", "owner": "小琴", "enabled": True},
            {"platform": "Shein", "store": "琪琪", "owner": "胡娟", "enabled": True},
        ]
        groups = [{"key": "erp_base", "name": "ERP 产品数据源", "status": "已有数据"}]

        matrix = build_import_matrix(assignments, groups, role="owner", user="小琴")

        self.assertEqual(matrix["summary"]["stores"], 1)
        self.assertEqual(matrix["rows"][0]["store"], "七弟")


if __name__ == "__main__":
    unittest.main()
