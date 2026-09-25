"""Named deviations stay absent after overflow and recover with fresh windows."""

import copy
import json
import math
import sys
import unittest

from openscript.library import counting, strength
from tests.test_momentum_overflow import finite, operation


class Candle:
    def __init__(self, values):
        self.values = values

    def bar(self, name):
        return self.values[name]


def cci_expected(bars, length):
    """Batch windows with each stated operation rounded from exact fractions."""
    typical = [finite(operation(operation(operation(row['high'], row['low'], '+'),
                                         row['close'], '+'), 3.0, '/')) for row in bars]
    output = []
    for index, price in enumerate(typical):
        window = typical[max(0, index + 1 - length):index + 1]
        answer = None
        if len(window) == length and all(value is not None for value in window):
            total = 0.0
            for value in window:
                total = operation(total, value, '+')
            mean = finite(operation(total, float(length), '/'))
            if mean is not None:
                total = 0.0
                for value in window:
                    total = operation(total, abs(operation(value, mean, '-')), '+')
                spread = finite(operation(total, float(length), '/'))
                if spread is not None and spread != 0:
                    answer = finite(operation(operation(price, mean, '-'),
                                              operation(0.015, spread, '*'), '/'))
        output.append(answer)
    return output


def cases():
    rows = []
    maximum = sys.float_info.max
    for length in [1, 4, 20]:
        for polarity in [1.0, -1.0]:
            pairs = [(101.0 + i, 99.0 + i) for i in range(length)]
            pairs += [(maximum, 100.0)] * max(2, length // 2)
            pairs += [(100.0, -maximum)] * max(2, length // 2)
            pairs += [(101.0 + i, 99.0 + i) for i in range(length + 3)]
            bars = [{'open': 100.0 * polarity, 'high': high * polarity,
                     'low': low * polarity, 'close': 100.0 * polarity, 'volume': 1.0}
                    for high, low in pairs]
            rows.append({'name': 'cci', 'length': length, 'bars': bars,
                         'expected': cci_expected(bars, length)})
    for polarity in [1.0, -1.0]:
        for swap in [False, True]:
            a = [polarity * value for value in [1.0, -1e308, 3.0, 4.0]]
            b = [1.0, 2.0, 3.0, 4.0]
            if swap:
                a, b = b, a
            rows.append({'name': 'correlation', 'length': 2, 'a': a, 'b': b,
                         'expected': [None, None, None, polarity]})
    return rows


def calculate(row, state, index):
    if row['name'] == 'cci':
        return strength.deviation_reading(state, Candle(row['bars'][index]), row['length'])
    return counting.correlation(state, row['a'][index], row['b'][index], row['length'])


class StatisticsOverflow(unittest.TestCase):
    def test_cci_window_deviation_overflow_is_absent_and_expires(self):
        bars = [{'open': 100.0, 'high': high, 'low': low, 'close': 100.0, 'volume': 1.0}
                for high, low in [(sys.float_info.max, 100.0)] * 2 +
                [(100.0, -sys.float_info.max)] * 2 + [(101.0, 99.0)]]
        self.assertEqual(cci_expected(bars, 4), [None] * 5)
        state = {}
        self.assertEqual([strength.deviation_reading(state, Candle(bar), 4)
                          for bar in bars], [None] * 5)

    def test_named_results_match_the_independent_windows(self):
        for row in cases():
            with self.subTest(name=row['name'], length=row['length'], expected=row['expected']):
                state = {}
                actual = [calculate(row, state, index) for index in range(len(row['expected']))]
                self.assertEqual(actual, row['expected'])
                self.assertTrue(all(value is None or math.isfinite(value) for value in actual))
                if row['length'] > 1:
                    self.assertIsNotNone(actual[-1])

    def test_checkpoint_restore_discards_forming_overflow(self):
        for row in cases():
            state, actual = {}, []
            for index in range(len(row['expected'])):
                saved = copy.deepcopy(state)
                calculate(row, state, 1)
                state = copy.deepcopy(saved)
                actual.append(calculate(row, state, index))
            self.assertEqual(actual, row['expected'])


if __name__ == '__main__':
    if sys.argv[1:] == ['--cases']:
        json.dump(cases(), sys.stdout)
    else:
        unittest.main()
