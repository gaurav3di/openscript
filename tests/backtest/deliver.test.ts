/**
 * The driver that folds the frames it is handed, and answers none of its own.
 *
 * `conformance.md` section 3 says `frames.csv` supplies order frames the way
 * `bars.csv` supplies bars, so a case asserts the fold against input the engine
 * did not choose. Every frame in the suite until now was one this engine's own
 * destination answered, which is why these are written against the wrong
 * implementations that suite cannot see:
 *
 * - a driver that builds the simulated destination anyway, so an order the
 *   case's frames leave working is filled at a bar's close by a venue nobody
 *   asked, and the run is this engine's own study wearing a case's file name;
 * - a driver that delivers a row at the bar it names rather than after it,
 *   which lets a strategy act on a fill inside the bar the fill arrived at;
 * - a driver that drops a row's own instant, which leaves `updatedAt` at
 *   `placedAt` on every row whose frame arrived later than its placement, the
 *   one field the two engines disagreed on before the column existed;
 * - a destination that drops a row naming an order the ledger does not hold,
 *   which is the one row section 3 hands an engine on purpose;
 * - a destination that folds such a row into the first order it holds instead,
 *   which puts a quantity nobody reported into a real position;
 * - a driver that writes the record's frames back out of what it delivered
 *   rather than carrying the rows it was given, which spells that row's ordinal
 *   as zero and makes the record disagree with the case it was run from;
 * - a driver that records a frame as delivered at the boundary it was answered
 *   at, which reports the last bar's frames as folded when no execution
 *   followed them.
 *
 * Each of the seven was built and run against this file before it was written
 * down here: they fail five, four, one, two, one, two and one of these tests.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { backtest, backtestSupplied } from '../../src/core/backtest/index.js';
import type { RecordedFrame, RunRecord } from '../../src/core/backtest/index.js';
import { FACTS, HOUR, START, inAndOut, probeText, rising, runSettings } from './support.js';

/** Eight bars closing at 100, 101 and up, so a price names its own bar. */
const BARS = rising(8);

/** The probe: it buys on bar one and closes on bar four. */
const PROBE = { entryBar: 1, exitBar: 4, qty: 2 };

/**
 * An instant inside the boundary a row names and equal to no bar's own time.
 *
 * `host-interface.md` 7.2 makes the instant the destination's, not the bar's,
 * so a run that reproduced it from the bars would agree with every reading of
 * the field and prove none of them.
 */
const spoke = (afterBar: number): number => START + afterBar * HOUR + 500;

/** One row of `frames.csv`, with the columns a case that states none leaves absent. */
function row(
  afterBar: number,
  intent: number,
  status: string,
  filledQty: number,
  avgFillPrice: number | null,
  time: number | null = null,
): RecordedFrame {
  return { afterBar, intent, status, filledQty, avgFillPrice, orderRef: 'R1', text: '', time };
}

/** One run of the probe over the frames a case supplies. */
function over(frames: readonly RecordedFrame[]): RunRecord {
  const result = backtestSupplied(inAndOut(PROBE), BARS, runSettings(), frames, {
    sourceText: probeText(PROBE),
    instrument: FACTS,
  });
  assert.equal(result.ok, true, result.ok ? '' : result.diagnostic.message);
  if (!result.ok) throw new Error('unreachable');
  return result.record;
}

/**
 * An order the frames leave working is left working, and nothing fills it.
 *
 * The probe's entry is a market order priced at its own bar's close, so the
 * simulated destination fills it whole at 101 on the boundary it acknowledges
 * it at, the position opens, and the close on bar four sends a second order
 * that fills at 104. A driver that built that destination while a case was
 * supplying the frames produces two orders and two fills here rather than one
 * order and none, which is the first assertion below.
 */
test('a case that supplies one working frame gets one working order and no fill', () => {
  const supplied = [row(1, 1, 'working', 0, null)];
  const record = over(supplied);

  assert.equal(record.orders.length, 1);
  assert.equal(record.orders[0]?.status, 'working');
  assert.equal(record.orders[0]?.filledQty, 0);
  assert.equal(record.orders[0]?.avgFillPrice, null);
  assert.deepEqual(record.fills, []);
  // The leg never opened, so the close on bar four had no position to send an
  // order about: one row is the whole ledger.
  assert.deepEqual(record.frames, [
    {
      afterBar: 1,
      intent: 1,
      status: 'working',
      filledQty: 0,
      avgFillPrice: null,
      orderRef: 'R1',
      text: '',
      time: null,
    },
  ]);
});

/**
 * The same program, the same bars, and a destination of this engine's own.
 *
 * The guard on the test above: if the two runs agreed, a driver that ignored
 * the supplied frames would pass it, and the file would prove nothing about
 * which frames were folded.
 */
test('the simulated destination fills what the supplied frames leave working', () => {
  const result = backtest(inAndOut(PROBE), BARS, runSettings(), {
    sourceText: probeText(PROBE),
    instrument: FACTS,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('unreachable');
  assert.equal(result.record.orders.length, 2);
  assert.equal(result.record.fills.length, 2);
});

/**
 * A fill in pieces, at the boundaries the rows name, with the instants they
 * carry.
 *
 * Two readings are wrong at once here. A driver delivering a row at the bar it
 * names rather than after it settles the first piece on bar two, one bar before
 * a strategy could have known of it. And a driver dropping the row's instant
 * leaves `updatedAt` at the placement's own time, which is the one field the
 * two engines disagreed on for as long as the file carried no column for it.
 */
test('a fill in pieces folds cumulatively, at the next bar, and moves updatedAt to the row instant', () => {
  const record = over([
    row(1, 1, 'working', 0, null, spoke(1)),
    row(2, 1, 'working', 1, 101.5, spoke(2)),
    row(3, 1, 'filled', 2, 102, spoke(3)),
  ]);

  const entry = record.orders[0];
  assert.equal(entry?.status, 'filled');
  assert.equal(entry?.filledQty, 2);
  assert.equal(entry?.avgFillPrice, 102);
  assert.equal(entry?.placedAt, START + HOUR);
  assert.equal(entry?.updatedAt, spoke(3));

  assert.deepEqual(
    record.fills.map((fill) => [fill.seq, fill.units, fill.price, fill.barIndex]),
    [
      [1, 1, 101.5, 3],
      [2, 1, 102, 4],
    ],
  );
  // Both pieces had settled before bar four executed, so the close sent an
  // order for the whole position, and nothing answered it.
  assert.equal(record.orders.length, 2);
  assert.equal(record.orders[1]?.qty, 2);
  assert.equal(record.orders[1]?.status, 'placed');
});

/**
 * A row naming an order the ledger does not hold is delivered and refused.
 *
 * Section 3: an ordinal greater than the number of intents the run placed is
 * how a case hands an engine a frame naming an order its ledger does not hold.
 * A destination that dropped it would leave the engine with nothing to refuse
 * and the case asserting the ledger of a run that was never handed the row, so
 * the row travels, the fold refuses it at step 1 of `stdlib.md` 17.8, and the
 * record still says it arrived.
 */
test('a row naming an intent the run never placed changes nothing and is still recorded', () => {
  const supplied = [
    row(1, 1, 'working', 0, null, spoke(1)),
    row(2, 9, 'filled', 5, 101.5, spoke(2)),
  ];
  const record = over(supplied);

  assert.equal(record.orders.length, 1);
  assert.equal(record.orders[0]?.status, 'working');
  assert.equal(record.orders[0]?.filledQty, 0);
  assert.deepEqual(record.fills, []);
  assert.equal(record.frames.length, 2);
  assert.equal(record.frames[1]?.intent, 9);
  assert.equal(record.frames[1]?.filledQty, 5);
});

/**
 * The record carries the rows it was handed, in delivery order.
 *
 * A driver writing the record's frames out of the frames it delivered would
 * spell a row naming no intent as ordinal zero, because that is what an id no
 * run minted maps back to, and the case projected from the record would name a
 * different order than the case it was run from. The rows are input and travel
 * as they arrived.
 */
test('the frames a record carries are the rows the case supplied', () => {
  const supplied = [
    row(1, 1, 'working', 0, null, spoke(1)),
    row(2, 9, 'filled', 5, 101.5, spoke(2)),
    row(3, 1, 'filled', 2, 102, null),
  ];
  const copied = supplied.map((one) => ({ ...one }));
  const record = over(supplied);
  assert.deepEqual(record.frames, copied);
});

/**
 * A row no boundary of the run reaches folds nothing, and the record says so.
 *
 * The last bar has no execution after it, so a row naming it is not delivered
 * and is not recorded as delivered. The driver leaves the reading of such a
 * case to whoever runs it: the adapter names it `unsupported` rather than
 * running a case with part of its own input passed over.
 */
test('a row after the last bar is never delivered and never recorded', () => {
  const record = over([row(1, 1, 'working', 0, null), row(7, 1, 'filled', 2, 102)]);
  assert.equal(record.frames.length, 1);
  assert.equal(record.orders[0]?.status, 'working');
});
