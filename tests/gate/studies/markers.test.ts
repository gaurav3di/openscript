/**
 * Studies whose output is named events rather than a curve.
 *
 * A marker is the surface the Phase 2 gate could not test at all: a column of
 * numbers proves the arithmetic, and a study that computes the right numbers
 * and marks the wrong bar draws a chart nobody can trade from. So each study
 * here is compared on three things, not one: the columns it plots, the bars it
 * marked, and the fixed part of each mark's declaration, which is the side of
 * the bar it sits on and the shape it is drawn with.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { asSeries, blank, pivotHighAt, pivotLowAt } from './arithmetic.js';
import type { RefBar, RefSeries } from './arithmetic.js';
import {
  HIGH,
  LOW,
  REF_BARS,
  UNPAINTED,
  assertColumn,
  assertFirstAt,
  column,
  marker,
  paint,
  runStudy,
} from './harness.js';

/** The text a marker carries on the bars a column has a value on, and nothing elsewhere. */
function textWhere(values: readonly (number | null)[], text: string): (string | null)[] {
  return values.map((value) => (value === null ? null : text));
}

/**
 * Catches: a pivot reported on the bar it formed on rather than on the bar that
 * confirmed it, which is a lookahead that draws perfectly on history and cannot
 * be traded, and a marker fired on a bar its column is absent on.
 */
for (const wings of [2, 3] as const) {
  test(`five bar reversal marks at ${wings} bars each side`, () => {
    const run = runStudy('five-bar-reversal', { settings: { wings } });
    const top = asSeries(pivotHighAt(HIGH, wings, wings));
    const bottom = asSeries(pivotLowAt(LOW, wings, wings));

    assertColumn(column(run, 'Top'), top, `top pivot at ${wings}`);
    assertColumn(column(run, 'Bottom'), bottom, `bottom pivot at ${wings}`);

    // The earliest bar either column can carry a value is `left + right`, and
    // the fixture's own shape decides which of the two gets there first.
    assertFirstAt(top, top.findIndex((one) => one !== null), `reference top at ${wings}`);
    assert.equal(
      top.findIndex((one) => one !== null) >= wings * 2,
      true,
      `a pivot cannot be known before bar ${wings * 2}`,
    );

    const tops = marker(run, 0);
    const bottoms = marker(run, 1);
    assert.equal(tops.shape, 'triangleDown', 'the top mark is a triangle pointing down');
    assert.equal(tops.at, 'above', 'the top mark sits above its bar');
    assert.equal(bottoms.shape, 'triangleUp', 'the bottom mark is a triangle pointing up');
    assert.equal(bottoms.at, 'below', 'the bottom mark sits below its bar');
    assertColumn(tops.text, textWhere(top, 'TOP'), `top marks at ${wings}`);
    assertColumn(bottoms.text, textWhere(bottom, 'BOTTOM'), `bottom marks at ${wings}`);
  });
}

/**
 * How stale a range may be before a body leaving it counts as a break, and how
 * fresh. Both are constants of the formula rather than settings, so they are
 * written here as the study writes them.
 */
const MIN_AGE = 1;
const MAX_AGE = 250;

interface RefConsolidation {
  readonly rangeHigh: RefSeries;
  readonly rangeLow: RefSeries;
  readonly breakUp: RefSeries;
  readonly breakDown: RefSeries;
  readonly insideAge: RefSeries;
}

/**
 * The consolidation state machine, transcribed with the carried index the
 * source keeps rather than with the two running bounds the study keeps.
 *
 * The two reads of that index straddle its reassignment, and that ordering is
 * the whole study: the break tests read the range as it stood before this bar
 * could claim it, and the rails read it after, so a bar that breaks out is
 * already the new range and is correctly left without a rail.
 */
function consolidation(bars: readonly RefBar[]): RefConsolidation {
  const n = bars.length;
  const rangeHigh = blank(n);
  const rangeLow = blank(n);
  const breakUp = blank(n);
  const breakDown = blank(n);
  const insideAge = blank(n);
  let mainIndex = 0;
  for (let i = 0; i < n; i += 1) {
    const bar = bars[i] as RefBar;
    const mother = bars[mainIndex] as RefBar;
    const bodyTop = Math.max(bar.open, bar.close);
    const bodyBottom = Math.min(bar.open, bar.close);
    const age = i - mainIndex;

    const breakable = age > MIN_AGE && age <= MAX_AGE;
    if (breakable && bodyTop > mother.high) breakUp[i] = mother.high;
    if (breakable && bodyBottom < mother.low) breakDown[i] = mother.low;

    const inside =
      i > 1 &&
      bodyBottom >= mother.low &&
      bodyBottom <= mother.high &&
      bodyTop >= mother.low &&
      bodyTop <= mother.high;
    const previous = mainIndex;
    mainIndex = inside ? mainIndex : i;

    if (mainIndex === previous) {
      rangeHigh[i] = (bars[mainIndex] as RefBar).high;
      rangeLow[i] = (bars[mainIndex] as RefBar).low;
    }
    const held = i - mainIndex;
    if (held > 0) insideAge[i] = held;
  }
  return { rangeHigh, rangeLow, breakUp, breakDown, insideAge };
}

/**
 * Catches: the two reads of the carried index collapsed into one, which moves
 * every break by a bar and still looks plausible on a chart; a rail drawn on
 * the bar that took the range over, which joins two separate consolidations
 * into one line; and a tint on the bar that set the range, which is the range
 * rather than part of what is inside it.
 */
test('a consolidation, the bar that leaves it, and the bars that stayed inside', () => {
  const run = runStudy('consolidation-breakout');
  const expected = consolidation(REF_BARS);

  assertColumn(column(run, 'Range high'), asSeries(expected.rangeHigh), 'range high');
  assertColumn(column(run, 'Range low'), asSeries(expected.rangeLow), 'range low');
  assertFirstAt(asSeries(expected.rangeHigh), 0, 'the first range opens on bar 0');

  const up = marker(run, 0);
  const down = marker(run, 1);
  assert.equal(up.at, 'below', 'a break upward is marked under its bar');
  assert.equal(down.at, 'above', 'a break downward is marked over its bar');
  assertColumn(up.text, textWhere(asSeries(expected.breakUp), 'BREAK UP'), 'breaks upward');
  assertColumn(down.text, textWhere(asSeries(expected.breakDown), 'BREAK DOWN'), 'breaks downward');

  assertColumn(
    run.barColor,
    expected.insideAge.map((age) => (Number.isFinite(age) ? paint('navy') : 'none')),
    'inside bar tint',
  );
});

/**
 * Catches: a toggle applied while the state machine runs rather than to what it
 * produced, which would change the range the next bar is measured against and
 * move the rails as well as the marks.
 */
test('turning the marks and the tint off leaves the rails where they were', () => {
  const plain = runStudy('consolidation-breakout', {
    settings: { markBreaks: false, tintInside: false },
  });
  const expected = consolidation(REF_BARS);

  assertColumn(column(plain, 'Range high'), asSeries(expected.rangeHigh), 'range high, marks off');
  assertColumn(marker(plain, 0).text, expected.rangeHigh.map(() => null), 'no breaks marked');
  assertColumn(plain.barColor, UNPAINTED, 'no candle tinted');
});
