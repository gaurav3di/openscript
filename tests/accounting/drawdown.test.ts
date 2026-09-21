/**
 * The summary's curve figures: the deepest the run went and how long it stayed
 * there.
 *
 * Drawdown is the figure a trader stops on, and it is three numbers that have
 * to describe one moment: how much, what fraction of the peak, and when. A
 * report that takes the money from one bar and the fraction from another
 * describes a moment the run never had, and the reader who checks it against
 * the curve finds two figures that cannot both be true.
 *
 * The other figure here is the one nobody prints and everybody needs: how many
 * bars the run spent under a peak before it took it back. A strategy that
 * recovers in four bars and one that recovers in four hundred have the same
 * worst drawdown and are not the same strategy.
 *
 * Curves are written out here as points rather than folded from trades, because
 * a test about what a summary reads out of a curve should fail when the summary
 * is wrong and not when the fold is. The fold has its own file.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { equityOver } from '../../src/core/accounting/equity.js';
import type { EquityPoint } from '../../src/core/accounting/equity.js';
import { summaryOf } from '../../src/core/accounting/statistics.js';
import { CONTRACT, marksOf, timeOf, tradeOf } from './metrics-support.js';

const CAPITAL = 1000;

/**
 * One point of a curve, carrying the figures a depth and a height are read
 * from.
 *
 * The run-up pair defaults to zero, so a test about drawdown states drawdown
 * and nothing else. The tests that are about run-up state it, and they state it
 * independently of the drawdown beside it: the two are read from the same point
 * and are not the same fold, so a point where both are stated is the only shape
 * that can catch a summary reading one of them out of the other.
 */
function pointOf(
  barIndex: number,
  drawdown: number,
  drawdownPercent: number,
  runUp = 0,
  runUpPercent = 0,
): EquityPoint {
  return {
    barIndex,
    time: timeOf(barIndex),
    realised: 0,
    charges: 0,
    openProfit: 0,
    cash: CAPITAL,
    equity: CAPITAL + drawdown,
    exposure: 0,
    drawdown,
    drawdownPercent,
    runUp,
    runUpPercent,
  };
}

/** A curve from a list of drawdowns, each stated as money and as a fraction. */
function curveOf(drawdowns: readonly (readonly [number, number])[]): readonly EquityPoint[] {
  return drawdowns.map(([money, fraction], barIndex) => pointOf(barIndex, money, fraction));
}

test('the three drawdown figures are read from one point of the curve', () => {
  // Catches the fraction taken as the worst fraction of any point rather than
  // as the fraction of the deepest point. The curve below is deepest in money
  // at bar 2, where the peak was large, and worst as a fraction at bar 4, where
  // it was small. A summary that mixes them reports a loss of fifty against a
  // peak that would make that eight percent, and no point in the curve it was
  // drawn from agrees with either pairing.
  const summary = summaryOf(
    [],
    curveOf([
      [0, 0],
      [-20, -0.02],
      [-50, -0.05],
      [0, 0],
      [-40, -0.08],
    ]),
    CONTRACT,
    CAPITAL,
  );

  assert.equal(summary.maxDrawdown, -50);
  assert.equal(summary.maxDrawdownPercent, -0.05);
  assert.equal(summary.maxDrawdownAt, timeOf(2));
});

test('the drawdown keeps the sign the curve states it with', () => {
  // Catches a summary that reports the magnitude while the points beside it
  // report the distance below the peak. Two figures called drawdown with two
  // signs in one report is a subtraction a reader gets wrong once, and a
  // comparison between two runs that gets it wrong every time.
  const summary = summaryOf([], curveOf([[-30, -0.03]]), CONTRACT, CAPITAL);

  assert.equal(summary.maxDrawdown, -30);
  assert.ok(summary.maxDrawdown <= 0, 'a drawdown reported as a positive magnitude');
  assert.ok(summary.maxDrawdownPercent <= 0, 'a fraction reported as a positive magnitude');
});

test('a run that never fell below its peak has no drawdown and no moment to name', () => {
  // Catches a summary that names the first bar, or the last, as the moment of a
  // drawdown that never happened. A time on a run with no drawdown is a date a
  // reader would go and look at.
  const summary = summaryOf(
    [],
    curveOf([
      [0, 0],
      [0, 0],
    ]),
    CONTRACT,
    CAPITAL,
  );

  assert.equal(summary.maxDrawdown, 0);
  assert.equal(summary.maxDrawdownPercent, 0);
  assert.equal(summary.maxDrawdownAt, null);
  assert.equal(summary.longestDrawdownBars, 0);
});

test('the longest drawdown is the longest run under a peak, not the total time under one', () => {
  // Catches the count that simply adds up every bar below a peak, which is a
  // much larger number and a different claim: a run that dips for one bar
  // fifteen times over a year has never been under water for more than a bar,
  // and a report saying fifteen would have a reader believing it took a year to
  // recover. Catches the counter that is never reset at a recovery too, which
  // is the same defect written as an accumulator.
  const summary = summaryOf(
    [],
    curveOf([
      [0, 0],
      [-1, -0.001],
      [-2, -0.002],
      [0, 0],
      [-1, -0.001],
      [-1, -0.001],
      [-1, -0.001],
      [0, 0],
    ]),
    CONTRACT,
    CAPITAL,
  );

  assert.equal(summary.longestDrawdownBars, 3);
  assert.equal(summary.barCount, 8);
});

test('a drawdown still open at the last bar counts to the end of the run', () => {
  // Catches a count that only closes a run at a recovery, and so reports zero
  // for the run that matters most: the one the report ends inside. That is the
  // drawdown the trader is sitting in while they read the page.
  const summary = summaryOf(
    [],
    curveOf([
      [0, 0],
      [-5, -0.005],
      [-9, -0.009],
    ]),
    CONTRACT,
    CAPITAL,
  );

  assert.equal(summary.longestDrawdownBars, 2);
  assert.equal(summary.maxDrawdownAt, timeOf(2));
});

test('the moment of the deepest drawdown is a bar time and never a bar index', () => {
  // Catches a summary that carries the index. `bars.ts` says loading more
  // history shifts every index, so a report that addresses a bar by index
  // changes its answer when the warmup changes, and two runs over the same
  // period with different warmups would disagree about when the worst moment
  // was. The curve below sits at bar 1, whose index and time are nothing alike.
  const summary = summaryOf(
    [],
    curveOf([
      [0, 0],
      [-7, -0.007],
    ]),
    CONTRACT,
    CAPITAL,
  );

  assert.equal(summary.maxDrawdownAt, timeOf(1));
  assert.notEqual(summary.maxDrawdownAt, 1);
});

test('the bars in the market are the report bars a position was held at the close', () => {
  // Catches a count taken from the trades rather than from the bars, which
  // reports the number of trades, and one taken from the whole curve, which
  // reports every bar of the run as held. The run below holds for three of its
  // five report bars, and is flat before the first and after the last.
  const trades = [
    tradeOf({ index: 1, openedOnBar: 2, closedOnBar: 4, exitPrice: 102 }),
    tradeOf({ index: 2, openedOnBar: 5, closedOnBar: 6, exitPrice: 101 }),
  ];
  const equity = equityOver(trades, marksOf([100, 100, 101, 102, 102, 101, 101], 1), CONTRACT, CAPITAL);
  const summary = summaryOf(trades, equity, CONTRACT, CAPITAL);

  assert.equal(summary.barCount, 6);
  assert.equal(summary.barsInMarket, 3);
  assert.equal(summary.tradeCount, 2);
});

test('a run with no curve at all still reports numbers', () => {
  // Catches a summary that reaches for the first point, or the last, without
  // asking whether there is one. A report over a window that held no bars is
  // not an error here: the range check refuses that case, and this fold is
  // asked for a summary before anybody has decided whether to refuse.
  const summary = summaryOf([], [], CONTRACT, CAPITAL);

  assert.equal(summary.barCount, 0);
  assert.equal(summary.barsInMarket, 0);
  assert.equal(summary.maxDrawdown, 0);
  assert.equal(summary.maxDrawdownPercent, 0);
  assert.equal(summary.maxDrawdownAt, null);
  assert.equal(summary.longestDrawdownBars, 0);
});

/**
 * Run-up: the same curve read the other way up.
 *
 * It is not a second drawdown with the comparison flipped, and the tests below
 * are mostly about the one place the symmetry breaks. The running peak starts
 * at the capital and only rises, so it is above zero for the whole of any run
 * that was given money. The running trough starts there and only falls, so it
 * reaches zero on a run that lost everything and the fraction has no basis left
 * to be taken against.
 *
 * These are the tests `unit:perf/run-up` names in `spec/feature-matrix.md`.
 */

test('run-up is measured from the running trough and not from the start', () => {
  // Catches a height measured against the capital, which is the reading that
  // looks right until a run goes down first. The curve below falls to 900 and
  // climbs to 1050: the account climbed 150 from where it stood, and a figure
  // measured from the capital reports 50 and hides the whole of the recovery.
  const summary = summaryOf(
    [],
    [pointOf(0, 0, 0, 0, 0), pointOf(1, -100, -0.1, 0, 0), pointOf(2, 0, 0, 150, 150 / 900)],
    CONTRACT,
    CAPITAL,
  );

  assert.equal(summary.maxRunUp, 150);
  assert.equal(summary.maxRunUpPercent, 150 / 900);
});

test('the height and the depth address different bars, each the first to reach it', () => {
  // Catches a summary that reads the run-up out of the bar it already chose for
  // the drawdown, which is the cheapest wrong implementation here and gives a
  // run-up of zero on most runs. The two extremes below are three bars apart.
  const summary = summaryOf(
    [],
    [
      pointOf(0, 0, 0, 0, 0),
      pointOf(1, -200, -0.2, 0, 0),
      pointOf(2, -50, -0.05, 150, 0.1875),
      pointOf(3, 0, 0, 260, 0.325),
    ],
    CONTRACT,
    CAPITAL,
  );

  assert.equal(summary.maxDrawdownAt, timeOf(1));
  assert.equal(summary.maxRunUpAt, timeOf(3));
  assert.equal(summary.maxDrawdown, -200);
  assert.equal(summary.maxRunUp, 260);
});

test('the earliest bar reaching a height keeps it, as the depth rule does', () => {
  // Catches a comparison written with `>=`, which hands the figure to the last
  // bar that matched. The depth above is picked by the first, and two figures
  // in one report picked by opposite tie rules is a report whose two halves
  // cannot be checked against each other.
  const summary = summaryOf(
    [],
    [pointOf(0, 0, 0, 0, 0), pointOf(1, 0, 0, 80, 0.08), pointOf(2, 0, 0, 80, 0.08)],
    CONTRACT,
    CAPITAL,
  );

  assert.equal(summary.maxRunUpAt, timeOf(1));
  assert.equal(summary.maxRunUp, 80);
});

test('a run that only fell has no run-up, and that is a zero rather than a null', () => {
  // Catches a height seeded from the first point rather than from zero. The
  // curve below never rose, so there is nothing to report, and zero is what
  // "nothing" means in a column of money.
  const summary = summaryOf(
    [],
    [pointOf(0, 0, 0, 0, 0), pointOf(1, -30, -0.03, 0, 0), pointOf(2, -75, -0.075, 0, 0)],
    CONTRACT,
    CAPITAL,
  );

  assert.equal(summary.maxRunUp, 0);
  assert.equal(summary.maxRunUpPercent, 0);
  assert.equal(summary.maxRunUpAt, null);
  assert.equal(summary.maxDrawdown, -75);
});

test('the curve folds a run-up from the capital and not from its first point', () => {
  // The fold's own half, over a real curve rather than a written one, and the
  // mirror of the drawdown rule next to it. The position below is entered at
  // 100 and marked up every bar, so the account is ahead from its first report
  // bar. A trough anchored at the first point would call that first bar the
  // bottom and report the gain it already had as having come from nowhere.
  const trades = [tradeOf({ index: 1, openedOnBar: 0, entryPrice: 100, units: 10 })];
  const curve = equityOver(trades, marksOf([110, 120, 130]), CONTRACT, CAPITAL);

  assert.deepEqual(
    curve.map((point) => point.runUp),
    [100, 200, 300],
  );
  assert.deepEqual(
    curve.map((point) => point.drawdown),
    [0, 0, 0],
  );
});

test('a trough at or below zero reports no fraction, and still reports the money', () => {
  // The one place the symmetry with drawdown breaks, and it is written down in
  // the shape. A guard written as `trough === 0` passes the wiped-out curve and
  // fails this one, so both are here: the first position below marks down to
  // exactly nothing and the second marks down past it, which is reachable
  // because an open position can lose more than the account holds.
  //
  // A fraction against a trough of zero is a division by zero and against a
  // negative one it turns a positive climb into a negative fraction, which is
  // the shape that once reported a profit factor of minus a half. The money
  // figure is unaffected and is what a reader of such a run is left with.
  const wiped = equityOver(
    [tradeOf({ index: 1, openedOnBar: 0, entryPrice: 100, units: 10 })],
    marksOf([0, 40]),
    CONTRACT,
    CAPITAL,
  );

  assert.equal(wiped[0]?.equity, 0);
  assert.equal(wiped[0]?.runUpPercent, 0);
  assert.equal(wiped[1]?.runUp, 400);
  assert.equal(wiped[1]?.runUpPercent, 0);

  const past = equityOver(
    [tradeOf({ index: 1, openedOnBar: 0, entryPrice: 100, units: 30 })],
    marksOf([0, 40]),
    CONTRACT,
    CAPITAL,
  );

  assert.equal(past[0]?.equity, -2000);
  assert.equal(past[1]?.equity, -800);
  assert.equal(past[1]?.runUp, 1200);
  assert.equal(past[1]?.runUpPercent, 0);
});
