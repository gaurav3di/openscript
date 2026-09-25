"""A failed finite seed can recover; an established running state is never reseeded."""

import copy
import unittest

from openscript.library import averages, ranges, strength
from openscript.library.history import ContributionHistory


def walk(step, source, length):
    state = {}
    return [step(state, value, length) for value in source]


class RecursiveOverflow(unittest.TestCase):
    def test_non_finite_seed_waits_for_a_later_finite_suffix(self):
        source = [1e308, 1e308, 1.0, 2.0]
        self.assertEqual(walk(averages.exponential, source, 2),
                         [None, None, 5e307, 1.6666666666666669e307])
        self.assertEqual(walk(averages.smoothed, source, 2), [None, None, 5e307, 2.5e307])

    def test_positive_and_negative_binary_scales_follow_the_seed_recipe(self):
        scale = float(2 ** 1022)
        for sign in [-1, 1]:
            source = [value * sign for value in [3 * scale, 3 * scale, scale / 2, scale]]
            self.assertEqual(walk(averages.exponential, source, 2),
                             [None, None, 1.75 * scale * sign, 1.25 * scale * sign])
            self.assertEqual(walk(averages.smoothed, source, 2),
                             [None, None, 1.75 * scale * sign, 1.375 * scale * sign])

    def test_atr_recovers_from_overflow_of_finite_true_ranges(self):
        class Bar:
            def __init__(self, high, first):
                self.high, self.first = high, first

            def bar(self, key):
                return self.high if key == "high" else 0.0

            def first_bar(self):
                return self.first

        state = {}
        values = [ranges.average_range(state, Bar(high, at == 0), 2)
                  for at, high in enumerate([1e308, 1e308, 1.0, 2.0])]
        self.assertEqual(values, [None, None, 5e307, 2.5e307])

    def test_rsi_waits_for_one_seed_while_the_other_side_continues(self):
        source = [-8e307, 8e307, -8e307, 8e307, 8e307]
        self.assertEqual(walk(strength.strength, source, 3), [None, None, None, None, 60])

    def test_post_seed_overflow_commits_state_without_reseeding(self):
        self.assertEqual(walk(averages.smoothed, [5e307, 5e307, 1.5e308, 1.0, 2.0, 3.0], 2),
                         [None, 5e307, None, None, None, None])
        state = {}
        for value in [5e307, 5e307, 1.5e308]:
            averages.smoothed(state, value, 2)
        saved = copy.deepcopy(state)
        self.assertIsNone(averages.smoothed(state, None, 2))
        self.assertIsNone(averages.smoothed(state, 1.0, 1))
        self.assertIsNone(averages.smoothed(copy.deepcopy(saved), 1.0, 2))

    def test_forming_correction_restores_failed_seed_or_established_state(self):
        for step in [averages.exponential, averages.smoothed]:
            state = {}
            step(state, 1e308, 2)
            before = copy.deepcopy(state)
            self.assertIsNone(step(state, 1e308, 2))
            self.assertIsInstance(state["run"].get("history"), ContributionHistory)
            failed = copy.deepcopy(state)
            self.assertEqual(step(copy.deepcopy(before), 1.0, 2), 5e307)
            self.assertEqual(step(copy.deepcopy(failed), 1.0, 2), 5e307)
        state = {}
        averages.smoothed(state, 5e307, 2)
        averages.smoothed(state, 5e307, 2)
        seeded = copy.deepcopy(state)
        self.assertIsNone(averages.smoothed(state, 1.5e308, 2))
        restored = copy.deepcopy(seeded)
        self.assertEqual(averages.smoothed(restored, 1.0, 2), 2.5e307)
        self.assertEqual(averages.smoothed(restored, 2.0, 2), 1.25e307)


if __name__ == "__main__":
    unittest.main()
