import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pow } from '../../src/core/stdlib/index.js';
import { fromBits } from './hypot-cases.js';
import { encode } from './transcendental-cases.js';
import { power } from '../../src/core/stdlib/maths/power.js';
import { exponentialEndpoint } from '../../src/core/stdlib/maths/transcendental.js';
import { decode, powerCases } from './power-cases.js';

test('power rounds the real result near one and retains an unrounded logarithm', () => {
  const belowOne = fromBits(0x3fefffffffffffffn);
  assert.equal(pow(belowOne, 0.5), belowOne);
  assert.equal(pow(belowOne, -1), 1 + Number.EPSILON);
  assert.equal(encode(pow(Number.MIN_VALUE, 0.25)), '2f26a09e667f3bcd');
});

test('power wrappers do not delegate to host power, logarithm or exponential', () => {
  const saved = {pow:Math.pow, log:Math.log, exp:Math.exp};
  Math.pow = Math.log = Math.exp = () => assert.fail('host elementary call');
  try { assert.equal(encode(pow(2, 0.5)), '3ff6a09e667f3bcd'); }
  finally { Object.assign(Math, saved); }
});

test('power checks finite arguments before identities and normalizes every zero', () => {
  for (const absent of [null, NaN, Infinity, -Infinity]) {
    assert.equal(pow(absent, 0), null);
    assert.equal(pow(1, absent), null);
  }
  for (const [x,y,wanted] of [[0,0,1],[-2,3,-8],[-2,-3,-0.125],[-2,0.5,null],
    [0,-1,null],[2,1024,null],[-0,3,0],[-2,-1075,0],[2,-1074,Number.MIN_VALUE]] as const) {
    assert.equal(encode(pow(x,y)), encode(wanted));
  }
});

test('power satisfies independent rational, algebraic and directed decimal certificates', () => {
  const cases=powerCases();
  assert.equal(cases.filter(row=>row.kind==='rational').length,14467);
  assert.equal(cases.filter(row=>row.midpoint).length,163);
  assert.equal(cases.filter(row=>row.kind==='algebraic').length,360);
  for (const row of cases) {
    const x=decode(row.x), y=decode(row.y);
    assert.equal(encode(pow(x,y)),row.expected,JSON.stringify(row));
    if (x!==null && y!==null) assert.equal(encode(power(x,y,64)),row.expected,JSON.stringify(row));
  }
});

test('undersized exponential enclosures request refinement instead of using an invalid tail bound', () => {
  assert.equal(exponentialEndpoint(8n,2),undefined);
  assert.equal(encode(power(2,0.5,2)),'3ff6a09e667f3bcd');
});
