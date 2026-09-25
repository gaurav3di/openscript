"""Distance reads wait for maximum readiness while selecting the current offset."""
import copy
import unittest

from openscript.library import bookkeeping, counting, momentum


FUNCTIONS = [counting.history_at, bookkeeping.change, momentum.distance, momentum.rate]


class VaryingDistance(unittest.TestCase):
    def test_shorter_distance_does_not_cancel_largest_observed_warmup(self):
        for step, last in zip(FUNCTIONS, [4, 4, 4, 100]):
            with self.subTest(step=step.__name__):
                state = {}
                actual = [step(state, float(value), distance) for value, distance in
                          zip([1, 2, 4, 8], [3, 1, 1, 1])]
                self.assertEqual(actual, [None, None, None, last])

    def test_larger_distance_hides_shorter_readings_until_ready(self):
        for step, expected in zip(FUNCTIONS, [
            [None, 1, None, None, None, 16],
            [None, 1, None, None, None, 16],
            [None, 1, None, None, None, 16],
            [None, 100, None, None, None, 100],
        ]):
            with self.subTest(step=step.__name__):
                state = {}
                self.assertEqual([step(state, float(value), distance) for value, distance in
                                  zip([1, 2, 4, 8, 16, 32], [1, 1, 5, 1, 1, 1])], expected)

    def test_absent_distance_still_contributes_source_history(self):
        for step, expected in zip(FUNCTIONS, [
            [None, None, 1, 4], [None, None, 3, 4],
            [None, None, 3, 4], [None, None, 300, 100],
        ]):
            state = {}
            self.assertEqual([step(state, float(value), distance) for value, distance in
                              zip([1, 2, 4, 8], [None, None, 2, 1])], expected)

    def test_only_selected_endpoints_need_to_be_present(self):
        for step, last in zip(FUNCTIONS, [1, 7, 7, 700]):
            state = {}
            actual = [step(state, value, 3) for value in [1.0, None, 4.0, 8.0]]
            self.assertEqual(actual, [None, None, None, last])

    def test_rollback_restores_maximum_and_contributions(self):
        for step, last in zip(FUNCTIONS, [2, 2, 2, 100]):
            state = {}
            step(state, 1.0, 1)
            step(state, 2.0, 1)
            saved = copy.deepcopy(state)
            self.assertIsNone(step(state, 4.0, 6))
            restored = copy.deepcopy(saved)
            self.assertEqual(step(restored, 4.0, 1), last)

    def test_zero_history_distance_is_ready_only_after_prior_maximum(self):
        state = {}
        self.assertEqual([counting.history_at(state, value, distance) for value, distance in
                          [(1.0, 2), (2.0, 0), (4.0, 0)]], [None, None, 4])
