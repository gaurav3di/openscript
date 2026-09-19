/**
 * Absence is not zero, and never becomes zero.
 *
 * The wrong implementation this file exists to catch is the one that fills a
 * warmup bar or a hole with 0. It is an easy implementation to write and a hard
 * defect to see: a study returning zero draws a line along the axis that looks
 * exactly like data, and nothing downstream can tell it from a reading of zero,
 * which is a real answer for several of these functions.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Value } from '../../src/core/stdlib/index.js';
import * as lib from '../../src/core/stdlib/index.js';

import { BARS } from './vectors.js';
import { assertSame, column, firstValueAt } from './support.js';

const CLOSE = BARS.map((bar) => bar.close);

/** A series with one bar missing from the middle of it. */
const HOLED: Value[] = [1, 2, null, 4, 5, 6, 7, 8];

test('a windowed function is absent for every window that contains a hole', () => {
  assertSame(lib.sma(HOLED, 3), [null, null, null, null, null, 5, 6, 7], 'sma over a hole');
});

test('no windowed function substitutes zero for a missing bar', () => {
  for (const value of lib.sma(HOLED, 3)) assert.notEqual(value, 0);
  for (const value of lib.wma(HOLED, 3)) assert.notEqual(value, 0);
  for (const value of lib.sum(HOLED, 3)) assert.notEqual(value, 0);
  for (const value of lib.stdev(HOLED, 3)) assert.notEqual(value, 0);
});

test('the three skip functions ignore a hole, and say so in their names', () => {
  assertSame(lib.sumSkip(HOLED, 3), [null, null, 3, 6, 9, 15, 18, 21], 'sumSkip');
  assertSame(lib.countPresent(HOLED, 3), [null, null, 2, 2, 2, 3, 3, 3], 'countPresent');
  assertSame(lib.avgSkip(HOLED, 3), [null, null, 1.5, 3, 4.5, 5, 6, 7], 'avgSkip');
});

// Catches: an exponential average that consumes an absent bar as zero, which
// would drag the running value toward nothing and leave it wrong for the rest
// of the series. It also catches one that re-seeds, which would restart a long
// average because of one missing bar.
test('a hole makes an exponential average absent for that bar and nothing more', () => {
  const withHole = lib.ema([1, 2, 3, null, 5], 3);
  const without = lib.ema([1, 2, 3, 5], 3);

  assert.equal(withHole[2], 2, 'seeded with the mean of the first three');
  assert.equal(withHole[3], null, 'the hole itself is absent');
  assert.equal(withHole[4], without[3], 'the bar after the hole continues from the seed');
});

// Catches: a warmup asserted rather than derived. Composition is the test that
// tells the two apart, because a hard coded first bar cannot know what it was
// handed.
test('warmups compose: an average of an average starts where both have finished', () => {
  assert.equal(firstValueAt(lib.sma(lib.ema(CLOSE, 10), 10)), 18);
  assert.equal(firstValueAt(lib.ema(lib.ema(CLOSE, 10), 10)), 18);
  assert.equal(firstValueAt(lib.rsi(lib.sma(CLOSE, 5), 14)), 18);
});

test('a division with no finite answer is absent, not an infinity', () => {
  assert.equal(lib.roc([0, 5], 1)[1], null, 'a zero base has no percentage');
  assert.equal(lib.sma([1e308, 1e308], 2)[1], null, 'a sum that overflows is absent');
  assert.equal(lib.bbPercent([5, 5, 5, 5], 4, 2)[3], null, 'flat bands have no position');
});

test('negative zero is normalised away, so nothing can observe its sign', () => {
  const mean = lib.sma([-0, -0], 2)[1];
  assert.equal(mean, 0);
  assert.ok(Object.is(mean, 0), 'the result should be positive zero');
});

// Catches: zero before the condition has ever held. Zero would read as "it
// happened on this bar", which is the one answer a reader would act on.
test('barsSince and valueWhen are absent before the condition has ever held', () => {
  const flags = [false, false, true, false, false];
  const source: Value[] = [10, 11, 12, 13, 14];
  assertSame(lib.barsSince(flags), [null, null, 0, 1, 2], 'barsSince');
  assertSame(lib.valueWhen(flags, source, 0), [null, null, 12, 12, 12], 'valueWhen');
});

test('volume studies are absent throughout when the host supplies no volume', () => {
  const noVolume = BARS.map((bar) => ({ ...bar, volume: null }));
  for (const value of lib.obv(noVolume)) assert.equal(value, null);
  for (const value of lib.ad(noVolume)) assert.equal(value, null);
  for (const value of lib.cmf(noVolume, 20)) assert.equal(value, null);
  for (const value of lib.mfi(noVolume, 14)) assert.equal(value, null);
  for (const value of lib.relativeVolume(noVolume, 20)) assert.equal(value, null);
});

// Catches: an array that grows as warmup completes, which would make an index
// an out-of-range error at the left edge of a chart and nowhere else.
test('a multi-output array is present and full length on a warmup bar', () => {
  const rows = lib.macd(CLOSE, 12, 26, 9);
  const first = rows[0];
  assert.ok(Array.isArray(first));
  assert.equal(first.length, 3);
  assert.deepEqual(first, [null, null, null]);
});

test('an element of a multi-output study carries its own warmup', () => {
  const rows = lib.adx(BARS, 14, 14);
  assert.equal(firstValueAt(column(rows, 0)), 27);
  assert.equal(firstValueAt(column(rows, 1)), 14);
  assert.equal(firstValueAt(column(rows, 2)), 14);
});

test('an anchored average is absent until its anchor and restarts on it', () => {
  const source: Value[] = [10, 20, 30, 40];
  const volume: Value[] = [1, 1, 1, 1];
  const anchors = [false, true, false, true];
  assertSame(
    lib.vwapAnchor(source, volume, anchors),
    [null, 20, 25, 40],
    'vwapAnchor',
  );
});
