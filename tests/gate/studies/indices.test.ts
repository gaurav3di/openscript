/**
 * Readings built out of running totals, stacked smoothings and bar counts.
 *
 * The group exists for the warmups. Every study here is built on something that
 * is itself absent on bar 0 or absent until its own window fills, so the first
 * bar it can draw on is two or three warmups end to end rather than one length.
 * A study that starts one bar early here is not a cosmetic fault: it is a
 * reading taken from a window that was short by a bar, and every value after it
 * inherits that.
 *
 * One of the six does not reproduce its reference, and the disagreement is
 * measured here rather than hidden behind a tolerance. See the directional
 * reading below.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertWarmup } from '../../stdlib/support.js';

import {
  asSeries,
  blank,
  fromFirst,
  has,
  seededMean,
  trueRange,
  wilderMean,
  windowHighBars,
  windowLowBars,
  windowSum,
} from './arithmetic.js';
import type { RefSeries } from './arithmetic.js';
import {
  CLOSE,
  HIGH,
  LOW,
  REF_BARS,
  VOLUME,
  assertColumn,
  column,
  deviation,
  levelColumn,
  runStudy,
} from './harness.js';

/** Every bar of a column carries the same constant, which is what a level is. */
function flat(value: number): (number | null)[] {
  return CLOSE.map(() => value);
}

/** The money flow term both accumulation studies are built from. */
function flowTerm(): RefSeries {
  return CLOSE.map((close, bar) => {
    const high = HIGH[bar] as number;
    const low = LOW[bar] as number;
    const degenerate = (close === high && close === low) || high === low;
    return degenerate ? 0 : ((2 * close - low - high) / (high - low)) * (VOLUME[bar] as number);
  });
}

/** A running total from bar 0, which is what an accumulation line is. */
function accumulate(values: RefSeries): RefSeries {
  const out = blank(values.length);
  let total = 0;
  for (let bar = 0; bar < values.length; bar += 1) {
    total += values[bar] as number;
    out[bar] = total;
  }
  return out;
}

interface RefDirectional {
  readonly plus: RefSeries;
  readonly minus: RefSeries;
  readonly strength: RefSeries;
}

/**
 * The directional readings as the sibling computes them.
 *
 * Two details are the sibling's own and both are transcribed rather than
 * tidied: bar 0's true range is dropped, because seeding a smoothing on the
 * bar-0 substitute starts the whole study a bar early; and bar 0's two
 * directional moves are **zero** rather than absent, because the bar has no
 * predecessor to have moved against.
 */
function directional(diLen: number, adxLen: number): RefDirectional {
  const n = CLOSE.length;
  const range = trueRange(REF_BARS);
  range[0] = Number.NaN;
  const up = new Array<number>(n).fill(0);
  const down = new Array<number>(n).fill(0);
  for (let bar = 1; bar < n; bar += 1) {
    const rise = (HIGH[bar] as number) - (HIGH[bar - 1] as number);
    const fall = (LOW[bar - 1] as number) - (LOW[bar] as number);
    up[bar] = rise > fall && rise > 0 ? rise : 0;
    down[bar] = fall > rise && fall > 0 ? fall : 0;
  }
  const smoothedRange = fromFirst(range, (tail) => wilderMean(tail, diLen));
  const smoothedUp = wilderMean(up, diLen);
  const smoothedDown = wilderMean(down, diLen);

  const plus = blank(n);
  const minus = blank(n);
  const spread = blank(n);
  let heldPlus = Number.NaN;
  let heldMinus = Number.NaN;
  for (let bar = 0; bar < n; bar += 1) {
    const width = smoothedRange[bar] as number;
    if (Number.isFinite(width) && width !== 0) {
      heldPlus = ((smoothedUp[bar] as number) / width) * 100;
      heldMinus = ((smoothedDown[bar] as number) / width) * 100;
    }
    if (!Number.isFinite(heldPlus) || !Number.isFinite(heldMinus)) continue;
    plus[bar] = heldPlus;
    minus[bar] = heldMinus;
    const total = heldPlus + heldMinus;
    spread[bar] = total > 0 ? (Math.abs(heldPlus - heldMinus) / total) * 100 : 0;
  }
  return {
    plus,
    minus,
    strength: fromFirst(spread, (tail) => wilderMean(tail, adxLen)),
  };
}

/**
 * **This study does not reproduce its reference, and the disagreement is
 * recorded rather than smoothed over.**
 *
 * The two directional moves are a change from the previous bar, and bar 0 has
 * no previous bar. The sibling writes zero there, on the reading that a bar
 * with nothing to move against has not moved. This library's absence
 * propagation gives nothing there instead, so its smoothing seeds from the mean
 * of bars 1 to `diLen` where the sibling seeds from bars 0 to `diLen - 1`. Both
 * readings first print on the same bar, which is what `stdlib.md` section 4
 * declares, and the values differ from that bar onward by the weight of one
 * term in the seed.
 *
 * The gate asserts the shape of the difference rather than an epsilon: the two
 * agree on which bars they draw, and the deviation is measured and reported.
 */
test('the directional readings, and where they part from the reference', () => {
  const diLen = 14;
  const adxLen = 14;
  const run = runStudy('directional-strength', { settings: { diLen, adxLen } });
  const expected = directional(diLen, adxLen);

  const plus = column(run, 'Up');
  const minus = column(run, 'Down');
  const strength = column(run, 'Strength');

  assertWarmup(plus, diLen, 'the rising reading');
  assertWarmup(minus, diLen, 'the falling reading');
  assertWarmup(strength, diLen + adxLen - 1, 'the strength reading');

  const apart = deviation(plus, asSeries(expected.plus));
  assert.equal(apart.absences, 0, 'the two agree on which bars carry a reading');
  assert.equal(apart.firstAt, diLen, 'and they differ from the first bar either of them draws');
  // Pinned rather than bounded. The number is what one term of the seed is
  // worth on this fixture, so a change on either side of the comparison moves
  // it and fails here instead of drifting quietly.
  assert.equal(apart.largestAt, diLen, 'the difference is largest on the first bar it draws');
  assert.equal(
    apart.largest,
    1.6135204081632573,
    `the rising reading is ${apart.largest} from the reference at bar ${apart.largestAt}`,
  );
  assertColumn(levelColumn(run, 'Trending'), flat(25), 'the trending level');
});

/**
 * Catches: a reading built from a window of `len` bars rather than `len + 1`,
 * which makes a reading of zero unreachable; and the other sign convention for
 * a bar count, which turns every hundred into a zero.
 */
for (const len of [14, 25] as const) {
  test(`how recently the window set each extreme, at length ${len}`, () => {
    const run = runStudy('aroon-rise', { settings: { len } });
    const sinceHigh = windowHighBars(HIGH, len + 1);
    const sinceLow = windowLowBars(LOW, len + 1);

    assertColumn(
      column(run, 'Rising'),
      asSeries(sinceHigh.map((one) => (100 * (len - one)) / len)),
      `rising at ${len}`,
    );
    assertColumn(
      column(run, 'Falling'),
      asSeries(sinceLow.map((one) => (100 * (len - one)) / len)),
      `falling at ${len}`,
    );
    assertWarmup(column(run, 'Rising'), len, `rising at ${len}`);
    assert.equal(run.bands.length, 1, 'one band between the two readings');
  });
}

/**
 * Catches: the second smoothing seeded from bar 0 of a series whose first eight
 * bars are absent, and a window summed across that gap. Either one prints the
 * reading many bars early, from terms that do not exist.
 */
test('range expansion against its own recent expansion, summed over a window', () => {
  const len = 10;
  const smoothLen = 9;
  const run = runStudy('mass-expansion', { settings: { len } });
  const reach = HIGH.map((high, bar) => high - (LOW[bar] as number));
  const single = seededMean(reach, smoothLen);
  const double = fromFirst(single, (tail) => seededMean(tail, smoothLen));
  const ratio = blank(CLOSE.length);
  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    if (!has(single[bar]) || !has(double[bar]) || double[bar] === 0) continue;
    ratio[bar] = (single[bar] as number) / (double[bar] as number);
  }

  assertColumn(column(run, 'Mass'), asSeries(windowSum(ratio, len)), 'mass');
  // Two smoothings and a window, end to end: bar 8, then bar 16, then bar 25.
  assertWarmup(column(run, 'Mass'), (smoothLen - 1) * 2 + len - 1, 'mass');
});

/**
 * Catches: a running total that takes an absent term on a bar with no range,
 * which blanks every bar after it; and two smoothings seeded from different
 * bars, which is what feeding the running total's own warmup to them would do.
 */
test('the difference between two smoothings of the accumulation line', () => {
  const fastLen = 3;
  const slowLen = 10;
  const run = runStudy('chaikin-swing', { settings: { fastLen, slowLen } });
  const line = accumulate(flowTerm());
  const fast = seededMean(line, fastLen);
  const slow = seededMean(line, slowLen);

  assertColumn(
    column(run, 'Swing'),
    asSeries(fast.map((one, bar) => one - (slow[bar] as number))),
    'chaikin swing',
  );
  assertWarmup(column(run, 'Swing'), slowLen - 1, 'chaikin swing');
  assertColumn(levelColumn(run, 'Zero'), flat(0), 'the zero line');
});

/**
 * Catches: a running total that starts at the first bar with a range rather
 * than at bar 0, which shifts the whole line by whatever the early bars
 * contributed.
 */
test('the running total of where each bar closed inside its own range', () => {
  const run = runStudy('accumulation-flow');
  const term = CLOSE.map((close, bar) => {
    const high = HIGH[bar] as number;
    const low = LOW[bar] as number;
    const reach = high - low;
    return reach > 0 ? ((close - low - (high - close)) / reach) * (VOLUME[bar] as number) : 0;
  });

  assertColumn(column(run, 'Accumulation'), asSeries(accumulate(term)), 'accumulation');
  assertWarmup(column(run, 'Accumulation'), 0, 'accumulation');
});

/**
 * Catches: a share taken over a window that traded nothing, which is a division
 * with no answer rather than a zero share.
 */
test('the money flow term as a share of the volume behind it', () => {
  const len = 20;
  const run = runStudy('flow-share', { settings: { len } });
  const flow = windowSum(flowTerm(), len);
  const traded = windowSum(VOLUME, len);
  const expected = blank(CLOSE.length);
  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    if (!has(flow[bar]) || !has(traded[bar]) || (traded[bar] as number) <= 0) continue;
    expected[bar] = (flow[bar] as number) / (traded[bar] as number);
  }

  assertColumn(column(run, 'Share'), asSeries(expected), 'flow share');
  assertWarmup(column(run, 'Share'), len - 1, 'flow share');
});
