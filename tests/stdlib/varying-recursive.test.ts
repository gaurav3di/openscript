import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { StateRecord, Value } from '../../src/core/stdlib/index.js';
import * as lib from '../../src/core/stdlib/index.js';
import { ContributionHistory } from '../../src/core/stdlib/values/index.js';

type Case = { name: string; source: Value[]; lengths: Value[]; ema: Value[]; rma: Value[]; rsi: Value[] };
const cases: Case[] = [
  { name: 'shrink before seed', source: [1, 2, 3], lengths: [3, 3, 2],
    ema: [null, null, 2.5], rma: [null, null, 2.5], rsi: [null, null, 100] },
  { name: 'largest initial length', source: [1, 2, 3, 4, 5], lengths: [5, 2, 2, 2, 2],
    ema: [null, null, null, null, 4.5], rma: [null, null, null, null, 4.5],
    rsi: [null, null, null, null, 100] },
  { name: 'growth before seed', source: [1, 2, 3, 4, 5, 6], lengths: [3, 3, 5, 5, 5, 5],
    ema: [null, null, null, null, 3, 4], rma: [null, null, null, null, 3, 3.6],
    rsi: [null, null, null, null, null, 100] },
  { name: 'growth after seed', source: [1, 2, 3, 4, 5, 6], lengths: [2, 2, 5, 5, 5, 5],
    ema: [null, 1.5, null, null, 3.4444444444444446, 4.296296296296297],
    rma: [null, 1.5, null, null, 2.792, 3.4335999999999998],
    rsi: [null, null, null, null, null, 100] },
  { name: 'missing initial lengths', source: [1, 2, 3, 4], lengths: [null, null, 3, 3],
    ema: [null, null, 2, 3], rma: [null, null, 2, 2.6666666666666665],
    rsi: [null, null, null, 100] },
  { name: 'missing length after seed', source: [1, 2, 100, 4, 5], lengths: [2, 2, null, 2, 2],
    ema: [null, 1.5, null, 3.1666666666666665, 4.388888888888888],
    rma: [null, 1.5, null, 2.75, 3.875], rsi: [null, null, null, 50.515463917525764, 51.020408163265316] },
  { name: 'source hole before seed', source: [1, null, 3, 4, 5], lengths: [3, 3, 2, 2, 2],
    ema: [null, null, null, 3.5, 4.5], rma: [null, null, null, 3.5, 4.25],
    rsi: [null, null, null, null, 100] },
  { name: 'source hole after seed', source: [1, 2, null, 4, 5, 6], lengths: [2, 2, 5, 5, 2, 2],
    ema: [null, 1.5, null, null, 4.111111111111111, 5.37037037037037],
    rma: [null, 1.5, null, null, 3.5, 4.75], rsi: [null, null, null, null, null, 100] },
  { name: 'initial absent change remains a position', source: [10, 14, 12, 16, 14], lengths: [5, 2, 2, 2, 2],
    ema: [null, null, null, null, 15], rma: [null, null, null, null, 15],
    rsi: [null, null, null, null, 66.66666666666666] },
];

const families = { ema: lib.emaStep, rma: lib.rmaStep, rsi: lib.rsiStep };
for (const fixture of cases) {
  for (const [name, step] of Object.entries(families)) {
    test(`${name}: ${fixture.name}`, () => {
      const state = lib.newState();
      const actual = fixture.source.map((value, index) => step(state, 'one', value, fixture.lengths[index]!));
      assert.deepEqual(actual, fixture[name as keyof typeof families]);
    });
  }
}

test('hidden recurrence steps run, while absent length or source freezes the callback', () => {
  const state = lib.newState();
  const calls: number[][] = [];
  const step = (before: number, next: number) => { calls.push([before, next]); return (before + next) / 2; };
  assert.equal(lib.smoothed(state, 'one', 1, 1, step), 1);
  assert.equal(lib.smoothed(state, 'one', 3, 3, step), null);
  assert.equal(lib.smoothed(state, 'one', 5, null, step), null);
  assert.equal(lib.smoothed(state, 'one', null, 20, step), null);
  assert.equal(lib.smoothed(state, 'one', 3, 5, step), 3.5);
  assert.deepEqual(calls, [[1, 3], [2, 5]]);
});

test('branch-local calls and independent keys do not share seed clocks', () => {
  const state = lib.newState();
  const branch: Value[] = [], continuous: Value[] = [];
  for (let at = 1; at <= 5; at += 1) {
    if (at % 2 === 1) branch.push(lib.emaStep(state, 'branch', at, at === 1 ? 3 : 2));
    continuous.push(lib.emaStep(state, 'continuous', at, 1));
  }
  assert.deepEqual(branch, [null, null, 4]);
  assert.deepEqual(continuous, [1, 2, 3, 4, 5]);
});

test('restoring before an interim first seed restores history and maximum independently', () => {
  const state = lib.newState();
  lib.emaStep(state, 'one', 1, 3);
  lib.emaStep(state, 'one', 2, 3);
  const checkpoint = lib.copyState(state);
  assert.equal(lib.emaStep(state, 'one', 300, 1), 300);
  const restored = lib.copyState(checkpoint);
  assert.equal(lib.emaStep(restored, 'one', 7, 2), 4.5);
  assert.equal(lib.emaStep(restored, 'one', 8, 2), 6.833333333333333);
  const longer = lib.copyState(checkpoint);
  lib.emaStep(longer, 'one', 300, 100);
  const fork = lib.copyState(checkpoint);
  assert.equal(lib.emaStep(fork, 'one', 4, 3), 7 / 3);
});

test('post-seed rollback restores hidden steps and an interim larger maximum', () => {
  const state = lib.newState();
  lib.emaStep(state, 'one', 1, 1);
  const saved = lib.copyState(state);
  assert.equal(lib.emaStep(state, 'one', 100, 20), null);
  const restored = lib.copyState(saved);
  assert.equal(lib.emaStep(restored, 'one', 3, 3), null);
  const hidden = lib.copyState(restored);
  assert.equal(lib.emaStep(restored, 'one', 5, 3), 3.5);
  const fork = lib.copyState(hidden);
  assert.equal(lib.emaStep(fork, 'one', 7, 3), 4.5);
});

test('seed history is released while checkpoints retain reusable immutable prefixes', () => {
  const state: StateRecord = lib.newState();
  for (let at = 1; at <= 64; at += 1) lib.emaStep(state, 'one', at, null);
  assert.ok(Object.values(state).some(value => value instanceof ContributionHistory));
  const saved = lib.copyState(state);
  assert.equal(lib.emaStep(state, 'one', 65, 65), 33);
  assert.ok(Object.values(state).every(value => typeof value === 'number' || typeof value === 'boolean'));
  const fields = Object.keys(state).length;
  for (let at = 66; at <= 10000; at += 1) lib.emaStep(state, 'one', at, 10000);
  assert.equal(Object.keys(state).length, fields);
  assert.ok(Object.values(state).every(value => typeof value === 'number' || typeof value === 'boolean'));
  const fork = lib.copyState(saved);
  assert.equal(lib.emaStep(fork, 'one', 99, 1), 99);
});

test('nested averages keep their own changing-length seed suffixes', () => {
  const dema = lib.newState(), tema = lib.newState();
  const source = [1, 2, 3, 4, 5, 6], lengths = [3, 3, 2, 2, 2, 2];
  assert.deepEqual(source.map((value, at) => lib.demaStep(dema, '', value, lengths[at]!)),
    [null, null, null, 4, 5, 6]);
  assert.deepEqual(source.map((value, at) => lib.temaStep(tema, '', value, lengths[at]!)),
    [null, null, null, null, 5, 6]);
});
