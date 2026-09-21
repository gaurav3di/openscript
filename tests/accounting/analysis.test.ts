/**
 * The trades taken apart, measured rather than quoted.
 *
 * Three figures here are not derivable from anything in the summary, and each
 * of them is here because a summary that looks healthy can hide the thing it
 * says. The side split can contradict the headline net. The extremes say
 * whether one trade is the whole result. The streaks say what the run of
 * losses was, and that one depends on an ordering the summary folds away, so
 * it is the figure two engines are most likely to disagree about.
 *
 * The partition is asserted against the summary rather than on its own, in both
 * directions: a side split whose counts stop summing to the trade count and
 * whose nets stop summing to the net profit is two panels of one report quietly
 * disagreeing, which is exactly the failure a reader cannot see.
 *
 * Each test says the wrong implementation it exists to catch, and each was
 * checked by writing that implementation and watching the test go red.
 *
 * These are the tests `unit:perf/trade-analysis` names in `spec/feature-matrix.md`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { analysisOf } from '../../src/core/accounting/analysis.js';
import { summaryOf } from '../../src/core/accounting/statistics.js';
import { CONTRACT, tradeOf } from './metrics-support.js';

test('the sides partition the closed trades, in count and in money', () => {
  // Catches a side split folded over the whole list rather than over the closed
  // half, and one that counts a trade on both sides. Either way the two panels
  // of one report disagree, and the reader has no way to tell which is wrong.
  // The open trade below is the one that separates the two mistakes: it is in
  // neither side, and the summary accounts for it in openTradeCount instead.
  const trades = [
    tradeOf({ index: 1, side: 'long', closedOnBar: 1, grossProfit: 10 }),
    tradeOf({ index: 2, side: 'short', closedOnBar: 2, grossProfit: -4 }),
    tradeOf({ index: 3, side: 'long', closedOnBar: 3, grossProfit: 6 }),
    tradeOf({ index: 4, side: 'short', openedOnBar: 3 }),
  ];

  const found = analysisOf(trades);
  const summary = summaryOf(trades, [], CONTRACT, 1000);

  assert.equal(found.long.count + found.short.count, summary.tradeCount);
  assert.equal(found.long.netProfit + found.short.netProfit, summary.netProfit);
  assert.equal(found.long.count, 2);
  assert.equal(found.short.count, 1);
  assert.equal(found.long.netProfit, 16);
  assert.equal(found.short.netProfit, -4);
  assert.equal(summary.openTradeCount, 1);
});

test('a side that decided nothing has no win rate, and that is not a zero', () => {
  // Catches a rate defaulted to zero on a side with no closed trade. Zero is a
  // number a reader compares sides on, and it would say the short side lost
  // every trade it took where it took none at all.
  const found = analysisOf([tradeOf({ index: 1, side: 'long', closedOnBar: 1, grossProfit: 5 })]);

  assert.equal(found.long.winRate, 1);
  assert.equal(found.short.winRate, null);
  assert.equal(found.short.count, 0);
});

test('a side win rate is over that side own decided trades and not the run', () => {
  // Catches a rate whose denominator is the whole run's decided count, which
  // reports every side as worse than it was, and one whose denominator is the
  // side's count including its scratches. The short side below went one and one
  // with a scratch beside it, which is a half by the first spelling and a third
  // by the second.
  const found = analysisOf([
    tradeOf({ index: 1, side: 'long', closedOnBar: 1, grossProfit: 10 }),
    tradeOf({ index: 2, side: 'short', closedOnBar: 2, grossProfit: 4 }),
    tradeOf({ index: 3, side: 'short', closedOnBar: 3, grossProfit: -4 }),
    tradeOf({ index: 4, side: 'short', closedOnBar: 4, grossProfit: 0 }),
  ]);

  assert.equal(found.short.winRate, 0.5);
  assert.equal(found.short.scratches, 1);
  assert.equal(found.short.count, 3);
});

test('the extremes are nets after charges, and the loss is a magnitude', () => {
  // Catches extremes taken from the gross, which is the same mistake the
  // summary's classification once made: the second trade below made twelve
  // before charges and nine after, so a largest win read from the gross names a
  // trade the account never had. Catches a largest loss carried as a negative,
  // which reads as zero under a Math.max and is silently never reported.
  const found = analysisOf([
    tradeOf({ index: 1, closedOnBar: 1, grossProfit: 10, charges: 0 }),
    tradeOf({ index: 2, closedOnBar: 2, grossProfit: 12, charges: 3 }),
    tradeOf({ index: 3, closedOnBar: 3, grossProfit: -7, charges: 1 }),
  ]);

  assert.equal(found.largestWin, 10);
  assert.equal(found.largestLoss, 8);
});

test('a run with nothing closed has no extreme and no streak', () => {
  // Catches an extreme seeded from the first element rather than from zero,
  // which on an empty list is undefined and on an all-losing list reports the
  // shallowest loss as the largest win.
  const found = analysisOf([tradeOf({ index: 1, openedOnBar: 0 })]);

  assert.equal(found.largestWin, 0);
  assert.equal(found.largestLoss, 0);
  assert.equal(found.maxConsecutiveWins, 0);
  assert.equal(found.maxConsecutiveLosses, 0);
});

test('a run where everything lost reports no win and the losses it had', () => {
  // The other half of the seeding mistake, and the case the zero default is
  // argued for in the shape: nothing won, and zero says so in a column of money.
  const found = analysisOf([
    tradeOf({ index: 1, closedOnBar: 1, grossProfit: -2 }),
    tradeOf({ index: 2, closedOnBar: 2, grossProfit: -9 }),
  ]);

  assert.equal(found.largestWin, 0);
  assert.equal(found.largestLoss, 9);
  assert.equal(found.maxConsecutiveLosses, 2);
  assert.equal(found.maxConsecutiveWins, 0);
});

test('a streak is counted in closing order and not in opening order', () => {
  // The defect this file exists for. Trade 1 is opened first and closed last,
  // which is every scaling strategy and every long hold with trades taken
  // around it. In opening order the nets read win, loss, win: no streak above
  // one. In the order the account experienced them they read loss, win, win,
  // which is a streak of two. The summary folds this ordering away entirely, so
  // nothing else in the report can catch an engine that sorts the wrong way, or
  // that does not sort at all.
  const trades = [
    tradeOf({ index: 1, openedOnBar: 0, closedOnBar: 9, grossProfit: 5 }),
    tradeOf({ index: 2, openedOnBar: 1, closedOnBar: 2, grossProfit: -3 }),
    tradeOf({ index: 3, openedOnBar: 3, closedOnBar: 4, grossProfit: 7 }),
  ];

  const found = analysisOf(trades);

  assert.equal(found.maxConsecutiveWins, 2);
  assert.equal(found.maxConsecutiveLosses, 1);
});

test('two trades closing on one bar are ordered by the order they opened', () => {
  // Catches a comparison that is not total. Trades 2 and 3 below both close on
  // bar 4, one a loss and one a win, so a sort keyed on the closing bar alone
  // leaves their order to whatever the list happened to arrive in. Both engines
  // sort stably, so that is not undefined behaviour, it is worse: the streak
  // silently becomes a fact about the input order rather than about the run.
  //
  // Asserted by folding the same three trades twice, once in each order, which
  // is the property that actually matters and the only spelling that fails
  // without the tie-break. A single fold in index order passes either way,
  // because a stable sort leaves an already ordered list alone.
  const trades = [
    tradeOf({ index: 1, openedOnBar: 0, closedOnBar: 3, grossProfit: -1 }),
    tradeOf({ index: 2, openedOnBar: 1, closedOnBar: 4, grossProfit: -1 }),
    tradeOf({ index: 3, openedOnBar: 2, closedOnBar: 4, grossProfit: 8 }),
  ];

  const forwards = analysisOf(trades);
  const backwards = analysisOf(trades.slice().reverse());

  assert.equal(forwards.maxConsecutiveLosses, 2);
  assert.equal(backwards.maxConsecutiveLosses, forwards.maxConsecutiveLosses);
  assert.equal(backwards.maxConsecutiveWins, forwards.maxConsecutiveWins);
});

test('a scratch breaks a streak and extends neither half', () => {
  // Catches a scratch folded into the wins, which is the classification mistake
  // the summary already guards against, and a scratch that is skipped entirely,
  // which is subtler and worse: skipping it joins the two wins either side into
  // a streak of two, so the reported best run depends on a rounding at the last
  // digit of a trade that made nothing.
  const found = analysisOf([
    tradeOf({ index: 1, closedOnBar: 1, grossProfit: 4 }),
    tradeOf({ index: 2, closedOnBar: 2, grossProfit: 0 }),
    tradeOf({ index: 3, closedOnBar: 3, grossProfit: 6 }),
  ]);

  assert.equal(found.maxConsecutiveWins, 1);
  assert.equal(found.maxConsecutiveLosses, 0);
  assert.equal(found.long.scratches, 1);
  assert.equal(found.long.wins, 2);
});

test('an open trade is in no streak, even between two closed losses', () => {
  // Catches the open trade left in the fold. Its net is zero while it is held,
  // so it reads as a scratch and breaks the run of losses either side of it,
  // reporting a worst run of one where the account lost twice running.
  const found = analysisOf([
    tradeOf({ index: 1, openedOnBar: 0, closedOnBar: 1, grossProfit: -3 }),
    tradeOf({ index: 2, openedOnBar: 2 }),
    tradeOf({ index: 3, openedOnBar: 3, closedOnBar: 4, grossProfit: -5 }),
  ]);

  assert.equal(found.maxConsecutiveLosses, 2);
  assert.equal(found.long.count, 2);
});

test('the longest streak is kept, not the last one', () => {
  // Catches a counter reported at the end of the loop rather than carried as a
  // maximum, which reports whatever the run happened to finish on: here a
  // single trailing loss, where the run's worst stretch was three.
  const found = analysisOf([
    tradeOf({ index: 1, closedOnBar: 1, grossProfit: -1 }),
    tradeOf({ index: 2, closedOnBar: 2, grossProfit: -1 }),
    tradeOf({ index: 3, closedOnBar: 3, grossProfit: -1 }),
    tradeOf({ index: 4, closedOnBar: 4, grossProfit: 9 }),
    tradeOf({ index: 5, closedOnBar: 5, grossProfit: -1 }),
  ]);

  assert.equal(found.maxConsecutiveLosses, 3);
});

test('the fold does not reorder the list it is given', () => {
  // Catches a sort applied in place. The list arrives in opening order because
  // the equity fold needs it that way, and an analysis that sorted it under the
  // caller would change the curve, the drawdown and every figure folded from
  // them, on a call that is supposed to read.
  const trades = [
    tradeOf({ index: 1, openedOnBar: 0, closedOnBar: 9, grossProfit: 5 }),
    tradeOf({ index: 2, openedOnBar: 1, closedOnBar: 2, grossProfit: -3 }),
  ];

  analysisOf(trades);

  assert.deepEqual(
    trades.map((trade) => trade.index),
    [1, 2],
  );
});
