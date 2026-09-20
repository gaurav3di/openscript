/**
 * The averaging studies of this half of the gate.
 *
 * Seven studies that each fix an arrangement rather than a formula. An
 * exponential mean seeded from a simple one, three of those chained and
 * combined with the brackets the study states, a layer that pushes an average
 * past itself, a window weighted by volume, two running means that reset at a
 * session boundary, and the linearly weighted mean whose accumulation order the
 * specification fixes.
 *
 * Two of them record a difference rather than an agreement, and both
 * differences are in the reference's accumulation rather than in either side's
 * arithmetic. They are measured here, with the first bar and the largest
 * distance, because a difference that is written down is a difference somebody
 * can act on and a difference hidden behind a tolerance is not.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Ref } from './primitives.js';
import { expMean, mean, smoothMean, weightedMean } from './primitives.js';
import {
  CLOSE,
  COARSE_BARS,
  HIGH,
  LOW,
  OPEN,
  SESSION_OF,
  VOLUME,
  plot,
  runStudy,
} from './surface.js';
import { asSeries, distance, matches, matchesWithGaps } from './verdict.js';

/** An average chained onto a series that already carries a leading gap. */
function chained(input: Ref, length: number, average: (v: readonly number[], p: number) => Ref): Ref {
  const start = input.findIndex((one) => Number.isFinite(one));
  const out = new Array<number>(input.length).fill(NaN);
  if (start < 0) return out;
  const run = average(input.slice(start), length);
  for (let i = 0; i < run.length; i += 1) out[start + i] = run[i] as number;
  return out;
}

const SMOOTH_LENGTH = 7;

// Catches: a smoothing seeded from bar 0 rather than from the simple mean of
// its first window. That one draws a line where there should be a gap and stays
// materially wrong until the seed decays, which is most of a short fixture.
test('the smoothed average matches the reference', () => {
  const surface = runStudy('smoothed-average', { len: SMOOTH_LENGTH });
  matches(
    plot(surface, 'Smoothed'),
    asSeries(smoothMean(CLOSE, SMOOTH_LENGTH)),
    SMOOTH_LENGTH - 1,
    'smoothed average',
  );
});

const TRIPLE_LENGTH = 9;

// Catches: the brackets. Three of the first mean less three of the second plus
// the third is the same quantity in exact arithmetic and a different number in
// binary64, so this study and the library's own triple mean are two different
// columns and only one of them is what the published study draws.
test('the triple exponential average matches the reference, brackets included', () => {
  const surface = runStudy('triple-exponential-average', { len: TRIPLE_LENGTH });

  const once = expMean(CLOSE, TRIPLE_LENGTH);
  const twice = chained(once, TRIPLE_LENGTH, expMean);
  const thrice = chained(twice, TRIPLE_LENGTH, expMean);
  const expected = once.map(
    (one, i) => 3 * (one - (twice[i] as number)) + (thrice[i] as number),
  );

  matches(
    plot(surface, 'Triple'),
    asSeries(expected),
    3 * TRIPLE_LENGTH - 3,
    'triple exponential average',
  );
});

const SIXFOLD_LENGTH = 5;
const SIXFOLD_FACTOR = 0.7;

// Catches: three call sites of one stateful function sharing one state. That
// mistake makes the second layer read the first layer's averages, and the line
// it draws is smooth and plausible and is not this study.
test('the sixfold smoothed average matches the reference at its six deep warmup', () => {
  const surface = runStudy('sixfold-smoothed', { len: SIXFOLD_LENGTH, factor: SIXFOLD_FACTOR });

  const layer = (input: Ref): Ref => {
    const first = chained(input, SIXFOLD_LENGTH, expMean);
    const second = chained(first, SIXFOLD_LENGTH, expMean);
    return first.map(
      (one, i) => one * (1 + SIXFOLD_FACTOR) - (second[i] as number) * SIXFOLD_FACTOR,
    );
  };
  const expected = layer(layer(layer([...CLOSE])));

  matches(
    plot(surface, 'Sixfold'),
    asSeries(expected),
    6 * (SIXFOLD_LENGTH - 1),
    'sixfold smoothed average',
  );
});

const VWMA_LENGTH = 20;

/**
 * A finding rather than a failure: the volume weighted mean is two
 * arrangements of one quantity.
 *
 * The published study divides a mean of price times volume by a mean of volume,
 * so the window length divides both sides and then cancels. `stdlib.md` section
 * 4 takes the total of price times volume over the total of volume, which is
 * what "weighted by volume" says and has two fewer roundings in it. The two
 * agree to within those roundings and are not equal, and this records how far
 * apart they are so that a change in either arrangement shows up as a change in
 * this number.
 */
test('the volume weighted average reproduces the published study to within its two divisions', () => {
  const surface = runStudy('volume-weighted-average', { len: VWMA_LENGTH });

  const product = CLOSE.map((one, i) => one * (VOLUME[i] as number));
  const top = mean(product, VWMA_LENGTH);
  const bottom = mean(VOLUME, VWMA_LENGTH);
  const expected = asSeries(
    top.map((one, i) => ((bottom[i] as number) === 0 ? NaN : one / (bottom[i] as number))),
  );
  const drawn = plot(surface, 'Weighted');

  assert.equal(distance(drawn, expected).absences, 0, 'the two are present on the same bars');
  const apart = distance(drawn, expected);
  assert.ok(
    apart.largest < 1e-10,
    `expected a rounding difference, got largest ${apart.largest} at bar ${apart.largestAt}`,
  );
  // The unweighted mean of the same window is a different line, which a study
  // that quietly dropped the weighting would otherwise pass everything above.
  assert.notDeepEqual(drawn, plot(surface, 'Unweighted'), 'weighting changes the line');
  matches(
    plot(surface, 'Unweighted'),
    asSeries(mean(CLOSE, VWMA_LENGTH)),
    VWMA_LENGTH - 1,
    'unweighted mean',
  );
});

// Catches: a running mean that resets after accumulating rather than before,
// which puts the session's first bar at the end of the previous session's
// average and leaves every session's first reading wrong.
test('the time weighted average restarts on the session first bar', () => {
  const surface = runStudy('time-weighted-average');

  const expected: number[] = [];
  let total = 0;
  let seen = 0;
  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    if (bar === 0 || SESSION_OF[bar] !== SESSION_OF[bar - 1]) {
      total = 0;
      seen = 0;
    }
    total += ((OPEN[bar] as number) + (HIGH[bar] as number) + (LOW[bar] as number) + (CLOSE[bar] as number)) / 4;
    seen += 1;
    expected.push(total / seen);
  }

  matches(plot(surface, 'Time weighted'), asSeries(expected), 0, 'time weighted average');
  // The session's first bar is its own average, which is the cheapest check
  // that the reset happened at all.
  for (let bar = 0; bar < CLOSE.length; bar += COARSE_BARS) {
    const price = ((OPEN[bar] as number) + (HIGH[bar] as number) + (LOW[bar] as number) + (CLOSE[bar] as number)) / 4;
    assert.equal(plot(surface, 'Time weighted')[bar], price, `session opening bar ${bar}`);
  }
});

const BAND_MULTIPLE = 1;

// Catches: a variance computed as a second pass over the session rather than
// from the same accumulation, and a band drawn around a mean that is not the
// mean the study plots.
test('the session weighted price and its band match the reference', () => {
  const surface = runStudy('session-weighted-price', { mult: BAND_MULTIPLE });

  const middle: number[] = [];
  const width: number[] = [];
  let flow = 0;
  let traded = 0;
  let squares = 0;
  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    if (bar === 0 || SESSION_OF[bar] !== SESSION_OF[bar - 1]) {
      flow = 0;
      traded = 0;
      squares = 0;
    }
    const price = ((HIGH[bar] as number) + (LOW[bar] as number) + (CLOSE[bar] as number)) / 3;
    const size = VOLUME[bar] as number;
    flow += price * size;
    squares += price * price * size;
    traded += size;
    const here = flow / traded;
    middle.push(here);
    width.push(Math.sqrt(Math.max(0, squares / traded - here * here)));
  }

  matches(plot(surface, 'Weighted price'), asSeries(middle), 0, 'session weighted price');
  matches(
    plot(surface, 'Upper band'),
    asSeries(middle.map((one, i) => one + BAND_MULTIPLE * (width[i] as number))),
    0,
    'session weighted upper band',
  );
  matches(
    plot(surface, 'Lower band'),
    asSeries(middle.map((one, i) => one - BAND_MULTIPLE * (width[i] as number))),
    0,
    'session weighted lower band',
  );
});

const WEIGHTED_LENGTH = 9;

// Catches: a weighted mean summed newest bar first. The weights are the same
// either way and the sum is not, which is the exact class of difference
// `compiled-program.md` section 8.2 exists to settle.
test('the weighted average matches the reference summed oldest bar first', () => {
  const surface = runStudy('weighted-average', { len: WEIGHTED_LENGTH });
  matches(
    plot(surface, 'Weighted'),
    asSeries(weightedMean(CLOSE, WEIGHTED_LENGTH)),
    WEIGHTED_LENGTH - 1,
    'weighted average',
  );
  matchesWithGaps(
    plot(surface, 'Simple'),
    asSeries(mean(CLOSE, WEIGHTED_LENGTH)),
    'simple mean beside it',
  );
});
