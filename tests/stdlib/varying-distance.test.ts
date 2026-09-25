import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as lib from '../../src/core/stdlib/index.js';

const functions = [lib.historyStep, lib.changeStep, lib.rocStep];

test('shrinking a distance retains the maximum requested readiness', () => {
  for (const [at, step] of functions.entries()) {
    const state = lib.newState();
    assert.deepEqual([1, 2, 4, 8].map((value, index) => step(state, 'one', value, index === 0 ? 3 : 1)),
      [null, null, null, at === 2 ? 100 : 4]);
  }
});

test('growing a distance hides shorter later readings until enough calls exist', () => {
  for (const [at, step] of functions.entries()) {
    const state = lib.newState();
    assert.deepEqual([1, 2, 4, 8, 16, 32].map((value, index) => step(state, 'one', value, index === 2 ? 5 : 1)),
      at === 2 ? [null, 100, null, null, null, 100] : [null, 1, null, null, null, 16]);
  }
});

test('absent distances contribute history and intervening source holes keep their positions', () => {
  const expected = [[null, null, 1, 4], [null, null, 3, 4], [null, null, 300, 100]];
  for (const [at, step] of functions.entries()) {
    const state = lib.newState();
    assert.deepEqual([1, 2, 4, 8].map((value, index) => step(state, 'one', value, [null, null, 2, 1][index]!)), expected[at]);
    const holes = lib.newState();
    assert.deepEqual([1, null, 4, 8].map(value => step(holes, 'one', value, 3)),
      [null, null, null, [1, 7, 700][at]]);
  }
});

test('forming replacement restores distance readiness and history independently', () => {
  for (const [at, step] of functions.entries()) {
    const state = lib.newState();
    step(state, 'one', 1, 1);
    step(state, 'one', 2, 1);
    const saved = lib.copyState(state);
    assert.equal(step(state, 'one', 4, 6), null);
    assert.equal(step(lib.copyState(saved), 'one', 4, 1), at === 2 ? 100 : 2);
  }
});

test('zero history distance preserves the largest prior readiness', () => {
  const state = lib.newState();
  assert.deepEqual([1, 2, 4].map((value, index) => lib.historyStep(state, 'one', value, index === 0 ? 2 : 0)),
    [null, null, 4]);
});
