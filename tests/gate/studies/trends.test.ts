/**
 * The trailing stop and trend strength studies of this half of the gate.
 *
 * Four studies, three of them recursions that a script has to write out bar by
 * bar because no library call is that study. That is the point of having them
 * here: a recursion in this language is a handful of `var`s read before they
 * are written, and the difference between reading the previous bar's value and
 * this bar's is the whole of whether the study is the one it claims to be.
 *
 * The fourth measures the built-in stop and reverse against the study written
 * out beside it, and records that they are not the same study. That is a
 * finding rather than a failure, and it is recorded as a measured distance
 * rather than hidden behind a tolerance.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Ref, RefBar } from './primitives.js';
import { averageTrueRange, trueRangeOf, windowSum } from './primitives.js';
import { CLOSE, REF_BARS, firedOn, marker, plot, runStudy } from './surface.js';
import { asSeries, distance, matches, matchesWithGaps } from './verdict.js';

const VORTEX_LENGTH = 14;

// Catches: the two numerators started at the same bar as the denominator. Both
// movement terms reach across a bar boundary and the range does not, so a study
// that warmed all three together is one bar early on two of its three columns
// and exactly right on the third.
test('the two vortex columns match the reference, each at its own warmup bar', () => {
  const surface = runStudy('vortex', { len: VORTEX_LENGTH });

  const bars = REF_BARS;
  const up = new Array<number>(bars.length).fill(NaN);
  const down = new Array<number>(bars.length).fill(NaN);
  for (let i = 1; i < bars.length; i += 1) {
    up[i] = Math.abs((bars[i] as RefBar).high - (bars[i - 1] as RefBar).low);
    down[i] = Math.abs((bars[i] as RefBar).low - (bars[i - 1] as RefBar).high);
  }
  const rangeTotal = windowSum(trueRangeOf(bars), VORTEX_LENGTH);
  const ratio = (terms: Ref): Ref => {
    const total = windowSum(terms, VORTEX_LENGTH);
    return total.map((value, i) => value / (rangeTotal[i] as number));
  };

  matches(plot(surface, 'Upward'), asSeries(ratio(up)), VORTEX_LENGTH, 'vortex upward');
  matches(plot(surface, 'Downward'), asSeries(ratio(down)), VORTEX_LENGTH, 'vortex downward');
});

/** What the volatility stop recursion produces, transcribed term for term. */
interface StopRun {
  readonly up: (number | null)[];
  readonly down: (number | null)[];
  readonly flips: number[];
  readonly longFlips: number[];
  readonly shortFlips: number[];
}

function volatilityStop(bars: readonly RefBar[], length: number, factor: number): StopRun {
  const n = bars.length;
  const up: (number | null)[] = new Array<number | null>(n).fill(null);
  const down: (number | null)[] = new Array<number | null>(n).fill(null);
  const longFlips: number[] = [];
  const shortFlips: number[] = [];
  const flips: number[] = [];
  const values = bars.map((bar) => bar.close);
  const band = averageTrueRange(bars, length);
  const range = trueRangeOf(bars);

  let max = values[0] as number;
  let min = values[0] as number;
  let uptrend = true;
  let stop = NaN;

  for (let i = 0; i < n; i += 1) {
    const v = values[i] as number;
    const width = Number.isFinite(band[i]) ? (band[i] as number) * factor : (range[i] as number);
    max = Math.max(max, v);
    min = Math.min(min, v);
    let level: number = uptrend ? Math.max(stop, max - width) : Math.min(stop, min + width);
    if (!Number.isFinite(level)) level = v;

    const nowUp: boolean = v - level >= 0;
    if (i > 0 && nowUp !== uptrend) {
      max = v;
      min = v;
      level = nowUp ? max - width : min + width;
      flips.push(i);
      if (nowUp) longFlips.push(i);
      else shortFlips.push(i);
    }
    uptrend = nowUp;
    stop = level;

    if (!Number.isFinite(level)) continue;
    if (nowUp) up[i] = level;
    else down[i] = level;
  }
  return { up, down, flips, longFlips, shortFlips };
}

const STOP_LENGTH = 20;
const STOP_FACTOR = 2;

// Catches: a recursion that reads this bar's side rather than the previous
// bar's when it decides which way the stop ratchets. That mistake still
// produces a plausible trailing line, and only a bar for bar comparison against
// the definition separates the two.
test('the volatility stop matches the reference on both of its sides', () => {
  const surface = runStudy('volatility-stop', { len: STOP_LENGTH, factor: STOP_FACTOR });
  const run = volatilityStop(REF_BARS, STOP_LENGTH, STOP_FACTOR);

  matchesWithGaps(plot(surface, 'Stop, long'), run.up, 'volatility stop, long side');
  matchesWithGaps(plot(surface, 'Stop, short'), run.down, 'volatility stop, short side');
  assert.notEqual(run.flips.length, 0, 'the fixture should make this stop flip');
});

// Catches: a flip marked on the bar after the flip, and a flip marked on bar 0,
// which has no previous side to differ from.
test('the volatility stop marks each flip once, on the bar it happened', () => {
  const surface = runStudy('volatility-stop', { len: STOP_LENGTH, factor: STOP_FACTOR });
  const run = volatilityStop(REF_BARS, STOP_LENGTH, STOP_FACTOR);

  assert.deepEqual(firedOn(marker(surface, 'm0')), run.longFlips, 'flips to the long side');
  assert.deepEqual(firedOn(marker(surface, 'm1')), run.shortFlips, 'flips to the short side');
});

interface SarRun {
  readonly stop: Ref;
  readonly longFlips: number[];
  readonly shortFlips: number[];
}

/** The accelerating stop with the clamp, transcribed term for term. */
function parabolic(bars: readonly RefBar[], start: number, step: number, ceiling: number): SarRun {
  const n = bars.length;
  const out = new Array<number>(n).fill(NaN);
  const longFlips: number[] = [];
  const shortFlips: number[] = [];
  if (n < 2) return { stop: out, longFlips, shortFlips };

  let rising = (bars[1] as RefBar).close >= (bars[0] as RefBar).close;
  let sar = rising ? (bars[0] as RefBar).low : (bars[0] as RefBar).high;
  let extreme = rising ? (bars[1] as RefBar).high : (bars[1] as RefBar).low;
  let rate = start;
  out[1] = sar;

  for (let i = 2; i < n; i += 1) {
    const bar = bars[i] as RefBar;
    sar += rate * (extreme - sar);

    if (rising && bar.low < sar) {
      rising = false;
      sar = Math.max(extreme, bar.high);
      extreme = bar.low;
      rate = start;
      shortFlips.push(i);
    } else if (!rising && bar.high > sar) {
      rising = true;
      sar = Math.min(extreme, bar.low);
      extreme = bar.high;
      rate = start;
      longFlips.push(i);
    } else if (rising && bar.high > extreme) {
      extreme = bar.high;
      rate = Math.min(ceiling, rate + step);
    } else if (!rising && bar.low < extreme) {
      extreme = bar.low;
      rate = Math.min(ceiling, rate + step);
    }

    const previousLow = (bars[i - 1] as RefBar).low;
    const olderLow = (bars[i - 2] as RefBar).low;
    const previousHigh = (bars[i - 1] as RefBar).high;
    const olderHigh = (bars[i - 2] as RefBar).high;
    sar = rising
      ? Math.min(Math.min(sar, previousLow), olderLow)
      : Math.max(Math.max(sar, previousHigh), olderHigh);

    out[i] = sar;
  }
  return { stop: out, longFlips, shortFlips };
}

const SAR_START = 0.02;
const SAR_STEP = 0.02;
const SAR_MAX = 0.2;

// Catches: the clamp applied before the flip test rather than after it. That
// order swallows flips the definition does fire, and the two orders agree on
// every bar between one swallowed flip and the next, so a spot check passes.
test('the accelerating stop matches the reference, clamp and all', () => {
  const surface = runStudy('parabolic-stop', {
    startRate: SAR_START,
    stepRate: SAR_STEP,
    maxRate: SAR_MAX,
  });
  const run = parabolic(REF_BARS, SAR_START, SAR_STEP, SAR_MAX);

  matches(plot(surface, 'Stop'), asSeries(run.stop), 1, 'accelerating stop');
  assert.deepEqual(firedOn(marker(surface, 'm0')), run.longFlips, 'flips to the long side');
  assert.deepEqual(firedOn(marker(surface, 'm1')), run.shortFlips, 'flips to the short side');
});

/**
 * A finding rather than a failure: the library's own stop and reverse is not
 * this study.
 *
 * `stdlib.md` section 4 says the library's follows the plain description and
 * applies no clamp, and the two also seed their direction differently. So a
 * script that reproduces a published accelerating stop has to write the
 * recursion out, which the study above does. The difference is measured here
 * rather than asserted away, so that the day the library grows the clamp this
 * test says so instead of quietly passing.
 */
test('the library stop and reverse is a different study, and by how much', () => {
  const surface = runStudy('parabolic-stop', {
    startRate: SAR_START,
    stepRate: SAR_STEP,
    maxRate: SAR_MAX,
  });
  const built = runStudy('parabolic-library', {
    startRate: SAR_START,
    stepRate: SAR_STEP,
    maxRate: SAR_MAX,
  });

  const apart = distance(plot(built, 'Stop'), plot(surface, 'Stop'));
  assert.notEqual(apart.firstAt, -1, 'the two should differ, and this records where');
  assert.ok(
    apart.largest > 0,
    `the clamp should move the stop: largest ${apart.largest} at bar ${apart.largestAt}`,
  );
});

/** The one pass correlation the published study uses, transcribed as it stands. */
function pearson(a: readonly number[], b: readonly number[], period: number): Ref {
  const n = a.length;
  const out = new Array<number>(n).fill(NaN);
  if (period <= 1 || n < period) return out;
  for (let i = period - 1; i < n; i += 1) {
    let sa = 0;
    let sb = 0;
    let saa = 0;
    let sbb = 0;
    let sab = 0;
    for (let k = 0; k < period; k += 1) {
      const x = a[i - k] as number;
      const y = b[i - k] as number;
      sa += x;
      sb += y;
      saa += x * x;
      sbb += y * y;
      sab += x * y;
    }
    const covariance = period * sab - sa * sb;
    const scale =
      Math.sqrt(period * saa - sa * sa) * Math.sqrt(period * sbb - sb * sb);
    out[i] = scale === 0 ? NaN : covariance / scale;
  }
  return out;
}

const STRENGTH_LENGTH = 14;

/**
 * A finding rather than a failure: the published study's correlation and this
 * language's are the same quantity computed two ways.
 *
 * The published one sums squares and cross products and subtracts at the end;
 * `stdlib.md` section 9 takes the mean first and then the deviations from it,
 * and says why: the single pass arrangement loses most of its significant
 * digits when the values are large and their spread is small, which is exactly
 * what a price series is. So the two disagree in the last bits, and this
 * records the size of that disagreement rather than accepting it under a
 * tolerance.
 */
test('trend strength reproduces the published study to within its accumulation', () => {
  const surface = runStudy('trend-strength', { len: STRENGTH_LENGTH });
  const drawn = plot(surface, 'Strength');
  const expected = asSeries(
    pearson(
      CLOSE,
      CLOSE.map((_value, bar) => bar),
      STRENGTH_LENGTH,
    ),
  );

  const apart = distance(drawn, expected);
  assert.equal(apart.absences, 0, 'the two should be present on exactly the same bars');
  assert.notEqual(
    apart.firstAt,
    -1,
    'the two arrangements should disagree; if they now agree, one of them changed',
  );
  // A reading bounded to minus one and one, disagreeing in the twelfth decimal.
  // The bound is not a tolerance on the study: the columns are not equal and
  // this test says so. It is the size of the disagreement, recorded so that a
  // change in either arrangement is visible as a change in this number.
  assert.ok(
    apart.largest < 1e-9,
    `expected an accumulation difference, got largest ${apart.largest} at bar ${apart.largestAt}`,
  );
  assert.equal(
    `first ${apart.firstAt} largest ${apart.largest.toExponential(3)} at ${apart.largestAt}`,
    'first 13 largest 7.187e-12 at 72',
    'the recorded distance between the two arrangements',
  );
});
