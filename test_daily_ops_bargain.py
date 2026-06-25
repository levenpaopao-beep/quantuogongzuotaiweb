import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

import daily_ops_bargain as bargain


def write_rows(path, headers, rows):
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append([row.get(header, "") for header in headers])
    wb.save(path)
    wb.close()


class BargainWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tmpdir.name)
        self.erp_file = self.root / "erp商品基础信息.xlsx"
        write_rows(self.erp_file, [
            "货品编码", "货品名称", "商家编码", "规格名称", "货品分类", "成本价", "批发价"
        ], [
            {"货品编码": "330318682", "货品名称": "M拉链外套", "商家编码": "330318682-XS", "规格名称": "咖白/XS", "货品分类": "衣服/清仓款衣服/8元", "成本价": 11.2, "批发价": 15},
            {"货品编码": "330318682", "货品名称": "M拉链外套", "商家编码": "330318682-S", "规格名称": "咖白/S", "货品分类": "衣服/清仓款衣服/8元", "成本价": 11.2, "批发价": 15},
            {"货品编码": "330319001", "货品名称": "正常外套", "商家编码": "330319001-XS", "规格名称": "红色/XS", "货品分类": "衣服/外套马甲", "成本价": 9.6, "批发价": 18},
        ])

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_clearance_catalog_matches_whole_product_by_goods_code(self):
        catalog = bargain.build_clearance_catalog([self.erp_file])

        self.assertEqual(catalog["summary"]["goods_count"], 1)
        self.assertEqual(catalog["summary"]["sku_count"], 2)
        self.assertTrue(bargain.is_clearance_goods(catalog, "330318682"))
        self.assertTrue(bargain.is_clearance_merchant(catalog, "330318682-S"))
        self.assertFalse(bargain.is_clearance_goods(catalog, "330319001"))

    def test_lookup_staging_rows_expands_one_merchant_code_to_all_sizes(self):
        store = bargain.BargainStore(self.root / "bargain_requests.json")
        catalog = bargain.build_clearance_catalog([self.erp_file])

        rows = store.lookup_staging_rows(
            merchant_code="330318682-XS",
            request_store="一弟",
            platform="Temu",
            owner="小琴",
            erp_files=[self.erp_file],
            clearance_catalog=catalog,
            platform_rows=[
                {"平台": "Temu", "店铺": "一弟", "商家编码": "330318682-XS", "申报价": 8, "30天销量": 10, "在线链接数": 1},
                {"平台": "Temu", "店铺": "二弟", "商家编码": "330318682-S", "申报价": 9, "30天销量": 30, "在线链接数": 2},
            ],
        )

        self.assertEqual([row["商家编码"] for row in rows], ["330318682-XS", "330318682-S"])
        self.assertTrue(all(row["货品编码"] == "330318682" for row in rows))
        self.assertTrue(all(row["议价申请店铺"] == "一弟" for row in rows))
        self.assertTrue(all(row["卖得最好的店铺"] == "二弟" for row in rows))
        self.assertTrue(all(row["清仓款"] for row in rows))
        self.assertEqual(rows[0]["风险等级"], "orange")

    def test_submit_review_reject_and_resubmit_keep_history_versions(self):
        store = bargain.BargainStore(self.root / "bargain_requests.json")
        batch = store.submit_batch("一弟", "Temu", "小琴", [
            {"货品编码": "330319001", "货品名称": "正常外套", "商家编码": "330319001-XS", "尺码": "XS", "本次议价": 8, "成本价": 9.6, "清仓款": False},
            {"货品编码": "330318682", "货品名称": "M拉链外套", "商家编码": "330318682-XS", "尺码": "XS", "本次议价": 8, "成本价": 11.2, "清仓款": True},
        ])

        result = store.review_lines(batch["id"], [batch["lines"][0]["id"]], "不通过", "管理员", "低于成本")
        self.assertEqual(result["count"], 1)
        result = store.review_lines(batch["id"], [batch["lines"][1]["id"]], "通过", "管理员", "清仓通过")
        self.assertEqual(result["count"], 1)

        rejected = store.rework_lines("小琴")
        self.assertEqual(len(rejected), 1)
        new_batch = store.resubmit_line(batch["lines"][0]["id"], 10, "小琴")
        self.assertEqual(new_batch["lines"][0]["version"], 2)
        history = store.history({"merchant_code": "330319001-XS"})
        self.assertEqual([row["version"] for row in history], [1, 2])

    def test_low_price_trace_uses_single_merchant_ignore_floor(self):
        store = bargain.BargainStore(self.root / "bargain_requests.json")
        store.submit_batch("一弟", "Temu", "小琴", [
            {"货品编码": "330319001", "货品名称": "正常外套", "商家编码": "330319001-XS", "本次议价": 8.9},
        ])
        batch = store.list_batches()[0]
        store.review_lines(batch["id"], [batch["lines"][0]["id"]], "通过", "管理员", "")

        risks = store.low_price_trace([
            {"平台": "Temu", "店铺": "一弟", "商家编码": "330319001-XS", "申报价": 8.8},
        ], tolerance=0.05)
        self.assertEqual(len(risks), 1)
        store.ignore_low_price([risks[0]["id"]], "管理员", "上线前历史低价")

        self.assertEqual(store.low_price_trace([
            {"平台": "Temu", "店铺": "一弟", "商家编码": "330319001-XS", "申报价": 8.8},
        ], tolerance=0.05), [])
        self.assertEqual(len(store.low_price_trace([
            {"平台": "Temu", "店铺": "一弟", "商家编码": "330319001-XS", "申报价": 8.7},
        ], tolerance=0.05)), 1)


if __name__ == "__main__":
    unittest.main()
