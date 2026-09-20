/**
 * State, checkpoints and rollback, `compiled-program.md` section 6.
 *
 * Section 6.4 states the property these tests exist for and calls it testable
 * rather than aspirational: restoring the checkpoint taken at the end of bar
 * `j` and then executing bars `j + 1` through `k` must produce state and output
 * for bar `k` that is identical, bit for bit, to the original run's. Every test
 * below is one shape of that, and the wrong implementation each one catches is
 * an engine that skipped a region: the cells, the library state, the heap, or
 * the register histories.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { Value } from '../../src/core/engine/index.js';
import {
  bars,
  compileTarget,
  emittableTargets,
  engineFor,
  flat,
  running,
  states,
  timeOf,
} from './support.js';

const COUNTER = [
  'version 1',
  '',
  'study("Counter")',
  '',
  'var hits = 0',
  'live var seen = 0',
  '',
  'seen = seen + 1',
  'if close > 100',
  '    hits = hits + 1',
  '',
  'plot(hits, "hits", aqua)',
  'plot(seen, "seen", red)',
].join('\n');

test('a var rolls back and a live var does not, which is the whole of 6.3', () => {
  // Catches an engine that rolls back everything: `live var` would then be
  // indistinguishable from `var` and the feature would silently do nothing.
  // And an engine that rolls back nothing: `hits` would count one crossing
  // three times.
  const engine = running(COUNTER);
  engine.append(flat(101, timeOf(0)), { isConfirmed: true });
  assert.deepEqual(engine.append(flat(102, timeOf(1)), { isConfirmed: false }).columns, [2, 2]);
  assert.deepEqual(engine.update(flat(103, timeOf(1)), { isConfirmed: false }).columns, [2, 3]);
  assert.deepEqual(engine.update(flat(99, timeOf(1)), { isConfirmed: false }).columns, [1, 4]);
});

test('executing a moving bar ten times gives the answer of executing it once', () => {
  const once = running(COUNTER);
  once.append(flat(101, timeOf(0)), { isConfirmed: true });
  const settled = once.append(flat(105, timeOf(1)), { isConfirmed: false }).columns[0];

  const many = running(COUNTER);
  many.append(flat(101, timeOf(0)), { isConfirmed: true });
  many.append(flat(140, timeOf(1)), { isConfirmed: false });
  for (let update = 0; update < 9; update += 1) {
    many.update(flat(99, timeOf(1)), { isConfirmed: false });
  }
  assert.equal(many.update(flat(105, timeOf(1)), { isConfirmed: false }).columns[0], settled);
});

test('library state rolls back, so a re-executed bar averages the bars on the chart', () => {
  // 6.2: an engine does not re-seed an `ema` from history, it puts back the
  // record it copied. Catches an engine that leaves a state region advanced by
  // a discarded execution, which is the failure 12.7 spells out.
  const engine = running(
    ['version 1', '', 'study("Mean")', '', 'plot(sma(close, 2), "m", aqua)'].join('\n'),
  );
  engine.append(flat(100, timeOf(0)), { isConfirmed: true });
  engine.append(flat(102, timeOf(1)), { isConfirmed: true });
  engine.append(flat(106, timeOf(2)), { isConfirmed: false });
  assert.equal(engine.update(flat(104, timeOf(2)), { isConfirmed: false }).columns[0], 103);
});

test('an object a discarded execution created does not survive the rollback', () => {
  // Section 6.1 lists what a checkpoint holds and does not name the drawing
  // roster separately. It has to be part of it: without that, a moving bar that
  // ticks fifty times leaves fifty boxes where the script asked for one.
  const engine = running(
    [
      'version 1',
      '',
      'study("Draw")',
      '',
      'var made = none',
      'if bar.isFirst',
      '    made = draw.box(time, low, time, high)',
      'plot(close, "c", aqua)',
    ].join('\n'),
  );
  engine.append(flat(100, timeOf(0)), { isConfirmed: false });
  assert.equal(engine.drawings().length, 1);
  for (let update = 0; update < 5; update += 1) {
    engine.update(flat(101, timeOf(0)), { isConfirmed: false });
  }
  assert.equal(engine.drawings().length, 1, 'five more executions, still one box');
});

test('an array two names share is still one array after a restore', () => {
  // 6.2's first requirement. Catches a restore that deep copies each cell
  // separately, which would turn one array into two and change what the script
  // computes from the next bar onward.
  const engine = running(
    [
      'version 1',
      '',
      'study("Shared")',
      '',
      'var first = [0.0]',
      'var second = first',
      '',
      'push(first, close)',
      'plot(size(second), "n", aqua)',
    ].join('\n'),
  );
  assert.equal(engine.append(flat(10, timeOf(0)), { isConfirmed: true }).columns[0], 2);
  assert.equal(engine.append(flat(11, timeOf(1)), { isConfirmed: false }).columns[0], 3);
  assert.equal(engine.update(flat(12, timeOf(1)), { isConfirmed: false }).columns[0], 3);
});

test('the replay invariant holds for every target over a whole dataset', () => {
  // The conformance suite's own test, run here: for each bar, re-execute it and
  // compare every channel. A difference is a failing engine, and it would come
  // from exactly one place, a region the rollback forgot.
  const data = bars(120);
  const state = states(120);
  for (const name of emittableTargets()) {
    const compiled = compileTarget(name);
    const engine = engineFor(compiled);
    for (let bar = 0; bar < data.length; bar += 1) {
      const here = data[bar];
      if (here === undefined) continue;
      const first = engine.append(here, state[bar] ?? {}, data.length);
      assert.equal(first.diagnostic, undefined, `${name} failed on bar ${bar}`);
      const again = engine.update(here, state[bar] ?? {});
      assert.deepEqual(
        again.columns as readonly Value[],
        first.columns as readonly Value[],
        `${name} bar ${bar} did not reproduce after a rollback`,
      );
    }
  }
});

test('the same program over the same bars produces the same numbers twice', () => {
  // Determinism is the contract. Nothing may depend on the iteration order of a
  // hash map, on wall clock time, or on anything the specification does not
  // fix, and two runs in one process is the cheapest way to notice one that
  // does.
  const data = bars(200);
  const state = states(200);
  for (const name of emittableTargets()) {
    const compiled = compileTarget(name);
    const first = engineFor(compiled).run(data, state);
    const second = engineFor(compiled).run(data, state);
    assert.equal(first.diagnostic, undefined, name);
    assert.deepEqual(
      first.bars.map((one) => one.columns),
      second.bars.map((one) => one.columns),
      name,
    );
  }
});
