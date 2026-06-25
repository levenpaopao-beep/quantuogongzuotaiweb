import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from openpyxl import Workbook

import daily_ops_app


def write_rows(path, headers, rows):
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append([row.get(header, "") for header in headers])
    wb.save(path)
    wb.close()


class DailyOpsBargainAppTest(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tmpdir.name)
        self.erp_file = self.root / "erp商品基础信息.xlsx"
        write_rows(self.erp_file, [
            "货品编码", "货品名称", "商家编码", "规格名称", "货品分类", "成本价", "批发价"
        ], [
            {"货品编码": "330318682", "货品名称": "M拉链外套", "商家编码": "330318682-XS", "规格名称": "咖白/XS", "货品分类": "衣服/清仓款衣服/8元", "成本价": 11.2, "批发价": 15},
            {"货品编码": "330318682", "货品名称": "M拉链外套", "商家编码": "330318682-S", "规格名称": "咖白/S", "货品分类": "衣服/清仓款衣服/8元", "成本价": 11.2, "批发价": 15},
        ])

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_rebuild_clearance_and_lookup_bargain_staging_rows(self):
        bargain_file = self.root / "bargain_requests.json"
        clearance_file = self.root / "clearance_catalog.json"
        with patch.object(daily_ops_app, "BARGAIN_DB_FILE", bargain_file), \
             patch.object(daily_ops_app, "CLEARANCE_CATALOG_FILE", clearance_file), \
             patch.object(daily_ops_app, "erp_base_files", return_value=[self.erp_file]):
            catalog = daily_ops_app.rebuild_clearance_catalog()
            rows = daily_ops_app.lookup_bargain_staging({
                "merchant_code": "330318682-XS",
                "store": "一弟",
                "platform": "Temu",
                "owner": "小琴",
                "platform_rows": [{"平台": "Temu", "店铺": "一弟", "商家编码": "330318682-XS", "申报价": 8, "30天销量": 2}],
            })

        self.assertEqual(catalog["summary"]["goods_count"], 1)
        self.assertEqual(len(rows["rows"]), 2)
        self.assertEqual(rows["rows"][0]["货品名称"], "M拉链外套")
        self.assertTrue(rows["rows"][0]["清仓款"])

    def test_submit_and_review_bargain_batch(self):
        bargain_file = self.root / "bargain_requests.json"
        with patch.object(daily_ops_app, "BARGAIN_DB_FILE", bargain_file):
            batch = daily_ops_app.submit_bargain_batch({
                "store": "一弟",
                "platform": "Temu",
                "owner": "小琴",
                "lines": [{"货品编码": "330318682", "商家编码": "330318682-XS", "本次议价": 8}],
            })
            result = daily_ops_app.review_bargain_lines({
                "batch_id": batch["id"],
                "line_ids": [batch["lines"][0]["id"]],
                "decision": "通过",
                "admin": "管理员",
                "remark": "清仓通过",
            })
            history = daily_ops_app.bargain_history({"merchant_code": "330318682-XS"})

        self.assertEqual(result["count"], 1)
        self.assertEqual(history["rows"][0]["status"], "已通过")
        self.assertEqual(history["rows"][0]["review_remark"], "清仓通过")


if __name__ == "__main__":
    unittest.main()
