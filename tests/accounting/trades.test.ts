/**
 * Round trips, folded from the fills a run settled.
 *
 * Every test here is written against a wrong implementation that is easy to
 * write and hard to notice, and the comment above each one names it. The four
 * that matter most are the four this repository has already paid for in another
 * form.
 *
 * **Pairing by anything but the position reference.** A reversal sends two
 * orders with the same tag on the same bar, one closing what is held and one
 * opening its replacement, and a fold keyed on the tag or the leg folds them
 * into a single trade whose quantity nothing was ever entered at. Five closed
 * defects in the ledger were one form of this mistake: reading a leg's net
 * where the question was about a position.
 *
 * **Closing a trade on the first reducing fill.** A partial close reduces and
 * leaves the trade open, and an implementation that ends the trade there splits
 * one round trip into two and reports the second as an entry at the exit price.
 *
 * **Letting a reduction move the average.** The position book keeps the average
 * across a reduction on purpose, so what remains is still the average of what
 * was bought. A fold that averages every fill it sees reports an entry at a
 * price nothing was entered at, and then measures the excursion from it.
 *
 * **Marking a bar's close before the fills that happened during that bar.** The
 * excursion is at the closes between the fill that opened the trade and the
 * fill that closed it, and a fold that marks first credits every trade with the
 * close of the bar it was closed on, which is a bar it ended holding nothing.
 *
 * Each of the four was written into the fold, and the test named above it
 * failed, before this file was left as it stands.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { tradesOf } from '../../src/core/accounting/index.js';
import type {
  BarMark,
  Contract,
  Money,
  RecordedFill,
  Trade,
} from '../../src/core/accounting/index.js';
import { portabilityProblems } from './support.js';

/** 2020-01-01T00:00:00Z, and a day, so a bar time is a number and not a clock. */
const T0 = 1_577_836_800_000;
const DAY = 86_400_000;

function timeOf(bar: number): number {
  return T0 + bar * DAY;
}

const CONTRACT: Contract = {
  symbol: 'AAA',
  exchange: 'XX',
  currency: 'CUR',
  tickSize: 0.05,
  lotSize: 1,
  pointValue: 1,
  digits: 2,
};

/** No cost model at all, which is what an empty schedule comes to. */
const FREE: readonly Money[] = [];

/**
 * A run of settled fills, sized the way the position book sizes them.
 *
 * The helper carries the signed size of each reference so a test writes what
 * the strategy did rather than the arithmetic of what it held. `units` is
 * signed here and positive on the fill, which is the shape a fill has.
 */
interface Book {
  readonly fills: RecordedFill[];
  move(ref: number, units: number, price: number, bar: number): void;
}

function book(): Book {
  const size = new Map<number, number>();
  const fills: RecordedFill[] = [];
  return {
    fills,
    move(ref, units, price, bar) {
      const before = size.get(ref) ?? 0;
      const after = before + units;
      size.set(ref, after);
      const seq = fills.length + 1;
      fills.push({
        seq,
        intentId: seq,
        orderRef: `o${seq}`,
        tag: 'trade',
        positionRef: ref,
        side: units > 0 ? 'buy' : 'sell',
        units: Math.abs(units),
        price,
        barIndex: bar,
        barTime: timeOf(bar),
        refSizeBefore: before,
        refSizeAfter: after,
      });
    },
  };
}

/** One close per bar, from bar zero, all inside the report window. */
function marks(closes: readonly (number | null)[]): readonly BarMark[] {
  return closes.map((close, barIndex) => ({
    barIndex,
    time: timeOf(barIndex),
    close,
    inReport: true,
  }));
}

function at(trades: readonly Trade[], index: number): Trade {
  const trade = trades[index];
  assert.ok(trade !== undefined, `there is no trade ${index}`);
  return trade;
}

// Catches a fold that never closes a trade, one that reports the entry and the
// exit the wrong way round, and one that counts the bars held from bar zero.
test('a buy closed by a sell is one round trip on one reference', () => {
  const run = book();
  run.move(1, 10, 100, 0);
  run.move(1, -10, 110, 2);

  const trades = tradesOf(run.fills, FREE, marks([100, 105, 110]), CONTRACT);
  assert.equal(trades.length, 1);
  const trade = at(trades, 0);
  assert.equal(trade.index, 1);
  assert.equal(trade.positionRef, 1);
  assert.equal(trade.side, 'long');
  assert.equal(trade.units, 10);
  assert.equal(trade.entryPrice, 100);
  assert.equal(trade.exitPrice, 110);
  assert.equal(trade.entries, 1);
  assert.equal(trade.exits, 1);
  assert.equal(trade.grossProfit, 100);
  assert.equal(trade.netProfit, 100);
  assert.equal(trade.isOpen, false);
  assert.equal(trade.openedOnBar, 0);
  assert.equal(trade.closedOnBar, 2);
  assert.equal(trade.openedAt, timeOf(0));
  assert.equal(trade.closedAt, timeOf(2));
  assert.equal(trade.barsHeld, 2);
});

// Catches a fold that opens a second trade on the second entry, and one that
// averages the two entry prices without weighting them: 105 rather than 107.5,
// which reports six hundred where five hundred was made.
test('a pyramided entry is one trade entered at the quantity weighted price', () => {
  const run = book();
  run.move(1, 10, 100, 0);
  run.move(1, 30, 110, 1);
  run.move(1, -40, 120, 3);

  const trades = tradesOf(run.fills, FREE, marks([100, 110, 115, 120]), CONTRACT);
  assert.equal(trades.length, 1);
  const trade = at(trades, 0);
  assert.equal(trade.entries, 2);
  assert.equal(trade.units, 40);
  assert.equal(trade.entryPrice, 107.5);
  assert.equal(trade.exits, 1);
  assert.equal(trade.grossProfit, 500);
});

// Catches a fold that ends the trade on the first reducing fill, which reports
// two trades, an exit price of 110 and forty of profit instead of two hundred
// and twenty.
test('a partial close leaves the trade open and weights the exit price', () => {
  const run = book();
  run.move(1, 10, 100, 0);
  run.move(1, -4, 110, 1);
  run.move(1, -6, 130, 2);

  const trades = tradesOf(run.fills, FREE, marks([100, 110, 130]), CONTRACT);
  assert.equal(trades.length, 1);
  const trade = at(trades, 0);
  assert.equal(trade.exits, 2);
  assert.equal(trade.exitPrice, 122);
  assert.equal(trade.units, 10);
  assert.equal(trade.grossProfit, 220);
  assert.equal(trade.closedOnBar, 2);
  assert.equal(trade.isOpen, false);
});

// Catches a fold that subtracts the entry from the exit whatever side the trade
// was, which reports a loss of a hundred on a short that made one.
test('a short round trip makes money when the price falls', () => {
  const run = book();
  run.move(1, -10, 100, 0);
  run.move(1, 10, 90, 2);

  const trades = tradesOf(run.fills, FREE, marks([100, 95, 90]), CONTRACT);
  const trade = at(trades, 0);
  assert.equal(trade.side, 'short');
  assert.equal(trade.units, 10);
  assert.equal(trade.grossProfit, 100);
  assert.equal(trade.isOpen, false);
});

// Catches a fold keyed on the tag or the leg rather than the position
// reference. Both orders carry the same tag and land on the same bar, and the
// replacement settles first, so a fold that pairs a fill with whatever the leg
// holds now pyramids the new short onto the long it was meant to replace.
test('a reversal is two trades, because it is two position references', () => {
  const run = book();
  run.move(1, 10, 100, 0);
  run.move(2, -10, 110, 1);
  run.move(1, -10, 110, 1);

  const trades = tradesOf(run.fills, FREE, marks([100, 110]), CONTRACT);
  assert.equal(trades.length, 2);
  const closed = at(trades, 0);
  assert.equal(closed.positionRef, 1);
  assert.equal(closed.side, 'long');
  assert.equal(closed.grossProfit, 100);
  assert.equal(closed.isOpen, false);
  const opened = at(trades, 1);
  assert.equal(opened.index, 2);
  assert.equal(opened.positionRef, 2);
  assert.equal(opened.side, 'short');
  assert.equal(opened.units, 10);
  assert.equal(opened.isOpen, true);
});

// Catches a fold that reads a fill through zero as an ordinary reduction. That
// one reports a single trade that exited twenty five units having entered ten,
// and loses the fifteen the account is now short.
test('a fill through zero closes one trade and opens another on that reference', () => {
  const run = book();
  run.move(1, 10, 100, 0);
  run.move(1, -25, 120, 1);

  const trades = tradesOf(run.fills, FREE, marks([100, 120]), CONTRACT);
  assert.equal(trades.length, 2);
  const closed = at(trades, 0);
  assert.equal(closed.units, 10);
  assert.equal(closed.exitPrice, 120);
  assert.equal(closed.grossProfit, 200);
  assert.equal(closed.closedOnBar, 1);
  assert.equal(closed.isOpen, false);
  const opened = at(trades, 1);
  assert.equal(opened.positionRef, 1);
  assert.equal(opened.side, 'short');
  assert.equal(opened.units, 15);
  assert.equal(opened.entryPrice, 120);
  assert.equal(opened.entries, 1);
  assert.equal(opened.exits, 0);
  assert.equal(opened.exitPrice, null);
  assert.equal(opened.grossProfit, 0);
  assert.equal(opened.openedOnBar, 1);
  assert.equal(opened.isOpen, true);
});

// Catches a fold that closes whatever is still open at the last bar, which is
// the shortcut that turns an open position into a trade counted in the win
// rate, and one that leaves an open trade out of the list altogether.
test('a reference still holding at the last bar is an open trade', () => {
  const run = book();
  run.move(1, 10, 100, 0);

  const trades = tradesOf(run.fills, FREE, marks([100, 105, 108]), CONTRACT);
  assert.equal(trades.length, 1);
  const trade = at(trades, 0);
  assert.equal(trade.isOpen, true);
  assert.equal(trade.closedOnBar, null);
  assert.equal(trade.closedAt, null);
  assert.equal(trade.barsHeld, null);
  assert.equal(trade.exitPrice, null);
  assert.equal(trade.exits, 0);
  assert.equal(trade.grossProfit, 0);
});

// Catches a fold that takes the gross over the units entered rather than the
// units that have left. On a trade half closed it reports a hundred of profit
// where forty has been realised.
test('an open trade reports what its exits realised and no more', () => {
  const run = book();
  run.move(1, 10, 100, 0);
  run.move(1, -4, 110, 1);

  const trades = tradesOf(run.fills, FREE, marks([100, 110]), CONTRACT);
  const trade = at(trades, 0);
  assert.equal(trade.isOpen, true);
  assert.equal(trade.units, 10);
  assert.equal(trade.exitPrice, 110);
  assert.equal(trade.grossProfit, 40);
});

// Catches a fold that attributes every charge to the trade a fill opened, which
// loses the exit's charge, and one that splits a charge across the two trades a
// crossing fill touches, which rounds it a second time.
test('a charge lands whole on the trade its fill belongs to', () => {
  const run = book();
  run.move(1, 10, 100, 0);
  run.move(1, -25, 120, 1);
  const charges: readonly Money[] = [5, 9];

  const trades = tradesOf(run.fills, charges, marks([100, 120]), CONTRACT);
  const closed = at(trades, 0);
  assert.equal(closed.charges, 14);
  assert.equal(closed.netProfit, 186);
  const opened = at(trades, 1);
  assert.equal(opened.charges, 0);
  assert.equal(opened.netProfit, 0);

  const paid = trades.reduce((total, trade) => total + trade.charges, 0);
  assert.equal(paid, charges.reduce((total, charge) => total + charge, 0));
});

// Catches a fold that marks a bar's close before the fills that happened during
// it are folded. The trade is then credited with the close of the bar that
// closed it, a thousand rather than fifty, on a bar it ended holding nothing.
// The closes before it opened are a guard against a fold that walks every mark
// it is handed rather than the ones the trade was open for.
test('the excursion is measured at the closes the trade was open for', () => {
  const run = book();
  run.move(1, 10, 100, 2);
  run.move(1, -10, 110, 4);

  const trades = tradesOf(run.fills, FREE, marks([500, 500, 105, 90, 200, 300]), CONTRACT);
  const trade = at(trades, 0);
  assert.equal(trade.maxFavourable, 50);
  assert.equal(trade.maxAdverse, -100);
  assert.equal(trade.grossProfit, 100);
});

// Catches a fold that reads an absent close as zero, which marks the position
// at a total loss on a bar the host simply had no price for.
test('a bar with no close marks nothing', () => {
  const run = book();
  run.move(1, 10, 100, 0);

  const trades = tradesOf(run.fills, FREE, marks([null, 120]), CONTRACT);
  const trade = at(trades, 0);
  assert.equal(trade.maxFavourable, 200);
  assert.equal(trade.maxAdverse, 0);
});

// Catches a fold that averages every fill into one running cost. Taking the
// reducing fill into the average leaves five units at an average of zero, which
// reports an entry at no price and an excursion of a thousand.
test('a reduction moves neither the entry price nor the excursion basis', () => {
  const run = book();
  run.move(1, 10, 100, 0);
  run.move(1, -5, 200, 1);

  const trades = tradesOf(run.fills, FREE, marks([100, 200, 100]), CONTRACT);
  const trade = at(trades, 0);
  assert.equal(trade.entryPrice, 100);
  assert.equal(trade.units, 10);
  assert.equal(trade.maxFavourable, 500);
  assert.equal(trade.maxAdverse, 0);
});

// Catches a fold that reads the fills in the order it was handed them. Reversed,
// the exit arrives first against a reference nothing has opened, and a fold that
// took the array's order would drop it and report the entry as still open.
test('the fills are read in seq order whatever order they arrive in', () => {
  const run = book();
  run.move(1, 10, 100, 0);
  run.move(1, -10, 110, 2);
  const bars = marks([100, 105, 110]);

  const asFolded = tradesOf(run.fills, [2, 3], bars, CONTRACT);
  const shuffled = run.fills.slice().reverse();
  const asHanded = tradesOf(shuffled, [3, 2], bars, CONTRACT);
  assert.deepEqual(asHanded, asFolded);
  assert.equal(at(asFolded, 0).netProfit, 95);
});

// Catches a fold that leaves the point value out, which reports a hundred on a
// contract where a point is worth fifty.
test('the contract point value multiplies every figure in money', () => {
  const run = book();
  run.move(1, 10, 100, 0);
  run.move(1, -10, 110, 2);

  const contract: Contract = { ...CONTRACT, pointValue: 50 };
  const trades = tradesOf(run.fills, [100], marks([100, 90, 110]), contract);
  const trade = at(trades, 0);
  assert.equal(trade.grossProfit, 5000);
  assert.equal(trade.netProfit, 4900);
  assert.equal(trade.maxAdverse, -5000);
});

// Catches a fold that divides by a quantity it has not got: an open trade with
// no exits gives a not a number exit price, which JSON writes down as null and
// a reader reads as an exit that happened.
test('every trade is written down as plain data', () => {
  const run = book();
  run.move(1, 10, 100, 0);
  run.move(1, -25, 120, 1);
  run.move(2, 5, 90, 2);

  const trades = tradesOf(run.fills, [1, 2, 3], marks([100, 120, 90]), CONTRACT);
  assert.equal(trades.length, 3);
  assert.deepEqual(portabilityProblems(trades, 'the trades'), []);
});
