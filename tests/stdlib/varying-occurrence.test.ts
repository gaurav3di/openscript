import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as lib from '../../src/core/stdlib/index.js';
import { ContributionHistory } from '../../src/core/stdlib/values/index.js';
import { flat, running, timeOf } from '../engine/support.js';

type Observation = readonly [lib.Flag, lib.Value, number | null];

/** Count true events independently of the runtime's state layout or retention. */
function expected(observations: readonly Observation[]): lib.Value[] {
  const events: lib.Value[] = [];
  return observations.map(([condition, value, occurrence]) => {
    if (condition === true) events.push(value);
    const ordinal = occurrence ?? 0;
    return events[events.length - 1 - ordinal] ?? null;
  });
}

function observed(observations: readonly Observation[]): lib.Value[] {
  const state = lib.newState();
  return observations.map(([cond, src, occurrence]) =>
    lib.valueWhenStep(state, 'events', { cond, src }, occurrence ?? 0));
}

test('a smaller occurrence immediately selects its current true event', () => {
  const rows: Observation[] = [[true, 1, 1], [true, 2, 1], [true, 3, 0]];
  assert.deepEqual(expected(rows), [null, 1, 3]);
  assert.deepEqual(observed(rows), expected(rows));
});

test('a larger occurrence can read events contributed before it was requested', () => {
  const rows: Observation[] = [[true, 1, 0], [true, 2, 0], [false, 3, 1]];
  assert.deepEqual(expected(rows), [1, 2, 1]);
  assert.deepEqual(observed(rows), expected(rows));
});

test('source absence occupies an event ordinal while false and absent conditions do not', () => {
  const rows: Observation[] = [[true, 10, 3], [true, null, 0], [null, 30, 1],
    [false, 40, 0], [true, 50, 2], [false, 60, 1], [false, 70, 0]];
  assert.deepEqual(expected(rows), [null, null, 10, null, 10, null, 50]);
  assert.deepEqual(observed(rows), expected(rows));
});

test('an absent occurrence keeps the established default binding to the latest event', () => {
  const rows: Observation[] = [[true, 1, null], [true, 2, null], [false, 3, 1]];
  assert.deepEqual(observed(rows), expected(rows));
});

test('changing ordinals follow an independent oracle across sparse events and chunk boundaries', () => {
  const rows: Observation[] = Array.from({ length: 257 }, (_, index) =>
    [index % 4 === 0 ? null : index % 3 !== 0, index % 13 === 0 ? null : index,
      index % 29 === 0 ? 90 : index % 11] as const);
  assert.deepEqual(observed(rows), expected(rows));
});

test('forks retain immutable event history and keys remain independent', () => {
  const state = lib.newState();
  for (let index = 0; index < 70; index++) {
    lib.valueWhenStep(state, 'one', { cond: true, src: index }, 0);
    lib.valueWhenStep(state, 'two', { cond: true, src: -index }, 0);
  }
  const saved = lib.copyState(state);
  const history = Object.values(state).find(value => value instanceof ContributionHistory);
  assert.ok(history instanceof ContributionHistory);
  assert.ok(Object.values(saved).includes(history));
  assert.equal(history.count, 70);
  lib.valueWhenStep(state, 'one', { cond: true, src: 999 }, 0);
  assert.equal(lib.valueWhenStep(saved, 'one', { cond: false, src: null }, 69), 0);
  assert.equal(lib.valueWhenStep(saved, 'two', { cond: false, src: null }, 68), -1);
  assert.equal(lib.valueWhenStep(state, 'one', { cond: false, src: null }, 69), 1);
});

test('compiled occurrence series and forming replacement use the same retained events', () => {
  const engine = running('version 1\nstudy("Event ordinals")\n' +
    'plot(valueWhen(open > 0, close, volume), "Value")\n');
  const bar = (index: number, cond: boolean, src: number, occurrence: number) =>
    ({ ...flat(src, timeOf(index)), open: cond ? 1 : 0, volume: occurrence });
  assert.equal(engine.append(bar(0, true, 1, 0), { isConfirmed: true }).diagnostic, undefined);
  assert.equal(engine.append(bar(1, true, 2, 0), { isConfirmed: true }).diagnostic, undefined);
  assert.equal(engine.append(bar(2, true, 999, 0), { isConfirmed: false }).diagnostic, undefined);
  assert.equal(engine.update(bar(2, false, 3, 1), { isConfirmed: true }).diagnostic, undefined);
  const plot = engine.program.outputs.plots[0];
  assert.ok(plot);
  assert.deepEqual(engine.column(plot.channel), [1, 2, 1]);
});
