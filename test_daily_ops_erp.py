import tempfile
import unittest
from pathlib import Path

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
            "spec_no": "SKU-XL",
            "goods_no": "SKU",
            "goods_name": "猫抓板",
            "spec_name": "XL",
            "stock_num": 12,
        }])
        self.assertEqual(rows[0]["商家编码（新）"], "SKU-XL")
        self.assertEqual(rows[0]["货品名称"], "猫抓板")
        self.assertEqual(rows[0]["规格名称"], "XL")

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "erp产品基础信息表_接口同步_test.xlsx"
            daily_ops_erp._write_rows(path, ["商家编码（新）", "货品名称", "规格名称"], rows)
            wb = load_workbook(path)
            ws = wb.active
            self.assertEqual(ws.cell(2, 1).value, "SKU-XL")
            wb.close()


if __name__ == "__main__":
    unittest.main()
