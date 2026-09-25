import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as lib from '../../src/core/stdlib/index.js';
import { statisticsOverflowCases } from './statistics-overflow-cases.js';

for (const [index, row] of statisticsOverflowCases().entries()) {
  const step = (state: lib.StateRecord, at: number) => row.name === 'cci'
    ? lib.cciStep(state, 'one', row.bars[at]!, row.length)
    : lib.correlationStep(state, 'one', { a: row.a[at]!, b: row.b[at]! }, row.length);

  test(`${row.name} named overflow case ${index} stays absent and recovers`, () => {
    const state = lib.newState();
    assert.deepEqual(row.expected.map((_, at) => step(state, at)), row.expected);
  });

  test(`${row.name} named overflow case ${index} survives forming checkpoint restoration`, () => {
    let state = lib.newState();
    const actual = row.expected.map((_, at) => {
      const saved = lib.copyState(state);
      step(state, 1);
      state = lib.copyState(saved);
      return step(state, at);
    });
    assert.deepEqual(actual, row.expected);
  });
}
