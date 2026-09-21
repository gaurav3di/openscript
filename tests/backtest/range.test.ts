/**
 * Which bars a report is about, OS6020, and which bars merely got it there.
 *
 * **A warmup bar executes and is not reported**, and getting that wrong is
 * silent in both directions. An implementation that reports every bar supplied
 * turns a hundred bars of indicator warmup into a hundred equity points nobody
 * traded; one that refuses to execute them starts the strategy blind and reports
 * a different study under the same name. Both produce a report that looks
 * entirely reasonable, so both are tested by what the window says rather than
 * by what the curve looks like.
 *
 * What is asserted is the window, the marks and the code, never the sentence.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { marksFor, windowFor } from '../../src/core/backtest/index.js';
import type { DateRange } from '../../src/core/backtest/index.js';
import { HOUR, START, rising } from './support.js';

const BARS = rising(10);

/** The window a range names, or the assertion that it named one at all. */
function windowOf(range: DateRange): ReturnType<typeof windowFor> {
  return windowFor(BARS, range);
}

/**
 * A run with no range stated is reported whole.
 *
 * This is the test that keeps the rest honest: an implementation that refused
 * every window, or that reported none of the bars, would satisfy the refusals
 * below and fail here.
 */
test('a run with no range stated reports every bar it was given', () => {
  const framed = windowOf({ from: null, to: null });
  assert.equal(framed.ok, true);
  if (!framed.ok) return;
  assert.deepEqual(framed.covered, { first: 0, last: 9, warmup: 0, total: 10 });
});

/**
 * A stated range makes the bars before it warmup and leaves them in the run.
 *
 * Catches an implementation that hands the engine the window rather than the
 * bars, which is the shape that loses the warmup: `total` is every bar supplied
 * and not the count inside the window, because the total is what the engine is
 * told a run holds and `bar.isLast` is derived from it.
 */
test('the bars before the window are warmup and are still part of the run', () => {
  const framed = windowOf({ from: START + 4 * HOUR, to: null });
  assert.equal(framed.ok, true);
  if (!framed.ok) return;
  assert.equal(framed.covered.first, 4);
  assert.equal(framed.covered.warmup, 4);
  assert.equal(framed.covered.last, 9);
  assert.equal(framed.covered.total, 10);
});

/**
 * Both bounds are inclusive.
 *
 * Catches the off-by-one that a strict comparison produces: a range written
 * from one bar's time to another's would silently lose the first bar, the last
 * bar, or both, and the report would be a day short at each end for ever.
 */
test('both bounds include the bar whose time they name', () => {
  const framed = windowOf({ from: START + 2 * HOUR, to: START + 5 * HOUR });
  assert.equal(framed.ok, true);
  if (!framed.ok) return;
  assert.equal(framed.covered.first, 2);
  assert.equal(framed.covered.last, 5);
});

/**
 * A window holding none of the bars supplied is refused.
 *
 * Catches an implementation that returns an empty window instead: a report with
 * no equity point, no trade and no summary is exactly what a strategy that did
 * nothing also produces, and only the refusal tells the two apart. The position
 * is nowhere in anybody's script, because the window is the host's choice.
 */
test('a window holding no bars is refused rather than reported empty', () => {
  const framed = windowOf({ from: START + 100 * HOUR, to: START + 200 * HOUR });
  assert.equal(framed.ok, false);
  if (framed.ok) return;
  assert.equal(framed.diagnostic.code, 'OS6020');
  assert.equal(framed.diagnostic.span.offset, 0);
  assert.equal(framed.diagnostic.span.length, 0);
  assert.equal(framed.diagnostic.span.line, 0);
  assert.equal(framed.diagnostic.span.column, 0);
});

/**
 * A window that falls between two bars is empty however wide it looks.
 *
 * The bars are an hour apart, so a window of fifty nine minutes inside one gap
 * holds nothing. Catches an implementation that answers a range against a
 * calendar rather than against the bars it was given, which would report a
 * window with bars in it that the run never executed.
 */
test('a window inside a gap in the data holds nothing', () => {
  const framed = windowOf({ from: START + HOUR + 60_000, to: START + 2 * HOUR - 60_000 });
  assert.equal(framed.ok, false);
  if (framed.ok) return;
  assert.equal(framed.diagnostic.code, 'OS6020');
});

/**
 * A bar with no time is inside an unstated bound and outside a stated one.
 *
 * Catches an implementation that compares an absent time numerically, where
 * absence reads as zero and every undated bar falls before every window. Here
 * it would put the undated bar inside a window that starts later, which is a
 * bar in a report on the strength of nothing.
 */
test('a bar with no time is in no window anybody stated', () => {
  const undated = [{ ...(BARS[0] as { time: number | null }), time: null }, ...BARS.slice(1)];
  const whole = windowFor(undated as typeof BARS, { from: null, to: null });
  assert.equal(whole.ok, true);
  if (whole.ok) assert.equal(whole.covered.first, 0);

  const stated = windowFor(undated as typeof BARS, { from: START + HOUR, to: null });
  assert.equal(stated.ok, true);
  if (stated.ok) assert.equal(stated.covered.first, 1);
});

/**
 * The marks cover every bar supplied and say which of them are reported.
 *
 * Catches an implementation that marks only the window: the money layer sweeps
 * the warmup, so a trade opened before the window is already in the fold at the
 * window's first point with its charges paid and its position marked, and a
 * shortened list of marks would lose both without saying anything.
 */
test('every bar is marked and only the window is reported', () => {
  const framed = windowOf({ from: START + 4 * HOUR, to: START + 7 * HOUR });
  assert.equal(framed.ok, true);
  if (!framed.ok) return;

  const marks = marksFor(BARS, framed.covered);
  assert.equal(marks.length, BARS.length);
  assert.deepEqual(
    marks.map((mark) => mark.inReport),
    [false, false, false, false, true, true, true, true, false, false],
  );
  assert.deepEqual(
    marks.map((mark) => mark.barIndex),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  assert.equal(marks[4]?.close, BARS[4]?.close);
  assert.equal(marks[4]?.time, BARS[4]?.time);
});
