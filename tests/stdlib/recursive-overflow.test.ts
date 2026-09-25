import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as lib from '../../src/core/stdlib/index.js';
import { ContributionHistory } from '../../src/core/stdlib/values/index.js';

test('a non-finite seed mean leaves EMA and RMA available to seed from a later suffix', () => {
  assert.deepEqual(lib.ema([1e308, 1e308, 1, 2], 2), [null, null, 5e307, 1.6666666666666669e307]);
  assert.deepEqual(lib.rma([1e308, 1e308, 1, 2], 2), [null, null, 5e307, 2.5e307]);
});

test('overflow recovery follows the seed recipe at positive and negative binary scales', () => {
  const scale = 2 ** 1022;
  for (const sign of [-1, 1]) {
    const source = [3 * scale, 3 * scale, scale / 2, scale].map(value => value * sign);
    assert.deepEqual(lib.ema(source, 2), [null, null, 1.75 * scale * sign, 1.25 * scale * sign]);
    assert.deepEqual(lib.rma(source, 2), [null, null, 1.75 * scale * sign, 1.375 * scale * sign]);
  }
});

test('ATR recovers when its finite true ranges can form a finite seed mean', () => {
  const bars = [1e308, 1e308, 1, 2].map(high => ({ open: 0, high, low: 0, close: 0, volume: 1 }));
  assert.deepEqual(lib.atr(bars, 2), [null, null, 5e307, 2.5e307]);
});

test('RSI waits for its overflowing side to seed while the other side continues', () => {
  const source = [-8e307, 8e307, -8e307, 8e307, 8e307];
  assert.deepEqual(lib.rsi(source, 3), [null, null, null, null, 60]);
});

test('an overflow after seeding commits running state and never silently seeds again', () => {
  assert.deepEqual(lib.rma([5e307, 5e307, 1.5e308, 1, 2, 3], 2),
    [null, 5e307, null, null, null, null]);
  const state = lib.newState();
  lib.rmaStep(state, 'one', 5e307, 2);
  lib.rmaStep(state, 'one', 5e307, 2);
  lib.rmaStep(state, 'one', 1.5e308, 2);
  const saved = lib.copyState(state);
  assert.equal(lib.rmaStep(state, 'one', null, 2), null);
  assert.equal(lib.rmaStep(state, 'one', 1, 1), null);
  assert.equal(lib.rmaStep(lib.copyState(saved), 'one', 1, 2), null);
});

test('failed-seed history and successful-seed state are both restored across forming corrections', () => {
  for (const step of [lib.emaStep, lib.rmaStep]) {
    const state = lib.newState();
    step(state, 'one', 1e308, 2);
    const before = lib.copyState(state);
    assert.equal(step(state, 'one', 1e308, 2), null);
    assert.ok(Object.values(state).some(value => value instanceof ContributionHistory));
    const failed = lib.copyState(state);
    assert.equal(step(lib.copyState(before), 'one', 1, 2), 5e307);
    assert.equal(step(lib.copyState(failed), 'one', 1, 2), 5e307);
  }
  const state = lib.newState();
  lib.rmaStep(state, 'one', 5e307, 2);
  lib.rmaStep(state, 'one', 5e307, 2);
  const seeded = lib.copyState(state);
  assert.equal(lib.rmaStep(state, 'one', 1.5e308, 2), null);
  const restored = lib.copyState(seeded);
  assert.equal(lib.rmaStep(restored, 'one', 1, 2), 2.5e307);
  assert.equal(lib.rmaStep(restored, 'one', 2, 2), 1.25e307);
});
