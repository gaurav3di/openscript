"""Overflowing changes are holes before smoothing, not infinite recurrence inputs."""

import copy
from fractions import Fraction
import json
import math
import struct
import sys
import unittest

from openscript.library import momentum, strength


def rounded(value):
    try:
        return float(value)
    except OverflowError:
        return -math.inf if value < 0 else math.inf


def operation(a, b, kind):
    """Round each specified operation from exact binary64 rational operands."""
    if math.isfinite(a) and math.isfinite(b):
        a, b = Fraction(a), Fraction(b)
    if kind == '+':
        return rounded(a + b)
    if kind == '-':
        return rounded(a - b)
    if kind == '*':
        return rounded(a * b)
    return rounded(a / b)


def finite(value):
    return value if value is not None and math.isfinite(value) else None


def average(values, length, smooth=False):
    """Independent batch recipe, retaining chronological seed windows and holes."""
    result, running = [], None
    weight = operation(2.0, float(length + 1), '/')
    rest = operation(1.0, weight, '-')
    for index, value in enumerate(values):
        if running is None:
            window = values[max(0, index - length + 1):index + 1]
            if len(window) == length and all(item is not None for item in window):
                total = 0.0
                for item in window:
                    total = operation(total, item, '+')
                running = finite(operation(total, float(length), '/'))
        elif value is not None:
            if smooth:
                running = operation(operation(operation(running, float(length - 1), '*'), value, '+'), float(length), '/')
            else:
                running = operation(operation(value, weight, '*'), operation(running, rest, '*'), '+')
        result.append(None if value is None else finite(running))
    return result


def expected(name, source, lengths):
    delta = [None] + [None if a is None or b is None else finite(operation(b, a, '-'))
                      for a, b in zip(source, source[1:])]
    if name == 'tsi':
        top = average(average(delta, lengths[0]), lengths[1])
        bottom = average(average([None if v is None else abs(v) for v in delta], lengths[0]), lengths[1])
        return [None if a is None or b is None or b == 0 else finite(operation(operation(100.0, a, '*'), b, '/'))
                for a, b in zip(top, bottom)]
    up = [None if v is None else max(v, 0.0) for v in delta]
    down = [None if v is None else max(-v, 0.0) for v in delta]
    if name == 'rsi':
        up, down = average(up, lengths[0], True), average(down, lengths[0], True)
        return [None if a is None or b is None else 100.0 if b == 0 else
                finite(operation(100.0, operation(100.0, operation(1.0, operation(a, b, '/'), '+'), '/'), '-'))
                for a, b in zip(up, down)]
    # CMO fixtures use length one, so the two window sums are the changes.
    return [None if a is None or b is None or a + b == 0 else
            finite(operation(operation(100.0, operation(a, b, '-'), '*'), operation(a, b, '+'), '/'))
            for a, b in zip(up, down)]


def cases():
    rows = []
    for sign in [1.0, -1.0]:
        source = [sign * value for value in [1.0, -1e308, 1e308, 1.0, 2.0]]
        for name, lengths in [('tsi', [1, 1]), ('rsi', [1]), ('cmo', [1])]:
            rows.append({'name': name, 'lengths': lengths, 'source': source,
                         'expected': expected(name, source, lengths)})
    source = list(map(float, range(64))) + [-1e308, 1e308, None] + list(map(float, range(1, 97)))
    for name, lengths in [('tsi', [25, 13]), ('rsi', [14])]:
        rows.append({'name': name, 'lengths': lengths, 'source': source,
                     'expected': expected(name, source, lengths)})
    return rows


FUNCTIONS = {'tsi': momentum.double_smoothed, 'rsi': strength.strength, 'cmo': strength.change_ratio}


class MomentumOverflow(unittest.TestCase):
    def test_minimal_oracle_has_hand_computed_recovery(self):
        rows = cases()
        self.assertEqual(rows[0]['expected'], [None, None, None, None, 100.0])
        self.assertEqual(rows[1]['expected'], [None, 0.0, None, 0.0, 100.0])
        self.assertEqual(rows[3]['expected'], [None, None, None, None, -100.0])

    def test_changes_are_normalized_before_they_enter_state(self):
        for row in cases():
            with self.subTest(name=row['name'], lengths=row['lengths'], first=row['source'][0]):
                state = {}
                actual = [FUNCTIONS[row['name']](state, value, *row['lengths']) for value in row['source']]
                self.assertEqual(actual, row['expected'])
                self.assertIsNotNone(actual[-1])

    def test_overflowing_forming_values_do_not_survive_checkpoint_restore(self):
        for row in cases():
            state, actual = {}, []
            call = FUNCTIONS[row['name']]
            for index, value in enumerate(row['source']):
                saved = copy.deepcopy(state)
                call(state, 1e308 if index % 2 else -1e308, *row['lengths'])
                state = copy.deepcopy(saved)
                actual.append(call(state, value, *row['lengths']))
            self.assertEqual(actual, row['expected'])

    def test_neighboring_changes_and_rates_recover(self):
        source = [1.0, -1e308, 1e308, 1.0, 2.0]
        for call, wanted in [(momentum.distance, [None, -1e308, None, -1e308, 1.0]),
                             (momentum.rate, [None, None, None, None, 100.0]),
                             (momentum.smoothed_rate, [None, None, None, None, 100.0])]:
            state = {}
            self.assertEqual([call(state, value, 1) for value in source], wanted)

    def test_ultimate_range_overflow_is_absent_before_the_ratio(self):
        class Bar:
            def __init__(self, close):
                self.close = close

            def bar(self, _fact):
                return self.close

        state = {}
        actual = [momentum.blended(state, Bar(close), 1, 1, 1) for close in [1e308, -1e308, 1.0, 2.0]]
        self.assertEqual(actual, [None, None, 100.0, 100.0])

    def test_ultimate_window_sum_overflow_is_absent_and_expires(self):
        class Bar:
            def __init__(self, high):
                self.high = high

            def bar(self, fact):
                return self.high if fact == 'high' else 0.0

        state = {}
        actual = [momentum.blended(state, Bar(high), 2, 2, 2) for high in [1e308, 1e308, 1e308, 1.0, 1.0]]
        self.assertEqual(actual, [None, None, None, 0.0, 0.0])


def execute_compiled():
    from openscript.adapter.serving import Serving
    from openscript.contracts import Bar, BarState
    from openscript.run import load
    from openscript.values import ABSENT
    payload = json.load(sys.stdin)
    library = Serving()
    loaded = load(payload['program'], {}, library)
    if not loaded.ok:
        raise AssertionError(loaded.diagnostic)
    output = []
    for delivery in payload['deliveries']:
        index = delivery['index']
        raw = {key: None if value is None else float(value) for key, value in delivery['bar'].items()}
        library.at_bar(raw, index == 0)
        actual = loaded.run.execute_bar(index, Bar(**raw), BarState())
        if not actual.ok:
            raise AssertionError(actual.diagnostic)
        values = [actual.columns[plot['channel']] for plot in payload['program']['outputs']['plots']]
        output.append([None if value is ABSENT or value is None else struct.pack('>d', value).hex() for value in values])
    json.dump(output, sys.stdout)


if __name__ == '__main__':
    if sys.argv[1:] == ['--cases']:
        json.dump(cases(), sys.stdout)
    elif sys.argv[1:] == ['--compiled']:
        execute_compiled()
    else:
        unittest.main()
