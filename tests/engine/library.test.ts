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
import { libraryEntries, libraryNames, typeText } from '../../src/core/index.js';
import { BAR_FACTS, BAR_FIELDS, DECLARATION_CALLS, REQUEST_CALLS } from '../../src/core/emit/index.js';
import { COLOUR_NAMES, manifestEntries, manifestEntry, namedColour } from '../../src/core/engine/library/index.js';
import type { BarView, CallContext, ManifestEntry } from '../../src/core/engine/library/index.js';
import { Heap } from '../../src/core/engine/values/index.js';
import type { Value } from '../../src/core/engine/values/index.js';
import { HOST, asWire, compile, compileTarget, emittableTargets } from './support.js';
import type { HostBar } from '../../src/core/engine/index.js';
import { load } from '../../src/core/index.js';

/** The smallest script that reaches one of the two reads. */
function readSource(name: string): string {
  const read =
    name === 'req.symbol'
      ? 'req.symbol("SYMBOL", "1D", close)'
      : 'req.timeframe("1D", close)';
  return `version 1
study("Capability")

plot(${read}, "D", aqua)
`;
}

/**
 * A host that can date a calendar bucket.
 *
 * A day, a week and a month are folded by the calendar rather than by counting,
 * so a read at one of them needs the instrument's timezone. A host that states
 * none leaves the read absent, which is the answer `library/dates.ts` gives to
 * the same question and is not the state these tests are about.
 */
const ZONED = { instrument: { ...HOST.instrument, timezone: 'UTC' } };

/** A day of one minute bars, which a daily read folds into two buckets. */
function minuteBars(): readonly HostBar[] {
  const start = Date.UTC(2025, 0, 6, 9, 0, 0);
  const out: HostBar[] = [];
  for (let i = 0; i < 48; i += 1) {
    const price = 100 + i;
    const day = Math.floor(i / 24) * 86_400_000;
    out.push({
      open: price,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 10,
      time: start + day + (i % 24) * 60_000,
    });
  }
  return out;
}

/** What a provider answers with, for the read that needs one. */
function dailyBars(): readonly HostBar[] {
  const start = Date.UTC(2025, 0, 6, 0, 0, 0);
  const out: HostBar[] = [];
  for (let i = 0; i < 3; i += 1) {
    const price = 200 + i;
    out.push({
      open: price,
      high: price + 2,
      low: price - 2,
      close: price,
      volume: 100,
      time: start + i * 86_400_000,
    });
  }
  return out;
}


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
    isSessionFirst: null,
    isSessionLast: null,
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
    },
    position: { size: () => null, avgPrice: () => null },
    state: {},
    guard: {
      array: () => undefined,
      string: (_span: unknown, text: string) => text,
      chars: () => undefined,
      drawing: () => undefined,
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
function fold(
  name: string,
  rows: readonly (readonly Value[])[],
  bars?: readonly Bar[],
  sessions?: readonly boolean[],
): Value[] {
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
      isSessionFirst: sessions?.[bar] === true,
    };
    out.push(of.call(context, rows[bar] ?? []));
  }
  return out;
}

/** The trio a multi-value call returned, read back out of the heap. */
function trios(
  name: string,
  rows: readonly (readonly Value[])[],
  bars?: readonly Bar[],
): Numeric[][] {
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
    ['dema', [4], numeric.dema(SERIES, 4)],
    ['tema', [4], numeric.tema(SERIES, 4)],
    ['swma', [], numeric.swma(SERIES)],
    ['alma', [5, 0.85, 6], numeric.alma(SERIES, 5, 0.85, 6)],
    // A non-zero offset, because zero is the one value that cannot tell a
    // binding that dropped the argument from one that read it.
    ['linreg', [5, 2], numeric.linreg(SERIES, 5, 2)],
    ['percentRank', [5], numeric.percentRank(SERIES, 5)],
    ['trix', [3], numeric.trix(SERIES, 3)],
    ['tsi', [7, 4], numeric.tsi(SERIES, 7, 4)],
    ['cmo', [5], numeric.cmo(SERIES, 5)],
    ['dpo', [6], numeric.dpo(SERIES, 6)],
    ['hv', [5, 252], numeric.hv(SERIES, 5, 252)],
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

/**
 * The readings `stdlib.md` writes with no source argument.
 *
 * Each one is about the whole bar, so the binding has to reach the bar rather
 * than an argument, and reaching for the wrong one of the four prices is the
 * mistake this catches: every one of them type checks and every one of them
 * draws a plausible line.
 */
test('the readings taken from the bar itself match the numeric library', () => {
  const empty = BARS.map(() => []);
  const cases: readonly [string, readonly Value[], readonly Numeric[]][] = [
    ['cci', [5], numeric.cci(BARS, 5)],
    ['williamsR', [5], numeric.williamsR(BARS, 5)],
    ['chop', [5], numeric.chop(BARS, 5)],
    ['awesomeOsc', [3, 8], numeric.awesomeOsc(BARS, 3, 8)],
    ['ultimateOsc', [3, 5, 8], numeric.ultimateOsc(BARS, 3, 5, 8)],
    ['adOsc', [3, 6], numeric.adOsc(BARS, 3, 6)],
    ['mfi', [5], numeric.mfi(BARS, 5)],
    ['cmf', [5], numeric.cmf(BARS, 5)],
    ['eom', [5], numeric.eom(BARS, 5)],
    ['forceIndex', [5], numeric.forceIndex(BARS, 5)],
    ['relativeVolume', [5], numeric.relativeVolume(BARS, 5)],
  ];
  for (const [name, rest, expected] of cases) {
    assert.deepEqual(fold(name, BARS.map(() => rest), BARS), expected, name);
  }
  assert.deepEqual(fold('obv', empty, BARS), numeric.obv(BARS), 'obv');
  assert.deepEqual(fold('ad', empty, BARS), numeric.ad(BARS), 'ad');
  assert.deepEqual(fold('pvt', empty, BARS), numeric.pvt(BARS), 'pvt');
});

/** The volume every bar carried, for the calls weighted by it. */
const VOLUMES: readonly Numeric[] = BARS.map((one) => one.volume);

test('the volume weighted averages read the volume from the bar', () => {
  assert.deepEqual(
    fold('vwma', SERIES.map((one) => [one, 4]), BARS),
    numeric.vwma(SERIES, VOLUMES, 4),
    'vwma',
  );
  // Both a plain type and the volume weighted one, because the second is the
  // only argument path that reaches the bar and a binding can serve one
  // correctly while dropping the other.
  for (const type of ['ema', 'vwma'] as const) {
    assert.deepEqual(
      fold('ma', SERIES.map((one) => [one, 4, type]), BARS),
      numeric.ma(SERIES, VOLUMES, 4, type),
      `ma ${type}`,
    );
  }
  // A type the six do not include is absence throughout, never a quiet fall
  // back to the simple mean.
  assert.deepEqual(
    fold('ma', SERIES.map((one) => [one, 4, 'nonesuch']), BARS),
    SERIES.map(() => null),
    'ma with an unrecognised type',
  );
});

test('the anchored averages take their anchor from the right place', () => {
  const resets = FLAGS.map((one) => one === true);
  assert.deepEqual(
    fold('vwapAnchor', SERIES.map((one, index) => [one, FLAGS[index] ?? null]), BARS),
    numeric.vwapAnchor(SERIES, VOLUMES, resets),
    'vwapAnchor',
  );
  // `vwap` takes its anchor from the bar's session flag rather than from an
  // argument, which is the whole difference between the two calls.
  assert.deepEqual(
    fold('vwap', SERIES.map((one) => [one]), BARS, resets),
    numeric.vwap(SERIES, VOLUMES, resets),
    'vwap',
  );
});

test('the two joint statistics match the numeric library', () => {
  const rows = SERIES.map((one, index) => [one, OTHER[index] ?? null, 5]);
  assert.deepEqual(fold('correlation', rows), numeric.correlation(SERIES, OTHER, 5), 'correlation');
  assert.deepEqual(fold('covariance', rows), numeric.covariance(SERIES, OTHER, 5), 'covariance');
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
  assert.deepEqual(
    trios('psar', BARS.map(() => [0.02, 0.02, 0.2]), BARS),
    numeric.psar(BARS, 0.02, 0.02, 0.2),
    'psar',
  );
  // Two different lengths, because `adx` passes one to three smoothings and the
  // other to a fourth, and equal lengths would not tell the two apart.
  assert.deepEqual(trios('adx', BARS.map(() => [4, 6]), BARS), numeric.adx(BARS, 4, 6), 'adx');
  assert.deepEqual(trios('aroon', BARS.map(() => [5]), BARS), numeric.aroon(BARS, 5), 'aroon');
  assert.deepEqual(
    trios('ichimoku', BARS.map(() => [3, 5, 7]), BARS),
    numeric.ichimoku(BARS, 3, 5, 7),
    'ichimoku',
  );
  assert.deepEqual(
    trios('stoch', BARS.map(() => [5, 2, 3]), BARS),
    numeric.stoch(BARS, 5, 2, 3),
    'stoch',
  );
  assert.deepEqual(
    trios('stochRsi', SERIES.map((one) => [one, 4, 5, 2, 3])),
    numeric.stochRsi(SERIES, 4, 5, 2, 3),
    'stochRsi',
  );
  assert.deepEqual(
    trios('ppo', SERIES.map((one) => [one, 4, 9, 3])),
    numeric.ppo(SERIES, 4, 9, 3),
    'ppo',
  );
  assert.deepEqual(
    trios('keltner', BARS.map(() => [5, 2, 4, 'ema']), BARS),
    numeric.keltner(BARS, 5, 2, 4, 'ema'),
    'keltner',
  );
});

/**
 * `text(x, d)` at a magnitude the runtime writes with an exponent.
 *
 * A price and a cumulative volume both reach the size where a runtime's own
 * decimal conversion switches to exponential form, and a formatter that split
 * the digits of `1e+22` returned `1e+.22`: a label with nonsense in it, on a
 * chart, with nothing reported anywhere. The conversion is positional at every
 * magnitude, which is the only rule under which the digits it splits are
 * digits.
 *
 * The rows below are the boundary and each side of it, and the ordinary values
 * are here because the fix must not move them by a digit.
 */
test('a fixed decimal conversion is positional at every magnitude', () => {
  const rows: readonly (readonly [number, number, string])[] = [
    [3.14159, 2, '3.14'],
    [-0.4, 0, '0'],
    [-2.5, 0, '-3'],
    [9.99, 1, '10.0'],
    [1e20, 2, '100000000000000000000.00'],
    [1e21, 0, `1${'0'.repeat(21)}`],
    [1e21, 2, `1${'0'.repeat(21)}.00`],
    [-1e21, 3, `-1${'0'.repeat(21)}.000`],
    [1e308, 2, `1${'0'.repeat(308)}.00`],
    [0.5, 25, `0.5${'0'.repeat(24)}`],
    [-0.5, 320, `-0.5${'0'.repeat(319)}`],
    [0, 3, '0.000'],
  ];
  for (const [x, decimals, want] of rows) {
    assert.equal(fold('text', [[x, decimals]])[0], want, `text(${x}, ${decimals})`);
  }
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
  'ad', 'adOsc', 'adx', 'alma', 'aroon', 'atr', 'avgSkip', 'awesomeOsc',
  'barsSince', 'bbPercent', 'bbWidth', 'bollinger', 'cci', 'change', 'chop',
  'cmf', 'cmo', 'correlation', 'count', 'countPresent', 'covariance', 'cross',
  'crossDown', 'crossUp', 'cum', 'dema', 'donchian', 'dpo', 'ema', 'eom',
  'falling', 'forceIndex', 'highest', 'highestBars', 'history', 'hma', 'hv',
  'ichimoku', 'keltner', 'linreg', 'lowest', 'lowestBars', 'ma', 'macd',
  'median', 'mfi', 'mom', 'natr', 'obv', 'percentRank', 'percentile',
  'pivotHigh', 'pivotLow', 'ppo', 'psar', 'pvt', 'relativeVolume', 'rising',
  'rma', 'roc', 'rsi', 'sma', 'stdev', 'stoch', 'stochRsi', 'sum', 'sumSkip',
  'supertrend', 'swma', 'tema', 'trix', 'tsi', 'ultimateOsc', 'valueWhen',
  'variance', 'vwap', 'vwapAnchor', 'vwma', 'williamsR', 'wma',
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

/**
 * The other direction of 2.5, and the one a consumer feels.
 *
 * A name the checker accepts compiles. A name the engine's manifest lacks is
 * refused at load with OS6004, which names a function and says nothing about
 * why. Between the two there is a third state that must not exist: a name the
 * documentation promises, the checker accepts, the compiler emits, and no
 * engine will run. A reader following the reference page writes it, it
 * compiles, and it then fails with a message they cannot act on.
 *
 * So every name the checker accepts either runs or is marked planned, and this
 * is what keeps it so. The three subtractions are the three ways a name reaches
 * a program without being a `CALL_LIB`, and each is taken from the module that
 * owns it rather than listed again here.
 *
 * **None of the three is an exemption for a name nothing executes.** A bar field
 * is a `"bar"` register the engine fills at step 4, a read is a `"request"`
 * register it fills at the same step, and a declaration is an entry in
 * `outputs`. Each of those runs, reached by something other than a `CALL_LIB`,
 * and the two tests below run the reads. A round that skipped the reads here
 * because no engine executed them is what this paragraph is about: the skip
 * outlived its reason by a whole phase, and nothing noticed.
 */
test('every name the checker accepts runs, says it is planned, or is a register', () => {
  const registers = new Set([...BAR_FIELDS, ...BAR_FACTS]);
  const unrunnable: string[] = [];
  for (const name of libraryNames()) {
    // A declaration is a fixed entry in `outputs`, not a call an engine makes.
    if (DECLARATION_CALLS.has(name)) continue;
    // A read is a `"request"` register, filled at step 4 from the fold of
    // `compiled-program.md` 2.16 rather than by an instruction of its own.
    if (REQUEST_CALLS.has(name)) continue;
    for (const one of libraryEntries(name)) {
      if (one.planned) continue;
      if (!one.callable && registers.has(name)) continue;
      const arity = one.callable ? one.parameters.length : 0;
      if (manifestEntry(name, arity) === undefined) unrunnable.push(`${name}/${arity}`);
    }
  }
  assert.deepEqual(
    unrunnable,
    [],
    'these compile and no engine will run them: wire them, or mark them planned',
  );
});

/**
 * The half of the rule above that an exemption would have hidden.
 *
 * A previous round skipped these two names and wrote a comment saying the format
 * had no field to carry them. The format had the fields, the emitter filled them,
 * and the engine refused the result with a message blaming the compiler that
 * wrote it. The skip is what let that sit.
 *
 * So neither name is taken on trust. Each must compile, carry its tag, and put a
 * number on a bar. Nothing here passes because a refusal exists somewhere.
 */
test('each read compiles, tags itself, and puts a value on a bar', () => {
  const answer = dailyBars();
  const bars = minuteBars();
  for (const name of REQUEST_CALLS) {
    const compiled = compile(name, readSource(name));
    assert.deepEqual(
      compiled.diagnostics.map((one) => one.code),
      [],
      `${name}: a read must compile cleanly, not be refused at the call`,
    );
    assert.ok(compiled.program, `${name}: a read must produce a program`);
    assert.ok(
      compiled.program.requires.includes(name),
      `${name}: the program must carry the capability tag, or an engine cannot know what it needs`,
    );

    const loaded = load(asWire(compiled.program), {
      host: { ...ZONED, requestBars: () => ({ bars: answer }) },
    });
    assert.equal(loaded.ok, true, `${name}: a host that can answer it must be able to run it`);
    if (!loaded.ok) continue;
    loaded.engine.run(bars, bars.map(() => ({ isConfirmed: true })));
    assert.ok(
      loaded.engine.column(0).some((value) => typeof value === 'number'),
      `${name}: a read that never produces a value is a plot that is always absent`,
    );
  }
});

/**
 * The refusal the tag exists for, which outlives the feature being built.
 *
 * `req.symbol` needs bars the engine does not hold and cannot derive, so a host
 * with no request provider cannot serve one. The program says what it needs and
 * the engine says what it lacks, by name, at load. That is the path a second
 * engine comes through for whatever it has not built yet, so it is proved here
 * rather than assumed.
 */
test('a read the host cannot serve is refused at load, by name', () => {
  const compiled = compile('req.symbol', readSource('req.symbol'));
  assert.ok(compiled.program);
  const loaded = load(asWire(compiled.program), { host: ZONED });
  assert.equal(loaded.ok, false, 'a host with no request provider must refuse');
  if (loaded.ok) return;
  assert.equal(loaded.diagnostic.code, 'OS6006');
  assert.equal(loaded.diagnostic.values['tag'], 'req.symbol');
});

test('the engine implements every call the runnable target scripts make', () => {
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
