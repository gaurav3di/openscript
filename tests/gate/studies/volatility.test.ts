/**
 * The volatility studies of this half of the gate.
 *
 * Eight studies, three of which are here for a warmup rather than for a
 * formula: a squared fall averaged over a window that is itself a window deep,
 * a residual computed by three loops inside one bar, and a study whose two
 * rolling extremes are taken over its own output and so wait for it twice.
 *
 * One of them does not reproduce, and the reason is worth more than the study:
 * the published implementation's rolling extreme answers from whatever part of
 * its window happens to hold values, so it prints twenty bars before a window
 * of real values exists. This language's refuses to, and the two columns agree
 * on every bar they both have. That is recorded here as a measured difference
 * in warmup rather than smoothed over.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Ref } from './primitives.js';
import {
  deviation,
  expMean,
  highestOf,
  lowestOf,
  mapped,
  mean,
  rateOfChange,
  regression,
} from './primitives.js';
import { CLOSE, HIGH, LOW, paintNames, plot, plotColour, runStudy } from './surface.js';
import { asSeries, distance, matches, matchesWithGaps } from './verdict.js';

const DEVIATION_PERIODS = 5;
const DEVIATION_SCALE = 1;

// Catches: a sample divisor where the study uses the population one, which is
// the commonest silent difference between two implementations of this reading
// and is invisible on a chart.
test('the standard deviation matches the reference', () => {
  const surface = runStudy('standard-deviation', {
    periods: DEVIATION_PERIODS,
    deviations: DEVIATION_SCALE,
  });
  matches(
    plot(surface, 'Deviation'),
    asSeries(deviation(CLOSE, DEVIATION_PERIODS).map((one) => one * DEVIATION_SCALE)),
    DEVIATION_PERIODS - 1,
    'standard deviation',
  );
});

/** The residual spread about the fitted line, transcribed loop for loop. */
function standardError(values: readonly number[], period: number): Ref {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  if (period < 3 || n < period) return out;
  const centre = (period + 1) / 2;
  for (let i = period - 1; i < n; i += 1) {
    let sumY = 0;
    for (let k = 0; k < period; k += 1) sumY += values[i - k] as number;
    const middle = sumY / period;
    let spread = 0;
    let tilt = 0;
    let ladder = 0;
    for (let k = 0; k < period; k += 1) {
      const fromMean = middle - (values[i - k] as number);
      const pos = centre - k - 1;
      spread += fromMean * fromMean;
      tilt += pos * fromMean;
      ladder += pos * pos;
    }
    out[i] = Math.sqrt((spread - (tilt * tilt) / ladder) / (period - 2));
  }
  return out;
}

const ERROR_LENGTH = 14;

// Catches: a window summed oldest bar first. This study's own definition sums
// newest bar first, which is the opposite of the order the language fixes for a
// library lookback, so a script that reached for a library total here would get
// a different number. Writing the loop out is what makes the order the study's.
test('the standard error matches the reference, summed the way the study sums it', () => {
  const surface = runStudy('standard-error', { len: ERROR_LENGTH });
  matches(
    plot(surface, 'Standard error'),
    asSeries(standardError(CLOSE, ERROR_LENGTH)),
    ERROR_LENGTH - 1,
    'standard error',
  );
});

const BAND_PERIODS = 21;
const BAND_ERRORS = 2;
const BAND_SPAN = 3;

// Catches: a band drawn around a smoothed price rather than around the fitted
// line's own endpoint, and a width recomputed after smoothing rather than
// smoothed with the leg it belongs to.
test('the standard error bands match the reference on all three legs', () => {
  const surface = runStudy('standard-error-bands', {
    periods: BAND_PERIODS,
    errors: BAND_ERRORS,
    span: BAND_SPAN,
  });

  const residual = standardError(CLOSE, BAND_PERIODS);
  const fitted = regression(CLOSE, BAND_PERIODS, 0);
  const first = BAND_PERIODS - 1 + BAND_SPAN - 1;

  matches(plot(surface, 'Basis'), asSeries(mean(fitted, BAND_SPAN)), first, 'error band basis');
  matches(
    plot(surface, 'Upper'),
    asSeries(mean(fitted.map((one, i) => one + BAND_ERRORS * (residual[i] as number)), BAND_SPAN)),
    first,
    'error band upper',
  );
  matches(
    plot(surface, 'Lower'),
    asSeries(mean(fitted.map((one, i) => one - BAND_ERRORS * (residual[i] as number)), BAND_SPAN)),
    first,
    'error band lower',
  );
});

const ULCER_LENGTH = 14;

// Catches: a mean taken over a window that still holds the fall's own warmup.
// The fall is absent for its first window and the mean of it is absent for a
// second, which puts the first reading two windows in, and an implementation
// that averaged what it had would print a full window early.
test('the ulcer index matches the reference at its two window warmup', () => {
  const surface = runStudy('ulcer-index', { len: ULCER_LENGTH });

  const peak = highestOf(CLOSE, ULCER_LENGTH);
  const drop = CLOSE.map((one, i) =>
    (peak[i] as number) === 0 ? NaN : (100 * (one - (peak[i] as number))) / (peak[i] as number),
  );
  const squared = drop.map((one) => one * one);
  const expected = mapped(mean(squared, ULCER_LENGTH), Math.sqrt);

  matches(plot(surface, 'Ulcer'), asSeries(expected), 2 * ULCER_LENGTH - 2, 'ulcer index');
});

const RANGE_SPAN = 3;

// Catches: a study that is absent on bar 0. The bar's own span is a fact about
// that bar with no history behind it, so it is present from the first bar and a
// warmup here would be an invention.
test('the range analysis matches the reference from bar 0', () => {
  const surface = runStudy('range-analysis', { span: RANGE_SPAN });

  const width = HIGH.map((one, i) => one - (LOW[i] as number));
  matches(plot(surface, 'Range'), asSeries(width), 0, 'range');
  matches(
    plot(surface, 'Average range'),
    asSeries(mean(width, RANGE_SPAN)),
    RANGE_SPAN - 1,
    'average range',
  );

  const drawn = plot(surface, 'Range');
  const average = plot(surface, 'Average range');
  assert.deepEqual(
    paintNames(surface.barColors, ['orange']),
    drawn.map((one, bar) => {
      const level = average[bar] ?? null;
      return one !== null && level !== null && one > level ? 'orange' : null;
    }),
    'wider than average bar colours',
  );
});

const SPIKE_LOOKBACK = 22;
const SPIKE_BAND = 20;
const SPIKE_MULT = 2;
const SPIKE_RANGE = 50;
const SPIKE_HIGH_SHARE = 0.85;
const SPIKE_LOW_SHARE = 1.01;

/** The published rolling extreme, which does not refuse a window with gaps in it. */
function laxHighest(values: readonly number[], period: number): Ref {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  for (let i = period - 1; i < n; i += 1) {
    let best = -Infinity;
    for (let k = 0; k < period; k += 1) {
      const here = values[i - k] as number;
      if (here > best) best = here;
    }
    out[i] = best;
  }
  return out;
}

function laxLowest(values: readonly number[], period: number): Ref {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  for (let i = period - 1; i < n; i += 1) {
    let best = Infinity;
    for (let k = 0; k < period; k += 1) {
      const here = values[i - k] as number;
      if (here < best) best = here;
    }
    out[i] = best;
  }
  return out;
}

// Catches: a reading measured from the highest low rather than the highest
// close, and a band taken over price rather than over the study's own output.
test('the volatility spike reading and its band match the reference', () => {
  const surface = runStudy('volatility-spike', {
    lookback: SPIKE_LOOKBACK,
    bandLen: SPIKE_BAND,
    mult: SPIKE_MULT,
    rangeLen: SPIKE_RANGE,
    highShare: SPIKE_HIGH_SHARE,
    lowShare: SPIKE_LOW_SHARE,
  });

  const peak = highestOf(CLOSE, SPIKE_LOOKBACK);
  const spike = LOW.map((one, i) =>
    (peak[i] as number) === 0 ? NaN : (((peak[i] as number) - one) / (peak[i] as number)) * 100,
  );
  const middle = mean(spike, SPIKE_BAND);
  const wide = deviation(spike, SPIKE_BAND);
  const upper = middle.map((one, i) => one + SPIKE_MULT * (wide[i] as number));

  matches(plot(surface, 'Spike'), asSeries(spike), SPIKE_LOOKBACK - 1, 'volatility spike');
  matches(
    plot(surface, 'Upper band'),
    asSeries(upper),
    SPIKE_LOOKBACK - 1 + SPIKE_BAND - 1,
    'volatility spike band',
  );
});

/**
 * A finding rather than a failure: the published rolling extreme answers from a
 * window that is not full.
 *
 * The published implementation's extreme skips the values it has none for
 * rather than refusing, so over a series that is itself absent for its first
 * window it reports the extreme of whatever part of the window happens to hold
 * values, twenty one bars before a full window of them exists. This language's
 * extreme refuses a window with a gap in it, which is why the two columns start
 * on different bars. Where both have a value they agree exactly, and that is
 * asserted here rather than assumed.
 */
test('the percentile range starts a window later here, and agrees everywhere both have a value', () => {
  const surface = runStudy('volatility-spike', {
    lookback: SPIKE_LOOKBACK,
    bandLen: SPIKE_BAND,
    mult: SPIKE_MULT,
    rangeLen: SPIKE_RANGE,
    highShare: SPIKE_HIGH_SHARE,
    lowShare: SPIKE_LOW_SHARE,
  });

  const peak = highestOf(CLOSE, SPIKE_LOOKBACK);
  const spike = LOW.map((one, i) =>
    (peak[i] as number) === 0 ? NaN : (((peak[i] as number) - one) / (peak[i] as number)) * 100,
  );
  const publishedTop = laxHighest(spike, SPIKE_RANGE).map((one) => one * SPIKE_HIGH_SHARE);
  const publishedBase = laxLowest(spike, SPIKE_RANGE).map((one) => one * SPIKE_LOW_SHARE);

  const drawnTop = plot(surface, 'Range high');
  const drawnBase = plot(surface, 'Range low');
  const apart = distance(drawnTop, asSeries(publishedTop));

  assert.equal(apart.largest, 0, 'where both have a value they agree exactly');
  assert.equal(
    `${apart.absences} bars, first at ${apart.firstAt}`,
    '21 bars, first at 49',
    'the published column starts this many bars earlier',
  );

  // The bars both columns have are compared as a column of their own, so the
  // agreement above is a comparison rather than an absence of one.
  const shared = drawnTop
    .map((one, bar) => (one === null ? null : bar))
    .filter((bar): bar is number => bar !== null);
  assert.notEqual(shared.length, 0, 'the two should overlap on this fixture');
  matchesWithGaps(
    shared.map((bar) => drawnBase[bar] ?? null),
    shared.map((bar) => publishedBase[bar] ?? null),
    'percentile range low over the shared bars',
  );
});

// Catches: a histogram colour that reads the drawn band rather than the band
// itself. The study says something only when the reading breaks its own band or
// its own recent range, and a colour that answered on a warmup bar would say
// something on a bar the study has no reading for.
test('the volatility spike colours the bars that break its band or its range', () => {
  const surface = runStudy('volatility-spike', {
    lookback: SPIKE_LOOKBACK,
    bandLen: SPIKE_BAND,
    mult: SPIKE_MULT,
    rangeLen: SPIKE_RANGE,
    highShare: SPIKE_HIGH_SHARE,
    lowShare: SPIKE_LOW_SHARE,
  });
  const drawn = plot(surface, 'Spike');
  const band = plot(surface, 'Upper band');
  const top = plot(surface, 'Range high');

  assert.deepEqual(
    paintNames(plotColour(surface, 'Spike'), ['lime', 'gray']),
    drawn.map((value, bar) => {
      const level = band[bar] ?? null;
      const ceiling = top[bar] ?? null;
      if (value === null) return 'gray';
      const hit = (level !== null && value >= level) || (ceiling !== null && value >= ceiling);
      return hit ? 'lime' : 'gray';
    }),
    'volatility spike colour',
  );
});

const RATIO_PERIODS = 10;
const RATIO_LOOKBACK = 10;

// Catches: a simple mean where the study uses an exponential one. A simple mean
// of ranges reacts to one wide bar for a whole window and then drops it in a
// single step, which prints a second move on the rate of change that the data
// never made.
test('the volatility ratio matches the reference', () => {
  const surface = runStudy('volatility-ratio', {
    periods: RATIO_PERIODS,
    lookback: RATIO_LOOKBACK,
  });

  const span = HIGH.map((one, i) => one - (LOW[i] as number));
  const smoothed = expMean(span, RATIO_PERIODS);
  matches(
    plot(surface, 'Ratio'),
    asSeries(rateOfChange(smoothed, RATIO_LOOKBACK)),
    RATIO_PERIODS - 1 + RATIO_LOOKBACK,
    'volatility ratio',
  );
});

const CHANNEL_LENGTH = 20;

// Catches: a middle computed as a mean of price rather than as the midpoint of
// the two edges. The two lines sit close together and are not the same line.
test('the price channel matches the reference on all three columns', () => {
  const surface = runStudy('price-channel', { len: CHANNEL_LENGTH });

  const top = highestOf(HIGH, CHANNEL_LENGTH);
  const base = lowestOf(LOW, CHANNEL_LENGTH);
  matches(plot(surface, 'Upper'), asSeries(top), CHANNEL_LENGTH - 1, 'channel upper');
  matches(plot(surface, 'Lower'), asSeries(base), CHANNEL_LENGTH - 1, 'channel lower');
  matches(
    plot(surface, 'Middle'),
    asSeries(top.map((one, i) => (one + (base[i] as number)) / 2)),
    CHANNEL_LENGTH - 1,
    'channel middle',
  );
});
