"""Money-flow named results must become absent before windows and ratios use them."""

import copy
from fractions import Fraction
import json
import math
import sys
import unittest

from openscript.library import stateful_table
from tests.test_series_rules import Bar


def operation(left, right, kind):
    """Independent binary64 rounding from exact rational operands."""
    if math.isfinite(left) and math.isfinite(right):
        left, right = Fraction(left), Fraction(right)
    if kind == '+':
        value = left + right
    elif kind == '*':
        value = left * right
    elif kind == '-':
        value = left - right
    else:
        value = left / right
    try:
        return float(value)
    except OverflowError:
        return -math.inf if value < 0 else math.inf


def finite(value):
    return value if value is not None and math.isfinite(value) else None


def expected(bars, length):
    """Batch formula with independently indexed chronological windows."""
    typical, upward, downward, values = [], [], [], []
    for index, bar in enumerate(bars):
        parts = [bar[name] for name in ['high', 'low', 'close']]
        price = None if None in parts else finite(operation(operation(
            operation(parts[0], parts[1], '+'), parts[2], '+'), 3.0, '/'))
        typical.append(price)
        before = typical[index - 1] if index else None
        up, down = None, None
        if price is not None and before is not None and bar['volume'] is not None:
            flow = finite(operation(price, bar['volume'], '*'))
            up = flow if price > before else 0.0
            down = flow if price < before else 0.0
        upward.append(up)
        downward.append(down)
        totals = []
        for column in [upward, downward]:
            selected = column[max(0, index - length + 1):index + 1]
            if len(selected) != length or None in selected:
                totals.append(None)
                continue
            total = 0.0
            for term in selected:
                total = operation(total, term, '+')
            totals.append(finite(total))
        rise, fall = totals
        if rise is None or fall is None:
            values.append(None)
        elif fall == 0:
            values.append(100.0)
        else:
            divisor = operation(1.0, operation(rise, fall, '/'), '+')
            values.append(None if divisor == 0 else finite(operation(
                100.0, operation(100.0, divisor, '/'), '-')))
    return values


def make_bars(prices, volumes):
    return [dict(high=None if price is None else price + 1.0,
                 low=None if price is None else price - 1.0,
                 close=price, volume=volume)
            for price, volume in zip(prices, volumes)]


def cases():
    fixtures = [
        ('up-product', [100., 101., 100., 101., 100., 102.], [1., 1e308, 1., 1., 1., 1.]),
        ('down-product', [102., 101., 102., 101., 102., 100.], [1., 1e308, 1., 1., 1., 1.]),
        ('up-total', [1., 2., 3., 2., 4., 5.], [1., 5e307, 4e307, 1., 1., 1.]),
        ('down-total', [3., 2., 1., 2., 3., 4.], [1., 5e307, 1e308, 1., 1., 1.]),
        ('flat-product', [100., 100., 100., 101., 102., 103.], [1e308] * 3 + [1.] * 3),
        ('gaps', [100., 101., None, 100., 101., 102.], [1., None, 1., 1., 1., 1.]),
        ('subnormal', [1., 2., 1., 2., 1., 2.], [float.fromhex('0x0.0000000000001p-1022')] * 6),
    ]
    rows = []
    for name, prices, volumes in fixtures:
        for length in [1, 2, 14]:
            bars = make_bars(prices, volumes)
            bars += make_bars([100. + index % 3 for index in range(48)], [1.] * 48)
            rows.append(dict(id=f'{name}:{length}', length=length, bars=bars,
                             expected=expected(bars, length)))
    return rows


def run(bars, length, forming=False):
    entry = stateful_table()[('mfi', 1)]
    state, values = {}, []
    for index, bar in enumerate(bars):
        if forming:
            checkpoint = copy.deepcopy(state)
            entry.call(Bar(high=201., low=199., close=200., volume=1e308), [float(length)], state)
            state = copy.deepcopy(checkpoint)
        values.append(entry.call(Bar(**bar), [float(length)], state))
    return values


class MoneyFlowEdges(unittest.TestCase):
    def test_overflowed_up_flow_is_absent_even_when_down_total_is_zero(self):
        bars = make_bars([100., 101., 102., 103., 104.], [1., 1e308, 1., 1., 1.])
        self.assertEqual(expected(bars, 2), [None, None, None, 100., 100.])
        self.assertEqual(run(bars, 2), [None, None, None, 100., 100.])

    def test_finite_terms_with_an_overflowing_total_are_absent_then_recover(self):
        bars = make_bars([1., 2., 3., 4., 5.], [1., 5e307, 4e307, 1., 1.])
        self.assertEqual(expected(bars, 2), [None, None, None, 100., 100.])
        self.assertEqual(run(bars, 2), [None, None, None, 100., 100.])

    def test_ordinary_ratios_and_flat_overflow_keep_the_declared_results(self):
        bars = make_bars([1., 2., 1., 1.], [1., 1., 2., 1e308])
        self.assertEqual(run(bars, 2), [None, None, 50., 0.])
        flat = make_bars([2., 2., 2.], [1e308] * 3)
        self.assertEqual(run(flat, 2), [None, None, 100.])

    def test_isolated_products_sums_holes_and_subnormals_match_independent_oracle(self):
        for row in cases():
            with self.subTest(case=row['id']):
                self.assertEqual(run(row['bars'], row['length']), row['expected'])
                self.assertIsNotNone(row['expected'][-1])

    def test_rejected_forming_flow_does_not_survive_checkpoint_restoration(self):
        for row in cases():
            with self.subTest(case=row['id']):
                self.assertEqual(run(row['bars'], row['length'], True), row['expected'])


if __name__ == '__main__':
    if sys.argv[1:] == ['--cases']:
        json.dump(cases(), sys.stdout, allow_nan=False)
    else:
        unittest.main()
