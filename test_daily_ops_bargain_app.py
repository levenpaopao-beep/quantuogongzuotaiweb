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

    def test_lookup_bargain_staging_collapses_platform_fallback_links_to_standard_sizes(self):
        bargain_file = self.root / "bargain_requests.json"
        empty_erp = self.root / "empty_erp.xlsx"
        write_rows(empty_erp, ["货品编码", "货品名称", "商家编码", "规格名称", "成本价", "批发价"], [])
        platform_rows = []
        for size in ["XS", "S", "M", "L", "XL"]:
            for index in range(3):
                platform_rows.append({
                    "平台": "Temu",
                    "店铺": "店铺A",
                    "商家编码": f"330317800-{size}" + ("@1" if index == 1 else ""),
                    "货品名称": "平台棒球衫",
                    "规格名称": f"米色/{size}",
                    "申报价": 14.32 - index,
                    "30天销量": index + 1,
                    "在线链接数": 1,
                })
        platform_rows.append({"平台": "Temu", "店铺": "错误店", "商家编码": "330317800-L33", "申报价": 1, "30天销量": 999})

        with patch.object(daily_ops_app, "BARGAIN_DB_FILE", bargain_file), \
             patch.object(daily_ops_app, "erp_base_files", return_value=[empty_erp]):
            rows = daily_ops_app.lookup_bargain_staging({
                "merchant_code": "330317800-S",
                "store": "一弟",
                "platform": "Temu",
                "owner": "洁琳",
                "platform_rows": platform_rows,
            })

        self.assertEqual([row["商家编码"] for row in rows["rows"]], [
            "330317800-XS", "330317800-S", "330317800-M", "330317800-L", "330317800-XL",
        ])
        self.assertTrue(all(row["在线销售链接数"] == 3 for row in rows["rows"]))
        self.assertTrue(all(row["在售最低申报价"] == 12.32 for row in rows["rows"]))

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

    def test_lookup_bargain_staging_flags_missing_cost_when_goods_archive_has_only_wholesale(self):
        bargain_file = self.root / "bargain_requests.json"
        erp_goods_archive = self.root / "erp_goods_archive.xlsx"
        write_rows(erp_goods_archive, ["货品编码", "货品名称", "商家编码", "规格名称", "成本价", "批发报价", "来源接口"], [
            {"货品编码": "330318390", "货品名称": "么么牛仔衣", "商家编码": "330318390-L", "规格名称": "蓝色/L", "成本价": "", "批发报价": 22, "来源接口": "goods_query.php"},
        ])

        with patch.object(daily_ops_app, "BARGAIN_DB_FILE", bargain_file), \
             patch.object(daily_ops_app, "erp_base_files", return_value=[erp_goods_archive]), \
             patch.object(daily_ops_app, "erp_cost_files", return_value=[]):
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
        self.assertIn("ERP成本缺失", rows["rows"][0]["风险标签"])
        self.assertIn("低于批发价80%", rows["rows"][0]["风险标签"])

    def test_lookup_bargain_staging_supplements_cost_from_inventory_sales_export(self):
        bargain_file = self.root / "bargain_requests.json"
        erp_goods_archive = self.root / "erp_goods_archive.xlsx"
        cost_file = self.root / "erp库存销量_宠物圈仓_20260623.xlsx"
        write_rows(erp_goods_archive, ["货品编码", "货品名称", "商家编码", "规格名称", "批发报价", "来源接口"], [
            {"货品编码": "330317800", "货品名称": "01棒球衫", "商家编码": "330317800-S", "规格名称": "黑/S", "批发报价": 16, "来源接口": "goods_query.php"},
        ])
        write_rows(cost_file, ["商家编码", "成本价", "昨日实际发货量", "近30天净销量"], [
            {"商家编码": "330317800-S", "成本价": 12, "昨日实际发货量": 0, "近30天净销量": 25},
        ])

        with patch.object(daily_ops_app, "BARGAIN_DB_FILE", bargain_file), \
             patch.object(daily_ops_app, "erp_base_files", return_value=[erp_goods_archive]), \
             patch.object(daily_ops_app, "erp_cost_files", return_value=[cost_file]):
            rows = daily_ops_app.lookup_bargain_staging({
                "merchant_code": "330317800-S",
                "store": "四弟",
                "platform": "Temu",
                "owner": "洁琳",
                "platform_rows": [
                    {"平台": "Temu", "店铺": "四弟", "商家编码": "330317800-S", "申报价": 9, "30天销量": 2},
                ],
            })

        self.assertEqual(rows["rows"][0]["成本价"], 12)
        self.assertIn("低于成本", rows["rows"][0]["风险标签"])
        self.assertEqual(rows["rows"][0]["风险等级"], "red")

    def test_lookup_bargain_staging_limits_platform_sales_to_erp_standard_size_codes(self):
        bargain_file = self.root / "bargain_requests.json"
        erp_goods_archive = self.root / "erp_goods_archive.xlsx"
        write_rows(erp_goods_archive, ["货品编码", "货品名称", "商家编码", "规格名称", "批发报价", "来源接口"], [
            {"货品编码": "330318390", "货品名称": "么么牛仔衣", "商家编码": "330318390-XS", "规格名称": "蓝色/XS", "批发报价": 22, "来源接口": "goods_query.php"},
            {"货品编码": "330318390", "货品名称": "么么牛仔衣", "商家编码": "330318390-S", "规格名称": "蓝色/S", "批发报价": 22, "来源接口": "goods_query.php"},
            {"货品编码": "330318390", "货品名称": "么么牛仔衣", "商家编码": "330318390-M", "规格名称": "蓝色/M", "批发报价": 22, "来源接口": "goods_query.php"},
            {"货品编码": "330318390", "货品名称": "么么牛仔衣", "商家编码": "330318390-L", "规格名称": "蓝色/L", "批发报价": 22, "来源接口": "goods_query.php"},
            {"货品编码": "330318390", "货品名称": "么么牛仔衣", "商家编码": "330318390-XL", "规格名称": "蓝色/XL", "批发报价": 22, "来源接口": "goods_query.php"},
        ])

        with patch.object(daily_ops_app, "BARGAIN_DB_FILE", bargain_file), \
             patch.object(daily_ops_app, "erp_base_files", return_value=[erp_goods_archive]):
            rows = daily_ops_app.lookup_bargain_staging({
                "merchant_code": "330318390-L",
                "store": "二弟",
                "platform": "Temu",
                "owner": "洁琳",
                "platform_rows": [
                    {"平台": "Temu", "店铺": "正确店", "商家编码": "330318390-L", "申报价": 16.62, "30天销量": 2},
                    {"平台": "Temu", "店铺": "同码后缀店", "商家编码": "330318390-L@1", "申报价": 15.00, "30天销量": 8},
                    {"平台": "Temu", "店铺": "错误前缀店", "商家编码": "330318390-L33", "申报价": 1.00, "30天销量": 999},
                ],
            })

        self.assertEqual([row["尺码"] for row in rows["rows"]], ["XS", "S", "M", "L", "XL"])
        self.assertTrue(all(row["货品名称"] == "么么牛仔衣" for row in rows["rows"]))
        self.assertEqual(rows["rows"][0]["卖得最好的店铺"], "同码后缀店")
        self.assertEqual(next(row for row in rows["rows"] if row["尺码"] == "L")["在售最低申报价"], 15.00)

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

    def test_bargain_submit_recomputes_risk_from_submitted_price(self):
        bargain_file = self.root / "bargain_requests.json"
        with patch.object(daily_ops_app, "BARGAIN_DB_FILE", bargain_file):
            batch = daily_ops_app.submit_bargain_batch({
                "store": "四弟",
                "platform": "Temu",
                "owner": "洁琳",
                "lines": [
                    {"货品编码": "330317800", "货品名称": "01棒球衫", "商家编码": "330317800-S", "尺码": "S", "本次议价": 9, "成本价": 12, "批发价": 16, "风险等级": "green", "风险标签": ""},
                ],
            })

        self.assertEqual(batch["lines"][0]["风险等级"], "red")
        self.assertIn("低于成本", batch["lines"][0]["风险标签"])
        self.assertIn("低于批发价80%", batch["lines"][0]["风险标签"])

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
