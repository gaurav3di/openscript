import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import * as lib from '../../src/core/stdlib/index.js';
import { encode, inputs, kinds } from './transcendental-cases.js';
import { transcendental } from '../../src/core/stdlib/maths/transcendental.js';
import { GaussianCache } from '../../src/core/stdlib/averages/gaussian.js';

test('elementary outputs satisfy independent decimal and rational rounding certificates', () => {
  const rows = kinds.flatMap(kind => inputs().map(input => ({kind,input:encode(input),actual:encode(lib[kind](input) as number | null)})));
  const python = spawnSync('python', ['-m', 'tests.test_transcendental', '--certify'], {
    cwd: resolve('engine'), encoding:'utf8', input:JSON.stringify(rows), maxBuffer:4*1024*1024,
  });
  assert.equal(python.status, 0, python.stderr);
  assert.deepEqual(JSON.parse(python.stdout), []);
});

test('portable elementary wrappers do not call host transcendental functions', () => {
  for (const kind of kinds) {
    const original = Math[kind];
    Math[kind] = () => assert.fail('host elementary call');
    try { assert.equal(typeof lib[kind](3), 'number'); } finally { Math[kind] = original; }
  }
});

test('Gaussian intermediate overflow preserves zero weights and finite uniform weights', () => {
  assert.deepEqual(lib.alma([1,2,3],3,0.5,1e162), [null,null,2]);
  assert.deepEqual(lib.alma([1,2,3],3,0.5,Number.MIN_VALUE), [null,null,2]);
  assert.deepEqual(lib.alma([1,2,3],3,0.5,1e308), [null,null,null]);
  assert.deepEqual(lib.alma([5],1,0.5,-1), [null]);
});

test('Hull smoothing retains source chronology while length is absent', () => {
  const state = {};
  assert.equal(lib.hmaStep(state,'h',0,null), null);
  assert.equal(lib.hmaStep(state,'h',3,2), 4);
});

test('lower starting precision refines to the independently certified wrapper results', () => {
  for (const kind of kinds) for (const input of inputs()) {
    if (input !== null) assert.equal(encode(transcendental(kind,input,64)), encode(lib[kind](input) as number|null));
  }
});

test('Gaussian cache bounds both resources and keeps evicted recomputations immutable', () => {
  const cache = new GaussianCache(), first=cache.get(50,0.85,6);
  assert.ok(first);
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.weights));
  assert.equal(cache.get(50,0.85,6), first);
  for (let i=0;i<20;i++) {
    cache.get(600,0.5+i/100,4);
    assert.ok(cache.size<=8 && cache.coefficients<=4096);
  }
  const rebuilt=cache.get(50,0.85,6);
  assert.notEqual(rebuilt,first);
  assert.deepEqual(rebuilt,first);
  const count=cache.coefficients, size=cache.size;
  assert.ok(cache.get(4097,0.5,6));
  assert.equal(cache.coefficients,count);
  assert.equal(cache.size,size);
});
