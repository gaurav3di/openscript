"""Portable elementary functions and their independent rounding certificates."""
import json
import math
import sys
import unittest
from unittest.mock import patch

from openscript.library import elementary
from openscript.library.composites import gaussian
from openscript.library.deviation import historical
from .transcendental_oracle import certified, decode, encode, rounded
from openscript.library.transcendental import transcendental
from openscript.library.gaussian import GaussianCache

KINDS = ('exp', 'log', 'log10', 'log2')
FUNCTIONS = {kind: getattr(elementary, kind) for kind in KINDS}


class ElementaryIntervals(unittest.TestCase):
    def test_refinement_and_bounded_immutable_cache(self):
        for kind in KINDS:
            for value in [3.0,decode('3fefffffffffffff'),decode('3ff0000000000001')]:
                self.assertTrue(certified(kind,value,transcendental(kind,value,64)))
        cache = GaussianCache()
        first = cache.get(50,0.85,6.0)
        self.assertIsInstance(first[0],tuple)
        self.assertIs(cache.get(50,0.85,6.0),first)
        for index in range(20):
            cache.get(600,0.5+index/100,4.0)
            self.assertLessEqual(len(cache.entries),8)
            self.assertLessEqual(cache.coefficients,4096)
        rebuilt = cache.get(50,0.85,6.0)
        self.assertIsNot(rebuilt,first)
        self.assertEqual(rebuilt,first)
        count,size = cache.coefficients,len(cache.entries)
        self.assertIsNotNone(cache.get(4097,0.5,6.0))
        self.assertEqual((cache.coefficients,len(cache.entries)),(count,size))

    def test_host_math_does_not_choose_the_result(self):
        for kind in KINDS:
            with patch('math.' + kind, side_effect=AssertionError('host elementary call')):
                self.assertTrue(certified(kind, 3.0, FUNCTIONS[kind](3.0)))

    def test_independent_certificates_at_boundaries_and_near_one(self):
        inputs = [None, -0.0, -1.0, 0.0, math.inf, -math.inf, math.nan, -10.0, 3.0, math.pi,
                  decode('0000000000000001'), decode('000fffffffffffff'),
                  decode('0010000000000000'), decode('3fefffffffffffff'),
                  1.0, decode('3ff0000000000001'), decode('7fefffffffffffff'),
                  709.782712893384, 709.7827128933841, -745.1332191019411, -745.1332191019412]
        for kind in KINDS:
            for value in inputs:
                with self.subTest(kind=kind, value=value):
                    actual = FUNCTIONS[kind](value)
                    self.assertTrue(certified(kind, value, actual, 100))
                    self.assertTrue(certified(kind, value, actual, 170))

    def test_certificate_rejects_a_last_bit_mutation(self):
        for kind in KINDS:
            exact = rounded(kind, 3.0)
            self.assertFalse(certified(kind, 3.0, math.nextafter(exact, math.inf)))

    def test_gaussian_domains_and_underflowed_exponent_denominator(self):
        self.assertIsNone(gaussian({}, 5.0, 1, 0.5, -1.0))

    def test_gaussian_underflowed_exponent_denominator_is_absent(self):
        self.assertIsNone(gaussian({}, 5.0, 1, 0.5, 1e308))

    def test_historical_volatility_requires_positive_prices_and_annualization(self):
        state = {}
        self.assertIsNone(historical(state, -1.0, 1, 1.0))
        self.assertIsNone(historical(state, -1.0, 1, 1.0))
        self.assertIsNone(historical(state, 1.0, 1, 1.0))
        self.assertEqual(historical(state, 2.0, 1, 1.0), 0.0)
        self.assertIsNone(historical(state, 4.0, 1, 0.0))


def certify_rows():
    rows = json.load(sys.stdin)
    failures = []
    for index, row in enumerate(rows):
        value, actual = decode(row['input']), decode(row['actual'])
        if not certified(row['kind'], value, actual, 100) or not certified(row['kind'], value, actual, 170):
            failures.append({'index': index, **row, 'expected': encode(rounded(row['kind'], value))})
    json.dump(failures, sys.stdout)


def execute_compiled():
    from openscript.adapter.serving import Serving
    from openscript.contracts import Bar, BarState
    from openscript.run import load
    payload = json.load(sys.stdin)
    library = Serving()
    loaded = load(payload['program'], {}, library)
    if not loaded.ok:
        raise AssertionError(loaded.diagnostic)
    out = []
    closes = {}
    history = []
    for delivery in payload['deliveries']:
        index = delivery['index']
        raw = {key:None if value is None else float(value) for key,value in delivery['bar'].items()}
        library.at_bar({**raw, 'previousClose': closes.get(index-1)}, index == 0)
        closes[index] = raw['close']
        if len(history) > index:
            history[index] = raw
        else:
            history.append(raw)
        result = loaded.run.execute_bar(index, Bar(**raw), BarState())
        if not result.ok:
            raise AssertionError(result.diagnostic)
        values = [result.columns[plot['channel']] for plot in payload['program']['outputs']['plots']]
        if payload.get('scalar'):
            for kind, actual in zip(KINDS, values):
                if not certified(kind, raw['close'], actual):
                    raise AssertionError((kind, index, raw['close'], actual))
        if payload.get('derived'):
            from .derived_math_oracle import gaussian as expected_gaussian, volatility, travel
            source = [one['close'] for one in history]
            expected = [expected_gaussian(source,3,0.85,6.0),volatility(source,3,252.0),travel(history,3)]
            if [encode(value) for value in expected] != [encode(value) for value in values]:
                raise AssertionError((index, expected, values))
        if payload.get('varying'):
            from .derived_math_oracle import gaussian as expected_gaussian, volatility
            source = [one['close'] for one in history]
            length = None if raw['volume'] is None else int(raw['volume'])
            maximum = max((one['volume'] or 0) for one in history)
            average = None if len(history) < maximum else expected_gaussian(source,length,raw['high'],raw['low'])
            expected = [average,volatility(source,2,raw['open'])]
            if [encode(value) for value in expected] != [encode(value) for value in values]:
                raise AssertionError((index, expected, values))
        out.append([encode(value) for value in values])
    json.dump(out, sys.stdout)


def benchmark():
    from time import perf_counter
    from openscript.adapter.serving import Serving
    from openscript.contracts import Bar, BarState
    from openscript.run import load
    payload = json.load(sys.stdin)
    times = []
    values = None
    for _ in range(4):
        library = Serving()
        loaded = load(payload['program'], {}, library)
        if not loaded.ok:
            raise AssertionError(loaded.diagnostic)
        channel = payload['program']['outputs']['plots'][0]['channel']
        result_values = []
        started = perf_counter()
        for index, raw in enumerate(payload['bars']):
            bar = {key:float(value) for key,value in raw.items()}
            library.at_bar(bar,index == 0)
            result = loaded.run.execute_bar(index,Bar(**bar),BarState())
            if not result.ok:
                raise AssertionError(result.diagnostic)
            result_values.append(result.columns[channel])
        times.append((perf_counter()-started)*1000)
        encoded = [encode(value) for value in result_values]
        if values is not None and encoded != values:
            raise AssertionError('cache history changed the compiled readings')
        values = encoded
    json.dump({'values':values,'timings':{'coldMs':times[0],'medianWarmMs':sorted(times[1:])[1]}},sys.stdout)


if __name__ == '__main__':
    if sys.argv[1:] == ['--certify']:
        certify_rows()
    elif sys.argv[1:] == ['--compiled']:
        execute_compiled()
    elif sys.argv[1:] == ['--bench']:
        benchmark()
    else:
        unittest.main()
