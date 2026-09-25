"""Portable power with independently checked rational and decimal results."""
import math
import json
import sys
import unittest
from fractions import Fraction
from unittest.mock import patch
from openscript.library.elementary import power
from .transcendental_oracle import decode, encode
from .power_oracle import certify, decimal_bounds, oracle, round_fraction, rounding_cell_contains
from .power_cases import algebraic_cases, certify_algebraic, general_cases, rational_expected
from openscript.library.power import power as kernel
from openscript.library.transcendental import exp_endpoint


class Power(unittest.TestCase):
    def test_small_enclosures_request_refinement(self):
        self.assertIsNone(exp_endpoint(8,2))
        self.assertEqual(encode(kernel(2.0,0.5,2)),'3ff6a09e667f3bcd')

    def test_rounding_near_one_and_unrounded_logarithm(self):
        below_one = math.nextafter(1.0, 0.0)
        self.assertEqual(power(below_one, 0.5), below_one)
        self.assertEqual(power(below_one, -1.0), math.nextafter(1.0, math.inf))
        self.assertEqual(encode(power(decode('0000000000000001'), 0.25)), '2f26a09e667f3bcd')

    def test_no_host_elementary_calls(self):
        with patch('math.pow', side_effect=AssertionError('host power call')), \
             patch('math.log', side_effect=AssertionError('host logarithm call')), \
             patch('math.exp', side_effect=AssertionError('host exponential call')):
            self.assertEqual(encode(power(2.0, 0.5)), '3ff6a09e667f3bcd')

    def test_finite_arguments_precede_identities_and_zeros_are_normalized(self):
        for absent in [None, math.nan, math.inf, -math.inf]:
            self.assertIsNone(power(absent, 0.0))
            self.assertIsNone(power(1.0, absent))
        for x, y, wanted in [(0.,0.,1.),(-2.,3.,-8.),(-2.,-3.,-0.125),(-2.,0.5,None),
                             (0.,-1.,None),(2.,1024.,None),(-0.,3.,0.),(-2.,-1075.,0.)]:
            self.assertEqual(encode(power(x,y)), encode(wanted))

    def test_exact_rational_cases_and_every_constructed_midpoint(self):
        count = ties = 0
        for x,y,expected,tie in rational_expected():
            self.assertEqual(encode(power(x,y)), encode(expected), (x,y))
            self.assertEqual(encode(kernel(x,y,64)), encode(expected), (x,y))
            count += 1
            ties += tie
        self.assertEqual((count,ties),(14467,163))

    def test_algebraic_cases_have_exact_inequality_certificates(self):
        for x,y,target,degree in algebraic_cases():
            actual = power(x,y)
            self.assertTrue(certify_algebraic(target,degree,actual), (x,y,actual))
            self.assertEqual(encode(kernel(x,y,64)), encode(actual))
            for precision in [30,100,200]:
                lo,hi = decimal_bounds(x,y,precision)
                self.assertLessEqual(lo**degree,target)
                self.assertTrue(hi is None or target <= hi**degree)

    def test_general_outputs_have_directed_decimal_certificates(self):
        for x,y in general_cases():
            expected,_ = certify(x,y)
            self.assertEqual(encode(power(x,y)), encode(expected), (x,y))
            if x is not None and y is not None:
                self.assertEqual(encode(kernel(x,y,64)), encode(expected), (x,y))

    def test_certificates_reject_wrong_ties_and_rounded_log_composition(self):
        midpoint = Fraction(1) + Fraction(2)**-53
        self.assertTrue(rounding_cell_contains(midpoint,midpoint,1.0))
        self.assertFalse(rounding_cell_contains(midpoint,midpoint,math.nextafter(1,math.inf)))
        tiny = Fraction(2)**-1075
        self.assertEqual(round_fraction(tiny),0.0)
        self.assertFalse(rounding_cell_contains(tiny,tiny,float.fromhex('0x1p-1074')))
        overflow = Fraction(2)**1024 - Fraction(2)**970
        self.assertIsNone(round_fraction(overflow))
        self.assertFalse(rounding_cell_contains(overflow,overflow,float.fromhex('0x1.fffffffffffffp1023')))
        x,y = float.fromhex('0x1p-1074'),0.25
        lo,hi = decimal_bounds(x,y,100)
        self.assertFalse(rounding_cell_contains(lo,hi,math.exp(y*math.log(x))))
        self.assertEqual(oracle(2.0,0.5,8),'refine')
        self.assertEqual(oracle(2.0,0.5,80),math.sqrt(2))


def certificate_rows():
    """A shared corpus generated from independent proofs, never runtime outputs."""
    rows = []
    for x,y,expected,tie in rational_expected():
        rows.append({'x':encode(x),'y':encode(y),'expected':encode(expected),'kind':'rational','midpoint':tie})
    for x,y,target,degree in algebraic_cases():
        expected,_ = certify(x,y)
        if not certify_algebraic(target,degree,expected):
            raise AssertionError('Decimal candidate failed exact algebraic certificate')
        rows.append({'x':encode(x),'y':encode(y),'expected':encode(expected),'kind':'algebraic'})
    for x,y in general_cases():
        expected,_ = certify(x,y)
        rows.append({'x':encode(x),'y':encode(y),'expected':encode(expected),'kind':'general'})
    return rows


def execute_compiled():
    from openscript.adapter.serving import Serving
    from openscript.contracts import Bar, BarState
    from openscript.run import load
    payload = json.load(sys.stdin)
    library = Serving()
    loaded = load(payload['program'],{},library)
    if not loaded.ok:
        raise AssertionError(loaded.diagnostic)
    out, history = [], []
    for delivery in payload['deliveries']:
        index = delivery['index']
        raw = {key:None if value is None else float(value) for key,value in delivery['bar'].items()}
        library.at_bar(raw,index == 0)
        actual = loaded.run.execute_bar(index,Bar(**raw),BarState())
        if not actual.ok:
            raise AssertionError(actual.diagnostic)
        expected,_ = certify(raw['open'],raw['close'])
        if len(history) > index:
            history[index] = expected
        else:
            history.append(expected)
        wanted = [expected,history[index-1] if index else None]
        values = [actual.columns[plot['channel']] for plot in payload['program']['outputs']['plots']]
        if list(map(encode,values)) != list(map(encode,wanted)):
            raise AssertionError((index,values,wanted))
        out.append(list(map(encode,values)))
    json.dump(out,sys.stdout)


if __name__ == '__main__':
    if sys.argv[1:] == ['--cases']:
        json.dump(certificate_rows(),sys.stdout)
    elif sys.argv[1:] == ['--compiled']:
        execute_compiled()
    else:
        unittest.main()
