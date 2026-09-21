/**
 * One run, driven end to end, and every figure it produced traced back to a
 * price a reader can point at.
 *
 * The bars rise by one a bar, so the arithmetic is arithmetic: a strategy that
 * buys two units at 101 and closes them at 104 made six, and a report that says
 * anything else is wrong about something nameable. That is the whole design of
 * this file. A suite that ran an indicator strategy over noisy bars would assert
 * numbers nobody could check, and the first thing to go would be the checking.
 *
 * The wrong implementations it is written against: a driver that tells the
 * engine each bar is the only bar, one that records the bar an order was decided
 * on as the bar it settled on, one that keeps the ledger's own array instead of
 * copying it, one that loses the warmup, and one whose report and whose trades
 * disagree about what a run cost.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { backtest } from '../../src/core/backtest/index.js';
import type { BacktestResult, RunRecord } from '../../src/core/backtest/index.js';
import type { CompiledProgram } from '../../src/core/emit/index.js';
import { load } from '../../src/core/engine/index.js';
import { HOUR, START, flatOnLast, inAndOut, rising, runSettings } from './support.js';

const BARS = rising(8);

/** A run that must have happened, so a test can read its record. */
function ran(result: BacktestResult): RunRecord {
  if (!result.ok) throw new Error(`the run was refused: ${result.diagnostic.code}`);
  return result.record;
}

/**
 * The run everything below reads: buy two on bar one, close on bar four.
 *
 * `fillOn` is the close, so the entry is bar one's close and the exit is bar
 * four's, and both are folded at the boundary after them.
 */
function probe(): RunRecord {
  return ran(backtest(inAndOut({}), BARS, runSettings()));
}

/**
 * A run produces the fills its orders were answered with, at the prices the
 * venue gave and on the bars the fold happened at.
 *
 * Catches a driver that records the bar the order was decided on: the position
 * does not exist until the frame folds, so a fill dated to the decision would
 * mark a bar the strategy was flat on and move the equity curve a bar early for
 * every trade in the run.
 */
test('the fills are the frames the fold settled, dated at the fold', () => {
  const record = probe();
  assert.equal(record.fills.length, 2);

  const entry = record.fills[0];
  assert.equal(entry?.seq, 1);
  assert.equal(entry?.side, 'buy');
  assert.equal(entry?.units, 2);
  assert.equal(entry?.price, 101);
  assert.equal(entry?.barIndex, 2);
  assert.equal(entry?.barTime, START + 2 * HOUR);
  assert.equal(entry?.refSizeBefore, 0);
  assert.equal(entry?.refSizeAfter, 2);

  const exit = record.fills[1];
  assert.equal(exit?.seq, 2);
  assert.equal(exit?.side, 'sell');
  assert.equal(exit?.price, 104);
  assert.equal(exit?.barIndex, 5);
  assert.equal(exit?.refSizeBefore, 2);
  assert.equal(exit?.refSizeAfter, 0);
  assert.equal(exit?.positionRef, entry?.positionRef);
});

/**
 * The report is the fills folded, and the figures agree with each other.
 *
 * Two units from 101 to 104 is six, and the identities are what a second
 * implementation is held to: the trades' charges add up to the summary's, and
 * expectancy is the net over the closed count however it is spelled. Catches a
 * report whose halves are computed from different lists, which is right until
 * the first partial close and then quietly is not.
 */
test('the report folds to what the prices say and agrees with itself', () => {
  const record = probe();
  const summary = record.report.summary;

  assert.equal(record.report.trades.length, 1);
  assert.equal(record.report.trades[0]?.entryPrice, 101);
  assert.equal(record.report.trades[0]?.exitPrice, 104);
  assert.equal(record.report.trades[0]?.netProfit, 6);
  assert.equal(summary.netProfit, 6);
  assert.equal(summary.tradeCount, 1);
  assert.equal(summary.capital, 100000);

  const charged = record.report.trades.reduce((total, trade) => total + trade.charges, 0);
  assert.equal(charged, summary.charges);
  assert.equal(summary.expectancy, summary.netProfit / summary.tradeCount);
  assert.equal(record.report.markers.length, 2);
  assert.equal(record.report.equity.length, BARS.length);
  assert.equal(record.report.equity[BARS.length - 1]?.equity, 100000 + 6);
});

/**
 * The declaration's costs are charged, once per fill, and they move the report.
 *
 * Catches a driver that derives a schedule from the declaration and then
 * reports the gross anyway, which is a backtest that quietly ignores what the
 * script said it costs to trade.
 */
test('a declared commission is charged on every fill', () => {
  const record = ran(backtest(inAndOut({ commission: 20 }), BARS, runSettings()));
  assert.equal(record.report.summary.charges, 40);
  assert.equal(record.report.summary.netProfit, 6 - 40);
  assert.equal(record.report.trades[0]?.charges, 40);
});

/**
 * Every bar supplied executes, and only the window is reported.
 *
 * The entry is on bar one and the window starts at bar three, so the trade
 * opened in the warmup. It is in the report, its charges are paid, and the
 * curve is four points long. Catches a driver that hands the engine only the
 * window, which loses the position entirely, and one that reports the warmup,
 * which is four extra points nobody traded.
 */
test('a warmup bar runs and is not reported', () => {
  const record = ran(
    backtest(
      inAndOut({ commission: 20 }),
      BARS,
      runSettings({ range: { from: START + 4 * HOUR, to: null } }),
    ),
  );
  assert.equal(record.report.equity.length, 4);
  assert.equal(record.report.equity[0]?.barIndex, 4);
  assert.equal(record.report.trades.length, 1);
  assert.equal(record.report.trades[0]?.openedOnBar, 2);
  assert.equal(record.report.summary.charges, 40);
  assert.equal(record.report.summary.barCount, 4);
});

/**
 * The frames say which boundary they were delivered at.
 *
 * That is the column a conformance case is handed, and it is the difference
 * between a fold another engine can reproduce and a list of answers in no
 * order. Catches a driver that records a frame at the bar it was answered for
 * rather than at the boundary it crossed at, which puts every fill one bar out
 * for whoever replays the case.
 */
test('the frames carry the boundary they were delivered at', () => {
  const record = probe();
  assert.deepEqual(
    record.frames.map((frame) => [frame.afterBar, frame.intent, frame.status, frame.filledQty]),
    [
      [1, 1, 'working', 0],
      [1, 1, 'filled', 2],
      [4, 2, 'working', 0],
      [4, 2, 'filled', 2],
    ],
  );
  for (const frame of record.frames) assert.equal(typeof frame.orderRef, 'string');
});

/**
 * The ledger in the record is a copy, in the words a case file prints.
 *
 * `engine.orders()` hands back the ledger's own array, which the fold writes
 * into and a refused bar truncates. Catches a driver that keeps that reference,
 * and one that writes the engine's own row shape into the document: a record
 * carrying `reduces` is a record only this engine can read, and the intent is an
 * ordinal because no engine can know what id another minted.
 */
test('the ledger is snapshot into the words a second engine reads', () => {
  const record = probe();
  assert.equal(record.orders.length, 2);
  assert.deepEqual(
    record.orders.map((row) => [row.intent, row.side, row.status, row.filledQty, row.qtyType]),
    [
      [1, 'buy', 'filled', 2, 'units'],
      [2, 'sell', 'filled', 2, 'units'],
    ],
  );
  for (const row of record.orders) {
    assert.equal('reduces' in row, false);
    assert.equal(row.rejection, null);
  }
});

/**
 * A run that could not start is a refusal and not a record.
 *
 * Two ways a run does not start, and neither produces a document: a program the
 * engine will not load, and a window holding no bars. The load's own refusal is
 * compared against loading the same program directly rather than against a code
 * written into this file, because what the driver promises is that it hands
 * that refusal back rather than inventing one of its own.
 *
 * Catches a driver that returns an empty record instead, which is a document
 * asserting figures nothing computed and is indistinguishable from a strategy
 * that did nothing.
 */
test('a run that could not start is refused rather than recorded', () => {
  const broken = {} as unknown as CompiledProgram;
  const refused = backtest(broken, BARS, runSettings());
  const direct = load(broken, { host: { route: () => undefined } });
  assert.equal(refused.ok, false);
  assert.equal(direct.ok, false);
  if (!refused.ok && !direct.ok) assert.equal(refused.diagnostic.code, direct.diagnostic.code);

  const empty = backtest(inAndOut({}), [], runSettings());
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.diagnostic.code, 'OS6020');
});

/**
 * A market order priced at the next open fills at the next open.
 *
 * The same strategy under the other spelling of the one declaration field the
 * venue reads. Bar one closes at 101 and bar two opens at 101.5, so the two
 * runs cannot be confused, and the driver is what carries the declaration to the
 * venue. Catches a driver that hands the venue a default rather than what the
 * program declared.
 */
test('the declaration reaches the venue, and it is what prices a fill', () => {
  const record = ran(backtest(inAndOut({ fillOn: 'nextOpen' }), BARS, runSettings()));
  assert.equal(record.fills[0]?.price, 101.5);
  assert.equal(record.fills[1]?.price, 104.5);
  assert.equal(record.report.summary.netProfit, 6);
});

/**
 * The engine is told how many bars the run holds, and the last bar is the last
 * bar.
 *
 * `bar.isLast` is derived from the count the host states, so a driver that
 * hands over the bars so far rather than the total makes every bar the last
 * one: this strategy would flatten on the bar after its entry and the ledger
 * would carry a close for every bar of the run. Here it carries exactly two
 * rows.
 *
 * And the second half is the rule about the end of a run: the close decided on
 * the last bar is answered by the venue, and there is no boundary left to fold
 * it at. The frame is not delivered, the row stays where it stood, and the
 * trade is reported open, which is what it is. Catches a driver that folds a
 * frame after the last bar, which would settle a fill on a bar that never
 * executed.
 */
test('the last bar is the last bar, and what it sent has nowhere left to fold', () => {
  const record = ran(backtest(flatOnLast(), BARS, runSettings()));

  assert.equal(record.orders.length, 2);
  assert.deepEqual(
    record.orders.map((row) => [row.side, row.status]),
    [
      ['buy', 'filled'],
      ['sell', 'placed'],
    ],
  );
  assert.equal(record.fills.length, 1);
  assert.equal(record.report.trades.length, 1);
  assert.equal(record.report.trades[0]?.isOpen, true);
});
