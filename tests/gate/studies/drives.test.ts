/**
 * Oscillators and trend levels whose picture is more than their column.
 *
 * Four surfaces meet here. A **per-bar plot colour**, which is the one argument
 * in the language that lands on a channel instead of on the declaration, so a
 * histogram can change colour with its own direction. A **level**, which is a
 * reference line the pane carries on every bar including the warmup. A **gap**,
 * which is what a division with no answer has to produce rather than a spike.
 * And a **state machine** whose level is split across two columns so that it can
 * change colour at a flip, with a band on each side and a plate on the flip bar.
 *
 * Every warmup asserted here is one bar later than the plain reading gives, and
 * that is the point of the group: a study built on a change rather than on a
 * level starts one bar later, and a study smoothed after being built starts at
 * the two warmups end to end.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertWarmup } from '../../stdlib/support.js';

import {
  asSeries,
  averageRange,
  blank,
  changeBy,
  crossedDown,
  crossedUp,
  has,
  rateOfChange,
  weightedMean,
  windowHigh,
  windowLow,
  windowMean,
  windowSum,
} from './arithmetic.js';
import type { RefBar, RefSeries } from './arithmetic.js';
import {
  CLOSE,
  HIGH,
  LOW,
  OPEN,
  REF_BARS,
  assertColumn,
  assertFirstAt,
  column,
  levelColumn,
  marker,
  paint,
  plotColour,
  runStudy,
} from './harness.js';

/** The fixture's own midpoint column, which the drive is taken over. */
const MIDPOINT = HIGH.map((high, bar) => (high + (LOW[bar] as number)) / 2);

/** Every bar of a column carries the same constant, which is what a level is. */
function flat(value: number): (number | null)[] {
  return CLOSE.map(() => value);
}

/**
 * Catches: a column coloured from the sign of the reading rather than from its
 * direction, which is a different picture entirely; and a first printed bar
 * coloured as a fall, where there is no previous reading and the comparison
 * against absence is false.
 */
test('the gap between a fast and a slow midpoint mean, coloured by its own direction', () => {
  const run = runStudy('awesome-drive');
  const fast = windowMean(MIDPOINT, 5);
  const slow = windowMean(MIDPOINT, 34);
  const drive = fast.map((one, bar) => one - (slow[bar] as number));

  assertColumn(column(run, 'Drive'), asSeries(drive), 'drive');
  assertWarmup(column(run, 'Drive'), 33, 'drive');
  // The colour is written on every bar, warmup included: a channel holds one
  // value per bar and the renderer draws nothing where the column is absent, so
  // there is no rule here about what colour a bar with no reading takes.
  assertColumn(
    plotColour(run, 'Drive'),
    drive.map((one, bar) => {
      const before = drive[bar - 1];
      const rising = before === undefined || !Number.isFinite(before) ? true : one - before > 0;
      return rising ? paint('teal') : paint('red');
    }),
    'drive colour',
  );
  assertColumn(levelColumn(run, 'Zero'), flat(0), 'the zero line');
});

/**
 * Catches: a bar with no range answered with zero rather than with nothing,
 * which draws a reading of a market that did not move.
 */
test('where the close finished inside the bar range, against where it opened', () => {
  const run = runStudy('balance-of-power');
  const expected = REF_BARS.map((bar: RefBar) => {
    const reach = bar.high - bar.low;
    return reach === 0 ? Number.NaN : (bar.close - bar.open) / reach;
  });

  assertColumn(column(run, 'Balance'), asSeries(expected), 'balance of power');
  assertFirstAt(asSeries(expected), 0, 'a reading with no warmup at all starts on bar 0');
  assertColumn(levelColumn(run, 'Zero'), flat(0), 'the zero line');
});

/**
 * Catches: a warmup of `len - 1`, which is what a window of levels gives and
 * what a window of changes does not: the first change is absent, so the first
 * complete window ends one bar later.
 */
for (const len of [9, 14] as const) {
  test(`the summed rise against the summed fall at length ${len}`, () => {
    const run = runStudy('chande-momentum', { settings: { len } });
    const step = changeBy(CLOSE, 1);
    const rise = step.map((one) => (Number.isFinite(one) ? (one >= 0 ? one : 0) : Number.NaN));
    const fall = step.map((one) => (Number.isFinite(one) ? (one >= 0 ? 0 : -one) : Number.NaN));
    const up = windowSum(rise, len);
    const down = windowSum(fall, len);
    const expected = blank(CLOSE.length);
    for (let bar = 0; bar < CLOSE.length; bar += 1) {
      if (!has(up[bar]) || !has(down[bar])) continue;
      const total = (up[bar] as number) + (down[bar] as number);
      if (total === 0) continue;
      expected[bar] = (100 * ((up[bar] as number) - (down[bar] as number))) / total;
    }

    assertColumn(column(run, 'Chande momentum'), asSeries(expected), `chande at ${len}`);
    assertWarmup(column(run, 'Chande momentum'), len, `chande at ${len}`);
  });
}

/**
 * Catches: a weighted mean started from bar 0 of the rate rather than from the
 * rate's own first value, which counts the warmup gap as data and prints the
 * first reading `longLen` bars too early.
 */
test('a weighted mean of two rates of change', () => {
  const longLen = 14;
  const shortLen = 11;
  const meanLen = 10;
  const run = runStudy('combined-rate', { settings: { longLen, shortLen, meanLen } });
  const long = rateOfChange(CLOSE, longLen);
  const short = rateOfChange(CLOSE, shortLen);
  const summed = long.map((one, bar) => one + (short[bar] as number));

  assertColumn(column(run, 'Combined rate'), asSeries(weightedMean(summed, meanLen)), 'combined');
  assertWarmup(column(run, 'Combined rate'), longLen + meanLen - 1, 'combined');
});

/**
 * Catches: a cross reported while either mean is still warming up, which is a
 * comparison against absence read as a crossing; and a marker on the bar after
 * the cross, which is the off-by-one every crossing study can have.
 */
test('two means, the bars they crossed on, and the plates that name the direction', () => {
  const fastLen = 9;
  const slowLen = 26;
  const run = runStudy('crossing-plates', { settings: { fastLen, slowLen } });
  const fast = windowMean(CLOSE, fastLen);
  const slow = windowMean(CLOSE, slowLen);
  const up = crossedUp(fast, slow);
  const down = crossedDown(fast, slow);

  assertColumn(column(run, 'Short mean'), asSeries(fast), 'short mean');
  assertColumn(column(run, 'Long mean'), asSeries(slow), 'long mean');
  assertColumn(
    column(run, 'Cross'),
    fast.map((one, bar) => (up[bar] === true || down[bar] === true ? one : null)),
    'the crossing bars',
  );
  assertColumn(
    marker(run, 0).text,
    up.map((one) => (one ? 'UP' : null)),
    'upward crossings',
  );
  assertColumn(
    marker(run, 1).text,
    down.map((one) => (one ? 'DOWN' : null)),
    'downward crossings',
  );

  // A watched condition fires on a live feed and never on a history load, which
  // is the rule that stops adding a study to a chart from sending a year of
  // alerts. Both readings are asserted, because a study that fires on history is
  // as wrong as one that never fires at all.
  assert.equal(
    run.alerts.reduce((total, one) => total + one.length, 0),
    0,
    'a history load fires nothing',
  );
  const live = runStudy('crossing-plates', { settings: { fastLen, slowLen }, realtime: true });
  assertColumn(
    live.alerts.map((one) => one.map((firing) => firing.key).join(',')),
    up.map((one, bar) => (one ? 'crossUp' : down[bar] === true ? 'crossDown' : '')),
    'the bars a live feed fires on',
  );
});

interface RefHalfTrend {
  readonly up: RefSeries;
  readonly down: RefSeries;
  readonly channelHigh: RefSeries;
  readonly channelLow: RefSeries;
  readonly buy: RefSeries;
  readonly sell: RefSeries;
}

/**
 * The two state machines the level is drawn from, transcribed with the numeric
 * trend flag the source keeps rather than with the two booleans the study keeps.
 */
function halfTrend(bars: readonly RefBar[], amp: number, chDev: number, rangeLen: number): RefHalfTrend {
  const n = bars.length;
  const out: RefHalfTrend = {
    up: blank(n),
    down: blank(n),
    channelHigh: blank(n),
    channelLow: blank(n),
    buy: blank(n),
    sell: blank(n),
  };
  const highs = bars.map((one) => one.high);
  const lows = bars.map((one) => one.low);
  const half = averageRange(bars, rangeLen).map((one) => one / 2);
  const meanHigh = windowMean(highs, amp);
  const meanLow = windowMean(lows, amp);
  const rollHigh = windowHigh(highs, amp);
  const rollLow = windowLow(lows, amp);

  let trend = 0;
  let armed = 0;
  let maxLow = lows[0] as number;
  let minHigh = highs[0] as number;
  let upLevel = 0;
  let downLevel = 0;
  let seeded = false;

  for (let i = 0; i < n; i += 1) {
    const step = half[i] as number;
    const dev = chDev * step;
    const barHigh = rollHigh[i] as number;
    const barLow = rollLow[i] as number;
    const prevHigh = i > 0 ? (highs[i - 1] as number) : (highs[0] as number);
    const prevLow = i > 0 ? (lows[i - 1] as number) : (lows[0] as number);
    const wasTrend = seeded ? trend : -1;

    if (armed === 1) {
      if (Number.isFinite(barLow)) maxLow = Math.max(barLow, maxLow);
      if (
        Number.isFinite(meanHigh[i]) &&
        (meanHigh[i] as number) < maxLow &&
        (bars[i] as RefBar).close < prevLow
      ) {
        trend = 1;
        armed = 0;
        minHigh = barHigh;
      }
    } else {
      if (Number.isFinite(barHigh)) minHigh = Math.min(barHigh, minHigh);
      if (
        Number.isFinite(meanLow[i]) &&
        (meanLow[i] as number) > minHigh &&
        (bars[i] as RefBar).close > prevHigh
      ) {
        trend = 0;
        armed = 1;
        maxLow = barLow;
      }
    }

    let level: number;
    if (trend === 0) {
      if (wasTrend === 1) {
        upLevel = downLevel;
        if (Number.isFinite(step)) out.buy[i] = upLevel - step;
      } else {
        upLevel = wasTrend === -1 ? maxLow : Math.max(maxLow, upLevel);
      }
      level = upLevel;
    } else {
      if (wasTrend === 0) {
        downLevel = upLevel;
        if (Number.isFinite(step)) out.sell[i] = downLevel + step;
      } else {
        downLevel = wasTrend === -1 ? minHigh : Math.min(minHigh, downLevel);
      }
      level = downLevel;
    }
    seeded = true;

    if (!Number.isFinite(level)) continue;
    if (trend === 0) out.up[i] = level;
    else out.down[i] = level;
    if (Number.isFinite(dev)) {
      out.channelHigh[i] = level + dev;
      out.channelLow[i] = level - dev;
    }
  }
  return out;
}

/**
 * Catches: a level that jumps to price on a flip instead of stepping across
 * from where the other side ended; a flip taken on the mean crossing alone,
 * without the close beyond the previous bar's extreme, which fires several
 * times inside one swing; and a channel drawn from the bar the level starts on
 * rather than from the bar the range does.
 */
test('a trend level that steps across at a flip, its channel and its plates', () => {
  const amp = 2;
  const chDev = 2;
  const rangeLen = 20;
  const run = runStudy('half-trend', { settings: { amp, chDev, rangeLen } });
  const expected = halfTrend(REF_BARS, amp, chDev, rangeLen);

  assertColumn(column(run, 'Level up'), asSeries(expected.up), 'level up');
  assertColumn(column(run, 'Level down'), asSeries(expected.down), 'level down');
  assertColumn(column(run, 'Channel high'), asSeries(expected.channelHigh), 'channel high');
  assertColumn(column(run, 'Channel low'), asSeries(expected.channelLow), 'channel low');
  assertColumn(column(run, 'Buy'), asSeries(expected.buy), 'buy level');
  assertColumn(column(run, 'Sell'), asSeries(expected.sell), 'sell level');

  assertColumn(
    marker(run, 0).text,
    expected.buy.map((one) => (Number.isFinite(one) ? 'Buy' : null)),
    'buy plates',
  );
  assertColumn(
    marker(run, 1).text,
    expected.sell.map((one) => (Number.isFinite(one) ? 'Sell' : null)),
    'sell plates',
  );

  // The two ribbons are one per side, and only the live side has both ends.
  assert.equal(run.bands.length, 2, 'one ribbon per side');
  assert.equal(
    expected.up.some(Number.isFinite) && expected.down.some(Number.isFinite),
    true,
    'the fixture should put the level on both sides at some point',
  );
});

/** The open column exists, which the balance reading above depends on. */
test('the fixture has bars whose open and close differ', () => {
  assert.equal(
    OPEN.some((one, bar) => one !== CLOSE[bar]),
    true,
    'a balance reading needs a body',
  );
});
