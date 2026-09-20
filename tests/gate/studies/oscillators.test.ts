/**
 * The oscillator studies of this half of the gate.
 *
 * Eight independently written studies, chosen for what they stack rather than
 * for what they compute: a signal line taken over a study's own output, two
 * averages applied in an order the argument list does not give, three averages
 * over a logarithm, and a histogram whose colour is decided per bar out of four
 * states rather than declared once.
 *
 * The per-bar colour is the part a column comparison cannot reach. A plot whose
 * colour is a constant carries it in the declaration; one that computes it per
 * bar carries a channel, and that channel is compared here bar for bar like any
 * other column.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Ref } from './primitives.js';
import { changeOf, expMean, highestOf, lowestOf, mapped, rateOfChange } from './primitives.js';
import {
  CLOSE,
  HIGH,
  LOW,
  VOLUME,
  firedOn,
  marker,
  paintNames,
  plot,
  plotColour,
  runStudy,
} from './surface.js';
import { asSeries, matches, matchesWithGaps } from './verdict.js';

const FAST = 12;
const SLOW = 26;
const SIGNAL = 9;

/** The percentage spread of two seeded exponential means, and its signal. */
function spread(values: readonly number[], fast: number, slow: number, signal: number): {
  value: Ref;
  signal: Ref;
  gap: Ref;
} {
  const quick = expMean(values, fast);
  const patient = expMean(values, slow);
  const value = quick.map((one, i) =>
    (patient[i] as number) === 0 ? NaN : (100 * (one - (patient[i] as number))) / (patient[i] as number),
  );
  const line = expMean(value.slice(slow - 1), signal);
  const padded = new Array<number>(value.length).fill(NaN);
  for (let i = 0; i < line.length; i += 1) padded[slow - 1 + i] = line[i] as number;
  return { value, signal: padded, gap: value.map((one, i) => one - (padded[i] as number)) };
}

// Catches: a signal line taken over price rather than over the study. Both are
// smooth lines that cross the study, and only a bar for bar comparison says
// which one is drawn.
test('the price oscillator, its signal and their gap match the reference', () => {
  const surface = runStudy('percentage-price-oscillator', {
    fastLen: FAST,
    slowLen: SLOW,
    signalLen: SIGNAL,
  });
  const expected = spread(CLOSE, FAST, SLOW, SIGNAL);

  matches(plot(surface, 'Oscillator'), asSeries(expected.value), SLOW - 1, 'price oscillator');
  matches(
    plot(surface, 'Signal'),
    asSeries(expected.signal),
    SLOW - 1 + SIGNAL - 1,
    'price oscillator signal',
  );
  matches(
    plot(surface, 'Histogram'),
    asSeries(expected.gap),
    SLOW - 1 + SIGNAL - 1,
    'price oscillator histogram',
  );
});

/**
 * Catches: a histogram colour that treats an absent previous bar as a rise. The
 * first drawn bar has nothing behind it, so the definition takes the fading
 * colour there, and an implementation that assumed a rise differs on exactly
 * one bar out of eighty.
 *
 * A colour channel answers on every bar, warmup included, and the column below
 * says so rather than stopping where the histogram starts. That is the rule of
 * `language.md` 6.6 reaching a surface: on a warmup bar the comparison is
 * absent, an absent condition takes the false arm of a ternary, and both arms
 * of this study's choice fall through to the same colour. Nothing is drawn
 * there, because the value is absent and the colour is not what decides that.
 */
test('the price oscillator histogram carries its colour bar for bar', () => {
  const surface = runStudy('percentage-price-oscillator', {
    fastLen: FAST,
    slowLen: SLOW,
    signalLen: SIGNAL,
  });
  const gap = plot(surface, 'Histogram');

  const expected = gap.map((value, bar) => {
    if (value === null) return 'red';
    const before = bar === 0 ? null : gap[bar - 1] ?? null;
    const growing = value > (before ?? value);
    if (value >= 0) return growing ? 'teal' : 'aqua';
    return growing ? 'pink' : 'red';
  });
  assert.deepEqual(
    paintNames(plotColour(surface, 'Histogram'), ['teal', 'aqua', 'pink', 'red']),
    expected,
    'price oscillator histogram colour',
  );
  // All four states are reached on this fixture, so the comparison is a real
  // one rather than an assertion that one colour was used throughout.
  const drawn = new Set(
    paintNames(plotColour(surface, 'Histogram'), ['teal', 'aqua', 'pink', 'red']).filter(
      (one, bar) => gap[bar] !== null && one !== null,
    ),
  );
  assert.deepEqual([...drawn].sort(), ['aqua', 'pink', 'red', 'teal']);
});

// Catches: the volume oscillator reading the close. It is the same arithmetic
// over a different series, so every shape assertion passes either way and only
// the numbers separate them.
test('the volume oscillator, its signal and their gap match the reference', () => {
  const surface = runStudy('percentage-volume-oscillator', {
    fastLen: FAST,
    slowLen: SLOW,
    signalLen: SIGNAL,
  });
  const expected = spread(VOLUME, FAST, SLOW, SIGNAL);

  matches(plot(surface, 'Oscillator'), asSeries(expected.value), SLOW - 1, 'volume oscillator');
  matches(
    plot(surface, 'Signal'),
    asSeries(expected.signal),
    SLOW - 1 + SIGNAL - 1,
    'volume oscillator signal',
  );
  assert.notDeepEqual(
    plot(surface, 'Oscillator'),
    asSeries(spread(CLOSE, FAST, SLOW, SIGNAL).value),
    'the volume oscillator is not the price one',
  );
});

/** The double smoothing both strength studies share: long first, then short. */
function doubleSmoothed(values: readonly number[], shortLen: number, longLen: number): Ref {
  const moved = changeOf(values);
  const smooth = (input: Ref): Ref => {
    const start = input.findIndex((one) => Number.isFinite(one));
    if (start < 0) return input.map(() => NaN);
    const once = expMean(input.slice(start), longLen);
    const padded = new Array<number>(input.length).fill(NaN);
    for (let i = 0; i < once.length; i += 1) padded[start + i] = once[i] as number;
    const from = padded.findIndex((one) => Number.isFinite(one));
    if (from < 0) return padded;
    const twice = expMean(padded.slice(from), shortLen);
    const out = new Array<number>(input.length).fill(NaN);
    for (let i = 0; i < twice.length; i += 1) out[from + i] = twice[i] as number;
    return out;
  };
  const top = smooth(moved);
  const bottom = smooth(mapped(moved, Math.abs));
  return top.map((one, i) => 100 * (one / (bottom[i] as number)));
}

const LONG = 25;
const SHORT = 13;

// Catches: the two smoothings applied short first. That is the argument order
// the study publishes and the wrong order to apply them in, and the curve it
// draws is plausible everywhere.
test('true strength and its signal match the reference', () => {
  const surface = runStudy('true-strength', { longLen: LONG, shortLen: SHORT, signalLen: SHORT });
  const value = doubleSmoothed(CLOSE, SHORT, LONG);
  const first = LONG + SHORT - 1;
  const signalTail = expMean(value.slice(first), SHORT);
  const signal = new Array<number>(value.length).fill(NaN);
  for (let i = 0; i < signalTail.length; i += 1) signal[first + i] = signalTail[i] as number;

  matches(plot(surface, 'Strength'), asSeries(value), first, 'true strength');
  matches(plot(surface, 'Signal'), asSeries(signal), first + SHORT - 1, 'true strength signal');
});

const ERG_LONG = 20;
const ERG_SHORT = 5;

// Catches: a study that draws the gap between two lines it did not draw. The
// histogram is asserted against the difference of the two reference columns
// rather than against the two plotted ones, so a study whose lines are right
// and whose subtraction is not is still caught.
test('the ergodic reading, its signal and their gap match the reference', () => {
  const surface = runStudy('smoothed-ergodic', {
    longLen: ERG_LONG,
    shortLen: ERG_SHORT,
    signalLen: ERG_SHORT,
  });
  const value = doubleSmoothed(CLOSE, ERG_SHORT, ERG_LONG);
  const first = ERG_LONG + ERG_SHORT - 1;
  const signalTail = expMean(value.slice(first), ERG_SHORT);
  const signal = new Array<number>(value.length).fill(NaN);
  for (let i = 0; i < signalTail.length; i += 1) signal[first + i] = signalTail[i] as number;

  matches(plot(surface, 'Ergodic'), asSeries(value), first, 'ergodic');
  matches(plot(surface, 'Signal'), asSeries(signal), first + ERG_SHORT - 1, 'ergodic signal');
  matches(
    plot(surface, 'Gap'),
    asSeries(value.map((one, i) => one - (signal[i] as number))),
    first + ERG_SHORT - 1,
    'ergodic gap',
  );
});

const K_LENGTH = 10;
const D_LENGTH = 3;

// Catches: a range measured from the low rather than from the midpoint, which
// is the one change that separates this study from the range position one and
// which shifts every reading by fifty on a different scale.
test('stochastic momentum and its signal match the reference', () => {
  const surface = runStudy('stochastic-momentum', {
    lenK: K_LENGTH,
    lenD: D_LENGTH,
    lenEma: D_LENGTH,
  });

  const top = highestOf(HIGH, K_LENGTH);
  const bottom = lowestOf(LOW, K_LENGTH);
  const span = top.map((one, i) => one - (bottom[i] as number));
  const place = CLOSE.map((one, i) => one - ((top[i] as number) + (bottom[i] as number)) / 2);
  const twice = (input: Ref): Ref => {
    const start = input.findIndex((one) => Number.isFinite(one));
    const once = expMean(input.slice(start), D_LENGTH);
    const padded = new Array<number>(input.length).fill(NaN);
    for (let i = 0; i < once.length; i += 1) padded[start + i] = once[i] as number;
    const from = padded.findIndex((one) => Number.isFinite(one));
    const out = new Array<number>(input.length).fill(NaN);
    const second = expMean(padded.slice(from), D_LENGTH);
    for (let i = 0; i < second.length; i += 1) out[from + i] = second[i] as number;
    return out;
  };
  const numerator = twice(place);
  const denominator = twice(span);
  const value = numerator.map((one, i) =>
    (denominator[i] as number) === 0 ? NaN : 200 * (one / (denominator[i] as number)),
  );

  const first = K_LENGTH - 1 + 2 * (D_LENGTH - 1);
  matches(plot(surface, 'Momentum'), asSeries(value), first, 'stochastic momentum');
});

const TRIX_LENGTH = 18;

// Catches: a study that smooths the price rather than its logarithm. The two
// curves are the same shape and differ by a factor that depends on the price
// level, which is the one thing the logarithm is there to remove.
test('the triple smoothed rate matches the reference at its deep warmup', () => {
  const surface = runStudy('triple-smoothed-rate', { len: TRIX_LENGTH });

  const logs = CLOSE.map((one) => (one > 0 ? Math.log(one) : NaN));
  const chained = (input: Ref): Ref => {
    const start = input.findIndex((one) => Number.isFinite(one));
    if (start < 0) return input.map(() => NaN);
    const once = expMean(input.slice(start), TRIX_LENGTH);
    const out = new Array<number>(input.length).fill(NaN);
    for (let i = 0; i < once.length; i += 1) out[start + i] = once[i] as number;
    return out;
  };
  const smoothed = chained(chained(chained(logs)));
  const expected = changeOf(smoothed).map((one) => 10000 * one);

  matches(plot(surface, 'Rate'), asSeries(expected), 3 * TRIX_LENGTH - 2, 'triple smoothed rate');
});

const ROC_LENGTH = 9;

// Catches: a rate that divides by this bar's price rather than by the older
// one. The two agree in sign and disagree in size, which on a chart is a
// difference nobody sees.
test('the rate of change matches the reference and marks each crossing of zero', () => {
  const surface = runStudy('rate-of-change', { len: ROC_LENGTH });
  const expected = rateOfChange(CLOSE, ROC_LENGTH);
  const drawn = plot(surface, 'Rate');

  matches(drawn, asSeries(expected), ROC_LENGTH, 'rate of change');

  const up: number[] = [];
  const down: number[] = [];
  for (let bar = 1; bar < drawn.length; bar += 1) {
    const now = drawn[bar] ?? null;
    const before = drawn[bar - 1] ?? null;
    if (now === null || before === null) continue;
    if (before <= 0 && now > 0) up.push(bar);
    if (before >= 0 && now < 0) down.push(bar);
  }
  assert.deepEqual(firedOn(marker(surface, 'm0')), up, 'crossings up through zero');
  assert.deepEqual(firedOn(marker(surface, 'm1')), down, 'crossings down through zero');
});

const MOMENTUM_LENGTH = 10;

// Catches: a study that treats its own zero as absence, and bar colouring that
// paints a bar the study said nothing about.
test('price momentum matches the reference and paints the sign of its reading', () => {
  const surface = runStudy('price-momentum', { len: MOMENTUM_LENGTH });
  const expected = changeOf(CLOSE, MOMENTUM_LENGTH);
  const drawn = plot(surface, 'Momentum');

  matches(drawn, asSeries(expected), MOMENTUM_LENGTH, 'price momentum');
  matchesWithGaps(
    paintNames(surface.barColors, ['lime', 'red']).map((one) =>
      one === null ? null : one === 'lime' ? 1 : -1,
    ),
    drawn.map((value) => (value === null || value === 0 ? null : value > 0 ? 1 : -1)),
    'price momentum bar colours',
  );
});
