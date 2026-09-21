/**
 * Two runs beside each other: whether the gap between them is a result.
 *
 * **This is the second half of the phase's gate**, and the failure it is
 * written against is the one that costs money rather than the one that throws.
 * A comparison that subtracts two summaries and prints the differences will
 * always produce a table, and the table reads as a result whether or not the
 * two runs had anything to do with each other. So what is tested here is
 * mostly refusal: that a pair over different bars is not compared, that a gap
 * inside the noise is not dressed up as an improvement, and that a run with one
 * trade is not reported as infinitely better than a run with none.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { backtest, compareRuns, settingsFor } from '../../src/core/backtest/index.js';
import type { RunRecord } from '../../src/core/backtest/index.js';
import { CONTRACT, inAndOut, revised, rising, runSettings } from './support.js';

const BARS = rising(8);

function runOf(
  program = inAndOut(),
  bars: readonly (typeof BARS)[number][] = BARS,
  settings = runSettings(),
): RunRecord {
  const result = backtest(program, bars, settings);
  assert.ok(result.ok, 'the probe run is expected to start');
  return result.record;
}

/** The run's first trade, which the probe strategy always takes. */
function aTrade(record: RunRecord) {
  const trade = record.report.trades[0];
  assert.ok(trade, 'the probe run is expected to take a trade');
  return trade;
}

/** A record carrying the trades given, for counting shared ones. */
function withTrades(record: RunRecord, trades: readonly ReturnType<typeof aTrade>[]): RunRecord {
  return { ...record, report: { ...record.report, trades } };
}

/** A record with one field of its summary moved, for the arithmetic below. */
function withSummary(record: RunRecord, patch: Record<string, number>): RunRecord {
  return {
    ...record,
    report: { ...record.report, summary: { ...record.report.summary, ...patch } },
  };
}

test('a pair over different bars is not comparable, and says which', () => {
  // The failure this exists for: two runs over different history produce two
  // summaries, and subtracting them produces a table that looks like a result.
  const before = runOf();
  const after = runOf(inAndOut(), revised(BARS, 3, 200));
  const comparison = compareRuns(before, after);

  assert.equal(comparison.comparable, false);
  assert.ok(
    comparison.differences.some((one) => one.what === 'bars'),
    'the bars are named as the difference',
  );
  assert.equal(comparison.separation, null, 'and no separation is offered for them');
});

test('an incomparable pair is given no separation even when one could be computed', () => {
  // The test above asserts a null separation on a pair whose two runs each took
  // one trade, and one trade has no spread, so that null arrives whether or not
  // anything withholds it. Both summaries are given a real standard error here,
  // so the only thing that can return null is the withholding itself.
  const before = withSummary(runOf(), { expectancy: 4, expectancyStandardError: 3 });
  const after = withSummary(
    runOf(inAndOut(), revised(BARS, 3, 200)),
    { expectancy: 12, expectancyStandardError: 4 },
  );
  const comparison = compareRuns(before, after);

  assert.equal(comparison.comparable, false);
  assert.equal(comparison.separation, null, 'withheld, not the 1.6 the figures would give');
});

test('a pair on different contracts is not comparable either', () => {
  const before = runOf();
  const after = runOf(inAndOut(), BARS, settingsFor({ ...CONTRACT, pointValue: 50 }));
  const comparison = compareRuns(before, after);

  assert.equal(comparison.comparable, false);
  assert.ok(comparison.differences.some((one) => one.what === 'contract'));
});

test('a different program over the same bars is exactly what is comparable', () => {
  // The opposite mistake to the one above: refusing the comparison somebody
  // actually wants. Changing the script is the reason to compare two runs.
  const before = runOf(inAndOut({ exitBar: 4 }));
  const after = runOf(inAndOut({ exitBar: 6 }));
  const comparison = compareRuns(before, after);

  assert.equal(comparison.comparable, true);
  assert.ok(
    comparison.differences.some((one) => one.what === 'program'),
    'and the program is still named as a difference',
  );
});

test('a setting changed without the script is named', () => {
  // The reason a run improved is as often a setting somebody forgot they
  // changed as it is the change they meant to test.
  const before = runOf();
  const after = runOf(inAndOut(), BARS, runSettings({ inputs: { unused: 1 } }));
  const comparison = compareRuns(before, after);

  assert.equal(comparison.comparable, true);
  assert.ok(comparison.differences.some((one) => one.what === 'inputs'));
});

test('two identical runs differ in nothing at all', () => {
  const comparison = compareRuns(runOf(), runOf());
  assert.deepEqual(comparison.differences, []);
  assert.equal(comparison.comparable, true);
  assert.ok(
    comparison.deltas.every((one) => one.delta === 0),
    'and every figure moved by nothing',
  );
});

test('the deltas are the figures, in one fixed order', () => {
  // The order is an output. A comparison whose rows move when somebody
  // reformats a literal is a comparison two readers cannot discuss.
  const first = compareRuns(runOf(), runOf(inAndOut({ exitBar: 6 })));
  const again = compareRuns(runOf(), runOf(inAndOut({ exitBar: 6 })));
  assert.deepEqual(
    first.deltas.map((one) => one.name),
    again.deltas.map((one) => one.name),
  );
  assert.ok(first.deltas.some((one) => one.name === 'netProfit'));
  assert.ok(
    first.deltas.every((one) => one.delta === one.after - one.before),
    'and every delta is the arithmetic it claims to be',
  );
});

test('a figure that is null in one run is reported without inventing a movement', () => {
  // profitFactor is null when a run took no loss. Subtracting from null is how
  // a comparison reports a move of minus-a-number that never happened.
  const before = runOf();
  const one = withSummary(before, { profitFactor: 2 });
  const other: RunRecord = {
    ...before,
    report: {
      ...before.report,
      summary: { ...before.report.summary, profitFactor: null as unknown as number },
    },
  };
  const row = compareRuns(one, other).deltas.find((d) => d.name === 'profitFactor');
  assert.ok(row, 'the row still appears');
  assert.equal(row.delta, 0, 'and claims no movement');
});

test('separation is the gap over the combined noise', () => {
  // Worked by hand: (12 - 4) / sqrt(3^2 + 4^2) = 8 / 5 = 1.6.
  const base = runOf();
  const before = withSummary(base, { expectancy: 4, expectancyStandardError: 3 });
  const after = withSummary(base, { expectancy: 12, expectancyStandardError: 4 });
  assert.equal(compareRuns(before, after).separation, 1.6);
});

test('separation is negative when the second run is the worse one', () => {
  const base = runOf();
  const before = withSummary(base, { expectancy: 12, expectancyStandardError: 4 });
  const after = withSummary(base, { expectancy: 4, expectancyStandardError: 3 });
  assert.equal(compareRuns(before, after).separation, -1.6);
});

test('no noise to measure is no answer, never infinite confidence', () => {
  // A run with fewer than two closed trades has a standard error of zero. A
  // ratio over zero is infinity, and infinity here would read as certainty,
  // which is the exact opposite of what one trade tells anybody.
  const base = runOf();
  const before = withSummary(base, { expectancy: 0, expectancyStandardError: 0 });
  const after = withSummary(base, { expectancy: 500, expectancyStandardError: 0 });
  assert.equal(compareRuns(before, after).separation, null);
});

test('two runs that traded alike share their trades', () => {
  const comparison = compareRuns(runOf(), runOf());
  assert.equal(comparison.sharedTrades, comparison.deltas.find((d) => d.name === 'tradeCount')?.after);
  assert.ok(comparison.sharedTrades > 0, 'the probe takes at least one trade');
});

test('a run that entered on another bar shares nothing', () => {
  // The figure that says whether a change moved the money by trading
  // differently or by trading the same and paying differently.
  const before = runOf(inAndOut({ entryBar: 1, exitBar: 4 }));
  const after = runOf(inAndOut({ entryBar: 2, exitBar: 5 }));
  assert.equal(compareRuns(before, after).sharedTrades, 0);
});

test('shared trades are counted as a multiset, not as a set', () => {
  // Two long trades opening on one bar against one on the same bar share one.
  const base = runOf();
  const one = { ...aTrade(base), openedOnBar: 1, side: 'long' as const };
  const twice = withTrades(base, [one, one]);
  const once = withTrades(base, [one]);
  assert.equal(compareRuns(twice, once).sharedTrades, 1);
  assert.equal(compareRuns(once, twice).sharedTrades, 1);
});

test('a side that differs on the same bar is not a shared trade', () => {
  const base = runOf();
  const long = withTrades(base, [{ ...aTrade(base), openedOnBar: 2, side: 'long' }]);
  const short = withTrades(base, [{ ...aTrade(base), openedOnBar: 2, side: 'short' }]);
  assert.equal(compareRuns(long, short).sharedTrades, 0);
});

test('the same pair compared twice gives the same answer', () => {
  // Analytic, with no resampling and no random number generator, so a decision
  // taken on a separation is one anybody can reproduce.
  const before = runOf(inAndOut({ exitBar: 4 }));
  const after = runOf(inAndOut({ exitBar: 6 }));
  assert.deepEqual(compareRuns(before, after), compareRuns(before, after));
});
