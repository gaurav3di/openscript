"""Independent trend outputs, complete seeds and skipped band observations.

These fixtures use short sequences with directly computed extrema, seeds and
bands. They catch an unavailable input on one side hiding an available output,
or an invalid midpoint entering state that later valid bars inherit.
"""

import sys
import unittest

from openscript.library import stateful_table
from tests.test_series_rules import Bar


class TrendBar(Bar):
    def __init__(self, index, high, low, close, previous_close):
        super().__init__(high=high, low=low, close=close, previousClose=previous_close)
        self.index = index

    def first_bar(self):
        return self.index == 0


def readings(name, parameters, bars):
    entry = stateful_table()[(name, len(parameters))]
    state = {}
    values = []
    for index, (high, low, close) in enumerate(bars):
        before = None if index == 0 else bars[index - 1][2]
        values.append(entry.call(TrendBar(index, high, low, close, before), parameters, state))
    return values


class IndependentExtremeAges(unittest.TestCase):
    def test_a_missing_high_does_not_hide_the_low_age(self):
        self.assertEqual(
            readings("aroon", [1.0], [(None, 2.0, 2.0), (None, 1.0, 1.0)]),
            [[None, None], [None, 100.0]],
        )

    def test_a_missing_low_does_not_hide_the_high_age(self):
        self.assertEqual(
            readings("aroon", [1.0], [(2.0, None, 2.0), (3.0, None, 3.0)]),
            [[None, None], [100.0, None]],
        )

    def test_each_age_recovers_after_its_own_hole_leaves(self):
        self.assertEqual(
            readings("aroon", [2.0], [(None, 2.0, 2.0), (3.0, 1.0, 2.0),
                                      (4.0, 2.0, 3.0), (5.0, 3.0, 4.0)]),
            [[None, None], [None, None], [None, 50.0], [100.0, 0.0]],
        )

    def test_equal_extremes_choose_the_current_bar(self):
        self.assertEqual(
            readings("aroon", [2.0], [(3.0, 1.0, 2.0)] * 3),
            [[None, None], [None, None], [100.0, 100.0]],
        )


class CompleteStopSeeds(unittest.TestCase):
    def test_a_falling_seed_also_requires_the_previous_low(self):
        self.assertEqual(
            readings("psar", [0.02, 0.02, 0.2],
                     [(3.0, None, 2.0), (2.0, 0.0, 1.0), (1.0, -1.0, 0.5)]),
            [[None, None], [None, None], [2.0, 1.0]],
        )

    def test_a_rising_seed_also_requires_the_previous_high(self):
        self.assertEqual(
            readings("psar", [0.02, 0.02, 0.2],
                     [(None, 0.0, 1.0), (3.0, 1.0, 2.0), (4.0, 2.0, 3.0)]),
            [[None, None], [None, None], [1.0, -1.0]],
        )

    def test_a_complete_pair_keeps_the_seed_and_next_stop_exact(self):
        self.assertEqual(
            readings("psar", [0.02, 0.02, 0.2],
                     [(3.0, 1.0, 2.0), (4.0, 2.0, 3.0), (5.0, 3.0, 4.0)]),
            [[None, None], [1.0, -1.0], [1.06, -1.0]],
        )


class UnavailableBandMidpoints(unittest.TestCase):
    def test_an_overflowed_midpoint_never_seeds_a_direction(self):
        large = sys.float_info.max
        self.assertEqual(
            readings("supertrend", [1.0, 1.0], [(large, large, large)] * 2),
            [[None, None], [None, None]],
        )

    def test_the_first_finite_midpoint_seeds_before_reporting(self):
        large = sys.float_info.max
        self.assertEqual(
            readings("supertrend", [1.0, 1.0],
                     [(large, large, large)] * 2 + [(12.0, 8.0, 10.0)] * 2),
            [[None, None], [None, None], [None, None], [14.0, 1.0]],
        )

    def test_a_skipped_midpoint_does_not_replace_the_last_accepted_close(self):
        large = sys.float_info.max
        self.assertEqual(
            readings("supertrend", [1.0, 1.0],
                     [(12.0, 8.0, 10.0)] * 2 + [(large, large, large), (12.0, 8.0, 10.0)]),
            [[None, None], [14.0, 1.0], [None, None], [14.0, 1.0]],
        )

    def test_ordinary_flat_bands_keep_their_exact_values(self):
        self.assertEqual(
            readings("supertrend", [1.0, 1.0], [(12.0, 8.0, 10.0)] * 3),
            [[None, None], [14.0, 1.0], [14.0, 1.0]],
        )


if __name__ == "__main__":
    unittest.main()
