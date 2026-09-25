"""An occurrence is a current true-event ordinal, not a history retention limit."""

import copy
import unittest

from openscript.library.bookkeeping import value_when
from openscript.library.history import ContributionHistory


def expected(rows):
    events, values = [], []
    for condition, value, occurrence in rows:
        if condition is True:
            events.append(value)
        ordinal = 0 if occurrence is None else occurrence
        values.append(events[-1 - ordinal] if len(events) > ordinal else None)
    return values


def observed(rows):
    state = {}
    return [value_when(state, condition, value, occurrence) for condition, value, occurrence in rows]


class VaryingOccurrence(unittest.TestCase):
    def test_shrink_selects_the_current_ordinal(self):
        rows = [(True, 1.0, 1), (True, 2.0, 1), (True, 3.0, 0)]
        self.assertEqual(expected(rows), [None, 1.0, 3.0])
        self.assertEqual(observed(rows), expected(rows))

    def test_growth_reads_events_before_the_larger_request(self):
        rows = [(True, 1.0, 0), (True, 2.0, 0), (False, 3.0, 1)]
        self.assertEqual(expected(rows), [1.0, 2.0, 1.0])
        self.assertEqual(observed(rows), expected(rows))

    def test_holes_count_as_events_and_absent_conditions_do_not(self):
        rows = [(True, 10.0, 3), (True, None, 0), (None, 30.0, 1),
                (False, 40.0, 0), (True, 50.0, 2), (False, 60.0, 1), (False, 70.0, 0)]
        self.assertEqual(expected(rows), [None, None, 10.0, None, 10.0, None, 50.0])
        self.assertEqual(observed(rows), expected(rows))

    def test_absent_occurrence_preserves_the_existing_default_binding(self):
        rows = [(True, 1.0, None), (True, 2.0, None), (False, 3.0, 1)]
        self.assertEqual(observed(rows), expected(rows))

    def test_independent_oracle_across_sparse_events_and_chunk_boundaries(self):
        rows = [(None if index % 4 == 0 else index % 3 != 0,
                 None if index % 13 == 0 else float(index), 90 if index % 29 == 0 else index % 11)
                for index in range(257)]
        self.assertEqual(observed(rows), expected(rows))

    def test_checkpoint_forks_share_immutable_history_without_new_events_leaking(self):
        state = {}
        for index in range(70):
            value_when(state, True, float(index), 0)
        saved = copy.deepcopy(state)
        history = state['seen'].get('history')
        self.assertIsInstance(history, ContributionHistory)
        self.assertIs(saved['seen']['history'], history)
        self.assertEqual(history.count, 70)
        value_when(state, True, 999.0, 0)
        self.assertEqual(value_when(saved, False, None, 69), 0.0)
        self.assertEqual(value_when(state, False, None, 69), 1.0)


if __name__ == '__main__':
    unittest.main()
