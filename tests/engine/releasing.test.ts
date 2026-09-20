/**
 * What releases an order that is working, and what a leg holds while one is.
 *
 * The other half of `working.test.ts`. That file asserts that a reducing order
 * is not sent twice; this one asserts that what it is holding comes back, which
 * is the failure in the opposite direction and is just as expensive. A rule that
 * never released would leave a strategy whose close was refused holding a
 * position with no way to flatten it, and the documented way out, `cancel()`,
 * would be no way out at all.
 *
 * Three things release, and each is a frame the destination sends:
 *
 *   - a fill, which releases the part of the order that filled, because those
 *     units have already moved the leg,
 *   - a rejection, a cancellation or an expiry, which ends the row and releases
 *     the rest, because nothing more is coming from it,
 *   - and nothing else. An order the destination has not answered keeps holding.
 *
 * Beside them, what a leg holds while an opposing order is outstanding. It holds
 * more than one position, and the price it reports for its entry is the price of
 * the positions making up its net rather than a quotient over all of them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { OrderIntent } from '../../src/core/engine/index.js';
import {
  PROBE,
  crossings,
  ended,
  frame,
  partial,
  quantities,
  ranAnswering,
  references,
  runFor,
  total,
} from './orders-support.js';

/** The exit every strategy has in it, with the entry acknowledged and nothing else. */
const EXIT = [
  ...PROBE,
  'if bar.index == 0',
  '    buy(qty = 3)',
  'if bar.index > 0 and pos.size > 0',
  '    close()',
  'plot(pos.size, "Size")',
];

/**
 * The partial fill, which is why the remainder is the number and not the order.
 *
 * Three sold with one filled leaves two working, so the next close sends two
 * and the one after it sends one. Catches an implementation that counts a
 * working order as the whole quantity it was sent with, which sends nothing
 * ever again and leaves two units on; and one that counts it as nothing, which
 * is the defect itself.
 */
test('partial fills in sequence close the leg exactly once over', () => {
  const run = runFor(EXIT);
  assert.equal(
    ranAnswering(run, 9, {
      1: [frame(1, 3, 100)],
      2: [frame(2, 1, 101)],
      3: [frame(3, 1, 102)],
      4: [frame(4, 1, 103)],
    }),
    undefined,
  );
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [3, 2, 1]);
  assert.equal(total(run, 'sell'), 6, 'the three closes sent more than the leg ever held');
  assert.equal(run.engine.column(0)[8], 0, 'the leg did not end flat');
});

/**
 * A destination that reports a partial fill and keeps the order alive.
 *
 * The same arithmetic through the other frame a host may send: `working` with a
 * non-zero filled quantity is ordinary traffic (`host-interface.md` 7.2), and
 * what is still going is the difference. One unit settles, the leg reads two,
 * two are still working, and nothing more is sent.
 */
test('a close left working after a partial fill holds the rest of itself', () => {
  const run = runFor(EXIT);
  assert.equal(
    ranAnswering(run, 8, { 1: [frame(1, 3, 100)], 3: [partial(2, 1, 101)], 5: [partial(2, 2, 101)] }),
    undefined,
  );
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [3], 'the remainder was not counted');
  assert.deepEqual(run.engine.column(0).slice(3), [2, 2, 1, 1, 1]);
});

/**
 * A rejection releases what it was holding, and the script may close again.
 *
 * The row ends, nothing more is coming from it, and the strategy is free. An
 * implementation that counted every reducing order ever sent would leave this
 * strategy holding three long with no way to flatten, which is the opposite
 * failure and just as expensive.
 */
test('a rejected close is sent again on the next bar that asks', () => {
  const run = runFor(EXIT);
  assert.equal(
    ranAnswering(run, 8, { 1: [frame(1, 3, 100)], 4: [ended(2, 'rejected', 'no margin')] }),
    undefined,
  );
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [3, 3]);
  const sells = run.sent.filter((one) => one.side === 'sell') as OrderIntent[];
  assert.equal(sells[0]?.bar.index, 1);
  assert.equal(sells[1]?.bar.index, 4, 'the refusal came back on bar 4 and nothing followed it');
});

/**
 * The way out of a destination that never answers at all.
 *
 * With nothing acknowledged the strategy cannot close again, which is right: it
 * already has a close working. `cancel` is what a script writes instead, and
 * this asserts it works end to end, because a rule that held the units forever
 * would make the documented escape no escape at all.
 */
test('cancel releases a working close, so the next close is sent', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 3, tag = "e")',
    'if bar.index == 2',
    '    close(tag = "e")',
    'if bar.index == 4',
    '    cancel("e")',
    'if bar.index == 6 and pos.size > 0',
    '    close()',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(
    ranAnswering(run, 9, { 1: [frame(1, 3, 100)], 6: [ended(2, 'cancelled')] }),
    undefined,
  );
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [3, 3]);
  assert.deepEqual(references(run, 'sell'), [1, 1], 'the second close left its own position');
});

/**
 * A destination that filled more than the order asked for.
 *
 * The leg goes through zero on the fill rather than on the order, which is
 * 17.8's reading of what the account now holds, and the close after it reduces
 * the new position rather than sending the old one again. Catches a count that
 * reads the leg's magnitude without its sign.
 */
test('a destination that overfills leaves a position the next close reduces', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 3)',
    'if bar.index == 2',
    '    close()',
    'if bar.index >= 4 and not pos.isFlat',
    '    close()',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(ranAnswering(run, 8, { 1: [frame(1, 3, 100)], 3: [frame(2, 5, 110)] }), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [3]);
  assert.deepEqual(quantities(run, 'buy'), [3, 2], 'the overfill left two short and it was closed');
  assert.deepEqual(references(run, 'buy'), [1, 1]);
  assert.equal(run.engine.column(0)[7], -2, 'the closing buy was never answered, so nothing settled');
});

/**
 * The entry price of a leg that holds two positions at once.
 *
 * A leg holds more than one whenever an opposing order is outstanding: during a
 * flip it holds the outgoing position and its replacement, and where the engine
 * could not size the opposing order it holds the position that order opened
 * beside the one it was meant to replace. Summed across both, the cost of a
 * position on its way out is subtracted from the cost of the one on its way in
 * and the quotient is a price nothing was entered at. Catches an average taken
 * over every position the leg has open: on these numbers it reports 70, and
 * every level a script measures from the entry would be measured from that.
 */
test('the entry price of a leg is averaged over the side the leg holds', () => {
  const run = runFor([
    'version 1',
    'strategy("Probe", qty = 2, pyramiding = 50, qtyType = "lots")',
    'if bar.index == 1',
    '    buy(qty = 12)',
    'if bar.index == 3',
    '    sell(qty = 9)',
    'plot(pos.size, "Size")',
    'plot(pos.avgPrice, "Entry")',
  ]);
  // The host fills in units, twenty five to the lot, which is the whole point:
  // a position is in units and a stated quantity is in lots.
  assert.equal(
    ranAnswering(run, 6, { 2: [frame(1, 300, 100)], 4: [frame(2, 225, 110)] }),
    undefined,
  );
  assert.deepEqual(crossings(run), []);
  assert.equal(run.engine.column(0)[5], 75, 'the leg holds three hundred less two hundred and twenty five');
  assert.equal(run.engine.column(1)[5], 100, 'the closing fill moved the entry price');
});

/**
 * A partial fill on a close that leaves some of the leg unspoken for.
 *
 * The one shape where the unfilled remainder and the whole order give different
 * numbers, which is what makes it the test for the arithmetic. Five long, two
 * asked for, one filled: the leg reads four, one is still going, and what is
 * left to close is three. Catches an implementation that counts the order it
 * sent rather than what has not filled of it, which answers two and leaves a
 * unit of the leg on with nothing working against it.
 */
test('a partially filled close holds only what has not filled', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 5)',
    'if bar.index == 2',
    '    close(qty = 2)',
    'if bar.index == 4',
    '    close()',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(ranAnswering(run, 7, { 1: [frame(1, 5, 100)], 4: [partial(2, 1, 101)] }), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [2, 3]);
  assert.equal(total(run, 'sell'), 5, 'the two closes did not add up to the leg');
});

/**
 * A working order on the side the leg no longer reduces from.
 *
 * The leg flipped short while the old sell was still going, so that sell is now
 * adding to the leg rather than taking from it and it holds nothing back from a
 * buy. Catches an implementation that subtracts every working reducing order
 * whatever side it is on: that one answers zero here and leaves the strategy
 * unable to close a short it is carrying, which is the opposite failure to the
 * one this file is about and reachable from the same script.
 */
test('a working sell holds nothing back once the leg is short', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 3)',
    'if bar.index == 2',
    '    close()',
    'if bar.index == 3',
    '    sell(qty = 5)',
    'if bar.index >= 5 and pos.size < 0',
    '    close()',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(ranAnswering(run, 8, { 1: [frame(1, 3, 100)], 5: [frame(3, 5, 105)] }), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'buy'), [3, 2], 'the short could not be closed');
  assert.deepEqual(quantities(run, 'sell'), [3, 5]);
});
