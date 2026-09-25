"""Selected directional overflow is an absent observation before smoothing."""

import copy
import json
import math
import struct
import sys
import unittest

from openscript.library import stateful_table
from tests.test_momentum_overflow import average, finite, operation


def expected(rows, di_length, adx_length):
    """Batch operation oracle, independent of directional state and dispatch."""
    rises, falls, ranges = [], [], []
    for index, bar in enumerate(rows):
        before = rows[index - 1] if index else {}
        high, low = bar['high'], bar['low']
        old_high, old_low, old_close = (before.get(key) for key in ['high', 'low', 'close'])
        up = down = width = None
        if all(value is not None for value in [high, low, old_high, old_low]):
            rise = operation(high, old_high, '-')
            fall = operation(old_low, low, '-')
            up = finite(rise) if rise > fall and rise > 0 else 0.0
            down = finite(fall) if fall > rise and fall > 0 else 0.0
        if all(value is not None for value in [high, low, old_close]):
            width = finite(max(operation(high, low, '-'), abs(operation(high, old_close, '-')),
                               abs(operation(low, old_close, '-'))))
        rises.append(up)
        falls.append(down)
        ranges.append(width)
    rises = average(rises, di_length, True)
    falls = average(falls, di_length, True)
    ranges = average(ranges, di_length, True)
    plus, minus, spreads = [], [], []
    for up, down, width in zip(rises, falls, ranges):
        plus.append(None if up is None or width in [None, 0] else
                    finite(operation(operation(up, width, '/'), 100.0, '*')))
        minus.append(None if down is None or width in [None, 0] else
                     finite(operation(operation(down, width, '/'), 100.0, '*')))
        a, b = plus[-1], minus[-1]
        if a is None or b is None:
            spreads.append(None)
        else:
            total = operation(a, b, '+')
            spreads.append(0.0 if total == 0 else finite(operation(
                operation(abs(operation(a, b, '-')), total, '/'), 100.0, '*')))
    return [list(row) for row in zip(average(spreads, adx_length, True), plus, minus)]


def bars(rows):
    return [dict(time=1700000000000 + index * 60000, open=close, high=high,
                 low=low, close=close, volume=100.0)
            for index, (high, low, close) in enumerate(rows)]


def cases():
    minimal = [(-1e308, -1e308, -1e308)] * 2 + [(1e308, 1e308, 1e308),
                (1e308, 5e307, 1e308), (1e308, 5e307, 1e308)]
    long = [minimal[0]] * 40 + minimal[2:4] + [(41.0 + i, 39.0 + i, 40.0 + i) for i in range(40)]
    rows = []
    for sign in [1, -1]:
        for label, source, length in [('overflow', minimal, 1), ('seeded-overflow', long, 14)]:
            source = source if sign == 1 else [(-low, -high, -close) for high, low, close in source]
            rows.append(dict(id=f'{label}-{sign}', bars=bars(source), lengths=[length, length]))
    competing = [(-1e308, -1.5e308, -1e308)] * 3 + [(1e308, -1.6e308, 0.),
                 (1e308, 5e307, 1e308), (1e308, 5e307, 1e308)]
    for sign in [1, -1]:
        for label, source, length in [('leading-overflow', minimal[1:], 1), ('competing-overflow', competing, 2)]:
            source = source if sign == 1 else [(-low, -high, -close) for high, low, close in source]
            rows.append(dict(id=f'{label}-{sign}', bars=bars(source), lengths=[length, length]))
    rows.append(dict(id='positive-movement-tie', bars=bars([(10., 8., 9.), (11., 7., 9.),
                     (12., 6., 9.), (14., 7., 12.), (13., 5., 8.)]), lengths=[1, 2]))
    ramp = [(41.0 + i, 39.0 + i, 40.0 + i) for i in range(9)]
    for field in ['high', 'low', 'close', 'open']:
        source = bars(ramp)
        source[6][field] = None
        rows.append(dict(id=f'missing-{field}', bars=source, lengths=[3, 3]))
    rows.append(dict(id='zero-range', bars=bars([(10., 0., 5.), (11., 1., 6.), (10., 2., 6.),
                     (6., 6., 6.), (12., 6., 9.), (11., 5., 8.)]), lengths=[1, 2]))
    rows.append(dict(id='reversal', bars=bars([(10., 8., 9.), (12., 9., 11.), (11., 7., 8.),
                     (13., 9., 12.), (12., 10., 11.)]), lengths=[2, 2]))
    rows.append(dict(id='flat', bars=bars([(10., 10., 10.)] * 8), lengths=[2, 2]))
    for row in rows:
        row['expected'] = expected(row['bars'], *row['lengths'])
    return rows


class Observation:
    def __init__(self, row, previous, index):
        self.values = {**row, 'previousClose': previous}
        self.index = index

    def bar(self, key):
        return self.values.get(key)

    def first_bar(self):
        return self.index == 0

    def make_array(self, values):
        return list(values)


def encoded(rows):
    return [[None if value is None else struct.pack('>d', value).hex() for value in row] for row in rows]


def readings(row, forming=False):
    entry = stateful_table()[('adx', 2)]
    state, output = {}, []
    for index, bar in enumerate(row['bars']):
        previous = row['bars'][index - 1]['close'] if index else None
        ctx = Observation(bar, previous, index)
        if forming:
            saved = copy.deepcopy(state)
            draft = {**bar, 'high': 1e308, 'low': -1e308, 'close': 0.0}
            entry.call(Observation(draft, previous, index), row['lengths'], state)
            state = copy.deepcopy(saved)
        output.append(entry.call(ctx, row['lengths'], state))
    return output


class DirectionalRecovery(unittest.TestCase):
    def test_minimal_oracle_has_hand_computed_recovery(self):
        upward = cases()[0]
        self.assertEqual(upward['expected'], [[None] * 3] * 3 + [[100., 0., 100.], [0., 0., 0.]])
        downward = cases()[2]
        self.assertEqual(downward['expected'], [[None] * 3] * 3 + [[100., 100., 0.], [0., 0., 0.]])

    def test_selected_overflow_never_poisoned_the_smoothed_state(self):
        for row in cases():
            with self.subTest(case=row['id']):
                self.assertEqual(encoded(readings(row)), encoded(row['expected']))
                if row['id'].startswith('seeded-overflow'):
                    self.assertTrue(all(value is not None and math.isfinite(value) for value in row['expected'][-1]))

    def test_each_prefix_keeps_the_same_availability_and_bits(self):
        for row in cases():
            for end in range(len(row['bars']) + 1):
                with self.subTest(case=row['id'], prefix=end):
                    self.assertEqual(encoded(readings({**row, 'bars': row['bars'][:end]})), encoded(row['expected'][:end]))

    def test_forming_checkpoint_revisions_do_not_contaminate_history(self):
        for row in cases():
            with self.subTest(case=row['id']):
                self.assertEqual(encoded(readings(row, forming=True)), encoded(row['expected']))


def compiled():
    from openscript.adapter.serving import Serving
    from openscript.contracts import Bar, BarState
    from openscript.run import load
    from openscript.values import ABSENT
    payload = json.load(sys.stdin)
    library = Serving()
    loaded = load(payload['program'], {}, library)
    if not loaded.ok:
        raise AssertionError(loaded.diagnostic)
    accepted, output = {}, []
    for delivery in payload['deliveries']:
        index = delivery['index']
        raw = {key: None if value is None else float(value) for key, value in delivery['bar'].items()}
        library.at_bar({**raw, 'previousClose': accepted.get(index - 1, {}).get('close')}, index == 0)
        actual = loaded.run.execute_bar(index, Bar(**raw), BarState())
        if not actual.ok:
            raise AssertionError(actual.diagnostic)
        values = [actual.columns[plot['channel']] for plot in payload['program']['outputs']['plots']]
        output.append([None if value is ABSENT else struct.pack('>d', value).hex() for value in values])
        accepted[index] = raw
    json.dump(output, sys.stdout)


if __name__ == '__main__':
    if sys.argv[1:] == ['--cases']:
        json.dump(cases(), sys.stdout)
    elif sys.argv[1:] == ['--compiled']:
        compiled()
    else:
        unittest.main()
