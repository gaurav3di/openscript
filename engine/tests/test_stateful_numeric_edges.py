"""Finite inputs whose computed ratio divisor is zero, per stdlib.md 2.4.

These cases catch guards that inspect an unscaled input instead of the divisor
actually used. They drive the stateful table, including its normal bar inputs,
and keep later observations in the same region to check recovery.
"""

import math
import unittest

from openscript.library import stateful_table


class Bar:
    """A point-price bar with unit volume for independently computed fixtures."""

    def __init__(self, price):
        self.price = float(price)

    def bar(self, fact):
        if fact == "volume":
            return 1.0
        if fact in ("high", "low", "close"):
            return self.price
        return None


def readings(name, prices):
    entry = stateful_table()[(name, 1)]
    state = {}
    return [entry.call(Bar(price), [2.0], state) for price in prices]


class StatefulNumericEdges(unittest.TestCase):
    def test_cci_subnormal_divisor_returns_absence(self):
        # Mean and deviation are two and one minimum subnormal units. Applying
        # 0.015 rounds the deviation to zero even though it was not zero before.
        tiny = float.fromhex("0x0.0000000000001p-1022")
        self.assertEqual(readings("cci", [tiny, 3 * tiny]), [None, None])

    def test_cci_recovers_after_a_zero_computed_divisor(self):
        tiny = float.fromhex("0x0.0000000000001p-1022")
        self.assertEqual(
            readings("cci", [tiny, 3 * tiny, 1.0, 2.0]),
            [None, None, 66.66666666666667, 66.66666666666667],
        )

    def test_cci_ordinary_results_keep_their_exact_order(self):
        self.assertEqual(
            readings("cci", [1.0, 2.0, 1.0]),
            [None, 66.66666666666667, -66.66666666666667],
        )

    def test_cci_small_nonzero_divisor_is_not_treated_as_zero(self):
        value = readings("cci", [0.0, 1e-300])[-1]
        self.assertTrue(isinstance(value, float) and math.isfinite(value))
        self.assertGreater(value, 66.0)
        self.assertLess(value, 67.0)

    def test_money_flow_zero_composed_divisor_returns_absence(self):
        # The two signed flow sums are 1 and -1. Their ratio is -1, so adding
        # one produces the zero divisor that the outer division must reject.
        self.assertEqual(readings("mfi", [-1.0, 1.0, -1.0]), [None, None, None])

    def test_money_flow_recovers_after_a_zero_composed_divisor(self):
        self.assertEqual(
            readings("mfi", [-1.0, 1.0, -1.0, 2.0, 3.0]),
            [None, None, None, 200.0, 100.0],
        )

    def test_money_flow_ordinary_results_keep_their_exact_order(self):
        self.assertEqual(
            readings("mfi", [1.0, 2.0, 1.0, 2.0, 3.0]),
            [None, None, 66.66666666666666, 66.66666666666666, 100.0],
        )

    def test_money_flow_zero_falling_side_stays_one_hundred(self):
        self.assertEqual(readings("mfi", [1.0, 1.0, 1.0]), [None, None, 100.0])


if __name__ == "__main__":
    unittest.main()
