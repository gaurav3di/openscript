"""Changing recursive lengths retain contributions, seed once and step while hidden."""

import copy
import unittest

from openscript.library import averages, composites, strength
from openscript.library.history import ContributionHistory


CASES = [
    ("shrink before seed", [1, 2, 3], [3, 3, 2],
     [None, None, 2.5], [None, None, 2.5], [None, None, 100]),
    ("largest initial length", [1, 2, 3, 4, 5], [5, 2, 2, 2, 2],
     [None, None, None, None, 4.5], [None, None, None, None, 4.5], [None, None, None, None, 100]),
    ("growth before seed", [1, 2, 3, 4, 5, 6], [3, 3, 5, 5, 5, 5],
     [None, None, None, None, 3, 4], [None, None, None, None, 3, 3.6], [None, None, None, None, None, 100]),
    ("growth after seed", [1, 2, 3, 4, 5, 6], [2, 2, 5, 5, 5, 5],
     [None, 1.5, None, None, 3.4444444444444446, 4.296296296296297],
     [None, 1.5, None, None, 2.792, 3.4335999999999998], [None, None, None, None, None, 100]),
    ("missing initial lengths", [1, 2, 3, 4], [None, None, 3, 3],
     [None, None, 2, 3], [None, None, 2, 2.6666666666666665], [None, None, None, 100]),
    ("missing length after seed", [1, 2, 100, 4, 5], [2, 2, None, 2, 2],
     [None, 1.5, None, 3.1666666666666665, 4.388888888888888], [None, 1.5, None, 2.75, 3.875],
     [None, None, None, 50.515463917525764, 51.020408163265316]),
    ("source hole before seed", [1, None, 3, 4, 5], [3, 3, 2, 2, 2],
     [None, None, None, 3.5, 4.5], [None, None, None, 3.5, 4.25], [None, None, None, None, 100]),
    ("source hole after seed", [1, 2, None, 4, 5, 6], [2, 2, 5, 5, 2, 2],
     [None, 1.5, None, None, 4.111111111111111, 5.37037037037037],
     [None, 1.5, None, None, 3.5, 4.75], [None, None, None, None, None, 100]),
    ("initial absent change remains a position", [10, 14, 12, 16, 14], [5, 2, 2, 2, 2],
     [None, None, None, None, 15], [None, None, None, None, 15],
     [None, None, None, None, 66.66666666666666]),
]


class VaryingRecursive(unittest.TestCase):
    def test_seed_and_continuation_equations(self):
        families = [averages.exponential, averages.smoothed, strength.strength]
        for name, source, lengths, *columns in CASES:
            for step, expected in zip(families, columns):
                with self.subTest(case=name, family=step.__name__):
                    state = {}
                    actual = [step(state, None if value is None else float(value), length)
                              for value, length in zip(source, lengths)]
                    self.assertEqual(actual, expected)

    def test_hidden_steps_advance_and_missing_length_or_source_freezes(self):
        state = {}
        self.assertEqual([averages.exponential(state, value, length) for value, length in
                          [(1.0, 1), (3.0, 3), (None, 5), (20.0, None), (5.0, 3)]],
                         [1, None, None, None, 3.5])

    def test_branch_local_calls_and_independent_regions(self):
        branch, continuous = {}, {}
        branch_values, continuous_values = [], []
        for at in range(1, 6):
            if at % 2 == 1:
                branch_values.append(averages.exponential(branch, float(at), 3 if at == 1 else 2))
            continuous_values.append(averages.exponential(continuous, float(at), 1))
        self.assertEqual(branch_values, [None, None, 4])
        self.assertEqual(continuous_values, [1, 2, 3, 4, 5])

    def test_restore_before_interim_first_seed_and_longer_length(self):
        state = {}
        averages.exponential(state, 1.0, 3)
        averages.exponential(state, 2.0, 3)
        checkpoint = copy.deepcopy(state)
        self.assertEqual(averages.exponential(state, 300.0, 1), 300)
        restored = copy.deepcopy(checkpoint)
        self.assertEqual(averages.exponential(restored, 7.0, 2), 4.5)
        self.assertEqual(averages.exponential(restored, 8.0, 2), 6.833333333333333)
        longer = copy.deepcopy(checkpoint)
        averages.exponential(longer, 300.0, 100)
        fork = copy.deepcopy(checkpoint)
        self.assertEqual(averages.exponential(fork, 4.0, 3), 7 / 3)

    def test_post_seed_rollback_restores_hidden_step_and_maximum(self):
        state = {}
        averages.exponential(state, 1.0, 1)
        saved = copy.deepcopy(state)
        self.assertIsNone(averages.exponential(state, 100.0, 20))
        restored = copy.deepcopy(saved)
        self.assertIsNone(averages.exponential(restored, 3.0, 3))
        hidden = copy.deepcopy(restored)
        self.assertEqual(averages.exponential(restored, 5.0, 3), 3.5)
        fork = copy.deepcopy(hidden)
        self.assertEqual(averages.exponential(fork, 7.0, 3), 4.5)

    def test_seed_history_is_released_but_checkpoint_keeps_its_prefix(self):
        def histories(value):
            if isinstance(value, ContributionHistory):
                return 1
            return sum(histories(one) for one in value.values()) if isinstance(value, dict) else 0

        state = {}
        for at in range(1, 65):
            averages.exponential(state, float(at), None)
        self.assertEqual(histories(state), 1)
        saved = copy.deepcopy(state)
        self.assertEqual(averages.exponential(state, 65.0, 65), 33)
        self.assertEqual(histories(state), 0)
        for at in range(66, 10001):
            averages.exponential(state, float(at), 10000)
        self.assertEqual(histories(state), 0)
        fork = copy.deepcopy(saved)
        self.assertEqual(averages.exponential(fork, 99.0, 1), 99)

    def test_nested_averages_seed_their_own_current_suffix(self):
        lengths = [3, 3, 2, 2, 2, 2]
        twice, thrice = {}, {}
        self.assertEqual([composites.doubled(twice, float(at), length)
                          for at, length in zip(range(1, 7), lengths)],
                         [None, None, None, 4, 5, 6])
        self.assertEqual([composites.tripled(thrice, float(at), length)
                          for at, length in zip(range(1, 7), lengths)],
                         [None, None, None, None, 5, 6])


if __name__ == "__main__":
    unittest.main()
