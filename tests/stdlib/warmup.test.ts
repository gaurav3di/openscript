/**
 * Every warmup `stdlib.md` declares, checked as an index.
 *
 * A warmup is a promise, not a hint: a conforming engine returns absence on
 * exactly the bars before it and no others. Two engines that disagree about a
 * single warmup bar fail the conformance suite, which is the point of writing
 * the lengths down rather than saying "after a while".
 *
 * The wrong implementation this file exists to catch is the one that produces
 * the right numbers a bar early or a bar late. Such an implementation passes
 * every value comparison that starts at its own first value, and only an
 * assertion on the index catches it.
 */
import { test } from 'node:test';

import type { Flag, Value } from '../../src/core/stdlib/index.js';
import * as lib from '../../src/core/stdlib/index.js';

import { BARS } from './vectors.js';
import { assertWarmup, column } from './support.js';

const CLOSE = BARS.map((bar) => bar.close);
const VOLUME = BARS.map((bar) => bar.volume);
const OTHER = BARS.map((bar) => bar.open);
const FLAGS: Flag[] = BARS.map((_bar, index) => index % 3 === 0);

/** One row: what was called, what it produced, and the bar it must start on. */
interface Row {
  readonly what: string;
  readonly series: Value[];
  readonly from: number;
}

function single(what: string, series: Value[], from: number): Row {
  return { what, series, from };
}

function multi(what: string, rows: Value[][], froms: readonly number[]): Row[] {
  return froms.map((from, index) =>
    single(`${what}[${index}]`, column(rows, index), from),
  );
}

const ROWS: Row[] = [
  // Section 4, moving averages and trend.
  single('sma(src, 10)', lib.sma(CLOSE, 10), 9),
  single('ema(src, 10)', lib.ema(CLOSE, 10), 9),
  single('wma(src, 10)', lib.wma(CLOSE, 10), 9),
  single('rma(src, 10)', lib.rma(CLOSE, 10), 9),
  single('hma(src, 9)', lib.hma(CLOSE, 9), 10),
  single('dema(src, 10)', lib.dema(CLOSE, 10), 18),
  single('tema(src, 10)', lib.tema(CLOSE, 10), 27),
  single('vwma(src, 10)', lib.vwma(CLOSE, VOLUME, 10), 9),
  single('swma(src)', lib.swma(CLOSE), 3),
  single('alma(src, 9)', lib.alma(CLOSE, 9), 8),
  single('linreg(src, 10)', lib.linreg(CLOSE, 10), 9),
  single('ma(src, 10, "ema")', lib.ma(CLOSE, VOLUME, 10, 'ema'), 9),
  ...multi('supertrend(3, 10)', lib.supertrend(BARS, 3, 10), [10, 10]),
  ...multi('psar()', lib.psar(BARS), [1, 1]),
  ...multi('adx(14, 14)', lib.adx(BARS, 14, 14), [27, 14, 14]),
  ...multi('aroon(14)', lib.aroon(BARS, 14), [14, 14]),
  ...multi('ichimoku(9, 26, 52)', lib.ichimoku(BARS, 9, 26, 52), [8, 25, 25, 51, 25]),

  // Section 5, momentum and oscillators.
  single('rsi(src, 14)', lib.rsi(CLOSE, 14), 14),
  ...multi('stoch(14, 1, 3)', lib.stoch(BARS, 14, 1, 3), [13, 15]),
  ...multi('stochRsi(src, 14, 14, 3, 3)', lib.stochRsi(CLOSE, 14, 14, 3, 3), [29, 31]),
  ...multi('macd(src, 12, 26, 9)', lib.macd(CLOSE, 12, 26, 9), [25, 33, 33]),
  ...multi('ppo(src, 12, 26, 9)', lib.ppo(CLOSE, 12, 26, 9), [25, 33, 33]),
  single('cci(20)', lib.cci(BARS, 20), 19),
  single('mom(src, 10)', lib.mom(CLOSE, 10), 10),
  single('roc(src, 9)', lib.roc(CLOSE, 9), 9),
  single('williamsR(14)', lib.williamsR(BARS, 14), 13),
  single('tsi(src, 25, 13)', lib.tsi(CLOSE, 25, 13), 37),
  single('trix(src, 18)', lib.trix(CLOSE, 18), 52),
  single('cmo(src, 9)', lib.cmo(CLOSE, 9), 9),
  single('dpo(src, 21)', lib.dpo(CLOSE, 21), 31),
  single('ultimateOsc(7, 14, 28)', lib.ultimateOsc(BARS, 7, 14, 28), 28),
  single('awesomeOsc(5, 34)', lib.awesomeOsc(BARS, 5, 34), 33),

  // Section 6, volatility and ranges.
  single('trueRange()', lib.trueRange(BARS), 0),
  single('atr(14)', lib.atr(BARS, 14), 13),
  single('natr(14)', lib.natr(BARS, 14), 13),
  single('stdev(src, 10)', lib.stdev(CLOSE, 10), 9),
  single('variance(src, 10)', lib.variance(CLOSE, 10), 9),
  ...multi('bollinger(src, 20, 2)', lib.bollinger(CLOSE, 20, 2), [19, 19, 19]),
  single('bbWidth(src, 20, 2)', lib.bbWidth(CLOSE, 20, 2), 19),
  single('bbPercent(src, 20, 2)', lib.bbPercent(CLOSE, 20, 2), 19),
  ...multi('keltner(20, 2, 10)', lib.keltner(BARS, 20, 2, 10), [19, 19, 19]),
  ...multi('donchian(20)', lib.donchian(BARS, 20), [19, 19, 19]),
  single('chop(14)', lib.chop(BARS, 14), 14),
  single('hv(src, 20, 252)', lib.hv(CLOSE, 20, 252), 20),

  // Section 7, volume.
  single('obv()', lib.obv(BARS), 0),
  single('ad()', lib.ad(BARS), 0),
  single('adOsc(3, 10)', lib.adOsc(BARS, 3, 10), 9),
  single('mfi(14)', lib.mfi(BARS, 14), 14),
  single('cmf(20)', lib.cmf(BARS, 20), 19),
  single('pvt()', lib.pvt(BARS), 1),
  single('eom(14)', lib.eom(BARS, 14), 14),
  single('forceIndex(13)', lib.forceIndex(BARS, 13), 13),
  single('relativeVolume(20)', lib.relativeVolume(BARS, 20), 19),

  // Section 9, series helpers.
  single('highest(src, 20)', lib.highest(CLOSE, 20), 19),
  single('lowest(src, 20)', lib.lowest(CLOSE, 20), 19),
  single('highestBars(src, 20)', lib.highestBars(CLOSE, 20), 19),
  single('lowestBars(src, 20)', lib.lowestBars(CLOSE, 20), 19),
  single('change(src)', lib.change(CLOSE), 1),
  single('change(src, 5)', lib.change(CLOSE, 5), 5),
  single('cum(src)', lib.cum(CLOSE), 0),
  single('sum(src, 20)', lib.sum(CLOSE, 20), 19),
  single('count(cond, 20)', lib.count(FLAGS, 20), 19),
  single('sumSkip(src, 20)', lib.sumSkip(CLOSE, 20), 19),
  single('avgSkip(src, 20)', lib.avgSkip(CLOSE, 20), 19),
  single('countPresent(src, 20)', lib.countPresent(CLOSE, 20), 19),
  single('history(src, 5)', lib.history(CLOSE, 5), 5),
  single('median(src, 5)', lib.median(CLOSE, 5), 4),
  single('percentile(src, 5, 50)', lib.percentile(CLOSE, 5, 50), 4),
  single('percentRank(src, 20)', lib.percentRank(CLOSE, 20), 19),
  single('correlation(a, b, 20)', lib.correlation(CLOSE, OTHER, 20), 19),
  single('covariance(a, b, 20)', lib.covariance(CLOSE, OTHER, 20), 19),
];

for (const row of ROWS) {
  test(`${row.what} first has a value at bar ${row.from}`, () => {
    assertWarmup(row.series, row.from, row.what);
  });
}

// `rising` and `falling` return a condition rather than a number, so their
// warmup is the first bar that is not absent rather than the first that is
// true. Bar `len` is where the last `len` changes first all exist.
test('rising and falling are absent until bar len', () => {
  const flags = lib.rising(CLOSE, 3);
  const falls = lib.falling(CLOSE, 3);
  for (let index = 0; index < 3; index += 1) {
    if (flags[index] !== null || falls[index] !== null) {
      throw new Error(`rising or falling had an answer at bar ${index}`);
    }
  }
  if (flags[3] === null || falls[3] === null) throw new Error('no answer at bar 3');
});

// A crossing is knowable from bar 1, and the answer on a bar with no crossing
// is false rather than absent: absence would mean "not yet knowable", which is
// a different statement.
test('a crossing is absent on bar 0 and answers from bar 1', () => {
  const crossings = lib.crossUp(CLOSE, lib.sma(CLOSE, 5));
  if (crossings[0] !== null) throw new Error('bar 0 should be absent');
  if (crossings[5] !== true && crossings[5] !== false) {
    throw new Error('bar 5 should be an answer, not absence');
  }
});
