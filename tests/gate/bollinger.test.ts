/**
 * The deviation bands, end to end, at three parameter sets.
 *
 * Two things this study is here to pin, and only one of them is arithmetic.
 *
 * **The divisor.** The bands use the population deviation, the `len` divisor.
 * The sample form, with `len - 1`, differs on every bar by a factor no
 * tolerance would hide, and it is the wrong one for a band study: the window is
 * the whole of what is being described rather than a sample drawn from
 * something larger.
 *
 * **The accumulation order.** `compiled-program.md` section 8.3 makes the order
 * part of the contract: every window is summed fresh, oldest bar first, and a
 * running total that subtracts the departing bar is not permitted even though
 * it computes the same quantity. The sibling reference carries a running total,
 * so it and this library disagree in the last bits. That disagreement is the
 * one deliberate difference here, and it is measured at the bottom of this file
 * rather than absorbed into a tolerance.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertWarmup } from '../stdlib/support.js';

import { asSeries, freshWindowBands, runningSumBands } from './reference.js';
import { CLOSE, deviation, plot, plotsOf } from './support.js';

const SETS = [
  { len: 20, mult: 2 },
  { len: 10, mult: 1.5 },
  { len: 34, mult: 2.5 },
] as const;

for (const set of SETS) {
  const named = `length ${set.len} and ${set.mult} deviations`;

  // Catches: the sample divisor in place of the population one, which shows on
  // the rails at every parameter set while leaving the basis untouched, so an
  // implementation with it passes any test that only looks at the middle line.
  // Also catches a rail computed from a deviation taken over a different window
  // than the basis, which a single multiplier would hide and three do not.
  test(`the bands at ${named} match the reference to the last decimal`, () => {
    const columns = plotsOf('bollinger', { ...set });
    const expected = freshWindowBands(CLOSE, set.len, set.mult);

    const basis = plot(columns, 'Basis');
    const upper = plot(columns, 'Upper');
    const lower = plot(columns, 'Lower');

    assertWarmup(basis, set.len - 1, `basis at ${named}`);
    assertWarmup(upper, set.len - 1, `upper rail at ${named}`);
    assertWarmup(lower, set.len - 1, `lower rail at ${named}`);

    assert.deepEqual(basis, asSeries(expected.basis), `basis at ${named}`);
    assert.deepEqual(upper, asSeries(expected.upper), `upper rail at ${named}`);
    assert.deepEqual(lower, asSeries(expected.lower), `lower rail at ${named}`);
  });
}

/**
 * The multiplier reaches the rails, and reaches nothing else.
 *
 * Catches two opposite failures with one comparison. An engine that ignored the
 * stored multiplier and used the input's declared default would draw the same
 * two rails whatever the dialog said. An engine that let the multiplier into
 * the window, by scaling the source or the mean rather than the deviation,
 * would move the basis as well, and a channel whose middle line depends on how
 * wide its rails are is wrong about every reading taken from it.
 *
 * The widening is asserted as a non-strict comparison on every bar plus one
 * strict one, rather than strictly everywhere, because a bar whose window has
 * no dispersion at all has a deviation of zero and the two multipliers agree
 * there honestly.
 */
test('a wider multiplier moves the rails apart and leaves the basis alone', () => {
  const narrow = plotsOf('bollinger', { len: 20, mult: 2 });
  const wide = plotsOf('bollinger', { len: 20, mult: 3 });

  assert.deepEqual(
    plot(wide, 'Basis'),
    plot(narrow, 'Basis'),
    'the multiplier should not move the middle line',
  );

  const narrowUpper = plot(narrow, 'Upper');
  const wideUpper = plot(wide, 'Upper');
  const narrowLower = plot(narrow, 'Lower');
  const wideLower = plot(wide, 'Lower');

  let widened = 0;
  for (let bar = 0; bar < narrowUpper.length; bar += 1) {
    const near = narrowUpper[bar];
    if (near === null || near === undefined) continue;
    const far = wideUpper[bar] as number;
    assert.ok(far >= near, `bar ${bar}: the wider upper rail is not above the narrower one`);
    assert.ok(
      (wideLower[bar] as number) <= (narrowLower[bar] as number),
      `bar ${bar}: the wider lower rail is not below the narrower one`,
    );
    if (far > near) widened += 1;
  }
  assert.ok(widened > 0, 'no bar in the fixture has any dispersion to widen on');
});

/**
 * The one deliberate difference, reported rather than hidden.
 *
 * The sibling reference carries a running total across the window and sums the
 * deviations newest bar first. This library sums both fresh and oldest bar
 * first, which is what section 8.3 defines as the reference arrangement. The
 * two compute the same quantity and neither is a mistake, and they are not the
 * same binary64 number.
 *
 * What is asserted is the shape of the difference rather than its absence. The
 * two agree exactly on the bar the window first fills, because the running
 * total has had nothing subtracted from it yet and is the same sum in the same
 * order. They can only part company once a bar has left the window, so nothing
 * may differ before bar `len`, and what does differ stays inside the last
 * couple of significant digits of a price. A larger difference, or one that
 * began earlier, would not be an accumulation difference at all.
 *
 * Catches the temptation this test exists to resist: adopting the running total
 * so the two agree. Any implementation that did would read zero here.
 */
test('the running total arrangement differs only in the last bits, never before bar len', () => {
  for (const set of SETS) {
    const drawn = plot(plotsOf('bollinger', { ...set }), 'Basis');
    const running = asSeries(runningSumBands(CLOSE, set.len, set.mult).basis);
    const apart = deviation(drawn, running);

    assert.equal(apart.absences, 0, `length ${set.len}: both start on the same bar`);
    assert.equal(
      drawn[set.len - 1],
      running[set.len - 1],
      `length ${set.len}: nothing has left the window yet, so the two sums are the same sum`,
    );
    assert.notEqual(apart.largest, 0, `length ${set.len}: the two arrangements should differ`);
    assert.ok(
      apart.firstAt >= set.len,
      `length ${set.len}: the first difference is at bar ${apart.firstAt}, before anything ` +
        `had left the window`,
    );
    assert.ok(
      apart.largest < 1e-11,
      `length ${set.len}: ${apart.largest} apart at bar ${apart.largestAt} is too large ` +
        `to be the last bits of an accumulation`,
    );
  }
});
