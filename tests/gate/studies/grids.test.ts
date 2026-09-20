/**
 * Studies whose output is a grid pinned to a corner of the pane.
 *
 * A grid is the surface with no column behind it: nothing a plot test could
 * reach, and the one place where the value a trader reads is a **string** that
 * a formatting rule produced rather than a number a renderer scaled. So the
 * comparison here is the cell text, character for character, together with the
 * colour and the alignment each cell carried, on every bar rather than at the
 * end. A panel that is right on the last bar and wrong on bar forty is a panel
 * that was wrong on a live chart all afternoon.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertWarmup } from '../../stdlib/support.js';

import {
  asSeries,
  averageRange,
  blank,
  fixedText,
  shiftBy,
  strength,
  windowHigh,
  windowHighBars,
  windowLow,
  windowLowBars,
  windowSum,
} from './arithmetic.js';
import type { RefSeries } from './arithmetic.js';
import {
  CLOSE,
  HIGH,
  LOW,
  OPEN,
  REF_BARS,
  VOLUME,
  assertColumn,
  column,
  faded,
  paint,
  runStudy,
} from './harness.js';

/** What a panel writes where a reading has not warmed up yet. */
const WARMING = 'warming up';

/** One cell, spelled as the run's snapshot spells one. */
function cellText(row: number, col: number, text: string, colour = 'none', align = 'left'): string {
  return `${row},${col}=${text}|${colour}|none|${align}`;
}

function reading(values: RefSeries, bar: number, decimals: number): string {
  const value = values[bar];
  return value === undefined || !Number.isFinite(value) ? WARMING : fixedText(value, decimals);
}

/** The cells one grid held at the end of one bar. */
function cellsOn(run: ReturnType<typeof runStudy>, bar: number): readonly string[] {
  const grids = run.grids[bar] ?? [];
  assert.equal(grids.length, 1, `bar ${bar}: one grid`);
  return (grids[0] as { cells: readonly string[] }).cells;
}

/** How many of the last `len` bars the condition held on, refusing a partial window. */
function countWhere(flags: readonly boolean[], len: number): RefSeries {
  const out = blank(flags.length);
  for (let bar = len - 1; bar < flags.length; bar += 1) {
    let found = 0;
    for (let back = bar - len + 1; back <= bar; back += 1) if (flags[back] === true) found += 1;
    out[bar] = found;
  }
  return out;
}

/**
 * Catches: a panel written from the numbers rather than from the formatter, so
 * a half lands on the wrong side; a cell whose colour is decided before the
 * reading has warmed up, which paints the first fifty bars as if the study had
 * an opinion; and a grid whose cells survive from one bar into the next, which
 * is the buffer rule the engine clears at step 3.
 */
test('a panel of readings, written on every bar', () => {
  const run = runStudy('dashboard-panel');
  const strengthNow = strength(CLOSE, 14);
  const rangeNow = averageRange(REF_BARS, 14);
  const top = windowHigh(HIGH, 20);
  const bottom = windowLow(LOW, 20);

  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    const grids = run.grids[bar] ?? [];
    assert.equal(grids.length, 1, `bar ${bar}: one grid`);
    const panel = grids[0] as { rows: number; cols: number; cells: readonly string[] };
    assert.equal(panel.rows, 4, 'the grid keeps the shape its declaration fixed');
    assert.equal(panel.cols, 2, 'the grid keeps the shape its declaration fixed');

    const reach = (top[bar] as number) - (bottom[bar] as number);
    const place =
      Number.isFinite(reach) && reach > 0
        ? (((CLOSE[bar] as number) - (bottom[bar] as number)) / reach) * 100
        : Number.NaN;
    const zone =
      (strengthNow[bar] as number) > 70
        ? paint('red')
        : (strengthNow[bar] as number) < 30
          ? paint('lime')
          : paint('silver');

    assertColumn(
      panel.cells,
      [
        cellText(0, 0, 'Strength'),
        cellText(0, 1, reading(strengthNow, bar, 2), zone, 'right'),
        cellText(1, 0, 'Range'),
        cellText(1, 1, reading(rangeNow, bar, 3), 'none', 'right'),
        cellText(2, 0, 'Place in span'),
        cellText(2, 1, `${reading([place], 0, 1)} percent`, 'none', 'right'),
        cellText(3, 0, 'Bars seen'),
        cellText(3, 1, fixedText(bar + 1, 0), 'none', 'left'),
      ],
      `panel on bar ${bar}`,
    );
  }
});

/**
 * Catches: a bar count reported with the sign the other convention uses, which
 * turns "set twelve bars ago" into a negative number in a panel nobody can read;
 * and a place reading that answers on a flat window, where the two extremes meet
 * and there is nothing to be a fraction of.
 */
test('a panel of the window extremes and how long ago each was set', () => {
  const len = 20;
  const run = runStudy('extremes-panel', { settings: { len } });
  const top = windowHigh(HIGH, len);
  const bottom = windowLow(LOW, len);
  const topAge = windowHighBars(HIGH, len);
  const lowAge = windowLowBars(LOW, len);

  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    const reach = (top[bar] as number) - (bottom[bar] as number);
    const place =
      Number.isFinite(reach) && reach > 0
        ? (((CLOSE[bar] as number) - (bottom[bar] as number)) / reach) * 100
        : Number.NaN;
    const colour = place > 80 ? paint('lime') : place < 20 ? paint('red') : paint('silver');
    assertColumn(
      cellsOn(run, bar),
      [
        cellText(0, 0, 'Window high'),
        cellText(0, 1, reading(top, bar, 2), 'none', 'right'),
        cellText(1, 0, 'Set this many bars ago'),
        cellText(1, 1, reading(topAge, bar, 0), 'none', 'right'),
        cellText(2, 0, 'Window low'),
        cellText(2, 1, reading(bottom, bar, 2), 'none', 'right'),
        cellText(3, 0, 'Set this many bars ago'),
        cellText(3, 1, reading(lowAge, bar, 0), 'none', 'right'),
        cellText(4, 0, 'Place in the window, percent'),
        cellText(4, 1, reading([place], 0, 1), colour, 'right'),
      ],
      `extremes on bar ${bar}`,
    );
  }
});

/**
 * Catches: a count taken over a window that is not yet full, which reports a
 * number smaller than the truth and looks like a quiet market.
 */
test('how many of the last bars closed up, with a bar drawn out of characters', () => {
  const len = 20;
  const run = runStudy('count-panel', { settings: { len } });
  const rose = countWhere(
    CLOSE.map((close, bar) => close > (OPEN[bar] as number)),
    len,
  );
  const fell = countWhere(
    CLOSE.map((close, bar) => close < (OPEN[bar] as number)),
    len,
  );
  const drawn = (value: number | undefined): string =>
    value === undefined || !Number.isFinite(value)
      ? `${WARMING} `
      : `${fixedText(value, 0)} ${'|'.repeat(value)}`;

  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    const up = rose[bar];
    const down = fell[bar];
    const other =
      up === undefined || down === undefined || !Number.isFinite(up) || !Number.isFinite(down)
        ? WARMING
        : fixedText(len - up - down, 0);
    assertColumn(
      cellsOn(run, bar),
      [
        cellText(0, 0, 'Closed up'),
        cellText(0, 1, drawn(up), paint('lime')),
        cellText(1, 0, 'Closed down'),
        cellText(1, 1, drawn(down), paint('red')),
        cellText(2, 0, 'Unchanged'),
        cellText(2, 1, other),
      ],
      `counts on bar ${bar}`,
    );
  }
});

/**
 * Catches: a flow index whose first reading lands at `len - 1`, which is what a
 * window of levels gives; this one is built on a change, so the first complete
 * window ends at `len`.
 */
test('where the money went, in a column, a shaded zone and a cell', () => {
  const len = 14;
  const run = runStudy('money-flow-panel', { settings: { len } });
  const typical = HIGH.map(
    (high, bar) => (high + (LOW[bar] as number) + (CLOSE[bar] as number)) / 3,
  );
  const positive = typical.map((one, bar) =>
    bar === 0 ? 0 : one > (typical[bar - 1] as number) ? one * (VOLUME[bar] as number) : 0,
  );
  const negative = typical.map((one, bar) =>
    bar === 0 ? 0 : one < (typical[bar - 1] as number) ? one * (VOLUME[bar] as number) : 0,
  );
  const up = windowSum(positive, len);
  const down = windowSum(negative, len);
  const expected = CLOSE.map((_, bar) => {
    if (bar < len) return Number.NaN;
    const over = up[bar] as number;
    const under = down[bar] as number;
    return under === 0 ? 100 : 100 - 100 / (1 + over / under);
  });

  assertColumn(column(run, 'Money flow'), asSeries(expected), 'money flow');
  assertWarmup(column(run, 'Money flow'), len, 'money flow');
  assertColumn(column(run, 'Upper edge'), CLOSE.map(() => 80), 'the upper edge');
  assertColumn(column(run, 'Lower edge'), CLOSE.map(() => 20), 'the lower edge');

  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    const value = expected[bar] as number;
    const zone = !Number.isFinite(value)
      ? WARMING
      : value > 80
        ? 'high'
        : value < 20
          ? 'low'
          : 'middle';
    const colour =
      zone === 'high' ? paint('red') : zone === 'low' ? paint('green') : paint('silver');
    assertColumn(
      cellsOn(run, bar),
      [
        cellText(0, 0, 'Money flow'),
        cellText(0, 1, reading(expected, bar, 2), 'none', 'right'),
        cellText(1, 0, 'Zone'),
        cellText(1, 1, zone, colour, 'right'),
      ],
      `money flow panel on bar ${bar}`,
    );
  }
});

/**
 * Catches: levels taken from the window that includes this bar, which moves the
 * level price is being measured against with price itself and makes a breach of
 * it impossible to see.
 */
test('floor levels from the window that ended on the previous bar', () => {
  const len = 20;
  const run = runStudy('levels-panel', { settings: { len } });
  const priorHigh = shiftBy(windowHigh(HIGH, len), 1);
  const priorLow = shiftBy(windowLow(LOW, len), 1);
  const priorClose = shiftBy(CLOSE, 1);
  const pivot = priorHigh.map(
    (one, bar) => (one + (priorLow[bar] as number) + (priorClose[bar] as number)) / 3,
  );
  const reach = priorHigh.map((one, bar) => one - (priorLow[bar] as number));
  const firstUp = pivot.map((one, bar) => 2 * one - (priorLow[bar] as number));
  const firstDown = pivot.map((one, bar) => 2 * one - (priorHigh[bar] as number));
  const secondUp = pivot.map((one, bar) => one + (reach[bar] as number));
  const secondDown = pivot.map((one, bar) => one - (reach[bar] as number));

  assertColumn(column(run, 'Pivot'), asSeries(pivot), 'pivot');
  assertColumn(column(run, 'First up'), asSeries(firstUp), 'first level up');
  assertColumn(column(run, 'First down'), asSeries(firstDown), 'first level down');
  assertWarmup(column(run, 'Pivot'), len, 'pivot');

  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    assertColumn(
      cellsOn(run, bar),
      [
        cellText(0, 0, 'Second up'),
        cellText(0, 1, reading(secondUp, bar, 2), 'none', 'right'),
        cellText(1, 0, 'First up'),
        cellText(1, 1, reading(firstUp, bar, 2), 'none', 'right'),
        cellText(2, 0, 'Pivot'),
        cellText(2, 1, reading(pivot, bar, 2), paint('white'), 'right'),
        cellText(3, 0, 'First down'),
        cellText(3, 1, reading(firstDown, bar, 2), 'none', 'right'),
        cellText(4, 0, 'Second down'),
        cellText(4, 1, reading(secondDown, bar, 2), 'none', 'right'),
      ],
      `levels panel on bar ${bar}`,
    );
  }
});

/**
 * Catches: a pane shaded during the warmup as if the reading were in the middle
 * zone, which is an opinion nobody expressed.
 */
test('the pane behind the bars shaded by the zone the reading is in', () => {
  const len = 14;
  const run = runStudy('heat-shading', { settings: { len, upperZone: 70, lowerZone: 30 } });
  const reading = strength(CLOSE, len);

  assertColumn(column(run, 'Strength'), asSeries(reading), 'the strength reading');
  assertColumn(
    run.background,
    reading.map((one) => {
      if (!Number.isFinite(one)) return 'none';
      if (one > 70) return faded('red', 90);
      if (one < 30) return faded('green', 90);
      return faded('silver', 96);
    }),
    'pane shading',
  );
});
