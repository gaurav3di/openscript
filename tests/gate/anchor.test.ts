/**
 * The anchor: the reference transcription is the arithmetic it was taken from.
 *
 * Every gate test below compares the engine's output against `reference.ts`, so
 * `reference.ts` is doing the work of a reference implementation and has to
 * earn it. The vectors in `tests/stdlib/vectors.ts` were produced by this
 * project's sibling chart package rather than by anything in this repository,
 * so reproducing them, to the last decimal and on the same bars, is what makes
 * the transcription the sibling's arithmetic instead of a second opinion
 * written from the same specification.
 *
 * **The wrong implementation this catches** is a transcription that drifted:
 * somebody tidying `reference.ts` into the shape of `src/core/stdlib`, or
 * fixing a difference in it to make a gate test pass. Either would make every
 * comparison in this directory a comparison of the library against itself, and
 * nothing else in the suite would notice.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
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
} from '../stdlib/vectors.js';
import { assertSame } from '../stdlib/support.js';

import {
  asSeries,
  bandsOf,
  convergence,
  directionsOf,
  freshWindowBands,
  runningSumBands,
  seededMean,
  strength,
  trailingBand,
} from './reference.js';
import { CLOSE, REF_BARS, deviation } from './support.js';

test('the reference mean reproduces the committed vectors', () => {
  assertSame(asSeries(seededMean(CLOSE, 20)), EMA_20, 'reference mean at length 20');
});

test('the reference strength reading reproduces the committed vectors', () => {
  assertSame(asSeries(strength(CLOSE, 14)), RSI_14, 'reference strength at length 14');
});

test('the reference convergence reproduces the committed vectors', () => {
  const three = convergence(CLOSE, 12, 26, 9);
  assertSame(asSeries(three.line), MACD_LINE, 'reference convergence line');
  assertSame(asSeries(three.signal), MACD_SIGNAL, 'reference convergence signal');
  assertSame(asSeries(three.histogram), MACD_HISTOGRAM, 'reference convergence histogram');
});

test('the reference bands reproduce the committed vectors', () => {
  const bands = freshWindowBands(CLOSE, 20, 2);
  assertSame(asSeries(bands.basis), BB_BASIS, 'reference basis');
  assertSame(asSeries(bands.upper), BB_UPPER, 'reference upper rail');
  assertSame(asSeries(bands.lower), BB_LOWER, 'reference lower rail');
});

/**
 * The first of the two knowing disagreements, measured rather than asserted
 * away.
 *
 * Both arrangements compute the same quantity. They are not the same binary64
 * number because addition is not associative, which is the whole reason
 * `compiled-program.md` section 8.3 makes the accumulation order part of the
 * contract rather than leaving it to an implementation.
 *
 * On the bar the window first fills, the running total has had nothing
 * subtracted from it yet, so it is the same sum in the same order and the two
 * agree exactly. Every bar after that is a subtraction the fresh sum never
 * makes, and the two are free to part company: where they first actually do
 * depends on the prices and is not a property worth asserting, so what is
 * asserted is that it cannot happen before bar `len`.
 *
 * Catches: a running total quietly adopted as the reference, which would make
 * this test read zero and would mean the gate had stopped testing the order.
 */
test('the running total and the fresh window disagree in the last bits, never before bar len', () => {
  for (const [len, mult] of [
    [20, 2],
    [10, 1.5],
    [34, 2.5],
  ] as const) {
    const fresh = asSeries(freshWindowBands(CLOSE, len, mult).basis);
    const running = asSeries(runningSumBands(CLOSE, len, mult).basis);
    const apart = deviation(fresh, running);

    assert.equal(apart.absences, 0, `length ${len}: both arrangements start on the same bar`);
    assert.equal(
      fresh[len - 1],
      running[len - 1],
      `length ${len}: nothing has left the window yet, so the two sums are the same sum`,
    );
    assert.notEqual(apart.largest, 0, `length ${len}: the two arrangements should differ`);
    assert.ok(
      apart.firstAt >= len,
      `length ${len}: the first difference is at bar ${apart.firstAt}, before anything ` +
        `had left the window`,
    );
    // A price near one hundred carries about fifteen significant digits, so a
    // disagreement in the last two of them is under a part in a trillion. Past
    // that it is not an accumulation difference any more and something else has
    // changed.
    assert.ok(
      apart.largest < 1e-11,
      `length ${len}: the difference is ${apart.largest} at bar ${apart.largestAt}, ` +
        `which is too large to be the last bits of an accumulation`,
    );
  }
});

/**
 * The second knowing disagreement: the bar the average range is seeded on.
 *
 * The reference reports a band and a direction there. On that bar there is no
 * previous close and no previous band, so both come from its seeding rule
 * rather than from the data, and `stdlib.md` section 4 declares the first value
 * one bar later. The committed vectors follow the specification, so the two
 * differ on exactly one bar and agree on every bar after it.
 */
test('the reference trailing band agrees from bar atrLen and reports its own seed bar', () => {
  const trail = trailingBand(REF_BARS, 3, 10);
  const band = bandsOf(trail);
  const direction = directionsOf(trail);

  assert.notEqual(band[9], null, 'the reference reports the bar its average range is seeded on');
  assert.equal(SUPERTREND_LINE[9], null, 'the specification reports absence there');

  // Bar 9 excluded from both sides, so what is compared is the arithmetic
  // rather than the disagreement about which bar exists.
  assertSame(band.slice(10), SUPERTREND_LINE.slice(10), 'reference band from bar 10');
  assertSame(direction.slice(10), SUPERTREND_DIRECTION.slice(10), 'reference direction from bar 10');
});
