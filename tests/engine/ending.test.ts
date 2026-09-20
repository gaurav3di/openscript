/**
 * A position reference ends when its quantity returns to zero, `stdlib.md` 17.7,
 * and what it reports on the way there.
 *
 * `attaching.test.ts` asks which position an order is sent against. This asks
 * the question that decides whether that answer is sound: **can every reference
 * the engine mints actually get back to zero**, and does the leg report the
 * right average entry price while more than one of them is open. A reference
 * nothing can ever close is a leak in the position book, and an average taken
 * across two positions is a price nothing was entered at.
 *
 * The last section is the honest half. Dividing a stated quantity into a closing
 * half and an opening half needs the instrument's lot size, which no leg is
 * given today (OS7005), so outside `qtyType = "units"` one shape of 17.1 is not
 * kept. What is kept in every unit, what is not, and what has to exist before it
 * can are asserted here rather than described, so that the day the lot size
 * reaches the ledger these are the tests that have to change.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROBE,
  crossings,
  ended,
  frame,
  partial,
  ran,
  ranAnswering,
  reversed,
  runFor,
  sentOn,
  settledBook,
} from './orders-support.js';

/** A leg holding two positions of opposite signs, which a rejected close makes. */
const BOTH_SIGNS = [
  ...PROBE,
  'if bar.index == 0',
  '    buy(qty = 10)',
  'if bar.index == 1',
  '    close()',
  'if bar.index == 2',
  '    sell(qty = 9)',
];
const REJECTED = { 1: [frame(1, 10, 100)], 3: [ended(2, 'rejected', 'no'), frame(3, 9, 110)] };

/**
 * Every reference the engine minted can be brought back to zero.
 *
 * The leg holds ten long on position 1 and nine short on position 2, and its net
 * is one long, so no bare close can reach more than one of them. An order on the
 * side that reduces a position, at the size that position holds, ends it: that is
 * what makes the scheme sound rather than a way of parking quantity on
 * references nobody can name again.
 *
 * Catches an implementation that attaches by whichever reference is current.
 * That one sends the sell of ten against position 2, which is short, and the buy
 * of nine against whatever it opened after that, and position 1 is never named
 * again for the life of the run.
 */
test('a reference the leg holds can always be brought back to zero', () => {
  const run = runFor([
    ...BOTH_SIGNS,
    'if bar.index == 4',
    '    sell(qty = 10)',
    'if bar.index == 6',
    '    buy(qty = 9)',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(
    ranAnswering(run, 8, { ...REJECTED, 5: [frame(4, 10, 105)], 7: [frame(5, 9, 115)] }),
    undefined,
  );
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(reversed(run), []);
  assert.deepEqual([...settledBook(run)], [[1, 0], [2, 0]], 'a position was left holding something');
  assert.equal(run.engine.column(0)[7], 0);
});

/**
 * The average entry price across two positions on one side.
 *
 * A leg holds two long positions whenever an entry arrives while the whole of an
 * earlier one is on its way out and the close is then rejected. Ten at a hundred
 * and five at a hundred and thirty is fifteen at a hundred and ten, and the leg
 * reports that: the average is over the positions, not over the last one opened
 * and not over the first.
 *
 * Catches an engine that reports the newest position's own average, which is a
 * hundred and thirty, and one that reports the oldest, which is a hundred. Both
 * are prices something was entered at, which is what makes this worth a test
 * rather than a glance.
 */
test('the average entry price is taken over the positions the leg holds', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 10)',
    'if bar.index == 1',
    '    close()',
    'if bar.index == 2',
    '    buy(qty = 5)',
    'plot(pos.avgPrice, "Avg")',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(
    ranAnswering(run, 6, { 1: [frame(1, 10, 100)], 3: [ended(2, 'rejected', 'no'), frame(3, 5, 130)] }),
    undefined,
  );
  assert.equal(run.engine.column(1)[5], 15);
  assert.equal(run.engine.column(0)[5], 110);
});

/**
 * And it is not taken across the two signs.
 *
 * The leg holds ten long at a hundred and nine short at a hundred and ten, and
 * its net is one long. Summed across both, the cost of the position on the way
 * out is subtracted from the cost of the one on the way in and the quotient is
 * ten, which is a price nothing was entered at and which every level a script
 * measures from the entry would then be measured from.
 *
 * The last round nearly shipped this and caught it by a test, and the states
 * this change makes reachable are exactly the states that produce it, so it is
 * asserted again from the path that now reaches it.
 */
test('the average entry price is not blended across the two signs', () => {
  const run = runFor([...BOTH_SIGNS, 'plot(pos.avgPrice, "Avg")', 'plot(pos.size, "Size")']);
  assert.equal(ranAnswering(run, 6, REJECTED), undefined);
  assert.equal(run.engine.column(1)[5], 1);
  assert.equal(run.engine.column(0)[5], 100);
});

/**
 * A rejection returns the quantity, and the reference it was on survives.
 *
 * The close of ten is rejected having filled nothing, so position 1 still holds
 * its ten and a later close sends them again. That is the strategy's way out of
 * a destination that refused its exit, and it is the same sentence 17.1 gives
 * for what is available to reduce, read per position.
 *
 * Catches an implementation that treats a reference as spent once an order has
 * been sent against it.
 */
test('a rejected close releases the position it was against', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 10)',
    'if bar.index == 1',
    '    close()',
    'if bar.index == 3',
    '    close()',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(
    ranAnswering(run, 6, { 1: [frame(1, 10, 100)], 2: [ended(2, 'rejected', 'no')], 4: [frame(3, 10, 105)] }),
    undefined,
  );
  assert.deepEqual(sentOn(run, 'sell'), ['10 on 1', '10 on 1'], 'the second close opened a position');
  assert.deepEqual(crossings(run), []);
  assert.equal(run.engine.column(0)[5], 0);
});

/**
 * A cancellation does the same, and a destination that never answers does not.
 *
 * The close is cancelled on bar two and the leg may close again; with nothing
 * answered at all the second close sends nothing, because the first one still
 * has the whole position going. Both halves are `closable.ts`'s rule, and they
 * are here because a reference that could not be reached again after a
 * cancellation would be a reference nothing can close.
 */
test('a cancellation releases the position and silence does not', () => {
  const lines = [
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 10)',
    'if bar.index == 1',
    '    close()',
    'if bar.index == 3',
    '    close()',
  ];
  const cancelled = runFor(lines);
  assert.equal(
    ranAnswering(cancelled, 6, { 1: [frame(1, 10, 100)], 2: [ended(2, 'cancelled')] }),
    undefined,
  );
  assert.deepEqual(sentOn(cancelled, 'sell'), ['10 on 1', '10 on 1']);

  const silent = runFor(lines);
  assert.equal(ranAnswering(silent, 6, { 1: [frame(1, 10, 100)] }), undefined);
  assert.deepEqual(sentOn(silent, 'sell'), ['10 on 1']);
  assert.deepEqual(crossings(silent), []);
});

/**
 * A close is sent against the position that has the units, not the one that is
 * already selling them.
 *
 * The leg holds ten long on position 1 with the whole of it already going, and
 * five long on position 2. What is left to close is five, and all five of it is
 * on position 2: position 1 has nothing a close may send, because everything it
 * holds is in an order the destination still has.
 *
 * Catches a per-position ceiling taken from what settled alone. That one offers
 * the close ten units against position 1, sends the five there, and when the
 * first close is finally answered position 1 has been sold fifteen against a buy
 * of ten and settles five short having opened long.
 */
test('a close sends against the position that has the units', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 10)',
    'if bar.index == 1',
    '    close()',
    'if bar.index == 2',
    '    buy(qty = 5)',
    'if bar.index == 4',
    '    close()',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(
    ranAnswering(run, 8, {
      1: [frame(1, 10, 100)],
      3: [frame(3, 5, 120)],
      6: [frame(2, 10, 105), frame(4, 5, 125)],
    }),
    undefined,
  );
  assert.deepEqual(sentOn(run, 'sell'), ['10 on 1', '5 on 2']);
  assert.deepEqual(reversed(run), []);
  assert.deepEqual([...settledBook(run)], [[1, 0], [2, 0]]);
  assert.equal(run.engine.column(0)[7], 0);

  // The same ceiling with part of position 1 going rather than the whole of it.
  // Ten long with four working leaves six, and the close is six there and five
  // on the other position. A ceiling taken from what settled alone sends ten,
  // which is fourteen sold against a buy of ten.
  const part = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 10)',
    'if bar.index == 1',
    '    close()',
    'if bar.index == 2',
    '    buy(qty = 5)',
    'if bar.index == 4',
    '    close(qty = 4)',
    'if bar.index == 6',
    '    close()',
  ]);
  assert.equal(
    ranAnswering(part, 8, { 1: [frame(1, 10, 100)], 3: [frame(3, 5, 120), ended(2, 'cancelled')] }),
    undefined,
  );
  assert.deepEqual(sentOn(part, 'sell'), ['10 on 1', '4 on 1', '6 on 1', '5 on 2']);
});

/**
 * A close is held to what an entry on the same side is already bringing.
 *
 * `buy(qty = 5)` is unanswered and the sells after it took the leg twelve short,
 * so that buy is a reduction now whatever it was when it left, and five of the
 * twelve are already on their way. What is left for a close to send is seven,
 * and a close stating twelve is a false claim about the strategy's own position.
 *
 * Catches a count that reads the record rather than the direction, which is what
 * `committed` did: it counted only the rows that carried a reduction when they
 * were sent, offered the close the whole twelve, and then the per-position
 * ceilings sent seven of it, so the script was told its claim was true and seven
 * of twelve arrived.
 */
test('a close is held to what an entry on the same side is already bringing', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 5)',
    'if bar.index == 1',
    '    sell(qty = 12)',
    'if bar.index == 3',
    '    close(qty = 12)',
  ]);
  const refused = ranAnswering(run, 5, { 2: [frame(2, 5, 100), frame(3, 7, 100)] });
  assert.equal(refused?.code, 'OS7017');
  assert.equal(refused?.values['held'], 7, 'the buy still going was not held back');
  assert.deepEqual(sentOn(run, 'sell'), ['5 on 1', '7 on 2']);
});

/**
 * And a position is held to the same reading, one scope in.
 *
 * Position 1 settled five short with a buy of five still going into it, so
 * nothing of it is a close's to send; position 2 settled eleven short and the
 * whole eleven are. The buy that is still going was an entry when it left and
 * carries no record of reducing anything, and a ceiling that read the record
 * offered the close three units of position 1 as well.
 *
 * The state is reached the way a destination reaches it: an entry partly filled,
 * a second entry rejected, and an opposing order that was divided against both
 * of them before either was answered.
 */
test('what is working against a position is what it holds now', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 7)',
    'if bar.index == 1',
    '    buy(qty = 2)',
    'if bar.index == 2',
    '    sell(qty = 20)',
    'if bar.index == 4',
    '    close()',
  ]);
  assert.equal(
    ranAnswering(run, 6, {
      3: [partial(1, 2, 100), ended(2, 'rejected', 'no'), partial(3, 7, 100), frame(4, 11, 100)],
    }),
    undefined,
  );
  assert.deepEqual(sentOn(run, 'sell'), ['9 on 1', '11 on 2']);
  assert.deepEqual(sentOn(run, 'buy'), ['7 on 1', '2 on 1', '11 on 2']);
});

/**
 * The reference is minted in every unit, and now before anything has settled.
 *
 * Outside `"units"` the engine cannot divide a stated quantity into the half
 * that closes and the half that opens, and minting a reference needs none of
 * that arithmetic. What was missing is the case this whole change is about: with
 * the destination silent the leg's settled net read zero, the opposing entry was
 * not seen as opposing anything, and both orders went on reference 1 in lots, in
 * cash and in an equity percent alike. `crossings` sees it, because both orders
 * of that reference state the same unit.
 */
test('an opposing entry never carries the outgoing reference, answered or not', () => {
  for (const qtyType of ['units', 'lots', 'cash', 'equityPercent']) {
    const run = runFor([
      'version 1',
      `strategy("Probe", qty = 2, pyramiding = 50, qtyType = "${qtyType}")`,
      'if bar.index == 0',
      '    buy(qty = 3)',
      'if bar.index == 1',
      '    sell(qty = 9)',
    ]);
    assert.equal(ranAnswering(run, 3, {}), undefined, qtyType);
    assert.deepEqual(crossings(run), [], qtyType);
    const entry = run.sent.find((one) => one.side === 'buy');
    const opposing = run.sent.filter((one) => one.side === 'sell');
    assert.ok(opposing.length > 0, qtyType);
    assert.notEqual(
      opposing[opposing.length - 1]?.positionRef,
      entry?.positionRef,
      `under ${qtyType} the replacement carried the position it replaced`,
    );
  }
});

/**
 * What that costs outside units, and what it no longer costs.
 *
 * **The outgoing position is named again.** A close works its own quantity out
 * in units, so it is divided across the positions holding the leg's own side,
 * oldest first, and the position the crossing entry left behind is one of them:
 * here three units come off reference 1 and it returns to zero, which is 17.7's
 * sentence happening for a reference that before this was never named a second
 * time for the life of the run.
 *
 * **What is still not kept** is the instruction itself. The entry is sent whole
 * on a reference of its own, so the outgoing position is left holding what it
 * holds, and a bare close reaches it only while the leg's net is on that
 * position's side. In the second run the net comes back to zero with reference 1
 * three long and reference 2 three short, and neither can be closed by a close
 * again. That is the one shape of 17.1 an engine does not keep, it waits on the
 * instrument's lot size, and OS7005 says so where a reader meets it.
 */
test('outside units the outgoing position can be closed, and an instruction cannot close it', () => {
  const lots = ['version 1', 'strategy("Probe", qty = 2, pyramiding = 50, qtyType = "lots")'];

  const reached = runFor([
    ...lots,
    'if bar.index == 0',
    '    buy(qty = 3)',
    'if bar.index == 2',
    '    sell(qty = 9)',
    'if bar.index == 4',
    '    buy(qty = 12)',
    'if bar.index == 6',
    '    close()',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(ran(reached, 8), undefined);
  assert.deepEqual(sentOn(reached, 'sell'), ['9 on 2', '3 on 1', '3 on 3']);
  assert.equal(settledBook(reached).get(1), 0, 'the outgoing position never returned to zero');
  assert.equal(reached.engine.column(0)[7], 0);

  const left = runFor([
    ...lots,
    'if bar.index == 0',
    '    buy(qty = 3)',
    'if bar.index == 2',
    '    sell(qty = 9)',
    'if bar.index == 4',
    '    close()',
    'if bar.index == 6',
    '    close()',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(ran(left, 8), undefined);
  assert.equal(left.engine.column(0)[7], 0, 'the leg did not end flat');
  // The leg is flat and two positions are still open, three long and three
  // short. This is the deferral, asserted: when the lot size reaches the ledger
  // the entry is two orders and this book is empty.
  assert.deepEqual([...settledBook(left)], [[1, 3], [2, -3]]);
});
