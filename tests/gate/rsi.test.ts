/**
 * The strength reading, end to end, at three lengths.
 *
 * This is the study whose warmup is most often wrong by one bar, and the reason
 * is worth stating: the reading is taken over `len` changes, a change needs two
 * bars, so the first honest value is at bar `len` rather than at bar `len - 1`
 * where a reader counting levels would put it. Every entry in the library that
 * consumes changes rather than levels carries the same extra bar.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertWarmup } from '../stdlib/support.js';

import { asSeries, strength } from './reference.js';
import { CLOSE, plot, plotsOf } from './support.js';

const LENGTHS = [7, 14, 21] as const;

for (const len of LENGTHS) {
  // Catches: the off-by-one that puts the first reading at bar `len - 1`. An
  // implementation that smoothed the change series as though it began at bar 0
  // lands one bar early here and the warmup line fails before any number is
  // compared. Three lengths, because an implementation that is early by one bar
  // at every length and an implementation hard coded to bar 14 both pass a
  // single parameter set.
  test(`the strength reading at length ${len} matches the reference to the last decimal`, () => {
    const drawn = plot(plotsOf('rsi', { len }), 'Strength');
    const expected = asSeries(strength(CLOSE, len));

    assertWarmup(drawn, len, `strength at length ${len}`);
    assert.deepEqual(drawn, expected, `strength at length ${len}`);
  });
}

/**
 * The reading stays inside the scale it declares.
 *
 * Catches a smoothing that consumed absence as zero. A zero average fall sends
 * the ratio to infinity and the reading off the top of its scale, which is a
 * number the study's own range in `study(..., range = [0, 100])` says cannot
 * happen, and which a chart would silently rescale around rather than report.
 */
test('the strength reading stays between 0 and 100 on every bar it has a value', () => {
  for (const len of LENGTHS) {
    const drawn = plot(plotsOf('rsi', { len }), 'Strength');
    for (let bar = 0; bar < drawn.length; bar += 1) {
      const value = drawn[bar];
      if (value === null || value === undefined) continue;
      assert.ok(
        value >= 0 && value <= 100,
        `length ${len}: bar ${bar} read ${value}, which is outside the declared range`,
      );
    }
  }
});

/**
 * The fixture reaches both ends of the scale, so the comparison above is a
 * comparison of something.
 *
 * Catches a fixture that drifted into a straight line, where every reading
 * would sit near the middle and an implementation with the rise and the fall
 * the wrong way round would still pass every assertion above.
 */
test('the fixture drives the reading well above and well below the middle', () => {
  const drawn = plot(plotsOf('rsi', { len: 14 }), 'Strength');
  const present = drawn.filter((value): value is number => value !== null && value !== undefined);
  assert.ok(Math.max(...present) > 70, 'the fixture should reach the upper band');
  assert.ok(Math.min(...present) < 40, 'the fixture should fall well below the middle');
});
