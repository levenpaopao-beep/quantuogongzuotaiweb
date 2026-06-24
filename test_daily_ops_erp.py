import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from openpyxl import load_workbook

import daily_ops_erp


class ErpSyncTest(unittest.TestCase):
    def test_wangdian_sign_matches_official_example(self):
        params = {
            "appkey": "test2-xx",
            "page_no": "0",
            "end_time": "2016-08-01 13:00:00",
            "start_time": "2016-08-01 12:00:00",
            "page_size": "40",
            "sid": "test2",
            "timestamp": "1470042310",
        }
        self.assertEqual(daily_ops_erp.wangdian_sign(params, "12345"), "ad4e6fe037ea6e3ba4768317be9d1309")

    def test_missing_credentials_blocks_sync_without_creating_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = daily_ops_erp.manual_sync({"base_url": "https://api.wangdian.cn/openapi2"}, Path(tmp))
            self.assertEqual(result["status"], "blocked")
            self.assertEqual(list(Path(tmp).glob("*.xlsx")), [])

    def test_product_rows_map_to_existing_erp_headers(self):
        rows = daily_ops_erp.normalize_product_rows([{
            "shop_no": "PETCIRCLE",
            "shop_name": "宠物圈仓库",
            "goods_no": "SKU",
            "goods_name": "猫抓板",
            "cost_price": "8.5",
            "wholesale_price": "12.8",
            "spec_list": [{
                "spec_no": "SKU-XL",
                "spec_name": "XL",
                "stock_num": 12,
            }],
        }])
        self.assertEqual(rows[0]["商家编码（新）"], "SKU-XL")
        self.assertEqual(rows[0]["货品名称"], "猫抓板")
        self.assertEqual(rows[0]["规格名称"], "XL")
        self.assertEqual(rows[0]["成本价"], "8.5")
        self.assertEqual(rows[0]["批发价"], "12.8")

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "erp产品基础信息表_接口同步_test.xlsx"
            daily_ops_erp._write_rows(path, ["商家编码（新）", "货品名称", "规格名称", "成本价", "批发价"], rows)
            wb = load_workbook(path)
            ws = wb.active
            self.assertEqual(ws.cell(2, 1).value, "SKU-XL")
            self.assertEqual(ws.cell(2, 4).value, "8.5")
            wb.close()

    def test_stock_rows_keep_warehouse_and_unified_merchant_code(self):
        rows = daily_ops_erp.normalize_stock_rows([{
            "shop_no": "PETCIRCLE",
            "shop_name": "宠物圈",
            "warehouse_no": "CW001",
            "warehouse_name": "宠物圈仓库",
            "spec_no": "SKU-XL",
            "goods_name": "猫抓板",
            "spec_name": "XL",
            "stock_num": 12,
        }])

        self.assertEqual(rows[0]["仓库编号"], "CW001")
        self.assertEqual(rows[0]["仓库"], "宠物圈仓库")
        self.assertEqual(rows[0]["商家编码（新）"], "SKU-XL")
        self.assertEqual(rows[0]["商家编码"], "SKU-XL")
        self.assertEqual(rows[0]["规格名称"], "XL")
        self.assertEqual(rows[0]["可销库存"], "12")

    def test_stock_rows_filter_to_petcircle_warehouse(self):
        rows = daily_ops_erp.normalize_stock_rows([
            {"warehouse_no": "CW001", "warehouse_name": "宠物圈仓库", "spec_no": "SKU-1", "stock_num": 5},
            {"warehouse_no": "CW002", "warehouse_name": "其他仓库", "spec_no": "SKU-2", "stock_num": 9},
        ], warehouse_name="宠物圈仓库")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["商家编码"], "SKU-1")
        self.assertEqual(rows[0]["仓库"], "宠物圈仓库")

    def test_manual_sync_reads_multiple_pages_and_caps_stock_rows(self):
        settings = {
            "base_url": "https://api.wangdian.cn/openapi2",
            "app_key": "app",
            "app_secret": "secret",
            "sid": "sid",
            "shop_no": "PETCIRCLE",
            "warehouse_name": "",
            "page_size": 2,
            "stock_limit": 3,
        }

        def fake_post(_settings, endpoint, params):
            page_no = params["page_no"]
            if endpoint == daily_ops_erp.PRODUCT_ENDPOINT:
                pages = [
                    {"goods_list": [
                        {"spec_no": "P-1", "goods_name": "猫粮", "spec_name": "1kg"},
                        {"spec_no": "P-2", "goods_name": "猫粮", "spec_name": "2kg"},
                    ], "total_count": 3},
                    {"goods_list": [
                        {"spec_no": "P-3", "goods_name": "猫粮", "spec_name": "3kg"},
                    ], "total_count": 3},
                ]
                return pages[page_no]
            pages = [
                {"stock_list": [
                    {"spec_no": "S-1", "stock_num": 11},
                    {"spec_no": "S-2", "stock_num": 12},
                ], "has_more": True},
                {"stock_list": [
                    {"spec_no": "S-3", "stock_num": 13},
                    {"spec_no": "S-4", "stock_num": 14},
                ], "has_more": False},
            ]
            return pages[page_no]

        with tempfile.TemporaryDirectory() as tmp, patch.object(daily_ops_erp, "post_api", side_effect=fake_post):
            result = daily_ops_erp.manual_sync(settings, Path(tmp))

            self.assertEqual(result["status"], "synced")
            self.assertEqual(result["product_count"], 3)
            self.assertEqual(result["stock_count"], 3)
            self.assertEqual(result["product_pages"], 2)
            self.assertEqual(result["stock_pages"], 2)
            self.assertIn("已达到拉取上限 3 条", result["warnings"])

            stock_path = Path(result["stock_file"])
            wb = load_workbook(stock_path)
            ws = wb.active
            headers = [cell.value for cell in ws[1]]
            self.assertIn("仓库", headers)
            self.assertIn("商家编码（新）", headers)
            self.assertIn("规格名称", headers)
            self.assertEqual(ws.cell(2, headers.index("商家编码（新）") + 1).value, "S-1")
            wb.close()


if __name__ == "__main__":
    unittest.main()
