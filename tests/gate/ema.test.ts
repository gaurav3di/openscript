/**
 * The exponential mean, end to end, at three lengths.
 *
 * The plainest study in the language and the one the rest of the gate rests on:
 * the strength reading, the convergence and the trailing band are all built out
 * of a seeded recurrence, so a mean that starts one bar early makes every one
 * of them start early too, and each would then look like its own separate
 * defect.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertWarmup } from '../stdlib/support.js';

import { asSeries, seededMean } from './reference.js';
import { CLOSE, plot, plotsOf } from './support.js';

/**
 * Three lengths, not one, and one of them long enough that the warmup takes up
 * most of the fixture.
 *
 * Catches a warmup written as a constant rather than derived from the length,
 * which a single parameter set cannot see: an implementation hard coded to bar
 * 19 passes at length 20 and fails at both of the others.
 */
const LENGTHS = [9, 20, 50] as const;

for (const len of LENGTHS) {
  // Catches: an average seeded from bar 0 rather than from the mean of the
  // first `len` values. That implementation has a value at bar 0, so it fails
  // on the warmup line before the comparison is reached, and it stays
  // materially wrong for many bars after the seed as well.
  test(`the mean at length ${len} matches the reference to the last decimal`, () => {
    const drawn = plot(plotsOf('ema', { len }), 'Mean');
    const expected = asSeries(seededMean(CLOSE, len));

    assertWarmup(drawn, len - 1, `mean at length ${len}`);
    assert.deepEqual(drawn, expected, `mean at length ${len}`);
  });
}

/**
 * The same study over a different source, driven from the settings a dialog
 * holds rather than from the script.
 *
 * Catches an engine that reads the input's declared default instead of the
 * value the host stored: the column would be the close reading whatever the
 * dialog said, and every assertion above would still pass because all of them
 * leave the source alone.
 */
test('a source chosen in the settings is the series the mean is taken over', () => {
  const overHigh = plot(plotsOf('ema', { len: 20, src: 'high' }), 'Mean');
  const overClose = plot(plotsOf('ema', { len: 20 }), 'Mean');

  assertWarmup(overHigh, 19, 'mean over the high');
  assert.notDeepEqual(overHigh, overClose, 'the two sources should give different lines');
});
