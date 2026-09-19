/**
 * The nine target scripts that reach the engine, and the five studies the
 * phase's gate names.
 *
 * `ROADMAP.md` fixes the gate: EMA, RSI, MACD, Bollinger Bands and Supertrend
 * match reference implementations to the last decimal, and each one's warmup is
 * exact. The last decimal is `library.test.ts`, which compares the engine's
 * arithmetic with the numeric library's bar by bar; the warmup is here, because
 * "starts one bar late" is the failure that survives every test of the value
 * itself and is the difference between a study that matches a reference
 * implementation and one that does not.
 *
 * The warmup bars are read from `stdlib.md`'s own table at test time. A copy
 * would pass forever after the specification changed, which is what this is
 * meant to prevent.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { Value } from '../../src/core/engine/index.js';
import { HOST, bars, compileTarget, emittableTargets, engineFor, running, states } from './support.js';

const STDLIB = new URL('../../../spec/stdlib.md', import.meta.url);

/** The warmup cell of one library table row, as the specification writes it. */
function warmupOf(signature: string): string {
  const text = readFileSync(STDLIB, 'utf8');
  const row = text.split('\n').find((line) => line.startsWith(`| \`${signature}\``));
  assert.ok(row !== undefined, `${signature} is not in a stdlib.md table`);
  const cells = row.split('|').map((one) => one.trim());
  return cells[3] ?? '';
}

/** The first bar a column has a value on. */
function firstValue(column: readonly Value[]): number {
  const at = column.findIndex((one) => one !== null);
  return at;
}

test('the nine emittable targets run a whole dataset without a diagnostic', () => {
  // The broadest test in the suite, and the one that would catch an instruction
  // implemented backwards: between them these programs use most of the
  // instruction set, every kind of channel, arrays, grids, drawing objects,
  // user functions and both loop forms.
  const data = bars(400);
  const state = states(400);
  for (const name of emittableTargets()) {
    const engine = engineFor(compileTarget(name));
    const run = engine.run(data, state);
    assert.equal(
      run.diagnostic,
      undefined,
      `${name}: ${run.diagnostic?.code ?? ''} at line ${run.diagnostic?.span.line ?? 0}`,
    );
    assert.equal(run.bars.length, data.length, name);
  }
});

test('a study that declares a grid fills it from the bar that wrote the cells', () => {
  const data = bars(120);
  const engine = engineFor(compileTarget('08-dashboard-table.oscript'));
  engine.run(data, states(120));
  const grids = engine.tables();
  assert.equal(grids.length, 1);
  assert.equal(grids[0]?.rows, 7);
  assert.equal(grids[0]?.cols, 2);
  assert.ok((grids[0]?.cells.length ?? 0) > 0, 'the last bar wrote cells into the grid');
});

test('a study that draws objects leaves the ones it did not delete', () => {
  const data = bars(300);
  const engine = engineFor(compileTarget('09-supply-demand-zones.oscript'));
  engine.run(data, states(300));
  const drawn = engine.drawings();
  assert.ok(drawn.length > 0, 'the study drew zones');
  assert.ok(drawn.every((one) => one.object.kind === 'box'), 'every zone is a box');
});

test('a strategy holds its orders back until the bar is confirmed', () => {
  // 5.4: the pending list is discarded at step 3 of every execution and applied
  // at step 9 only when the bar is confirmed. Catches an engine that places on
  // a moving bar: a condition true halfway through a bar and false when it
  // closed would place an order that the closing bar says nothing about.
  const placed: { bar: number; name: string }[] = [];
  const engine = engineFor(compileTarget('10-strategy-ema-cross.oscript'), {
    host: { ...HOST, route: (effect, bar) => placed.push({ bar, name: effect.name }) },
  });
  const data = bars(200);
  const state = states(200).map((one, index) => ({ ...one, isConfirmed: index < 199 }));
  engine.run(data, state);
  assert.ok(placed.length > 0, 'the strategy placed orders on the confirmed bars');
  assert.ok(placed.every((one) => one.bar < 199), 'nothing was placed on the moving bar');
});

test('ema starts on the bar stdlib.md says it starts on', () => {
  assert.equal(warmupOf('ema(src, len)'), 'bar `len - 1`');
  const column = warmupColumn('ema(close, 20)');
  assert.equal(firstValue(column), 19);
});

test('rsi starts on the bar stdlib.md says it starts on', () => {
  // One bar later than the plain reading: rsi needs `len` changes and a change
  // needs two bars. An engine that seeds it at `len - 1` produces a number on
  // every bar from then on and is wrong on all of them.
  assert.equal(warmupOf('rsi(src, len = 14)'), 'bar `len`');
  assert.equal(firstValue(warmupColumn('rsi(close, 14)')), 14);
});

test('bollinger starts on the bar stdlib.md says it starts on', () => {
  assert.equal(warmupOf('bollinger(src, len = 20, mult = 2)'), 'all elements at bar `len - 1`');
  assert.equal(firstValue(warmupColumn('element(bollinger(close, 20, 2), 0)')), 19);
  assert.equal(firstValue(warmupColumn('element(bollinger(close, 20, 2), 1)')), 19);
});

test('macd and its signal start on the two bars stdlib.md says they start on', () => {
  assert.equal(
    warmupOf('macd(src, fast = 12, slow = 26, signal = 9)'),
    'element 0 at bar `slow - 1`, elements 1 and 2 at bar `slow + signal - 2`',
  );
  assert.equal(firstValue(warmupColumn('element(macd(close, 12, 26, 9), 0)')), 25);
  assert.equal(firstValue(warmupColumn('element(macd(close, 12, 26, 9), 1)')), 33);
});

test('supertrend starts on the bar stdlib.md says it starts on', () => {
  assert.equal(
    warmupOf('supertrend(factor = 3, atrLen = 10)'),
    'element 0 at bar `atrLen`, element 1 at bar `atrLen`',
  );
  assert.equal(firstValue(warmupColumn('element(supertrend(3, 10), 0)')), 10);
});

/** Plots one expression over a clean dataset and returns its column. */
function warmupColumn(expression: string): readonly Value[] {
  const engine = running(
    ['version 1', '', 'study("Warmup")', '', `plot(${expression}, "x", aqua)`].join('\n'),
  );
  const data = bars(80);
  engine.run(data, states(80));
  return engine.column(0);
}
