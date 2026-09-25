"""Exact hypotenuse rounding, independently checked between adjacent floats."""
import json
import math
import struct
import sys
import unittest
from fractions import Fraction
from pathlib import Path
from unittest.mock import patch

from openscript.library.elementary import hypot


def bits(value):
    return struct.unpack('>Q', struct.pack('>d', value))[0]


def from_bits(value):
    return struct.unpack('>d', struct.pack('>Q', value))[0]


def certified(x, y, actual):
    """Rational input squares and adjacent-float bounds, without square roots."""
    if x is None or y is None:
        return actual is None
    square = Fraction.from_float(x) ** 2 + Fraction.from_float(y) ** 2
    maximum = Fraction.from_float(from_bits(0x7fefffffffffffff))
    if actual is None:
        return square >= ((maximum + 2**1024) / 2) ** 2
    if actual == 0:
        return square == 0 and bits(actual) == 0
    if actual < 0 or not math.isfinite(actual):
        return False
    center = Fraction.from_float(actual)
    before = Fraction.from_float(math.nextafter(actual, 0))
    following = math.nextafter(actual, math.inf)
    after = Fraction(2**1024) if math.isinf(following) else Fraction.from_float(following)
    lower, upper = ((before + center) / 2) ** 2, ((center + after) / 2) ** 2
    even = bits(actual) % 2 == 0
    return lower < square < upper or even and square in (lower, upper)


def midpoint_pairs():
    m, n = 2**26 + 1, 2**26
    return [(float(m*m-n*n) * 2.0**exponent, float(2*m*n) * 2.0**exponent)
            for exponent in (-1074, -1022, -100, 0, 500, 970)]


def pairs():
    tiny = from_bits(1)
    edges = [0.0, -0.0, tiny, -tiny, tiny*2, from_bits(0x000fffffffffffff),
             2.0**-1022, from_bits(0x0010000000000001), 0.5, 1.0,
             from_bits(0x3ff0000000000001), 3.0, 4.0, 2.0**500, 2.0**997,
             2.0**998, from_bits(0x7fefffffffffffff), -from_bits(0x7fefffffffffffff)]
    out = [(None, 3.0), (4.0, None), (None, None), *midpoint_pairs()]
    out.extend((x, y) for x in edges for y in edges)
    seed = 0x394de179

    def random():
        nonlocal seed
        seed = (seed * 1664525 + 1013904223) & 0xffffffff
        return seed

    def value():
        return from_bits((random() % 2047) << 52 | (random() & 0xfffff) << 32 | random())

    out.extend((value(), value()) for _ in range(512))
    return out


class Hypotenuse(unittest.TestCase):
    def test_committed_vectors_are_certified_without_a_gap_exemption(self):
        path = Path(__file__).resolve().parents[2] / 'spec/vectors/library/math.hypot-2.json'
        document = json.loads(path.read_text(encoding='utf8'))
        for case in document['cases']:
            self.assertEqual(case['gaps'], [])
            for index in range(case['bars']):
                x, y = [None if column['values'][index] is None else
                        struct.unpack('>d', bytes.fromhex(column['values'][index]))[0]
                        for column in case['args']]
                expected = case['outputs'][0]['values'][index]
                actual = hypot(x, y)
                self.assertEqual(None if actual is None else struct.pack('>d', actual).hex(), expected)
                self.assertTrue(certified(x, y, actual), (case['id'], index))

    def test_outputs_have_an_independent_rational_rounding_certificate(self):
        for x, y in pairs():
            with self.subTest(x=x, y=y):
                self.assertTrue(certified(x, y, hypot(x, y)))

    def test_the_wrapper_does_not_delegate_to_host_hypot(self):
        with patch('math.hypot', side_effect=AssertionError('portable hypotenuse called host')):
            self.assertEqual(hypot(3.0, 4.0), 5.0)
            self.assertEqual(hypot(from_bits(1), from_bits(1)), from_bits(1))

    def test_constructed_midpoints_use_the_even_value(self):
        for x, y in midpoint_pairs():
            self.assertEqual(hypot(x, y), y)
            self.assertFalse(certified(x, y, from_bits(bits(y) + 1)))

    def test_adjacent_inputs_straddle_the_overflow_threshold(self):
        maximum = from_bits(0x7fefffffffffffff)
        below = from_bits(0x7e46a09e667f3bcc)
        above = from_bits(0x7e46a09e667f3bcd)
        self.assertEqual(hypot(maximum, below), maximum)
        self.assertIsNone(hypot(maximum, above))
        self.assertTrue(certified(maximum, below, maximum))
        self.assertTrue(certified(maximum, above, None))

    def test_absence_subnormals_signs_and_zero(self):
        self.assertIsNone(hypot(None, 0.0))
        self.assertIsNone(hypot(0.0, None))
        self.assertEqual(hypot(-3.0, -4.0), 5.0)
        self.assertEqual(hypot(4.0, 3.0), 5.0)
        self.assertEqual(hypot(from_bits(1), from_bits(1)), from_bits(1))
        self.assertEqual(bits(hypot(-0.0, -0.0)), 0)

    def test_the_certificate_rejects_wrong_rounding_and_intermediate_overflow(self):
        self.assertFalse(certified(from_bits(1), from_bits(1), 0.0))
        self.assertFalse(certified(1e200, 1e200, None))
        self.assertFalse(certified(3.0, 4.0, from_bits(bits(5.0) - 1)))
        self.assertFalse(certified(3.0, 4.0, from_bits(bits(5.0) + 1)))
        self.assertFalse(certified(0.0, 0.0, -0.0))


def execute_compiled():
    """Consume the exact serialized program emitted by the companion gate test."""
    from openscript.adapter.serving import Serving
    from openscript.contracts import Bar, BarState
    from openscript.run import load

    payload = json.load(sys.stdin)
    library = Serving()
    loaded = load(payload['program'], {}, library)
    if not loaded.ok:
        raise AssertionError(loaded.diagnostic)
    channel = payload['program']['outputs']['plots'][0]['channel']
    out = []
    for index, raw in enumerate(payload['bars']):
        bar = {key:None if value is None else float(value) for key, value in raw.items()}
        library.at_bar(bar, index == 0)
        executed = loaded.run.execute_bar(index, Bar(**bar), BarState(), supplied=len(payload['bars']))
        if not executed.ok:
            raise AssertionError(executed.diagnostic)
        value = executed.columns[channel]
        if not certified(bar['open'], bar['close'], value):
            raise AssertionError(f'uncertified compiled output at bar {index}')
        out.append(None if value is None else struct.pack('>d', value).hex())
    json.dump(out, sys.stdout)


if __name__ == '__main__':
    if sys.argv[1:] == ['--compiled']:
        execute_compiled()
    else:
        unittest.main()
