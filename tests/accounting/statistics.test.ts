/**
 * The summary's trade figures, measured rather than quoted.
 *
 * Win rate, expectancy and the standard error beside it are the three figures a
 * reader decides on, and every one of them is a division with a case where
 * there is nothing to divide by. So the cases are here first: nothing closed,
 * one trade closed, every trade a scratch, everything lost and nothing lost.
 * Each of them has produced a value that is not a number in some report
 * somebody once trusted, and a value that is not a number is written down as
 * absence, which is how a report comes back from a round trip with a hole in
 * the place its worst figure was.
 *
 * The curve's own figures, drawdown and the bars in the market, are next door
 * in `drawdown.test.ts`: they are measured over an equity curve rather than
 * over a trade list, and mixing the two files would hide which half a failure
 * is in.
 *
 * Each test says the wrong implementation it exists to catch, and each was
 * checked by writing that implementation and watching the test go red.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { summaryOf } from '../../src/core/accounting/statistics.js';
import type { Summary } from '../../src/core/accounting/statistics.js';
import type { Trade } from '../../src/core/accounting/trades.js';
import { CONTRACT, tradeOf } from './metrics-support.js';

const CAPITAL = 1000;

/** The summary of these trades against no curve, which is the trades half. */
function summaryFor(trades: readonly Trade[]): Summary {
  return summaryOf(trades, [], CONTRACT, CAPITAL);
}

test('a trade wins or loses on its net after charges, and a scratch is in neither half', () => {
  // Catches the classification taken from the gross. The middle trade below
  // made two before charges and gave all of it back to them, and a report that
  // counts it as a win states a win rate of two thirds where the account was
  // ahead on one trade out of three. Charges are exactly what turns a winning
  // strategy into a losing account, so the figure that decides has to be the
  // one after them.
  const summary = summaryFor([
    tradeOf({ index: 1, closedOnBar: 1, grossProfit: 10, charges: 2 }),
    tradeOf({ index: 2, closedOnBar: 2, grossProfit: -5, charges: 1 }),
    tradeOf({ index: 3, closedOnBar: 3, grossProfit: 2, charges: 2 }),
  ]);

  assert.equal(summary.tradeCount, 3);
  assert.equal(summary.wins, 1);
  assert.equal(summary.losses, 1);
  assert.equal(summary.scratches, 1);
  assert.equal(summary.winRate, 0.5);
  assert.equal(summary.netProfit, 2);
  assert.equal(summary.grossProfit, 10);
  assert.equal(summary.grossLoss, 5);
  assert.equal(summary.charges, 5);
});

test('an open trade brings its charges and not its net', () => {
  // Catches a net profit folded over every trade in the list. An open trade's
  // net is its charges so far with no gross against them, so a run holding a
  // winner would report a loss, and the expectancy under it would be the loss
  // divided by a count that included a trade that has decided nothing. The
  // charges are the other way round: the money left the account whether or not
  // the position came back.
  const summary = summaryFor([
    tradeOf({ index: 1, closedOnBar: 1, grossProfit: 10, charges: 2 }),
    tradeOf({ index: 2, openedOnBar: 2, charges: 3 }),
  ]);

  assert.equal(summary.tradeCount, 1);
  assert.equal(summary.openTradeCount, 1);
  assert.equal(summary.netProfit, 8);
  assert.equal(summary.charges, 5);
  assert.equal(summary.expectancy, 8);
});

test('a win rate is null where there is no denominator, never zero', () => {
  // Catches both `0 / 0` and the zero somebody writes to avoid it. A rate of
  // zero is the claim that nothing won, which a reader compares against and
  // acts on; "nothing has closed" and "every trade scratched" are different
  // claims, and neither of them is a losing run.
  assert.equal(summaryFor([]).winRate, null);
  assert.equal(summaryFor([tradeOf({ index: 1, openedOnBar: 0, charges: 1 })]).winRate, null);

  const scratched = summaryFor([
    tradeOf({ index: 1, closedOnBar: 1, grossProfit: 2, charges: 2 }),
    tradeOf({ index: 2, closedOnBar: 2, grossProfit: 0, charges: 0 }),
  ]);
  assert.equal(scratched.tradeCount, 2);
  assert.equal(scratched.scratches, 2);
  assert.equal(scratched.winRate, null);
});

test('expectancy is the net over the closed trades, and the win rate spelling agrees', () => {
  // Catches an expectancy averaged over every trade in the list, and one
  // computed as the win rate against the average win with the loss side left
  // off. The second spelling is the one a reader knows from every book on the
  // subject, so the two are required to agree; they are not required to agree
  // bit for bit, because they are two different sequences of divisions and
  // insisting on the last bit would be insisting on an accident.
  const summary = summaryFor([
    tradeOf({ index: 1, closedOnBar: 1, grossProfit: 8 }),
    tradeOf({ index: 2, closedOnBar: 2, grossProfit: -6 }),
    tradeOf({ index: 3, closedOnBar: 3, grossProfit: 4 }),
    tradeOf({ index: 4, openedOnBar: 4, charges: 9 }),
  ]);

  assert.equal(summary.tradeCount, 3);
  assert.equal(summary.netProfit, 6);
  assert.equal(summary.expectancy, 2);
  assert.equal(summary.averageWin, 6);
  assert.equal(summary.averageLoss, 6);

  const rate = summary.winRate ?? 0;
  const spelled = rate * summary.averageWin - (1 - rate) * summary.averageLoss;
  assert.ok(
    Math.abs(spelled - summary.expectancy) <= 1e-9,
    `the two spellings of expectancy are ${spelled} and ${summary.expectancy}`,
  );
});

test('a scratch parts the two spellings of expectancy, and the report states the one it names', () => {
  // Catches expectancy divided by the trades that decided rather than by the
  // trades that closed. A scratch closed, so it is in the count; it decided
  // nothing, so it is in neither side of the win rate. The two spellings are
  // therefore the same figure only where nothing scratched, and a report that
  // quietly swapped the denominator would read as money per trade while being
  // money per decided trade.
  const summary = summaryFor([
    tradeOf({ index: 1, closedOnBar: 1, grossProfit: 8 }),
    tradeOf({ index: 2, closedOnBar: 2, grossProfit: -6 }),
    tradeOf({ index: 3, closedOnBar: 3, grossProfit: 4 }),
    tradeOf({ index: 4, closedOnBar: 4, grossProfit: 0 }),
  ]);

  assert.equal(summary.tradeCount, 4);
  assert.equal(summary.scratches, 1);
  assert.equal(summary.netProfit, 6);
  assert.equal(summary.expectancy, 1.5);

  const rate = summary.winRate ?? 0;
  const spelled = rate * summary.averageWin - (1 - rate) * summary.averageLoss;
  assert.ok(Math.abs(spelled - 2) <= 1e-9, `the win rate spelling is ${spelled}`);
  assert.ok(
    Math.abs(spelled * (summary.wins + summary.losses) - summary.expectancy * summary.tradeCount) <=
      1e-9,
    'the two spellings do not share a numerator',
  );
});

test('the standard error is the sample deviation over the root of the count', () => {
  // Catches the population deviation, which divides by the count rather than by
  // one less than it and understates the spread by exactly the amount that
  // matters on the short runs where this figure is asked for, and a deviation
  // reported without the division by the root of the count, which is a
  // different statistic three times the size.
  const summary = summaryFor([
    tradeOf({ index: 1, closedOnBar: 1, grossProfit: 10 }),
    tradeOf({ index: 2, closedOnBar: 2, grossProfit: -2 }),
    tradeOf({ index: 3, closedOnBar: 3, grossProfit: 4 }),
  ]);

  // Nets of 10, -2 and 4 have a mean of 4, squared distances of 36, 36 and 0, a
  // sample variance of 36, a deviation of 6, and an error of 6 over the root of
  // three.
  assert.equal(summary.expectancy, 4);
  assert.ok(
    Math.abs(summary.expectancyStandardError - Math.sqrt(12)) <= 1e-12,
    `the error is ${summary.expectancyStandardError}`,
  );
});

test('one closed trade has no spread, and the figure that says so is a number', () => {
  // Catches the sample variance dividing by one less than a count of one. That
  // is a division by zero, and it arrives in the report as an infinity or as
  // something that is not a number at all, which is written down as absence.
  // The single trade run is not an edge case: it is the first thing anybody
  // sees when they backtest a new script over a short window.
  const summary = summaryFor([tradeOf({ index: 1, closedOnBar: 1, grossProfit: 7 })]);

  assert.equal(summary.tradeCount, 1);
  assert.equal(summary.expectancy, 7);
  assert.equal(summary.expectancyStandardError, 0);
  assert.ok(Number.isFinite(summary.expectancyStandardError), 'the error is not a number');
});

test('a run with nothing in it reports numbers and three honest nulls', () => {
  // Catches the empty run computing its way to a value that is not a number in
  // any of five places at once: the win rate, the expectancy, the error, the
  // profit factor and the average bars held. This is the run every driver meets
  // first, on the day somebody backtests a script that never entered.
  const summary = summaryFor([]);

  assert.equal(summary.winRate, null);
  assert.equal(summary.profitFactor, null);
  assert.equal(summary.averageBarsHeld, null);
  for (const [name, figure] of numbersOf(summary)) {
    assert.ok(Number.isFinite(figure), `${name} is ${figure}`);
  }
  assert.equal(summary.netProfit, 0);
  assert.equal(summary.expectancy, 0);
  assert.equal(summary.expectancyStandardError, 0);
  assert.equal(summary.tradeCount, 0);
});

test('a run that lost everything states a profit factor of zero and an average win of zero', () => {
  // Catches `0 / 0` in the average win, which is the shape a losing run has:
  // there are no winners to average. The profit factor is a real zero here,
  // there was gross loss to divide into, and a report that answered null would
  // be saying the figure cannot be stated when it can.
  const summary = summaryFor([
    tradeOf({ index: 1, closedOnBar: 1, grossProfit: -4, charges: 1 }),
    tradeOf({ index: 2, closedOnBar: 2, grossProfit: -6, charges: 1 }),
  ]);

  assert.equal(summary.wins, 0);
  assert.equal(summary.losses, 2);
  assert.equal(summary.winRate, 0);
  assert.equal(summary.averageWin, 0);
  assert.equal(summary.averageLoss, 6);
  assert.equal(summary.grossProfit, 0);
  assert.equal(summary.grossLoss, 10);
  assert.equal(summary.profitFactor, 0);
  assert.equal(summary.expectancy, -6);
});

test('a gross loss driven under zero by charges states no profit factor', () => {
  // A trade wins or loses on its net after charges and contributes its gross to
  // the gross figures, so a trade whose gross was positive and whose charges
  // took it under lands in the losses carrying a positive gross. Enough of
  // those and the gross loss goes under zero, and dividing by it reported a
  // profit factor of minus a half: a ratio every use of which is non-negative,
  // handed back negative, on a run somebody was about to judge.
  const summary = summaryFor([
    tradeOf({ index: 1, closedOnBar: 1, grossProfit: 100, charges: 101 }),
    tradeOf({ index: 2, closedOnBar: 2, grossProfit: 50 }),
  ]);

  assert.equal(summary.wins, 1, 'the second trade won');
  assert.equal(summary.losses, 1, 'and the first lost on its net, which is the rule');
  assert.equal(summary.grossLoss, -100, 'the gross loss is below zero, as it says it can be');
  assert.equal(summary.profitFactor, null, 'so there is no ratio to state');
});

test('a run whose only trade was charged into a loss states no profit factor either', () => {
  const summary = summaryFor([tradeOf({ index: 1, closedOnBar: 1, grossProfit: 100, charges: 101 })]);
  assert.equal(summary.grossLoss, -100);
  assert.equal(summary.profitFactor, null, 'rather than minus zero');
});

test('a run that lost nothing states no profit factor at all', () => {
  // Catches an infinity. Dividing by a gross loss of zero gives one, and an
  // infinity is a value JSON writes as null, so the report would come back from
  // a round trip with a hole in it and a conformance comparison would fail on
  // absence rather than on arithmetic. Null here is the same decision said out
  // loud instead of by accident.
  const summary = summaryFor([
    tradeOf({ index: 1, closedOnBar: 1, grossProfit: 4 }),
    tradeOf({ index: 2, closedOnBar: 2, grossProfit: 6 }),
  ]);

  assert.equal(summary.grossLoss, 0);
  assert.equal(summary.profitFactor, null);
  assert.equal(summary.winRate, 1);
  assert.equal(summary.averageLoss, 0);
});

test('the average bars held is over the closed trades that state one', () => {
  // Catches a mean divided by the closed count where a trade carries no bars
  // held, which is not a number, and one that folds in the open trades, whose
  // bars held is absent because they have not finished being held. Null where
  // nothing closed, for the same reason the win rate is null there.
  const summary = summaryFor([
    tradeOf({ index: 1, openedOnBar: 0, closedOnBar: 4 }),
    tradeOf({ index: 2, openedOnBar: 5, closedOnBar: 7 }),
    tradeOf({ index: 3, openedOnBar: 8, closedOnBar: 9, barsHeld: null }),
    tradeOf({ index: 4, openedOnBar: 9 }),
  ]);

  assert.equal(summary.averageBarsHeld, 3);
  assert.equal(summaryFor([]).averageBarsHeld, null);
  assert.equal(summaryFor([tradeOf({ index: 1, openedOnBar: 0 })]).averageBarsHeld, null);
});

test('the return is a fraction of the capital, and zero where there is no capital', () => {
  // Catches a return already multiplied by a hundred, which is the other
  // convention and is indistinguishable from this one until the figure is a
  // hundred times wrong in a document, and catches the unguarded division that
  // a capital of zero turns into a value that is not a number.
  const trades = [tradeOf({ index: 1, closedOnBar: 1, grossProfit: 60, charges: 10 })];

  assert.equal(summaryOf(trades, [], CONTRACT, 1000).returnPercent, 0.05);
  assert.equal(summaryOf(trades, [], CONTRACT, 0).returnPercent, 0);
  assert.equal(summaryOf(trades, [], CONTRACT, 1000).capital, 1000);
  assert.equal(summaryOf(trades, [], CONTRACT, 1000).currency, CONTRACT.currency);
});

/** Every figure in a summary that is a number, named as a failure names it. */
function numbersOf(summary: Summary): readonly (readonly [string, number])[] {
  const found: (readonly [string, number])[] = [];
  for (const [name, figure] of Object.entries(summary)) {
    if (typeof figure === 'number') found.push([name, figure]);
  }
  return found;
}
