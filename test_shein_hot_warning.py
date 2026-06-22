import unittest

from shein_hot_warning_v11_analysis import num


class SheinHotWarningNumberTest(unittest.TestCase):
    def test_num_converts_non_empty_values_to_float(self):
        self.assertEqual(num(12), 12.0)
        self.assertEqual(num("1,234.5"), 1234.5)

    def test_num_treats_blank_and_invalid_values_as_zero(self):
        self.assertEqual(num(None), 0.0)
        self.assertEqual(num(""), 0.0)
        self.assertEqual(num("abc"), 0.0)


if __name__ == "__main__":
    unittest.main()
