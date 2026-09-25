"""The scalar wrappers must obey the real-result rounding and zero contracts."""
import math
import json
import struct
import sys
import unittest
from fractions import Fraction
from unittest.mock import patch

from openscript.library import elementary
from openscript.library.trigonometric import trigonometric
from .trigonometric_oracle import certified, certify_cell, decode, expected


def encoded(value):
    return None if value is None else struct.pack('>d',value).hex()


class TrigonometricRounding(unittest.TestCase):
    def test_fresh_constant_cache_clamps_undersized_refinement_starts(self):
        with patch('openscript.library.trigonometric._PI',(0,(0,0))):
            self.assertEqual(trigonometric('asin',1.0,start=0),math.pi/2)
            self.assertEqual(trigonometric('atan2',1.0,0.0,-100),math.pi/2)

    def test_oracle_rounding_cells_enforce_midpoint_parity_and_normalized_zero(self):
        half=Fraction(1,1 << 1075)
        self.assertTrue(certify_cell(half,half,'0000000000000000'))
        self.assertFalse(certify_cell(half,half,'0000000000000001'))
        midpoint=3*half
        self.assertFalse(certify_cell(midpoint,midpoint,'0000000000000001'))
        self.assertTrue(certify_cell(midpoint,midpoint,'0000000000000002'))
        self.assertTrue(certify_cell(-half,half,'0000000000000000'))
        normal=Fraction(1)+Fraction(1,1 << 53)
        self.assertTrue(certify_cell(normal,normal,'3ff0000000000000'))
        self.assertFalse(certify_cell(normal,normal,'3ff0000000000001'))

    def test_independent_directed_certificates_at_domain_edges_and_large_angles(self):
        values=[None,-0.0,0.0,-1.0,1.0,0.125,0.5,2.0,4.0,math.inf,-math.inf,math.nan,
                math.ulp(0.0),-math.ulp(0.0),decode('7fefffffffffffff'),decode('ffefffffffffffff'),
                decode('3fefffffffffffff'),decode('bfefffffffffffff'),
                decode('3ff0000000000001'),decode('4180000000000000'),decode('44f0000000000000')]
        for kind in ('sin','cos','tan','asin','acos','atan'):
            for value in values:
                with self.subTest(kind=kind,value=value):
                    actual=getattr(elementary,kind)(value)
                    self.assertTrue(certified(kind,value,None,actual))
                    if value is not None:
                        self.assertEqual(encoded(trigonometric(kind,value,start=64)),encoded(actual))

    def test_refinement_matches_exact_ratio_certificates_and_rejects_neighbor(self):
        minimum=math.ulp(0.0)
        for y,x in [(3*minimum,2.0),(-3*minimum,2.0),(5*minimum,2.0),
                    (minimum,decode('7fefffffffffffff')),(1.0,-1.0),(-1.0,-1.0)]:
            wanted=expected('atan2',y,x)
            self.assertTrue(certified('atan2',y,x,trigonometric('atan2',y,x,64)))
            self.assertFalse(certified('atan2',y,x,math.nextafter(wanted,math.inf)))
        for kind in ('sin','cos','tan','asin','acos','atan'):
            wanted=expected(kind,0.5)
            self.assertFalse(certified(kind,0.5,None,math.nextafter(wanted,math.inf)))

    def test_subnormal_midpoint_keeps_the_cubic_correction(self):
        minimum=math.ulp(0.0)
        self.assertEqual(encoded(elementary.atan2(3*minimum,2.0)),'0000000000000001')
        self.assertEqual(encoded(elementary.atan2(-3*minimum,2.0)),'8000000000000001')

    def test_zero_signs_are_normalized_before_quadrant_selection(self):
        for zero in (0.0,-0.0):
            self.assertEqual(encoded(elementary.atan2(zero,-1.0)),'400921fb54442d18')
            for other in (0.0,-0.0,1.0):
                self.assertEqual(encoded(elementary.atan2(zero,other)),'0000000000000000')
            self.assertEqual(encoded(elementary.atan2(1.0,zero)),'3ff921fb54442d18')
            self.assertEqual(encoded(elementary.atan2(-1.0,zero)),'bff921fb54442d18')

    def test_no_host_approximation_selects_the_output(self):
        for kind in ('sin','cos','tan','asin','acos','atan','atan2'):
            with self.subTest(kind=kind):
                with patch('math.'+kind,side_effect=AssertionError('host trigonometric call')):
                    function=getattr(elementary,kind)
                    actual=function(0.5,1.0) if kind=='atan2' else function(0.5)
                    self.assertIsInstance(actual,float)


def certify_rows():
    failures=[]
    for index,row in enumerate(json.load(sys.stdin)):
        first,second,actual=decode(row['first']),decode(row.get('second')),decode(row['actual'])
        if not certified(row['kind'],first,second,actual):
            failures.append({'index':index,**row,'expected':encoded(expected(row['kind'],first,second))})
    json.dump(failures,sys.stdout)


def execute_compiled():
    from openscript.adapter.serving import Serving
    from openscript.contracts import Bar, BarState
    from openscript.run import load
    payload=json.load(sys.stdin)
    library=Serving()
    loaded=load(payload['program'],{},library)
    if not loaded.ok:
        raise AssertionError(loaded.diagnostic)
    out=[]
    history=[]
    for delivery in payload['deliveries']:
        index=delivery['index']
        raw={key:None if value is None else float(value) for key,value in delivery['bar'].items()}
        library.at_bar(raw,index==0)
        result=loaded.run.execute_bar(index,Bar(**raw),BarState())
        if not result.ok:
            raise AssertionError(result.diagnostic)
        values=[result.columns[plot['channel']] for plot in payload['program']['outputs']['plots']]
        if payload.get('certify'):
            for kind,actual in zip(('sin','cos','tan','asin','acos','atan','atan2'),values):
                second=raw['open'] if kind=='atan2' else None
                if not certified(kind,raw['close'],second,actual):
                    raise AssertionError((kind,index,raw['close'],second,actual))
        if payload.get('history'):
            current=expected('atan2',raw['close'],raw['open'])
            if len(history)>index:
                history[index]=current
            else:
                history.append(current)
            wanted=[current,history[index-1] if index else None,history[0]]
            if list(map(encoded,values))!=list(map(encoded,wanted)):
                raise AssertionError((index,values,wanted))
        out.append([encoded(value) for value in values])
    json.dump(out,sys.stdout)


if __name__=='__main__':
    if sys.argv[1:]==['--certify']:
        certify_rows()
    elif sys.argv[1:]==['--compiled']:
        execute_compiled()
    else:
        unittest.main()
