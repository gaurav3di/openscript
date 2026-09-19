/**
 * The series helpers of `stdlib.md` section 9, and the decisions inside them
 * that a reader would otherwise have to guess.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Bar, Value } from '../../src/core/stdlib/index.js';
import * as lib from '../../src/core/stdlib/index.js';

import { assertSame } from './support.js';

function bar(high: number, low: number, close: number, volume = 1): Bar {
  return { open: close, high, low, close, volume };
}

// Catches: "strictly below, then above". Two series that touch and separate
// report one cross rather than none, which stdlib.md section 9 states and gives
// the reason for: touching is common on an instrument with a coarse tick, and
// the strict reading loses exactly those crossings.
test('a crossing counts a touch as being at or below, so a touch and a separation cross', () => {
  assertSame(
    lib.crossUp([1, 2, 2, 3], [2, 2, 2, 2]).map((flag) => (flag === null ? null : flag ? 1 : 0)),
    [null, 0, 0, 1],
    'crossUp after a touch',
  );
});

test('a crossing down is the same test the other way, and cross is either', () => {
  const down = lib.crossDown([3, 2, 2, 1], [2, 2, 2, 2]);
  assert.equal(down[3], true);
  const either = lib.cross([1, 3], [2, 2]);
  assert.equal(either[1], true);
});

// Catches: reporting the older bar when the window's extreme is tied. The high
// was set most recently at the newer bar, and answering with the older one
// makes the reading jump backwards as an equal high rolls in.
test('the bars-back readings resolve a tie to the most recent bar', () => {
  assert.equal(lib.highestBars([5, 5, 5], 3)[2], 0);
  assert.equal(lib.highestBars([5, 3, 3], 3)[2], 2);
  assert.equal(lib.highestBars([3, 5, 5], 3)[2], 0);
  assert.equal(lib.lowestBars([1, 1, 1], 3)[2], 0);
  assert.equal(lib.lowestBars([1, 3, 3], 3)[2], 2);
});

// Catches: reporting a pivot at the bar it formed on. That is a lookahead: the
// value would appear on history at a bar where no script could have had it, and
// a backtest built on it is a backtest of a strategy nobody could have run.
test('a pivot is reported right bars after it formed, not at the pivot', () => {
  assertSame(lib.pivotHigh([1, 5, 1, 1, 1], 1, 1), [null, null, 5, null, null], 'pivotHigh');
  assertSame(lib.pivotLow([5, 1, 5, 5, 5], 1, 1), [null, null, 1, null, null], 'pivotLow');
});

// Catches: a non-strict comparison, which would call one of two equal highs a
// pivot and make the answer depend on which end the scan started from.
test('an equal neighbour means there is no pivot', () => {
  for (const value of lib.pivotHigh([1, 5, 5, 1, 1], 1, 1)) assert.equal(value, null);
});

test('valueWhen reaches back past the latest occurrence when asked', () => {
  const flags = [true, false, true, false, true];
  const source: Value[] = [1, 2, 3, 4, 5];
  assertSame(lib.valueWhen(flags, source, 0), [1, 1, 3, 3, 5], 'occurrence 0');
  assertSame(lib.valueWhen(flags, source, 1), [null, null, 1, 1, 3], 'occurrence 1');
});

test('barsSince is zero on the bar the condition held, and counts up after it', () => {
  assertSame(lib.barsSince([false, true, false, false, true]), [null, 0, 1, 2, 0], 'barsSince');
});

test('a run test needs every one of the last len changes to go the same way', () => {
  assertSame(
    lib.rising([1, 2, 3, 3], 2).map((flag) => (flag === null ? null : flag ? 1 : 0)),
    [null, null, 1, 0],
    'rising',
  );
  assertSame(
    lib.falling([4, 3, 2, 2], 2).map((flag) => (flag === null ? null : flag ? 1 : 0)),
    [null, null, 1, 0],
    'falling',
  );
});

// Catches: the nearest rank method, which returns a member of the window rather
// than interpolating, and gives the upper of the two middles for an even length
// window. stdlib.md section 9 specifies the interpolated form.
test('percentile interpolates, so an even window has a median between two values', () => {
  assert.equal(lib.median([1, 2, 3, 4], 4)[3], 2.5);
  assert.equal(lib.percentile([1, 2, 3, 4], 4, 25)[3], 1.75);
  assert.equal(lib.percentile([1, 2, 3, 4], 4, 0)[3], 1);
  assert.equal(lib.percentile([1, 2, 3, 4], 4, 100)[3], 4);
  assert.equal(lib.percentile([1, 2, 3, 4], 4, 101)[3], null, 'a percentile is 0 to 100');
});

test('percentRank counts the window including this bar, as its warmup requires', () => {
  assert.equal(lib.percentRank([1, 2, 3, 4], 4)[3], 100);
  assert.equal(lib.percentRank([4, 3, 2, 1], 4)[3], 25);
});

test('covariance and correlation are the population forms', () => {
  assert.equal(lib.covariance([1, 2, 3], [2, 4, 6], 3)[2], 1.3333333333333333);
  assert.equal(lib.correlation([1, 2, 3], [2, 4, 6], 3)[2], 1);
  assert.equal(lib.correlation([1, 2, 3], [6, 4, 2], 3)[2], -1);
  assert.equal(lib.correlation([1, 1, 1], [2, 4, 6], 3)[2], null, 'no spread, no correlation');
});

test('history is the explicit form of reading a bar back', () => {
  assertSame(lib.history([1, 2, 3, 4], 2), [null, null, 1, 2], 'history');
  assertSame(lib.change([1, 2, 4, 8], 2), [null, null, 3, 6], 'change over two bars');
});

test('count treats an absent condition as one that did not hold', () => {
  assertSame(lib.count([null, true, false, true], 2), [null, 1, 1, 1], 'count');
});

// Catches: bar 0 propagating absence through true range. stdlib.md section 6
// calls this the one deliberate exception in the library: the bar's own range
// is a true statement about that bar, and propagating would start every average
// of it one bar later than every reference implementation.
test('true range on bar 0 is the bar range, and the gap form is absent there', () => {
  const bars = [bar(3, 1, 2), bar(5, 4, 4)];
  assertSame(lib.trueRange(bars), [2, 3], 'trueRange');
  assertSame(lib.gapTrueRange(bars), [null, 3], 'the gap aware form');
});

test('the running totals of volume start where their entries say they do', () => {
  const bars = [bar(3, 1, 2, 10), bar(5, 2, 4, 20), bar(5, 2, 3, 5)];
  assertSame(lib.obv(bars), [0, 20, 15], 'obv is seeded at zero on bar 0');
  assert.equal(lib.pvt(bars)[0], null, 'pvt has no change to add on bar 0');
});

test('the window extremes read the bars, not the source, where the entry says so', () => {
  const bars = [bar(3, 1, 2), bar(5, 2, 4)];
  assertSame(lib.donchian(bars, 2)[1] ?? [], [5, 3, 1], 'donchian upper, basis and lower');
});
