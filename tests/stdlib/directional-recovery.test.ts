import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as lib from '../../src/core/stdlib/index.js';
import { directionalCases } from './directional-recovery-cases.js';

for (const row of directionalCases()) {
  const step = (state: lib.StateRecord, bar: lib.Bar) =>
    lib.adxStep(state, 'one', lib.gapOf(state, 'gap', bar), ...row.lengths);

  test(`directional ${row.id} preserves the independent exact values at every prefix`, () => {
    for (let end = 0; end <= row.bars.length; end++) {
      assert.deepEqual(lib.adx(row.bars.slice(0, end), ...row.lengths), row.expected.slice(0, end));
    }
  });

  test(`directional ${row.id} restores forming observation state`, () => {
    let state = lib.newState();
    const values = row.bars.map(bar => {
      const saved = lib.copyState(state);
      step(state, { ...bar, high: 1e308, low: -1e308, close: 0 });
      state = lib.copyState(saved);
      return step(state, bar);
    });
    assert.deepEqual(values, row.expected);
  });
}
