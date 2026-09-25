"""An overflowing term is an absent observation, and the anchored total keeps its value.

`compiled-program.md` section 3.1 makes every non-finite arithmetic result
absent, checked after each individual operation. `stdlib.md` section 20.6 says
an absent term produces an absent reading and leaves the running total where it
was. Read together, a term whose change, proportion or product overflows costs
the reading on its own bar and nothing after it. The wrong implementation these
fixtures catch adds the unchecked term, stores the infinity it produced, and is
absent on every later bar.

A total that overflows although its term was finite is a different case: the
total keeps what the arithmetic produced and every later reading is absent until
the total is started again, which is what the sibling totals already do.
"""

import copy
import json
import math
import struct
import sys
import unittest

from openscript.library import stateful_table
from tests.test_momentum_overflow import finite, operation


def trend_expected(rows):
    """Batch reading of ``pvt``, one rounded operation at a time from exact operands."""
    output, total, before, started = [], 0.0, None, False
    for row in rows:
        close, volume = row['close'], row['volume']
        previous, seen = before, started
        before, started = close, True
        reading = None
        if seen and previous is not None and previous != 0 and close is not None and volume is not None:
            change = finite(operation(close, previous, '-'))
            proportion = None if change is None else finite(operation(change, previous, '/'))
            term = None if proportion is None else finite(operation(proportion, volume, '*'))
            if term is not None:
                total = operation(total, term, '+')
                reading = finite(total)
        output.append(reading)
    return output


def anchored_expected(rows, anchors):
    """Batch reading of ``vwapAnchor``: both totals reset first, then one term each."""
    output, flow, traded, anchored = [], 0.0, 0.0, False
    for row, anchor in zip(rows, anchors):
        if anchor:
            flow, traded, anchored = 0.0, 0.0, True
        reading = None
        price, volume = row['close'], row['volume']
        if anchored and price is not None and volume is not None:
            term = finite(operation(price, volume, '*'))
            if term is not None:
                flow = operation(flow, term, '+')
                traded = operation(traded, volume, '+')
                numerator, divisor = finite(flow), finite(traded)
                if numerator is not None and divisor is not None and divisor != 0:
                    reading = finite(operation(numerator, divisor, '/'))
        output.append(reading)
    return output


def bars(closes, volumes, anchors=None):
    """Host bars; ``open`` marks an anchor so a compiled script can read it."""
    anchors = anchors or [False] * len(closes)
    return [dict(time=1700000000000 + index * 60000, open=1.0 if anchor else 0.0,
                 high=close, low=close, close=close, volume=volume)
            for index, (close, volume, anchor) in enumerate(zip(closes, volumes, anchors))]


def trend_case(label, closes, volumes):
    rows = bars(closes, volumes)
    return dict(id=f'pvt-{label}', name='pvt', bars=rows, anchors=[False] * len(rows),
                expected=trend_expected(rows))


def anchored_case(label, closes, volumes, anchors):
    rows = bars(closes, volumes, anchors)
    return dict(id=f'vwapAnchor-{label}', name='vwapAnchor', bars=rows, anchors=list(anchors),
                expected=anchored_expected(rows, anchors))


def signed(values, sign):
    return [None if value is None else sign * value for value in values]


def cases():
    rows = []
    ordinary = [40.0 + index % 7 for index in range(40)]
    for sign in [1.0, -1.0]:
        tag = 'up' if sign > 0 else 'down'

        def flip(values):
            return signed(values, sign)

        rows.append(trend_case(f'change-overflow-{tag}', flip([1.0, 1e308, -1e308, 2.0, 3.0]), [1.0] * 5))
        rows.append(trend_case(f'proportion-overflow-{tag}',
                               flip([1.0, 2.0, 1e-300, 1e10, 2e10, 3e10]), [1.0] * 6))
        rows.append(trend_case(f'product-overflow-{tag}', flip([1.0, 2.0, 6.0, 7.0, 8.0]),
                               [1.0, 1.0, 1e308, 1.0, 1.0]))
        rows.append(trend_case(f'total-overflow-{tag}', flip([1.0, 2.0, 4.0, 8.0, 9.0]),
                               [1.0, 1e308, 1e308, 1.0, 1.0]))
        rows.append(trend_case(f'recovery-{tag}', flip(ordinary + [-1e308, 1e308] + ordinary),
                               [1.0 + index % 3 for index in range(82)]))
    rows.append(trend_case('holes', [10.0, 11.0, None, 12.0, 13.0, 14.0, 15.0],
                           [5.0, 5.0, 5.0, 5.0, None, 5.0, 5.0]))
    rows.append(trend_case('zero-previous', [0.0, 1e308, 1.0, 2.0], [1.0] * 4))
    rows.append(trend_case('unchanged-negative', [-5.0, -5.0, -4.0], [3.0] * 3))
    for sign in [1.0, -1.0]:
        tag = 'up' if sign > 0 else 'down'
        rows.append(anchored_case(f'product-overflow-{tag}', [10.0 * sign, 1e308 * sign, 20.0 * sign, 30.0 * sign],
                                  [2.0, 1e10, 6.0, 2.0], [True, False, False, False]))
        rows.append(anchored_case(f'flow-overflow-{tag}', [1e308 * sign, 1e308 * sign, 5.0 * sign, 4.0 * sign],
                                  [1.0, 1.0, 1.0, 2.0], [True, False, False, True]))
    rows.append(anchored_case('traded-overflow', [1e-10, 1e-10, 5.0, 4.0, 6.0], [1e308, 1e308, 1.0, 2.0, 2.0],
                              [True, False, False, True, False]))
    rows.append(anchored_case('overflow-before-anchor', [1e308, 10.0, 1e308, 20.0], [1e10, 2.0, 1e10, 2.0],
                              [False, True, False, False]))
    return rows


class Observation:
    """What the stateful table reads from a bar, with the session flag for ``vwap``."""

    def __init__(self, row, anchor):
        self.values = {**row, 'isSessionFirst': anchor}

    def bar(self, key):
        return self.values.get(key)

    def first_bar(self):
        return False

    def make_array(self, values):
        return list(values)


def call(name, row, anchor, state):
    if name == 'pvt':
        return stateful_table()[('pvt', 0)].call(Observation(row, anchor), [], state)
    if name == 'vwap':
        return stateful_table()[('vwap', 1)].call(Observation(row, anchor), [row['close']], state)
    return stateful_table()[('vwapAnchor', 2)].call(Observation(row, anchor), [row['close'], anchor], state)


def encoded(values):
    return [None if value is None else struct.pack('>d', value).hex() for value in values]


def readings(row, name=None, forming=False):
    name = name or row['name']
    state, output = {}, []
    for index, (bar, anchor) in enumerate(zip(row['bars'], row['anchors'])):
        if forming:
            saved = copy.deepcopy(state)
            draft = {**bar, 'close': 1e308 if index % 2 else -1e308, 'volume': sys.float_info.max}
            call(name, draft, anchor, state)
            state = copy.deepcopy(saved)
        output.append(call(name, bar, anchor, state))
    return output


def named(prefix):
    return next(row for row in cases() if row['id'] == prefix)


class AnchoredTotalOverflow(unittest.TestCase):
    def test_the_specified_trend_values_are_hand_computed(self):
        # Bar 2's change overflows, so its term is absent and the total stays at
        # 1e308. Bar 3 adds ((2 + 1e308) / -1e308) * 1 = -1, and 1e308 - 1
        # rounds back to 1e308, as does adding bar 4's 0.5.
        self.assertEqual(named('pvt-change-overflow-up')['expected'], [None, 1e308, None, 1e308, 1e308])
        self.assertEqual(named('pvt-change-overflow-down')['expected'], [None, 1e308, None, 1e308, 1e308])
        self.assertEqual(named('pvt-proportion-overflow-up')['expected'], [None, 1.0, 0.0, None, 1.0, 1.5])
        self.assertEqual(named('pvt-product-overflow-up')['expected'],
                         [None, 1.0, None, 1.0 + 1.0 / 6.0, 1.0 + 1.0 / 6.0 + 1.0 / 7.0])
        self.assertEqual(named('pvt-total-overflow-up')['expected'], [None, 1e308, None, None, None])
        self.assertEqual(named('vwapAnchor-product-overflow-up')['expected'], [10.0, None, 17.5, 20.0])
        self.assertEqual(named('vwapAnchor-traded-overflow')['expected'], [1e-10, None, None, 4.0, 5.0])

    def test_an_overflowing_term_leaves_the_total_where_it_was(self):
        for row in cases():
            with self.subTest(case=row['id']):
                actual = readings(row)
                self.assertEqual(encoded(actual), encoded(row['expected']))
                self.assertTrue(all(value is None or math.isfinite(value) for value in actual))
                if 'recovery' in row['id'] or 'product-overflow' in row['id']:
                    self.assertIsNotNone(actual[-1])

    def test_each_prefix_keeps_the_same_availability_and_bits(self):
        for row in cases():
            for end in range(len(row['bars']) + 1):
                with self.subTest(case=row['id'], prefix=end):
                    part = {**row, 'bars': row['bars'][:end], 'anchors': row['anchors'][:end]}
                    self.assertEqual(encoded(readings(part)), encoded(row['expected'][:end]))

    def test_forming_checkpoint_revisions_do_not_contaminate_history(self):
        for row in cases():
            with self.subTest(case=row['id']):
                self.assertEqual(encoded(readings(row, forming=True)), encoded(row['expected']))

    def test_the_session_average_is_the_same_calculation(self):
        for row in cases():
            if row['name'] == 'vwapAnchor':
                with self.subTest(case=row['id']):
                    self.assertEqual(encoded(readings(row, name='vwap')), encoded(row['expected']))


if __name__ == '__main__':
    if sys.argv[1:] == ['--cases']:
        json.dump(cases(), sys.stdout)
    else:
        unittest.main()
