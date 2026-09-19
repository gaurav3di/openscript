/**
 * The gate for this phase: EMA, RSI, MACD, Bollinger Bands and Supertrend match
 * reference implementations to the last decimal, with exact warmup.
 *
 * Each test names the wrong implementation it exists to catch, because a test
 * that cannot fail is documentation with a green tick on it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  bollinger,
  bollingerTail,
  ema,
  emaTail,
  macd,
  macdTail,
  rsi,
  rsiTail,
  supertrend,
  supertrendTail,
} from '../../src/core/stdlib/index.js';

import {
  BARS,
  BB_BASIS,
  BB_LOWER,
  BB_UPPER,
  EMA_20,
  MACD_HISTOGRAM,
  MACD_LINE,
  MACD_SIGNAL,
  RSI_14,
  SUPERTREND_DIRECTION,
  SUPERTREND_LINE,
} from './vectors.js';
import { assertSame, assertTailAgrees, assertWarmup, column } from './support.js';

const CLOSE = BARS.map((bar) => bar.close);

// Catches: an average seeded from bar 0 rather than from the mean of the first
// `len` values, which draws a line where there should be a gap and stays
// materially wrong for many bars after it. Such an implementation has a value
// at bar 0 and fails the warmup assertion on its first line.
test('ema matches the reference to the last decimal, from bar len - 1', () => {
  const values = ema(CLOSE, 20);
  assertWarmup(values, 19, 'ema(close, 20)');
  assertSame(values, EMA_20, 'ema(close, 20)');
});

test('the ema tail and the whole series form are the same numbers', () => {
  assertTailAgrees(() => emaTail(20), (input) => ema(input, 20), CLOSE, 'ema(close, 20)');
});

// Catches: the off-by-one that puts the first reading at bar `len - 1`. A
// strength reading needs `len` changes and a change needs two bars, so the
// first honest value is at bar `len`. An implementation that smoothed the
// change series as though it began at bar 0 lands one bar early here.
test('rsi matches the reference to the last decimal, from bar len', () => {
  const values = rsi(CLOSE, 14);
  assertWarmup(values, 14, 'rsi(close, 14)');
  assertSame(values, RSI_14, 'rsi(close, 14)');
});

test('the rsi tail and the whole series form are the same numbers', () => {
  assertTailAgrees(() => rsiTail(14), (input) => rsi(input, 14), CLOSE, 'rsi(close, 14)');
});

// Catches: a signal average started at bar 0 of the difference series rather
// than at the difference's own first value. That implementation would seed the
// signal from eight absent bars and one real one, and its first signal value
// lands at bar 25 rather than bar 33.
test('macd matches the reference to the last decimal, on all three warmups', () => {
  const rows = macd(CLOSE, 12, 26, 9);
  const line = column(rows, 0);
  const signal = column(rows, 1);
  const histogram = column(rows, 2);

  assertWarmup(line, 25, 'macd line');
  assertWarmup(signal, 33, 'macd signal');
  assertWarmup(histogram, 33, 'macd histogram');

  assertSame(line, MACD_LINE, 'macd line');
  assertSame(signal, MACD_SIGNAL, 'macd signal');
  assertSame(histogram, MACD_HISTOGRAM, 'macd histogram');
});

// Catches: an array whose length grows as warmup completes. Section 2.3 of
// stdlib.md requires the array itself to be present and of a fixed length on
// every bar, with each element carrying its own warmup.
test('a multi-output study returns a full length array on every bar, warmup included', () => {
  for (const row of macd(CLOSE, 12, 26, 9)) assert.equal(row.length, 3);
  for (const row of bollinger(CLOSE, 20, 2)) assert.equal(row.length, 3);
  for (const row of supertrend(BARS, 3, 10)) assert.equal(row.length, 2);
});

test('the macd tail and the whole series form are the same numbers', () => {
  const tail = macdTail(12, 26, 9);
  const whole = macd(CLOSE, 12, 26, 9);
  for (let index = 0; index < CLOSE.length; index += 1) {
    assert.deepEqual(tail.next(CLOSE[index] ?? null), whole[index]);
  }
});

// Catches: the sample standard deviation, with the `len - 1` divisor, in place
// of the population one. Section 6 of stdlib.md fixes the population form
// because that is what the band study a chart has to reproduce uses, and the
// two differ on every bar by a factor no tolerance would hide.
test('bollinger matches the reference to the last decimal, from bar len - 1', () => {
  const rows = bollinger(CLOSE, 20, 2);
  const basis = column(rows, 0);
  const upper = column(rows, 1);
  const lower = column(rows, 2);

  assertWarmup(basis, 19, 'bollinger basis');
  assertWarmup(upper, 19, 'bollinger upper');
  assertWarmup(lower, 19, 'bollinger lower');

  assertSame(basis, BB_BASIS, 'bollinger basis');
  assertSame(upper, BB_UPPER, 'bollinger upper');
  assertSame(lower, BB_LOWER, 'bollinger lower');
});

test('the bollinger tail and the whole series form are the same numbers', () => {
  const tail = bollingerTail(20, 2);
  const whole = bollinger(CLOSE, 20, 2);
  for (let index = 0; index < CLOSE.length; index += 1) {
    assert.deepEqual(tail.next(CLOSE[index] ?? null), whole[index]);
  }
});

// Catches: a band that does not carry forward. The upper band may only fall
// while price stays below it and the lower may only rise while price stays
// above it; an implementation that recomputed both bands outright every bar
// produces a line that wanders back and forth and flips on bars this one does
// not.
test('supertrend matches the reference to the last decimal, from bar atrLen', () => {
  const rows = supertrend(BARS, 3, 10);
  const line = column(rows, 0);
  const direction = column(rows, 1);

  assertWarmup(line, 10, 'supertrend line');
  assertWarmup(direction, 10, 'supertrend direction');

  assertSame(line, SUPERTREND_LINE, 'supertrend line');
  assertSame(direction, SUPERTREND_DIRECTION, 'supertrend direction');
});

// Catches: reporting the seed bar. On the bar average true range first has a
// value there is no previous close and no previous band, so the direction there
// would come from the implementation's own seeding rule rather than from the
// data. stdlib.md section 4 puts the first value one bar later, and a
// conforming engine returns absence on exactly the bars before it.
test('supertrend reports nothing on the bar its average true range is seeded on', () => {
  const rows = supertrend(BARS, 3, 10);
  assert.deepEqual(rows[9], [null, null]);
  assert.notDeepEqual(rows[10], [null, null]);
});

test('the supertrend tail and the whole series form are the same numbers', () => {
  const tail = supertrendTail(3, 10);
  const whole = supertrend(BARS, 3, 10);
  for (let index = 0; index < BARS.length; index += 1) {
    const bar = BARS[index];
    assert.ok(bar !== undefined);
    assert.deepEqual(tail.next(bar), whole[index]);
  }
});

// Catches: a direction reported as a bool, or with the signs the other way
// round. It is a number so that `direction != direction[1]` reads as the flip
// test, and -1 is long because that is the sign of the side the band protects
// against.
test('supertrend direction is -1 long and 1 short, and it flips', () => {
  const direction = column(supertrend(BARS, 3, 10), 1).filter((value) => value !== null);
  assert.ok(direction.length > 0);
  for (const value of direction) assert.ok(value === -1 || value === 1);
  assert.ok(new Set(direction).size === 2, 'the fixture should contain a flip');
});
