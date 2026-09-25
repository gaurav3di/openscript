"""Anchored warmup and finite window totals through the stateful table.

The anchor fixtures catch totals started before a reset or retained across a
reset with absent data. The flow fixtures catch a raw infinite named sum being
used as a divisor instead of propagating its absence.
"""

import sys
import unittest

from openscript.library import stateful_table
from tests.test_series_rules import Bar


def average(name, prices, volumes, anchors):
    entry = stateful_table()[(name, 1 if name == "vwap" else 2)]
    state = {}
    values = []
    for price, volume, anchor in zip(prices, volumes, anchors):
        args = [price] if name == "vwap" else [price, anchor]
        values.append(entry.call(Bar(volume=volume, isSessionFirst=anchor), args, state))
    return values


def money_flow(volumes, closes=None):
    entry = stateful_table()[("cmf", 1)]
    state = {}
    prices = closes if closes is not None else [1.0] * len(volumes)
    return [
        entry.call(Bar(high=2.0, low=0.0, close=close, volume=volume), [2.0], state)
        for volume, close in zip(volumes, prices)
    ]


class AnchoredWarmup(unittest.TestCase):
    def test_no_average_exists_before_the_first_anchor(self):
        for name in ("vwap", "vwapAnchor"):
            with self.subTest(name=name):
                self.assertEqual(
                    average(name, [10.0, 20.0, 30.0, 50.0], [100.0, 100.0, 2.0, 2.0],
                            [False, False, True, False]),
                    [None, None, 30.0, 40.0],
                )

    def test_a_run_without_an_anchor_stays_absent(self):
        for name in ("vwap", "vwapAnchor"):
            with self.subTest(name=name):
                self.assertEqual(
                    average(name, [10.0, 20.0], [2.0, 6.0], [False, None]),
                    [None, None],
                )

    def test_ordinary_weighting_and_repeated_anchors_keep_exact_values(self):
        for name in ("vwap", "vwapAnchor"):
            with self.subTest(name=name):
                self.assertEqual(
                    average(name, [10.0, 20.0, 30.0, 40.0], [2.0, 6.0, 1.0, 2.0],
                            [True, False, True, True]),
                    [10.0, 17.5, 30.0, 40.0],
                )

    def test_an_anchor_with_absent_source_starts_the_new_average(self):
        for name in ("vwap", "vwapAnchor"):
            with self.subTest(name=name):
                self.assertEqual(
                    average(name, [10.0, None, 40.0], [2.0, 2.0, 1.0], [True, True, False]),
                    [10.0, None, 40.0],
                )

    def test_an_anchor_with_absent_volume_starts_the_new_average(self):
        for name in ("vwap", "vwapAnchor"):
            with self.subTest(name=name):
                self.assertEqual(
                    average(name, [10.0, 20.0, 40.0], [2.0, None, 1.0], [True, True, False]),
                    [10.0, None, 40.0],
                )

    def test_an_absent_condition_after_an_anchor_does_not_reset_or_drop_a_bar(self):
        for name in ("vwap", "vwapAnchor"):
            with self.subTest(name=name):
                self.assertEqual(
                    average(name, [10.0, 20.0, 40.0], [2.0, 6.0, 2.0], [True, None, False]),
                    [10.0, 17.5, 22.0],
                )

    def test_a_source_hole_leaves_anchored_totals_available_afterward(self):
        self.assertEqual(
            average("vwapAnchor", [10.0, None, 20.0], [2.0, 50.0, 6.0], [True, False, False]),
            [10.0, None, 17.5],
        )

    def test_a_zero_volume_anchor_remains_initialized(self):
        self.assertEqual(
            average("vwapAnchor", [10.0, 20.0], [0.0, 2.0], [True, False]),
            [None, 20.0],
        )


class FlowWindowTotals(unittest.TestCase):
    def test_an_overflowed_volume_sum_is_absent_instead_of_a_zero_ratio(self):
        self.assertEqual(money_flow([sys.float_info.max, sys.float_info.max]), [None, None])

    def test_a_finite_window_recovers_after_the_overflow_leaves(self):
        self.assertEqual(
            money_flow([sys.float_info.max, sys.float_info.max, 1.0, 1.0]),
            [None, None, 0.0, 0.0],
        )

    def test_ordinary_signed_flow_sums_keep_exact_values(self):
        self.assertEqual(money_flow([2.0, 6.0, 2.0], [1.5, 0.5, 2.0]), [None, -0.25, -0.125])

    def test_a_subnormal_nonzero_volume_sum_is_not_absent(self):
        tiny = float.fromhex("0x0.0000000000001p-1022")
        self.assertEqual(money_flow([tiny, tiny]), [None, 0.0])

    def test_a_zero_volume_sum_stays_absent(self):
        self.assertEqual(money_flow([0.0, 0.0]), [None, None])


if __name__ == "__main__":
    unittest.main()
