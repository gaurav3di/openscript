/**
 * Studies whose picture is a pair of rails and the region between them.
 *
 * Three surfaces beyond the Phase 2 gate's columns are under test here. A band
 * is a declaration that names two **plot handles**, which is the one
 * compile-time value in the language that is not a number, so the band's entry
 * has to carry the two plot keys and not two series. A level is a horizontal
 * reference the host redraws after every calculation. And a rail built from two
 * calculations with different warmups starts at the later of the two, which is
 * where a study that starts at the earlier one draws a rail from a range that
 * has not warmed up.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertWarmup } from '../../stdlib/support.js';

import {
  asSeries,
  averageRange,
  blank,
  has,
  regressionOf,
  seededMean,
  windowHigh,
  windowLow,
  windowMean,
  windowStdev,
} from './arithmetic.js';
import type { RefSeries } from './arithmetic.js';
import {
  CLOSE,
  HIGH,
  LOW,
  REF_BARS,
  assertColumn,
  column,
  levelColumn,
  runStudy,
} from './harness.js';

/** Every bar of a column carries the same constant, which is what a level is. */
function flat(value: number): (number | null)[] {
  return CLOSE.map(() => value);
}

/**
 * Catches: a band declared against the series rather than against the two plots
 * it joins, which the compiled format has nowhere to put; and rails computed
 * from a percentage that was not divided by a hundred, which is the same shape
 * of line ten times too wide.
 */
test('a mean with two rails a fixed percentage away, and the band between them', () => {
  const run = runStudy('envelope-band', { settings: { len: 20, percent: 10 } });
  const basis = windowMean(CLOSE, 20);

  assertColumn(column(run, 'Basis'), asSeries(basis), 'envelope basis');
  assertColumn(
    column(run, 'Upper'),
    asSeries(basis.map((one) => one * (1 + 10 / 100))),
    'envelope upper',
  );
  assertColumn(
    column(run, 'Lower'),
    asSeries(basis.map((one) => one * (1 - 10 / 100))),
    'envelope lower',
  );
  assertWarmup(column(run, 'Basis'), 19, 'envelope basis');

  assert.equal(run.bands.length, 1, 'one band');
  assert.deepEqual(
    (run.bands[0] as { between: readonly [string, string] }).between,
    ['p0', 'p2'],
    'the band joins the first and third declared plots',
  );
});

/**
 * Catches: a midpoint taken over the source rather than between the two
 * extremes, and an extreme that answers from a partial window, which draws a
 * channel that is right at the end of the fixture and wrong at the start of
 * every chart.
 */
test('the window high, its midpoint and the window low', () => {
  const run = runStudy('channel-rails', { settings: { len: 20 } });
  const top = windowHigh(HIGH, 20);
  const bottom = windowLow(LOW, 20);

  assertColumn(column(run, 'Upper'), asSeries(top), 'channel upper');
  assertColumn(column(run, 'Lower'), asSeries(bottom), 'channel lower');
  assertColumn(
    column(run, 'Basis'),
    asSeries(top.map((one, bar) => (one + (bottom[bar] as number)) / 2)),
    'channel basis',
  );
  assertWarmup(column(run, 'Upper'), 19, 'channel upper');
});

/**
 * Catches: a rail drawn from the bar the window warms up on rather than from
 * the bar the average range does, at the two lengths where those differ.
 */
for (const [window, rangeLen] of [
  [22, 22],
  [10, 30],
] as const) {
  test(`rails a range multiple in from the window extreme, ${window} against ${rangeLen}`, () => {
    const run = runStudy('chandelier-rails', {
      settings: { len: window, rngLen: rangeLen, mult: 3 },
    });
    const range = averageRange(REF_BARS, rangeLen);
    const top = windowHigh(HIGH, window);
    const bottom = windowLow(LOW, window);
    const longExit = top.map((one, bar) => one - 3 * (range[bar] as number));
    const shortExit = bottom.map((one, bar) => one + 3 * (range[bar] as number));

    assertColumn(column(run, 'Long exit'), asSeries(longExit), 'long exit');
    assertColumn(column(run, 'Short exit'), asSeries(shortExit), 'short exit');
    assertWarmup(column(run, 'Long exit'), Math.max(window, rangeLen) - 1, 'long exit');
  });
}

/**
 * Catches: a windowed extreme that answers over a series still warming up, by
 * skipping the absent bars instead of refusing the window. That implementation
 * prints a stop from bar 9 instead of bar 17 and the line it draws is a real
 * number taken from the wrong set of bars, which is the hardest kind of wrong
 * to see on a chart.
 */
test('a stop that is the running extreme of a rail that warms up late', () => {
  const run = runStudy('kroll-stop', { settings: { rngLen: 10, factor: 1, stopLen: 9 } });
  const range = averageRange(REF_BARS, 10);
  const highRail = windowHigh(HIGH, 10).map((one, bar) => one - 1 * (range[bar] as number));
  const lowRail = windowLow(LOW, 10).map((one, bar) => one + 1 * (range[bar] as number));

  assertColumn(column(run, 'Stop long'), asSeries(windowLow(lowRail, 9)), 'stop long');
  assertColumn(column(run, 'Stop short'), asSeries(windowHigh(highRail, 9)), 'stop short');
  assertWarmup(column(run, 'Stop long'), 10 + 9 - 2, 'stop long');
});

/**
 * Catches: rails built from the mean of the bar ranges rather than from the
 * mean of the two shifted series, which is a different line whenever the highs
 * and the lows do not move together.
 */
test('rails set a fraction of each bar own range away, then smoothed', () => {
  const factor = 0.001;
  const run = runStudy('acceleration-band', { settings: { len: 20, factor } });
  const upperSource = HIGH.map((high, bar) => {
    const low = LOW[bar] as number;
    const denominator = high + low;
    const ratio = denominator > 0 ? (4000 * factor * (high - low)) / denominator : 0;
    return high * (1 + ratio);
  });
  const lowerSource = LOW.map((low, bar) => {
    const high = HIGH[bar] as number;
    const denominator = high + low;
    const ratio = denominator > 0 ? (4000 * factor * (high - low)) / denominator : 0;
    return low * (1 - ratio);
  });

  assertColumn(column(run, 'Upper'), asSeries(windowMean(upperSource, 20)), 'acceleration upper');
  assertColumn(column(run, 'Basis'), asSeries(windowMean(CLOSE, 20)), 'acceleration basis');
  assertColumn(column(run, 'Lower'), asSeries(windowMean(lowerSource, 20)), 'acceleration lower');
  assertWarmup(column(run, 'Upper'), 19, 'acceleration upper');
});

/**
 * Catches: rails widened by a deviation of the closes rather than by the
 * average range, which is the same picture until the market gaps and then is
 * not, and a basis taken as a windowed mean where the study asks for a seeded
 * exponential one.
 */
test('a mean with rails a range multiple away from it', () => {
  const run = runStudy('keltner-rails', { settings: { len: 20, mult: 2, rngLen: 10 } });
  const basis = seededMean(CLOSE, 20);
  const range = averageRange(REF_BARS, 10);
  const offset = range.map((one) => one * 2);

  assertColumn(column(run, 'Basis'), asSeries(basis), 'keltner basis');
  assertColumn(
    column(run, 'Upper'),
    asSeries(basis.map((one, bar) => one + (offset[bar] as number))),
    'keltner upper',
  );
  assertColumn(
    column(run, 'Lower'),
    asSeries(basis.map((one, bar) => one - (offset[bar] as number))),
    'keltner lower',
  );
  assertWarmup(column(run, 'Basis'), 19, 'keltner basis');
});

/**
 * Catches: a reading that invents an answer where the two rails meet, which on
 * a flat window is a fabricated signal at the exact moment a squeeze study is
 * being read; and a level column that is drawn only after the study warms up,
 * where a level is a reference line the pane carries on every bar.
 */
test('where the source sits between its own deviation rails', () => {
  const run = runStudy('band-position', { settings: { len: 20, mult: 2 } });
  const basis = windowMean(CLOSE, 20);
  const spread = windowStdev(CLOSE, 20);
  const position: RefSeries = blank(CLOSE.length);
  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    if (!has(basis[bar]) || !has(spread[bar])) continue;
    const upper = (basis[bar] as number) + 2 * (spread[bar] as number);
    const lower = (basis[bar] as number) - 2 * (spread[bar] as number);
    const span = upper - lower;
    if (span > 0) position[bar] = ((CLOSE[bar] as number) - lower) / span;
  }

  assertColumn(column(run, 'Position'), asSeries(position), 'band position');
  assertWarmup(column(run, 'Position'), 19, 'band position');
  assertColumn(levelColumn(run, 'Upper rail'), flat(1), 'the upper reference line');
  assertColumn(levelColumn(run, 'Middle'), flat(0.5), 'the middle reference line');
  assertColumn(levelColumn(run, 'Lower rail'), flat(0), 'the lower reference line');
});

/**
 * The residual spread of the closes about the line fitted to the window.
 *
 * The window's positions run 1 to `periods`, newest first, which is the order
 * the study's own loop walks, and only their spacing reaches the answer.
 */
function fittedError(values: readonly number[], periods: number): RefSeries {
  const out = blank(values.length);
  const meanX = (periods + 1) / 2;
  for (let i = periods - 1; i < values.length; i += 1) {
    let total = 0;
    for (let k = 0; k < periods; k += 1) total += values[i - k] as number;
    const meanY = total / periods;
    let squaresY = 0;
    let crossXY = 0;
    let squaresX = 0;
    for (let k = 0; k < periods; k += 1) {
      const stepY = meanY - (values[i - k] as number);
      const stepX = meanX - k - 1;
      squaresY += stepY * stepY;
      crossXY += stepX * stepY;
      squaresX += stepX * stepX;
    }
    out[i] = Math.sqrt((squaresY - (crossXY * crossXY) / squaresX) / (periods - 2));
  }
  return out;
}

/**
 * Catches: a band whose width is recomputed around the smoothed middle rather
 * than smoothed with it, which is a different pair of rails; and a divisor of
 * `periods` under the residual, which makes this a deviation and shrinks every
 * rail by a fixed ratio that looks like a scaling choice.
 */
test('a band around the fitted line, each leg smoothed on its own', () => {
  const periods = 21;
  const errors = 2;
  const avgLen = 3;
  const run = runStudy('fitted-error-band', { settings: { periods, errors, avgLen } });

  const spread = fittedError(CLOSE, periods);
  const middle = regressionOf(CLOSE, periods, 0);
  const smooth = (values: RefSeries): (number | null)[] => asSeries(windowMean(values, avgLen));

  assertColumn(column(run, 'Basis'), smooth(middle), 'fitted basis');
  assertColumn(
    column(run, 'Upper'),
    smooth(middle.map((one, bar) => one + errors * (spread[bar] as number))),
    'fitted upper',
  );
  assertColumn(
    column(run, 'Lower'),
    smooth(middle.map((one, bar) => one - errors * (spread[bar] as number))),
    'fitted lower',
  );
  // Each leg is smoothed after the fit, so the first bar is the two warmups end
  // to end rather than the longer of the two.
  assertWarmup(column(run, 'Basis'), periods - 1 + (avgLen - 1), 'fitted basis');
});
