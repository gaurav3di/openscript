/**
 * The engine's library, gated against the numeric library and the checker's
 * surface.
 *
 * **The bindings.** There is one implementation of every calculation, under
 * `src/core/stdlib`, and the engine's manifest is a table of call sites
 * pointing at it. So what can still be wrong is the pointing: an argument read
 * from the wrong position, a length passed where a multiplier belongs, a
 * default that differs from the declared one, or two steps of one study handed
 * the same key and so sharing a lookback that should be two. None of those
 * would fail a type check and every one of them would draw a wrong line.
 *
 * This file drives each manifest entry through the engine's own call path, one
 * bar at a time, and asserts the result equals the library function of the same
 * name folded over the same series, bar by bar and bit for bit. Every entry
 * that holds state is covered, because a binding is wrong one entry at a time.
 *
 * **The named colours.** `stdlib.md` 11.1 fixes their channel values in a
 * library manifest that does not exist, so the compiler carries a table for the
 * colours it writes into a declaration before bar 0 and the engine carries one
 * for the colours a script computes on a bar. The test compares the two through
 * the artifacts rather than by reading either table, so the day the manifest
 * exists both copies are deleted rather than reconciled.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import * as numeric from '../../src/core/stdlib/index.js';
import type { Bar, Value as Numeric } from '../../src/core/stdlib/index.js';
import { libraryEntries, typeText } from '../../src/core/index.js';
import { COLOUR_NAMES, manifestEntries, manifestEntry, namedColour } from '../../src/core/engine/library/index.js';
import type { BarView, CallContext, ManifestEntry } from '../../src/core/engine/library/index.js';
import { Heap } from '../../src/core/engine/values/index.js';
import type { Value } from '../../src/core/engine/values/index.js';
import { compile, compileTarget, emittableTargets } from './support.js';

/** A context a fold can drive, with no budget and no host to speak of. */
function contextFor(heap: Heap): CallContext & { state: Record<string, unknown>; view: BarView } {
  const view: BarView = {
    index: 0,
    open: null,
    high: null,
    low: null,
    close: null,
    volume: null,
    time: null,
    previousClose: null,
    isConfirmed: true,
    isRealtime: false,
    isNew: true,
    isLast: true,
    updates: 1,
    isSessionStart: false,
    isSessionEnd: false,
  };
  const context = {
    heap,
    span: { offset: 0, length: 0, line: 0, column: 0 },
    bar: view,
    host: {
      symbol: () => null,
      exchange: () => null,
      interval: () => null,
      tickSize: () => null,
      lotSize: () => null,
      now: () => null,
      positionSize: () => null,
      positionPrice: () => null,
    },
    state: {},
    guard: {
      array: () => undefined,
      string: (_span: unknown, text: string) => text,
      heap: () => undefined,
      badArgument: (): never => {
        throw new Error('badArgument');
      },
      badIndex: (): never => {
        throw new Error('badIndex');
      },
      deleted: (): never => {
        throw new Error('deleted');
      },
    },
    nameOf: () => 'the array',
    view,
  };
  return context as unknown as CallContext & { state: Record<string, unknown>; view: BarView };
}

function entryFor(name: string, arity: number): ManifestEntry {
  const found = manifestEntry(name, arity);
  assert.ok(found !== undefined, `the engine has no ${name} of ${arity} arguments`);
  return found;
}

/** Folds one engine entry over a list of argument rows, one row per bar. */
function fold(name: string, rows: readonly (readonly Value[])[], bars?: readonly Bar[]): Value[] {
  const of = entryFor(name, (rows[0] ?? []).length);
  const heap = new Heap();
  const context = contextFor(heap);
  const out: Value[] = [];
  for (let bar = 0; bar < rows.length; bar += 1) {
    const view = bars?.[bar];
    const mutable = context as unknown as { bar: BarView };
    mutable.bar = {
      ...context.view,
      index: bar,
      open: view?.open ?? null,
      high: view?.high ?? null,
      low: view?.low ?? null,
      close: view?.close ?? null,
      volume: view?.volume ?? null,
      previousClose: bar === 0 ? null : bars?.[bar - 1]?.close ?? null,
    };
    out.push(of.call(context, rows[bar] ?? []));
  }
  return out;
}

/** The trio a multi-value call returned, read back out of the heap. */
function trios(name: string, rows: readonly (readonly Value[])[], bars?: readonly Bar[]): Numeric[][] {
  const of = entryFor(name, (rows[0] ?? []).length);
  const heap = new Heap();
  const context = contextFor(heap);
  const out: Numeric[][] = [];
  for (let bar = 0; bar < rows.length; bar += 1) {
    const view = bars?.[bar];
    const mutable = context as unknown as { bar: BarView };
    mutable.bar = {
      ...context.view,
      index: bar,
      open: view?.open ?? null,
      high: view?.high ?? null,
      low: view?.low ?? null,
      close: view?.close ?? null,
      volume: view?.volume ?? null,
      previousClose: bar === 0 ? null : bars?.[bar - 1]?.close ?? null,
    };
    const handle = of.call(context, rows[bar] ?? []);
    const object = heap.deref(handle);
    assert.ok(object !== undefined && object.kind === 'array', `${name} returns an array`);
    out.push(object.items.map((one) => (typeof one === 'number' ? one : null)));
  }
  return out;
}

/**
 * A series with two holes in it.
 *
 * The holes matter more than the shape: a lookback that is filled but not
 * complete, a recurrence frozen by an absent bar and a crossing test with a
 * missing side are where a binding that shares a key with its neighbour stops
 * agreeing with the function it is supposed to be calling.
 */
const SERIES: readonly Numeric[] = [
  12, 13.5, 11.25, 14, 15.5, null, 16.25, 15, 14.75, 18, 19.5, 17, null, 16, 20.25, 21, 19.75,
  22.5, 24, 23.25, 21.5, 25, 26.75, 24.5, 27, 28.5, 26.25, 29, 30.75, 28.5,
];

const OTHER: readonly Numeric[] = SERIES.map((one, index) =>
  one === null ? null : one + Math.sin(index) * 2,
);

const FLAGS: readonly (boolean | null)[] = SERIES.map((one, index) =>
  one === null ? null : index % 4 === 0,
);

const BARS: readonly Bar[] = SERIES.map((one, index) => ({
  open: one,
  high: one === null ? null : one + 1.5,
  low: one === null ? null : one - 1.25,
  close: one === null ? null : one + Math.cos(index) * 0.5,
  volume: 1000 + index * 7,
}));

function rowsOf(series: readonly Numeric[], ...rest: readonly Value[]): readonly (readonly Value[])[] {
  return series.map((one) => [one, ...rest]);
}

test('every single source series call matches the numeric library bit for bit', () => {
  const cases: readonly [string, readonly Value[], readonly Numeric[]][] = [
    ['sma', [4], numeric.sma(SERIES, 4)],
    ['ema', [5], numeric.ema(SERIES, 5)],
    ['rma', [5], numeric.rma(SERIES, 5)],
    ['wma', [4], numeric.wma(SERIES, 4)],
    ['hma', [6], numeric.hma(SERIES, 6)],
    ['highest', [5], numeric.highest(SERIES, 5)],
    ['lowest', [5], numeric.lowest(SERIES, 5)],
    ['highestBars', [5], numeric.highestBars(SERIES, 5)],
    ['lowestBars', [5], numeric.lowestBars(SERIES, 5)],
    ['change', [3], numeric.change(SERIES, 3)],
    ['mom', [4], numeric.mom(SERIES, 4)],
    ['roc', [4], numeric.roc(SERIES, 4)],
    ['history', [3], numeric.history(SERIES, 3)],
    ['sum', [4], numeric.sum(SERIES, 4)],
    ['sumSkip', [4], numeric.sumSkip(SERIES, 4)],
    ['avgSkip', [4], numeric.avgSkip(SERIES, 4)],
    ['countPresent', [4], numeric.countPresent(SERIES, 4)],
    ['median', [5], numeric.median(SERIES, 5)],
    ['percentile', [5, 30], numeric.percentile(SERIES, 5, 30)],
    ['pivotHigh', [2, 2], numeric.pivotHigh(SERIES, 2, 2)],
    ['pivotLow', [2, 2], numeric.pivotLow(SERIES, 2, 2)],
    ['rsi', [6], numeric.rsi(SERIES, 6)],
    ['stdev', [5, false], numeric.stdev(SERIES, 5, false)],
    ['variance', [5, false], numeric.variance(SERIES, 5, false)],
  ];
  for (const [name, rest, expected] of cases) {
    assert.deepEqual(fold(name, rowsOf(SERIES, ...rest)), expected, name);
  }
});

test('cum and the run tests match the numeric library', () => {
  assert.deepEqual(fold('cum', rowsOf(SERIES)), numeric.cum(SERIES), 'cum');
  assert.deepEqual(fold('rising', rowsOf(SERIES, 3)), numeric.rising(SERIES, 3), 'rising');
  assert.deepEqual(fold('falling', rowsOf(SERIES, 3)), numeric.falling(SERIES, 3), 'falling');
});

test('the three crossing tests match the numeric library', () => {
  const rows = SERIES.map((one, index) => [one, OTHER[index] ?? null]);
  assert.deepEqual(fold('crossUp', rows), numeric.crossUp(SERIES, OTHER), 'crossUp');
  assert.deepEqual(fold('crossDown', rows), numeric.crossDown(SERIES, OTHER), 'crossDown');
  assert.deepEqual(fold('cross', rows), numeric.cross(SERIES, OTHER), 'cross');
});

test('the condition calls match the numeric library', () => {
  assert.deepEqual(
    fold('barsSince', FLAGS.map((one) => [one])),
    numeric.barsSince(FLAGS),
    'barsSince',
  );
  assert.deepEqual(
    fold('count', FLAGS.map((one) => [one, 4])),
    numeric.count(FLAGS, 4),
    'count',
  );
});

test('the bar driven studies match the numeric library', () => {
  const empty = BARS.map(() => []);
  assert.deepEqual(fold('trueRange', empty, BARS), numeric.trueRange(BARS), 'trueRange');
  assert.deepEqual(fold('atr', BARS.map(() => [5]), BARS), numeric.atr(BARS, 5), 'atr');
  assert.deepEqual(fold('natr', BARS.map(() => [5]), BARS), numeric.natr(BARS, 5), 'natr');
});

test('the multi value studies match the numeric library', () => {
  assert.deepEqual(
    trios('macd', SERIES.map((one) => [one, 4, 9, 3])),
    numeric.macd(SERIES, 4, 9, 3),
    'macd',
  );
  assert.deepEqual(
    trios('bollinger', SERIES.map((one) => [one, 5, 2])),
    numeric.bollinger(SERIES, 5, 2),
    'bollinger',
  );
  assert.deepEqual(
    trios('supertrend', BARS.map(() => [3, 5]), BARS),
    numeric.supertrend(BARS, 3, 5),
    'supertrend',
  );
  // Catches the element order, which is the one thing about a multi-value study
  // a type check cannot see and a reader of a chart reads as the study's answer.
  // `stdlib.md` 6 gives this one as upper, basis, lower, and the two orders are
  // both plausible, which is exactly why it is asserted rather than assumed.
  assert.deepEqual(
    trios('donchian', BARS.map(() => [4]), BARS),
    numeric.donchian(BARS, 4),
    'donchian',
  );
});

test('the two band readings match the numeric library', () => {
  assert.deepEqual(
    fold('bbWidth', SERIES.map((one) => [one, 5, 2])),
    numeric.bbWidth(SERIES, 5, 2),
    'bbWidth',
  );
  assert.deepEqual(
    fold('bbPercent', SERIES.map((one) => [one, 5, 2])),
    numeric.bbPercent(SERIES, 5, 2),
    'bbPercent',
  );
});

test('valueWhen matches the numeric library at both occurrences', () => {
  for (const occurrence of [0, 1]) {
    const rows = SERIES.map((one, index) => [FLAGS[index] ?? null, one, occurrence]);
    assert.deepEqual(
      fold('valueWhen', rows),
      numeric.valueWhen(FLAGS, SERIES, occurrence),
      `valueWhen at occurrence ${occurrence}`,
    );
  }
});

/**
 * Every stateful entry is compared above, and this is what keeps it so.
 *
 * A binding is wrong one entry at a time, so an entry nobody drove through the
 * call path is an entry whose keys and argument positions are asserted by
 * nothing. The list below is the entries this file folds; a new stateful call
 * fails here until it is added to one of the comparisons.
 */
const COMPARED: readonly string[] = [
  'avgSkip', 'atr', 'barsSince', 'bbPercent', 'bbWidth', 'bollinger', 'change',
  'count', 'countPresent', 'cross', 'crossDown', 'crossUp', 'cum', 'donchian',
  'ema', 'falling', 'highest', 'highestBars', 'history', 'hma', 'lowest',
  'lowestBars', 'macd', 'median', 'mom', 'natr', 'percentile', 'pivotHigh',
  'pivotLow', 'rising', 'rma', 'roc', 'rsi', 'sma', 'stdev', 'sum', 'sumSkip',
  'supertrend', 'valueWhen', 'variance', 'wma',
];

test('every stateful entry the engine implements is one this file compares', () => {
  const missing = manifestEntries()
    .filter((one) => one.state && !COMPARED.includes(one.name))
    .map((one) => `${one.name}/${one.arity}`);
  assert.deepEqual(missing, [], 'stateful entries compared against nothing');
});

/**
 * The engine's manifest against the checker's library surface.
 *
 * 2.5 requires the two to agree in name, arity, whether the function holds
 * state and what effect it has, and makes a mismatch OS6004 at load. This test
 * is the same comparison run in the repository, so a signature that changes on
 * one side fails here rather than at a customer's.
 */
test('every entry the engine implements agrees with the checker on state and effect', () => {
  for (const mine of manifestEntries()) {
    const theirs = libraryEntries(mine.name).filter(
      (one) => one.parameters.length === mine.arity,
    );
    assert.ok(theirs.length > 0, `${mine.name}/${mine.arity} is not in the library surface`);
    for (const one of theirs) {
      assert.equal(one.stateful, mine.state, `${mine.name}/${mine.arity} state`);
      const effect =
        one.name === 'print'
          ? 'log'
          : one.strategyOnly && one.callable && typeText(one.returns) === 'nothing'
            ? 'order'
            : 'none';
      assert.equal(mine.effect, effect, `${mine.name}/${mine.arity} effect`);
    }
  }
});

test('the engine implements every call the nine target scripts make', () => {
  // The other direction, and the one that decides whether the phase is done:
  // a name the engine lacks is refused at load, so a target that needs one does
  // not run at all.
  for (const name of emittableTargets()) {
    for (const used of compileTarget(name).program.lib.functions) {
      assert.ok(
        manifestEntry(used.name, used.arity) !== undefined,
        `${name} calls ${used.name} with ${used.arity} arguments and the engine has no entry`,
      );
    }
  }
});

test('the engine and the compiler give the nineteen named colours the same channels', () => {
  const source = [
    'version 1',
    '',
    'study("Colours")',
    '',
    ...COLOUR_NAMES.map((name, index) => `plot(close, "p${index}", ${name})`),
  ].join('\n');
  const plots = compile('colours.oscript', source).program.outputs.plots;
  assert.equal(plots.length, COLOUR_NAMES.length);
  for (let index = 0; index < COLOUR_NAMES.length; index += 1) {
    const name = COLOUR_NAMES[index] as string;
    const written = plots[index]?.color as readonly number[];
    const computed = namedColour(name);
    assert.ok(computed !== null && typeof computed === 'object' && computed.tag === 'color');
    assert.deepEqual(
      [computed.r, computed.g, computed.b, computed.a],
      [...written],
      `${name} differs between the compiler's table and the engine's`,
    );
  }
});
