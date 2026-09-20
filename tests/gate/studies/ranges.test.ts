/**
 * The range studies of this half of the gate.
 *
 * Five independently written studies, each reproduced in OpenScript and each
 * carrying something beyond a column of numbers: a negative scale, a pane
 * shaded while a regime holds, a marker that fires on the change of state
 * rather than on the state, and two studies whose warmups stack four deep.
 *
 * The strength reading these lean on is imported from the first half's
 * reference rather than transcribed again. It is already anchored there against
 * the committed vectors, and a second copy of it here would be a second place
 * for it to drift.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { strength } from '../reference.js';
import type { Ref, RefBar } from './primitives.js';
import { highestOf, lowestOf, mean, rangePosition, symmetricMean, windowSum } from './primitives.js';
import {
  CLOSE,
  HIGH,
  LOW,
  OPEN,
  REF_BARS,
  firedOn,
  marker,
  paintNames,
  plot,
  runStudy,
} from './surface.js';
import { asSeries, matches, matchesWithGaps } from './verdict.js';

const PERCENT_LENGTH = 14;

// Catches: the sign convention inverted, which is the mistake this study invites
// and which a reader cannot see on a chart because the shape of the line is the
// same either way. It also catches a window taken over the source rather than
// over the bar's own high and low: the three do not have to agree, and here
// they do not.
test('percent range matches the reference on every bar', () => {
  const surface = runStudy('percent-range', { len: PERCENT_LENGTH });
  const top = highestOf(HIGH, PERCENT_LENGTH);
  const bottom = lowestOf(LOW, PERCENT_LENGTH);
  const expected: Ref = CLOSE.map((value, bar) => {
    const span = (top[bar] as number) - (bottom[bar] as number);
    return span === 0 ? NaN : (100 * (value - (top[bar] as number))) / span;
  });

  matches(
    plot(surface, 'Percent range'),
    asSeries(expected),
    PERCENT_LENGTH - 1,
    'percent range',
  );
});

// Catches: shading that answers on a warmup bar. An absent reading is neither
// above the upper band nor below the lower one, and a study that treated
// absence as "not above" would shade the whole warmup as the quiet regime.
test('percent range shades the pane only while a reading is at an extreme', () => {
  const surface = runStudy('percent-range', { len: PERCENT_LENGTH });
  const drawn = plot(surface, 'Percent range');
  const shaded = surface.background.map((cell) => cell !== null);

  assert.deepEqual(
    shaded,
    drawn.map((value) => value !== null && (value > -20 || value < -80)),
    'percent range shading',
  );
});

// Catches: a marker that fires on every bar of an extreme rather than on the
// bar the study left it. The two differ by a run of bars, and the run is what a
// reader would act on twenty times instead of once.
test('percent range marks the bar it leaves an extreme on, and no other', () => {
  const surface = runStudy('percent-range', { len: PERCENT_LENGTH });
  const drawn = plot(surface, 'Percent range');

  const above = drawn.map((value) => value !== null && value > -20);
  const below = drawn.map((value) => value !== null && value < -80);
  const leaving = (state: readonly boolean[]): number[] => {
    const out: number[] = [];
    for (let bar = 1; bar < state.length; bar += 1) {
      if (state[bar] === false && state[bar - 1] === true) out.push(bar);
    }
    return out;
  };

  assert.deepEqual(firedOn(marker(surface, 'm0')), leaving(above), 'leaving the high band');
  assert.deepEqual(firedOn(marker(surface, 'm1')), leaving(below), 'leaving the low band');
  assert.notEqual(leaving(above).length + leaving(below).length, 0, 'the fixture should reach both bands');
});

const FAST = 7;
const MID = 14;
const SLOW = 28;

// Catches: the extra bar of warmup dropped. Every term of this study reaches
// back across a bar boundary, so bar 0 has none and a total over a window
// holding bar 0 has none either. An implementation that started its totals at
// bar `slow - 1` produces a value one bar early and is otherwise identical.
test('the ultimate oscillator matches the reference, warmup bar included', () => {
  const surface = runStudy('ultimate-oscillator', { fastLen: FAST, midLen: MID, slowLen: SLOW });

  const bars = REF_BARS;
  const buying = new Array<number>(bars.length).fill(NaN);
  const span = new Array<number>(bars.length).fill(NaN);
  for (let i = 1; i < bars.length; i += 1) {
    const previous = (bars[i - 1] as RefBar).close;
    const top = Math.max((bars[i] as RefBar).high, previous);
    const bottom = Math.min((bars[i] as RefBar).low, previous);
    buying[i] = (bars[i] as RefBar).close - bottom;
    span[i] = top - bottom;
  }
  const ratio = (length: number): Ref => {
    const totalBuying = windowSum(buying, length);
    const totalSpan = windowSum(span, length);
    return totalSpan.map((value, i) =>
      value === 0 ? NaN : (totalBuying[i] as number) / value,
    );
  };
  const fast = ratio(FAST);
  const middle = ratio(MID);
  const slow = ratio(SLOW);
  const expected = bars.map(
    (_bar, i) =>
      (100 * (4 * (fast[i] as number) + 2 * (middle[i] as number) + (slow[i] as number))) / 7,
  );

  matches(plot(surface, 'Oscillator'), asSeries(expected), SLOW, 'ultimate oscillator');
});

const RSI_LENGTH = 14;
const STOCH_LENGTH = 14;
const SMOOTH_K = 3;
const SMOOTH_D = 3;

// Catches: a window taken over price rather than over the strength reading, and
// a warmup that does not stack. Four windows run one after the other here, so
// an implementation that started any of them at bar 0 of the series rather than
// at its input's first value is early by exactly the window it skipped.
test('the stochastic strength reading and its smoothing match the reference', () => {
  const surface = runStudy('stochastic-strength', {
    rsiLen: RSI_LENGTH,
    stochLen: STOCH_LENGTH,
    smoothK: SMOOTH_K,
    smoothD: SMOOTH_D,
  });

  const reading = strength(CLOSE, RSI_LENGTH);
  const raw = rangePosition(reading, reading, reading, STOCH_LENGTH);
  const k = mean(raw, SMOOTH_K);
  const d = mean(k, SMOOTH_D);

  const firstRaw = RSI_LENGTH + STOCH_LENGTH - 1;
  matches(plot(surface, 'K'), asSeries(k), firstRaw + SMOOTH_K - 1, 'stochastic strength K');
  matches(
    plot(surface, 'D'),
    asSeries(d),
    firstRaw + SMOOTH_K - 1 + SMOOTH_D - 1,
    'stochastic strength D',
  );
});

const VIGOUR_LENGTH = 10;

// Catches: a total taken from bar 0 rather than from the four bar kernel's own
// first value. The kernel is absent for three bars, so a total that started
// counting at bar 0 would be three bars early and would have summed absence.
test('relative vigour and its signal match the reference', () => {
  const surface = runStudy('relative-vigour', { len: VIGOUR_LENGTH });

  const body = symmetricMean(REF_BARS.map((bar) => bar.close - bar.open));
  const span = symmetricMean(REF_BARS.map((bar) => bar.high - bar.low));
  const top = windowSum(body, VIGOUR_LENGTH);
  const bottom = windowSum(span, VIGOUR_LENGTH);
  const value = bottom.map((denominator, i) =>
    denominator === 0 ? NaN : (top[i] as number) / denominator,
  );
  const signal = symmetricMean(value);

  const first = 3 + VIGOUR_LENGTH - 1;
  matches(plot(surface, 'Vigour'), asSeries(value), first, 'relative vigour');
  matches(plot(surface, 'Signal'), asSeries(signal), first + 3, 'relative vigour signal');
  // The two source columns are not the same series, which a study that read one
  // of them twice would pass every other assertion here without.
  assert.notDeepEqual(OPEN, HIGH, 'the fixture should have bodies inside its ranges');
});

const K_LENGTH = 14;
const K_SMOOTH = 3;
const D_SMOOTH = 3;

// Catches: the two smoothings applied in the wrong order, which gives a
// different D and the same K, so half the study still matches.
test('range position and its two smoothings match the reference', () => {
  const surface = runStudy('range-position', { kLen: K_LENGTH, kSmooth: K_SMOOTH, dLen: D_SMOOTH });

  const top = highestOf(HIGH, K_LENGTH);
  const bottom = lowestOf(LOW, K_LENGTH);
  const raw = CLOSE.map((value, bar) => {
    const span = (top[bar] as number) - (bottom[bar] as number);
    return span > 0 ? ((value - (bottom[bar] as number)) / span) * 100 : NaN;
  });
  const k = mean(raw, K_SMOOTH);
  const d = mean(k, D_SMOOTH);

  const firstK = K_LENGTH - 1 + K_SMOOTH - 1;
  matches(plot(surface, 'K'), asSeries(k), firstK, 'range position K');
  matches(plot(surface, 'D'), asSeries(d), firstK + D_SMOOTH - 1, 'range position D');
});

// Catches: a crossing test that fires on the bar the two lines touch rather than
// on the bar one passes the other, and a marker whose text was decided by the
// wrong condition. Both markers are compared as the bars they fired on and as
// the words they carried, because the words are what a reader acts on.
test('range position marks each crossing once, with the level it happened at', () => {
  const surface = runStudy('range-position', { kLen: K_LENGTH, kSmooth: K_SMOOTH, dLen: D_SMOOTH });
  const k = plot(surface, 'K');
  const d = plot(surface, 'D');

  const up: number[] = [];
  const down: number[] = [];
  for (let bar = 1; bar < k.length; bar += 1) {
    const nowK = k[bar] ?? null;
    const nowD = d[bar] ?? null;
    const wasK = k[bar - 1] ?? null;
    const wasD = d[bar - 1] ?? null;
    if (nowK === null || nowD === null || wasK === null || wasD === null) continue;
    if (wasK <= wasD && nowK > nowD) up.push(bar);
    if (wasK >= wasD && nowK < nowD) down.push(bar);
  }

  const upMarks = marker(surface, 'm0');
  const downMarks = marker(surface, 'm1');
  assert.deepEqual(firedOn(upMarks), up, 'upward crossings');
  assert.deepEqual(firedOn(downMarks), down, 'downward crossings');
  assert.deepEqual(
    up.map((bar) => upMarks[bar]),
    up.map((bar) => ((k[bar] as number) < 20 ? 'TURN UP, LOW' : 'TURN UP')),
    'upward crossing text',
  );
  assert.deepEqual(
    down.map((bar) => downMarks[bar]),
    down.map((bar) => ((k[bar] as number) > 80 ? 'TURN DOWN, HIGH' : 'TURN DOWN')),
    'downward crossing text',
  );
});

// Catches: a pane shaded from the slow line rather than from the fast one, and
// shading left on through the warmup. Asserting the colour by name rather than
// by channel means a failure reads as the colour a reader would see.
test('range position shades the pane from the fast line alone', () => {
  const surface = runStudy('range-position', { kLen: K_LENGTH, kSmooth: K_SMOOTH, dLen: D_SMOOTH });
  const k = plot(surface, 'K');
  const shaded = paintNames(surface.background, []);

  matchesWithGaps(
    shaded.map((cell) => (cell === null ? null : 1)),
    k.map((value) => (value !== null && (value > 80 || value < 20) ? 1 : null)),
    'range position shading',
  );
});
