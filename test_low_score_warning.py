import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

from generate_low_score_warning import (
    build_output_rows,
    classify_spu_status,
    load_owner_map,
    load_low_score_rows,
    merge_current_rows,
)


class LowScoreWarningTest(unittest.TestCase):
    def test_marks_new_spu_when_not_in_history(self):
        result = classify_spu_status("123", set(), {"123": {"在售": True}})
        self.assertEqual(result["是否本周新增低分"], "本周新增低分产品")
        self.assertEqual(result["是否下架"], "在售")

    def test_marks_history_spu_when_found_in_previous_week(self):
        result = classify_spu_status("123", {"123"}, {"123": {"在售": True}})
        self.assertEqual(result["是否本周新增低分"], "历史持续低分产品")

    def test_marks_off_shelf_when_sales_missing(self):
        result = classify_spu_status("123", set(), {})
        self.assertEqual(result["是否下架"], "已下架")

    def test_keeps_first_row_when_current_week_has_duplicate_spu(self):
        rows = [
            {"SPU": "1001", "店铺品质分情况": "58.0", "填表人": "A"},
            {"SPU": "1001", "店铺品质分情况": "57.0", "填表人": "B"},
            {"SPU": "1002", "店铺品质分情况": "59.0", "填表人": "C"},
        ]
        merged = merge_current_rows(rows)
        self.assertEqual(len(merged), 2)
        self.assertEqual(merged[0]["填表人"], "A")
        self.assertEqual(merged[0]["店铺品质分情况"], "58.0")

    def test_reads_sparse_input_sheet_without_column_shift(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "低分预警表.xlsx"
            wb = Workbook()
            ws = wb.active
            ws.append(["spu", "skc", "货品名称", "店铺", "品质分情况", "填表人", "是否已下架", "平台仓库库存", "是否爆旺款", "填表时间"])
            ws.append([1409099486, None, None, 1, 57.5, None, None, None, None, None])
            ws.append([4629719582, None, None, 1, 59.6, None, None, None, None, None])
            wb.save(path)
            rows, _ = load_low_score_rows([path])
            self.assertEqual(rows[0]["SPU"], "1409099486")
            self.assertEqual(rows[0]["填表人"], "")
            self.assertEqual(rows[1]["SPU"], "4629719582")

    def test_prefers_erp_name_by_sales_product_code(self):
        current_rows = [{"SPU": "6232074702", "店铺品质分情况": "58.3", "填表人": "", "填表时间": ""}]
        sales_index = {
            "6232074702": {
                "在售": True,
                "SKC": "69443952334",
                "所属店铺": "5",
                "产品负责人": "小琴",
                "平台仓库库存": 56,
                "30天销量": 120,
                "ERP货品编码": "330318277",
            }
        }
        erp_names = {"330318277": "天蓝色雨衣"}
        rows = build_output_rows(current_rows, set(), sales_index, erp_names, set())
        self.assertEqual(rows[0]["货品名称"], "天蓝色雨衣")

    def test_preserves_import_spu_order_in_output(self):
        current_rows = [
            {"SPU": "300", "店铺品质分情况": "58.0", "所属店铺_原始": "3"},
            {"SPU": "100", "店铺品质分情况": "57.0", "所属店铺_原始": "1"},
            {"SPU": "200", "店铺品质分情况": "56.0", "所属店铺_原始": "2"},
        ]
        sales_index = {
            "100": {"在售": True, "所属店铺": "1", "产品负责人": "小琴"},
        }
        rows = build_output_rows(current_rows, set(), sales_index, {}, set(), {"1": "小琴", "2": "洁琳", "3": "胡娟"})
        self.assertEqual([row["SPU"] for row in rows], ["300", "100", "200"])

    def test_uses_input_store_to_fill_owner_when_sales_missing(self):
        current_rows = [{"SPU": "300", "店铺品质分情况": "58.0", "所属店铺_原始": "3"}]
        rows = build_output_rows(current_rows, set(), {}, {}, set(), {"3": "胡娟"})
        self.assertEqual(rows[0]["所属店铺"], "3")
        self.assertEqual(rows[0]["产品负责人"], "胡娟")

    def test_owner_map_supports_store_code_and_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "店铺负责人对应表.xlsx"
            wb = Workbook()
            ws = wb.active
            ws.append(["店铺", "业务"])
            ws.append(["三弟", "胡娟"])
            ws.append(["10", "洁琳"])
            wb.save(path)

            owners = load_owner_map(path)

        self.assertEqual(owners["三弟"], "胡娟")
        self.assertEqual(owners["3"], "胡娟")
        self.assertEqual(owners["10"], "洁琳")


if __name__ == "__main__":
    unittest.main()
