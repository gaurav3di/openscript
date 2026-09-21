/**
 * A destination behaving badly on a stated schedule, driven end to end.
 *
 * These run the whole path a harvested case runs, from the settings a host
 * chose through the driver to the venue and back into the record, because the
 * schedule travels on the fill policy and a test that built a `Simulator` by
 * hand would prove the venue and not the wiring. Every case in the conformance
 * suite was harvested against a destination that filled every order whole and
 * on time, so the wrong implementations this file is written against are the
 * ones that suite cannot see: a venue that answers a scheduled order twice, a
 * partial fill reported as a delta or priced at its last piece, an ending that
 * forgets what had already filled, and a fill after a cancellation that is
 * never spoken, which is the one that leaves an account holding a position the
 * strategy cannot see (`stdlib.md` 17.8).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { backtest } from '../../src/core/backtest/index.js';
import type { RunRecord, SimulatorOptions } from '../../src/core/backtest/index.js';
import { compile } from '../engine/support.js';
import { FACTS, inAndOut, probeText, rising, runSettings } from './support.js';

/** Eight bars closing at 100, 101 and up, so a price names its own bar. */
const BARS = rising(8);

/** The policy a schedule rides on, which is the host's own choice of venue. */
type Policy = SimulatorOptions['fill'];

/** The default policy with a schedule stated on it. */
function scheduled(schedule: NonNullable<Policy['schedule']>): Policy {
  return { ...runSettings().fill, schedule };
}

/** One run of the probe under a stated schedule. */
function runWith(policy: Policy, program = inAndOut({ entryBar: 1, exitBar: 4, qty: 10 })): RunRecord {
  const result = backtest(program, BARS, runSettings({ fill: policy }), {
    sourceText: probeText({ entryBar: 1, exitBar: 4, qty: 10 }),
    instrument: FACTS,
  });
  assert.equal(result.ok, true, 'the run was refused before its first bar');
  if (!result.ok) throw new Error('unreachable');
  return result.record;
}

/** The frames about one order, in the order the venue spoke them. */
function about(record: RunRecord, intent: number): RunRecord['frames'] {
  return record.frames.filter((frame) => frame.intent === intent);
}

/**
 * An order the schedule names is answered by the schedule and by nothing else.
 *
 * Catches the implementation that leaves the ordinary path running beside the
 * schedule: the entry is a market order priced at this bar's close, so it would
 * be filled whole at 101 on the same boundary the acknowledgement was spoken
 * on, and every partial fill, rejection and expiry a schedule states would be
 * overtaken by a complete fill nobody asked for. It is the defect that makes
 * this whole file pass while proving nothing.
 */
test('a scheduled order is answered by its schedule alone', () => {
  const record = runWith(scheduled([{ order: 1, afterBars: 0, does: 'fill', units: 0 }]));

  assert.deepEqual(
    about(record, 1).map((frame) => [frame.status, frame.filledQty, frame.avgFillPrice]),
    [['working', 0, null]],
  );
  const entry = record.orders[0];
  assert.equal(entry?.status, 'working');
  assert.equal(entry?.filledQty, 0);
  // The entry never filled, so the leg is flat and the close on bar four sends
  // nothing: one row is the whole ledger.
  assert.equal(record.orders.length, 1);
  assert.deepEqual(record.fills, []);
});

/**
 * A fill in pieces is cumulative, and the average is over the cumulative
 * quantity.
 *
 * Three wrong implementations, each of which produces a plausible run:
 *
 * - a venue reporting the delta rather than the total, where the ledger's
 *   `filledQty` walks 4 then 6 and the position ends at 6 of the 10 units the
 *   strategy holds;
 * - a venue reporting the last piece's price as the average, 103 rather than
 *   102.6, which the engine takes whole because 17.8 step 3 forbids it to
 *   average two averages of its own, so the error lands in the ledger and in
 *   every trade folded from it;
 * - a row marked `filled` at the first piece, which is an order the strategy
 *   believes is done while six units are still to come.
 */
test('a partial fill is cumulative and priced over the whole of it', () => {
  const record = runWith(
    scheduled([
      { order: 1, afterBars: 0, does: 'fill', units: 0 },
      { order: 1, afterBars: 1, does: 'fill', units: 4 },
      { order: 1, afterBars: 2, does: 'fill', units: 10 },
    ]),
  );

  // Bar two closes at 102 and bar three at 103, so the average over ten units
  // is (102 * 4 + 103 * 6) / 10.
  assert.deepEqual(
    about(record, 1).map((frame) => [frame.status, frame.filledQty, frame.avgFillPrice]),
    [
      ['working', 0, null],
      ['working', 4, 102],
      ['filled', 10, 102.6],
    ],
  );
  assert.deepEqual(
    record.fills.map((fill) => [fill.units, fill.price]),
    [
      [4, 102],
      [6, 102.6],
      [10, 104],
    ],
  );
  const entry = record.orders[0];
  assert.equal(entry?.status, 'filled');
  assert.equal(entry?.filledQty, 10);
  // `stdlib.md` 17.7: `updatedAt` is when a frame last changed the row, which
  // is the boundary the last piece arrived at and not the bar that placed the
  // order. Catches an engine that never moves the field, which reads as correct
  // in every case the suite holds, because a frame there arrives at the
  // boundary that placed its own order and the two instants are one.
  assert.equal(entry?.placedAt, BARS[1]?.time);
  assert.equal(entry?.updatedAt, BARS[3]?.time);

  // And the record carries the instant of every frame it folded, which is what
  // lets a case reproduce the field above from its own input. Catches a driver
  // that drops the instant on the way into the record: the run's own ledger is
  // right either way, and the case harvested from it asserts an `updatedAt` no
  // engine reading the case back could arrive at.
  assert.deepEqual(
    about(record, 1).map((frame) => frame.time),
    [BARS[1]?.time, BARS[2]?.time, BARS[3]?.time],
  );
});

/**
 * The three endings carry the vocabulary's word, the quantity that had already
 * filled, and the destination's own text.
 *
 * Catches an ending that reports nothing filled, which loses three real units
 * and leaves the strategy flat against an account that is not; one that leaves
 * the row `working`, where the quantity that never arrived goes on being
 * counted against the position for the rest of the run; and one that drops the
 * text, which leaves a host reconciling a rejection with nothing to read.
 */
for (const [does, word] of [
  ['reject', 'rejected'],
  ['cancel', 'cancelled'],
  ['expire', 'expired'],
] as const) {
  test(`an order that ends ${word} keeps what it filled`, () => {
    const record = runWith(
      scheduled([
        { order: 1, afterBars: 0, does: 'fill', units: 3 },
        { order: 1, afterBars: 1, does, text: 'the venue said so' },
      ]),
    );

    assert.deepEqual(
      about(record, 1).map((frame) => [frame.status, frame.filledQty, frame.avgFillPrice]),
      [
        ['working', 3, 101],
        [word, 3, 101],
      ],
    );
    const entry = record.orders[0];
    assert.equal(entry?.status, word);
    assert.equal(entry?.filledQty, 3);
    assert.equal(entry?.rejection, 'the venue said so');
  });
}

/**
 * A fill after a cancellation is spoken, and the row keeps the word that ended
 * it.
 *
 * This is the cancel that raced a fill, `stdlib.md` 17.8's last paragraph, and
 * it catches the venue that consults liveness before performing an act: the
 * fill is never sent, the position never opens, and the loss is invisible from
 * inside the script because the account holds units the strategy cannot see.
 * The row stays `cancelled` while `filledQty` reaches the whole order, which is
 * the pair of facts that paragraph insists are both true.
 */
test('a fill arriving after a cancellation is folded and the status stays terminal', () => {
  const record = runWith(
    scheduled([
      { order: 1, afterBars: 0, does: 'fill', units: 0 },
      { order: 1, afterBars: 1, does: 'cancel' },
      { order: 1, afterBars: 2, does: 'fill' },
    ]),
  );

  assert.deepEqual(
    about(record, 1).map((frame) => [frame.status, frame.filledQty, frame.avgFillPrice]),
    [
      ['working', 0, null],
      ['cancelled', 0, null],
      ['filled', 10, 103],
    ],
  );
  const entry = record.orders[0];
  assert.equal(entry?.status, 'cancelled');
  assert.equal(entry?.filledQty, 10);
  assert.equal(entry?.avgFillPrice, 103);
  assert.deepEqual(
    record.fills.map((fill) => [fill.units, fill.price]),
    [
      [10, 103],
      [10, 104],
    ],
  );
});

/**
 * An act names the nth order the destination took, and a bracket is not one.
 *
 * Catches the implementation that counts intents: the bracket this probe
 * attaches is the second intent and the close is the third, so order two would
 * name the bracket, which this venue answers with nothing at all, and the
 * schedule would do nothing while the close filled as if it had never been
 * written. A schedule that quietly does nothing is worse than one that is
 * wrong, because the case harvested from it looks like every other case.
 */
test('the ordinal counts the orders taken, not the intents handed over', () => {
  const bracketed = compile('bracketed.oscript', BRACKET_PROBE).program;
  const result = backtest(bracketed, BARS, runSettings({ fill: BRACKET_SCHEDULE }), {
    sourceText: BRACKET_PROBE,
    instrument: FACTS,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('unreachable');

  const [entry, exit] = result.record.orders;
  assert.equal(result.record.orders.length, 2);
  assert.equal(entry?.status, 'filled');
  assert.equal(entry?.filledQty, 10);
  assert.equal(exit?.status, 'rejected');
  assert.equal(exit?.filledQty, 0);
  // The bracket is the second intent and is answered with nothing, so the close
  // is the second order and the third intent.
  assert.equal(exit?.intent, 3);
});

/** A probe that attaches a bracket, so an intent is not an order. */
const BRACKET_PROBE = [
  'version 1',
  '',
  'strategy("Bracket probe", capital = 100000, qty = 10, qtyType = "units",',
  '         fillOn = "close", commissionType = "perTrade", commission = 0)',
  '',
  'if bar.index == 1',
  '    buy(tag = "long")',
  '    exit(tag = "long", stop = 90, limit = 200)',
  '',
  'if bar.index == 4',
  '    close()',
  '',
  'plot(close, "Close")',
].join(String.fromCharCode(10));

/** The close refused, named as the second order this destination took. */
const BRACKET_SCHEDULE: Policy = {
  ...runSettings().fill,
  schedule: [{ order: 2, afterBars: 0, does: 'reject', text: 'no' }],
};
