import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as lib from '../../src/core/stdlib/index.js';
import { momentumCases } from './momentum-overflow-cases.js';

for (const [index, row] of momentumCases().entries()) {
  const step = (state: lib.StateRecord, value: number | null) => row.name === 'tsi'
    ? lib.tsiStep(state, 'one', value, row.lengths[0]!, row.lengths[1]!)
    : row.name === 'rsi' ? lib.rsiStep(state, 'one', value, row.lengths[0]!)
      : lib.cmoStep(state, 'one', value, row.lengths[0]!);

  test(`${row.name} overflow recovery case ${index} follows the independent operation oracle`, () => {
    const state = lib.newState();
    assert.deepEqual(row.source.map(value => step(state, value)), row.expected);
    assert.notEqual(row.expected.at(-1), null);
  });

  test(`${row.name} overflow recovery case ${index} survives forming checkpoint restore`, () => {
    let state = lib.newState();
    const actual = row.source.map((value, at) => {
      const saved = lib.copyState(state);
      step(state, at % 2 ? 1e308 : -1e308);
      state = lib.copyState(saved);
      return step(state, value);
    });
    assert.deepEqual(actual, row.expected);
  });
}

test('nearby momentum and percentage changes recover after an overflowing delta', () => {
  const source = [1, -1e308, 1e308, 1, 2];
  assert.deepEqual(lib.mom(source, 1), [null, -1e308, null, -1e308, 1]);
  assert.deepEqual(lib.roc(source, 1), [null, null, null, null, 100]);
  assert.deepEqual(lib.trix(source, 1), [null, null, null, null, 100]);
});

test('ultimate oscillator normalizes an overflowing named range before division', () => {
  const bars = [1e308, -1e308, 1, 2].map(close => ({ open: close, high: close, low: close, close, volume: 1 }));
  assert.deepEqual(lib.ultimateOsc(bars, 1, 1, 1), [null, null, 100, 100]);
});

test('ultimate oscillator normalizes overflowing window sums and recovers as they expire', () => {
  const bars = [1e308, 1e308, 1e308, 1, 1].map(high => ({ open: 0, high, low: 0, close: 0, volume: 1 }));
  assert.deepEqual(lib.ultimateOsc(bars, 2, 2, 2), [null, null, null, 0, 0]);
});
