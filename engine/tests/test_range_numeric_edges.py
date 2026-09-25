"""Independent channel availability for the window's high and low.

A missing high cannot invalidate a known lower extreme. Only the midpoint
requires both sides, and a missing side recovers when its hole leaves the window.
"""

import unittest

from openscript.library import stateful_table
from tests.test_series_rules import Bar


def channel(highs, lows, length):
    entry = stateful_table()[("donchian", 1)]
    state = {}
    return [
        entry.call(Bar(high=high, low=low), [float(length)], state)
        for high, low in zip(highs, lows)
    ]


class IndependentChannelOutputs(unittest.TestCase):
    def test_an_absent_high_preserves_the_lower_extreme(self):
        self.assertEqual(channel([None], [2.0], 1), [[None, None, 2.0]])

    def test_an_absent_low_preserves_the_upper_extreme(self):
        self.assertEqual(channel([5.0], [None], 1), [[5.0, None, None]])

    def test_two_absent_sides_leave_all_outputs_absent(self):
        self.assertEqual(channel([None], [None], 1), [[None, None, None]])

    def test_each_side_recovers_when_its_own_hole_leaves_the_window(self):
        self.assertEqual(
            channel([None, 4.0, 6.0, 5.0, 8.0], [1.0, 2.0, None, 3.0, 2.0], 2),
            [[None, None, None], [None, None, 1.0], [6.0, None, None],
             [6.0, None, None], [8.0, 5.0, 2.0]],
        )

    def test_ordinary_extremes_and_midpoints_keep_exact_values(self):
        self.assertEqual(
            channel([5.0, 5.0, 4.0], [1.0, 2.0, 2.0], 2),
            [[None, None, None], [5.0, 3.0, 1.0], [5.0, 3.5, 2.0]],
        )


if __name__ == "__main__":
    unittest.main()
