import unittest

from generate_temu_bargain_reply import evaluate_offer


def offer(price=20, cost=10, wholesale=20, links=None, has_hot=False):
    return {
        "申报价": price,
        "成本价": cost,
        "批发价": wholesale,
        "在售链接": links or [],
        "有爆旺款": has_hot,
    }


class TemuBargainRuleTest(unittest.TestCase):
    def test_rejects_price_below_cost_first(self):
        result = evaluate_offer(offer(price=9, cost=10, wholesale=8, has_hot=True))
        self.assertEqual(result["是否通过"], "拒绝上架-理由 亏损")
        self.assertEqual(result["建议价格"], 10)

    def test_rejects_when_hot_link_exists(self):
        result = evaluate_offer(offer(has_hot=True, links=[{"申报价": 20}]))
        self.assertEqual(result["是否通过"], "拒绝上架-理由 有爆旺款在售")

    def test_rejects_preview_hot_when_quote_below_95_percent(self):
        result = evaluate_offer(
            offer(price=18, links=[{"申报价": 20, "7天销量": 11, "30天销量": 30}])
        )
        self.assertEqual(result["是否通过"], "拒绝上架-理由 有预备爆款链接在售")
        self.assertEqual(result["建议价格"], 19)

    def test_rejects_when_more_than_seven_links_exist(self):
        result = evaluate_offer(offer(links=[{"申报价": 20}] * 8))
        self.assertEqual(
            result["是否通过"], "拒绝上架-理由 同时在架产品过多，15天以后再尝试上架"
        )

    def test_rejects_four_to_seven_links_when_quote_too_low(self):
        result = evaluate_offer(
            offer(price=18, cost=10, links=[{"申报价": 20}, {"申报价": 22}, {"申报价": 21}, {"申报价": 23}])
        )
        self.assertEqual(result["是否通过"], "拒绝上架-理由 报价过低建议价格为19.00")
        self.assertEqual(result["建议价格"], 19)

    def test_rejects_price_below_80_percent_wholesale(self):
        result = evaluate_offer(offer(price=15, cost=10, wholesale=20))
        self.assertEqual(result["是否通过"], "拒绝上架-理由 破价")
        self.assertEqual(result["建议价格"], 16)

    def test_approves_when_no_rule_matches(self):
        result = evaluate_offer(offer(price=20, cost=10, wholesale=20, links=[{"申报价": 20}]))
        self.assertEqual(result["是否通过"], "同意议价")
        self.assertEqual(result["建议价格"], "")


if __name__ == "__main__":
    unittest.main()
