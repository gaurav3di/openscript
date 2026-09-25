"""Finite windows keep contributions, their current length and their warmup separate."""

import copy
import unittest

from openscript.library import averages, counting, trend
from openscript.library.history import ContributionHistory
from openscript.library.series import contributed, raw_window


class VaryingLookback(unittest.TestCase):
    def test_window_lengths_keep_history_and_maximum_warmup(self):
        cases = [
            ([1, 2, 3], [3, 3, 2], [None, None, 5]),
            ([1, 2, 3, 4, 5], [5, 2, 2, 2, 2], [None, None, None, None, 9]),
            ([1, 2, 3, 4, 5, 6], [2, 2, 2, 5, 5, 5], [None, 3, 5, None, 15, 20]),
            ([1, 2, 3, 4], [None, None, 3, 2], [None, None, 6, 7]),
            ([1, None, 3, 4, 5, 6], [3, 3, 2, 2, 3, 3], [None, None, None, 7, 12, 15]),
        ]
        for source, lengths, expected in cases:
            with self.subTest(lengths=lengths):
                state = {}
                actual = [counting.windowed_sum(state, None if v is None else float(v), n)
                          for v, n in zip(source, lengths)]
                self.assertEqual(actual, expected)

    def test_current_length_is_the_divisor(self):
        state = {}
        self.assertEqual([averages.simple(state, float(v), 5 if v == 1 else 2)
                          for v in range(1, 6)], [None, None, None, None, 4.5])

    def test_paired_holes_keep_alignment(self):
        state = {}
        actual = [counting.correlation(state, float(a), b, n) for a, b, n in
                  [(1, 2.0, 2), (2, None, 2), (3, 6.0, 4), (4, 8.0, 2), (5, 10.0, 2)]]
        self.assertEqual(actual, [None, None, None, 1, 1])

    def test_skipping_holes_still_requires_maximum_warmup(self):
        state = {}
        self.assertEqual([counting.skipping_sum(state, v, n) for v, n in
                          [(1.0, 4), (None, 2), (3.0, 2), (None, 2)]],
                         [None, None, None, 3])

    def test_independent_keys_and_branch_local_contributions(self):
        state = {}
        left, right = [], []
        for at in range(1, 7):
            left.append(raw_window(contributed(state, "left", float(at), 5 if at == 1 else 2), 2))
            if at % 2 == 0:
                right.append(raw_window(contributed(state, "right", float(at), 3 if at == 2 else 2), 2))
        self.assertEqual(left, [None, None, None, None, [5, 4], [6, 5]])
        self.assertEqual(right, [None, None, [6, 4]])

    def test_snapshot_forks_and_forming_length_rollback(self):
        state = {}
        counting.windowed_sum(state, 1.0, 3)
        counting.windowed_sum(state, 2.0, 3)
        checkpoint = copy.deepcopy(state)
        self.assertIsNone(counting.windowed_sum(state, 300.0, 10))
        corrected = copy.deepcopy(checkpoint)
        self.assertEqual(counting.windowed_sum(corrected, 7.0, 3), 10)
        self.assertEqual(counting.windowed_sum(corrected, 8.0, 2), 15)
        fork = copy.deepcopy(checkpoint)
        self.assertEqual(counting.windowed_sum(fork, 4.0, 2), 6)
        self.assertEqual(counting.windowed_sum(corrected, 9.0, 5), 27)

    def test_fixed_length_addition_is_oldest_first(self):
        state = {}
        for value in [1e16, -1e16]:
            self.assertIsNone(counting.windowed_sum(state, value, 3))
        self.assertEqual(counting.windowed_sum(state, 1.0, 3), 1)

    def test_finite_history_does_not_choose_a_new_recursive_seed_rule(self):
        state = {}
        self.assertEqual([averages.exponential(state, float(v), n) for v, n in
                          [(1, None), (2, None), (3, 3), (4, 3)]],
                         [None, None, None, 3])

    def test_growth_can_reach_before_any_previous_requested_window(self):
        state = {}
        for at in range(1, 8192):
            counting.windowed_sum(state, float(at), 2)
        self.assertEqual(counting.windowed_sum(state, 8192.0, 8192), 8192 * 8193 / 2)

    def test_cloud_lines_have_independent_fixed_warmups(self):
        class Bar:
            def __init__(self, at):
                self.at = float(at)

            def bar(self, key):
                return self.at + 1 if key == "high" else self.at - 1 if key == "low" else self.at

        state = {}
        rows = [trend.cloud(state, Bar(at), 2, 3, 5) for at in range(1, 6)]
        self.assertEqual(rows, [
            [None, None, None, None, None], [1.5, None, None, None, None],
            [2.5, 2.0, 2.25, None, 3.0], [3.5, 3.0, 3.25, None, 4.0],
            [4.5, 4.0, 4.25, 3.0, 5.0],
        ])
        state = {}
        varying = [trend.cloud(state, Bar(at), 5 if at == 1 else 2, 3, 2) for at in range(1, 6)]
        self.assertEqual(varying, [
            [None, None, None, None, None], [None, None, None, 1.5, None],
            [None, 2.0, None, 2.5, 3.0], [None, 3.0, None, 3.5, 4.0],
            [4.5, 4.0, 4.25, 4.5, 5.0],
        ])

    def test_checkpoints_share_immutable_chunks_and_detach_mutable_state(self):
        history = ContributionHistory()
        copied_cells = 0
        for at in range(4096):
            later = history.append(float(at), 2)
            copied_cells += len(later.tail)
            if later.head is not history.head:
                self.assertIs(later.head.values, history.tail)
                self.assertIs(later.head.prior, history.head)
            history = later
        self.assertLessEqual(copied_cells, 4096 * 32)
        state = {"history": history, "mutable": [1, 2]}
        snapshot = copy.deepcopy(state)
        self.assertIs(snapshot["history"], history)
        self.assertIsNot(snapshot["mutable"], state["mutable"])
        left, right = history.append(9.0, 2), history.append(11.0, 2)
        self.assertIs(left.head.prior, right.head.prior)
        self.assertEqual(left.view(1)[0], 9)
        self.assertEqual(right.view(1)[0], 11)
        self.assertEqual(history.view(1)[0], 4095)
        with self.assertRaises(AttributeError):
            history.count = 0

    def test_large_window_visits_chunks_once_and_indexes_values_in_constant_work(self):
        history = ContributionHistory()
        for at in range(32768):
            history = history.append(float(at), 2)
        links = [0]

        class MeasuredChunk:
            def __init__(self, node):
                self.node = node
                self.values = node.values

            @property
            def prior(self):
                links[0] += 1
                return None if self.node.prior is None else MeasuredChunk(self.node.prior)

        measured = ContributionHistory(MeasuredChunk(history.head), history.tail, history.count)
        view = measured.view(8192)
        before = links[0]
        self.assertLessEqual(before, 8192 // 32)
        self.assertEqual(sum(view), (24576 + 32767) * 8192 / 2)
        self.assertEqual(links[0], before)
        measured.view(2)
        self.assertEqual(links[0], before)


if __name__ == "__main__":
    unittest.main()
