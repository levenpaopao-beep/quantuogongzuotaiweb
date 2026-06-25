import json
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

    def test_lookup_bargain_staging_keeps_platform_row_when_erp_cost_is_missing(self):
        bargain_file = self.root / "bargain_requests.json"
        empty_erp = self.root / "empty_erp.xlsx"
        write_rows(empty_erp, ["货品编码", "货品名称", "商家编码", "规格名称", "成本价", "批发价"], [])
        with patch.object(daily_ops_app, "BARGAIN_DB_FILE", bargain_file), \
             patch.object(daily_ops_app, "erp_base_files", return_value=[empty_erp]):
            rows = daily_ops_app.lookup_bargain_staging({
                "merchant_code": "330318390-L",
                "store": "二弟",
                "platform": "Temu",
                "owner": "洁琳",
                "platform_rows": [
                    {"平台": "Temu", "店铺": "二弟", "商家编码": "330318390-L", "货品名称": "平台商品", "规格名称": "黑/L", "申报价": 9.9, "30天销量": 45, "平台库存": 12},
                ],
            })

        self.assertEqual(len(rows["rows"]), 1)
        self.assertEqual(rows["rows"][0]["商家编码"], "330318390-L")
        self.assertEqual(rows["rows"][0]["货品名称"], "平台商品")
        self.assertEqual(rows["rows"][0]["成本价"], "")
        self.assertEqual(rows["rows"][0]["批发价"], "")
        self.assertEqual(rows["rows"][0]["风险等级"], "review")
        self.assertIn("ERP成本缺失", rows["rows"][0]["风险标签"])

    def test_lookup_bargain_staging_reads_imported_platform_source_without_payload_rows(self):
        bargain_file = self.root / "bargain_requests.json"
        manifest = self.root / "data_source_manifest.json"
        empty_erp = self.root / "empty_erp.xlsx"
        temu_file = self.root / "temu_sales.xlsx"
        write_rows(empty_erp, ["货品编码", "货品名称", "商家编码", "规格名称", "成本价", "批发价"], [])
        write_rows(temu_file, ["平台", "店铺", "商家编码", "货品名称", "规格名称", "申报价", "7天销量", "30天销量", "平台库存"], [
            {"平台": "Temu", "店铺": "二弟", "商家编码": "330318390-L", "货品名称": "自动源商品", "规格名称": "黑/L", "申报价": 9.9, "7天销量": 12, "30天销量": 45, "平台库存": 8},
        ])
        manifest.write_text(json.dumps({
            "categories": {
                "temu_platform": {"paths": [str(temu_file)], "path": str(temu_file), "uploaded_at": "2026-06-25 12:00:00"}
            }
        }, ensure_ascii=False), encoding="utf-8")

        with patch.object(daily_ops_app, "BARGAIN_DB_FILE", bargain_file), \
             patch.object(daily_ops_app, "DATA_SOURCE_MANIFEST", manifest), \
             patch.object(daily_ops_app, "erp_base_files", return_value=[empty_erp]):
            rows = daily_ops_app.lookup_bargain_staging({
                "merchant_code": "330318390-L",
                "store": "二弟",
                "platform": "Temu",
                "owner": "洁琳",
            })

        self.assertEqual(len(rows["rows"]), 1)
        self.assertEqual(rows["rows"][0]["货品名称"], "自动源商品")
        self.assertEqual(rows["rows"][0]["Temu 30天最高销量"], 45)

    def test_lookup_bargain_staging_does_not_flag_missing_cost_when_goods_archive_has_wholesale(self):
        bargain_file = self.root / "bargain_requests.json"
        erp_goods_archive = self.root / "erp_goods_archive.xlsx"
        write_rows(erp_goods_archive, ["货品编码", "货品名称", "商家编码", "规格名称", "成本价", "批发报价", "来源接口"], [
            {"货品编码": "330318390", "货品名称": "么么牛仔衣", "商家编码": "330318390-L", "规格名称": "蓝色/L", "成本价": "", "批发报价": 22, "来源接口": "goods_query.php"},
        ])

        with patch.object(daily_ops_app, "BARGAIN_DB_FILE", bargain_file), \
             patch.object(daily_ops_app, "erp_base_files", return_value=[erp_goods_archive]):
            rows = daily_ops_app.lookup_bargain_staging({
                "merchant_code": "330318390-L",
                "store": "二弟",
                "platform": "Temu",
                "owner": "洁琳",
                "platform_rows": [
                    {"平台": "Temu", "店铺": "二弟", "商家编码": "330318390-L", "申报价": 16.62, "30天销量": 2},
                ],
            })

        self.assertEqual(rows["rows"][0]["批发价"], 22)
        self.assertEqual(rows["rows"][0]["风险标签"], "")

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

    def test_bargain_submit_requires_price_for_every_size(self):
        bargain_file = self.root / "bargain_requests.json"
        with patch.object(daily_ops_app, "BARGAIN_DB_FILE", bargain_file):
            with self.assertRaisesRegex(ValueError, "每个尺码都必须填写本次议价"):
                daily_ops_app.submit_bargain_batch({
                    "store": "一弟",
                    "platform": "Temu",
                    "owner": "小琴",
                    "lines": [
                        {"货品编码": "330318682", "商家编码": "330318682-XS", "本次议价": 8},
                        {"货品编码": "330318682", "商家编码": "330318682-S", "本次议价": ""},
                    ],
                })

    def test_bargain_reject_requires_review_remark(self):
        bargain_file = self.root / "bargain_requests.json"
        with patch.object(daily_ops_app, "BARGAIN_DB_FILE", bargain_file):
            batch = daily_ops_app.submit_bargain_batch({
                "store": "一弟",
                "platform": "Temu",
                "owner": "小琴",
                "lines": [{"货品编码": "330318682", "商家编码": "330318682-XS", "本次议价": 8}],
            })
            with self.assertRaisesRegex(ValueError, "拒绝议价必须填写原因"):
                daily_ops_app.review_bargain_lines({
                    "batch_id": batch["id"],
                    "line_ids": [batch["lines"][0]["id"]],
                    "decision": "不通过",
                    "admin": "管理员",
                    "remark": "",
                })


if __name__ == "__main__":
    unittest.main()
