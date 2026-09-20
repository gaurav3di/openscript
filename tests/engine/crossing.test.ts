/**
 * No order crosses zero, on every path a bar can reach it from.
 *
 * `stdlib.md` 17.1 states it without qualification, and the engine held it on
 * the paths that had been tried. Issue 0013 closed the half a script reaches by
 * writing a quantity. Issue 0016 is the half that needs no quantity at all:
 *
 *     if bar.index == 2
 *         close()
 *         close()
 *
 * sent two sells of three against a leg holding three long, under one position
 * reference. The destination netted three short, the ledger folded to minus
 * three, and nothing was said. A position is folded from settled fills and from
 * nothing else, which is right, so the second close measured against the same
 * position the first one did.
 *
 * **Every assertion here is on the destination.** A fix that refused the second
 * close and a fix that sized it against what is left are both acceptable
 * answers to 0016, so a test that asserted the diagnostic alone would hold one
 * of them and fail the other. What both answers have to produce is a
 * destination that was never handed an order taking a position through zero,
 * which is what `crossings` below measures: it walks the intents in the order
 * they were handed over and reports any order that takes its own position
 * reference from one sign to the other.
 *
 * The three properties, each asserted rather than described:
 *
 *   - the orders one bar sends never sum past the position they are reducing,
 *   - a leg is never left short after a call named `close`, on any path,
 *   - an entry that crosses sends two orders with two position references.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { Diagnostic } from '../../src/core/index.js';
import type { HostBar, OrderFrame, OrderIntent } from '../../src/core/engine/index.js';
import { Engine } from '../../src/core/engine/index.js';
import { HOST, running, timeOf } from './support.js';

const CONFIRMED = { isConfirmed: true };
const MOVING = { isConfirmed: false };

interface Run {
  readonly engine: Engine;
  /** Every intent the destination was handed, which is the whole of what it saw. */
  readonly sent: OrderIntent[];
}

function runFor(lines: readonly string[]): Run {
  const sent: OrderIntent[] = [];
  const engine = running(lines.join('\n'), {
    host: {
      ...HOST,
      route: (effect) => {
        for (const intent of effect.intents) sent.push(intent);
      },
    },
  });
  return { engine, sent };
}

/** A bar at one price, dated so that a series stays strictly increasing. */
function at(index: number, close: number): HostBar {
  return { open: close, high: close, low: close, close, volume: 1, time: timeOf(index) };
}

function frame(intentId: number, filledQty: number, price: number): OrderFrame {
  return { intentId, status: 'filled', filledQty, avgFillPrice: price };
}

/** Runs bars until one fails, filling every order the bar sent. */
function ran(run: Run, bars: number): Diagnostic | undefined {
  let answered = 0;
  for (let index = 0; index < bars; index += 1) {
    while (answered < run.sent.length) {
      const intent = run.sent[answered] as OrderIntent;
      answered += 1;
      if (intent.kind !== 'place' || intent.qty === null) continue;
      run.engine.deliver(frame(intent.intentId, intent.qty, 100));
    }
    const result = run.engine.append(at(index, 100 + index), CONFIRMED, bars);
    if (result.diagnostic !== undefined) return result.diagnostic;
  }
  return undefined;
}

/**
 * Every order the destination was handed that takes a position through zero.
 *
 * The property itself, and the whole of what a host can see. Each intent
 * carries the position reference it settles (`host-interface.md` 7.1), so the
 * orders of one reference are one position's own book: an order that takes that
 * book from long to short, or from short to long, is an order that crossed
 * zero. Filling is not needed and is not done here, because the defect is in
 * what was sent rather than in what came back.
 *
 * Quantities are compared as numbers, which they are only where the declaration
 * counts in units. A bar that mixes a quantity stated in lots with one the
 * engine worked out in units is two kinds of number, and the tests about those
 * declarations say what they assert instead.
 */
function crossings(run: Run): readonly string[] {
  const book = new Map<number, number>();
  const found: string[] = [];
  for (const intent of run.sent) {
    if (intent.kind !== 'place' || intent.qty === null || intent.side === null) continue;
    const units = intent.side === 'buy' ? intent.qty : -intent.qty;
    const before = book.get(intent.positionRef) ?? 0;
    const after = before + units;
    if (before !== 0 && after !== 0 && Math.sign(after) !== Math.sign(before)) {
      found.push(
        `position ${intent.positionRef} held ${before} and was sent ${units} on bar ` +
          `${intent.bar.index}`,
      );
    }
    book.set(intent.positionRef, after);
  }
  return found;
}

/** The quantities of one side, in the order the destination was handed them. */
function quantities(run: Run, side: string): readonly (number | null)[] {
  return run.sent.filter((one) => one.kind === 'place' && one.side === side).map((one) => one.qty);
}

/** What one side sent in total, which is what a ceiling is about. */
function total(run: Run, side: string): number {
  return quantities(run, side).reduce((sum: number, one) => sum + (one ?? 0), 0);
}

/** The position references the orders of one side carried. */
function references(run: Run, side: string): readonly number[] {
  return run.sent
    .filter((one) => one.kind === 'place' && one.side === side)
    .map((one) => one.positionRef);
}

/** A leg that may hold several tags at once, so a part can be told from the whole. */
const PROBE = ['version 1', 'strategy("Probe", qty = 2, pyramiding = 50)'];

/**
 * The defect of issue 0016, measured.
 *
 * Catches the implementation this replaced, which measured both closes against
 * the position the bar began with: that one sends two sells of three, crosses
 * position 1 from three to minus three, and leaves `pos.size` reading minus
 * three on the next bar.
 */
test('two closes on one bar send one position, and the leg is not left short', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 3)',
    'if bar.index == 3',
    '    close()',
    '    close()',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(ran(run, 6), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [3], 'the second close sent an order of its own');
  assert.equal(run.engine.column(0)[5], 0, 'the leg did not end flat');
});

/**
 * The same shape written as a loop, which is how it was first measured.
 *
 * Five bare closes on one bar ended the leg twelve short. A fix keyed on "the
 * call before this one was also a close" would pass the test above and fail
 * here.
 */
test('five closes in a loop send one position between them', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 3)',
    'if bar.index == 3',
    '    for i = 0 to 4',
    '        close()',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(ran(run, 6), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [3]);
  assert.equal(run.engine.column(0)[5], 0);
});

/**
 * Two quantities that each pass the OS7017 ceiling and cross zero together.
 *
 * On a leg of three, `close(qty = 2)` twice ended the leg one short with each
 * order inside the ceiling and the pair outside it. The assertion is the sum
 * and the sign, so a fix that refuses the second call and a fix that sizes it
 * to what is left both hold.
 */
test('two stated closes on one bar never sum past the leg', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 3)',
    'if bar.index == 3',
    '    close(qty = 2)',
    '    close(qty = 2)',
  ]);
  const diagnostic = ran(run, 6);
  assert.deepEqual(crossings(run), []);
  assert.ok(total(run, 'sell') <= 3, `the bar sent ${total(run, 'sell')} against a leg of 3`);
  // The answer this engine gives: the quantity is a claim about the leg, and
  // against what is left the claim is false, so it is refused.
  assert.equal(diagnostic?.code, 'OS7017');
  assert.equal(diagnostic?.values['held'], 1, 'the refusal named what the bar began with');
});

/**
 * A tagged close and a bare close, which measure against two different numbers.
 *
 * `close(tag = "a", qty = 2)` then `close(qty = 4)` on a leg of four ended it
 * two short: the first measured against the tag, the second against the leg,
 * and neither knew about the other. Catches a fix that counts what is left for
 * one tag and leaves the leg's own number alone.
 */
test('a tagged close and a bare close on one bar never sum past the leg', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 2, tag = "a")',
    'if bar.index == 2',
    '    buy(qty = 2, tag = "b")',
    'if bar.index == 4',
    '    close(tag = "a", qty = 2)',
    '    close(qty = 4)',
  ]);
  const diagnostic = ran(run, 7);
  assert.deepEqual(crossings(run), []);
  assert.ok(total(run, 'sell') <= 4, `the bar sent ${total(run, 'sell')} against a leg of 4`);
  assert.equal(diagnostic?.code, 'OS7017');
  assert.equal(diagnostic?.values['held'], 2, 'two of the four were already going');
});

/**
 * The other direction of the same rule: what is left is not over-subtracted.
 *
 * Two tags closed on one bar are two parts of one leg, and each sends its own.
 * Catches a count that takes every reduction out of every part, which would
 * make the second close send nothing and leave half the leg on, and it is the
 * reason the record names the part it reduces rather than only a quantity.
 */
test('two tags closed on one bar each send their own part', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 2, tag = "a")',
    'if bar.index == 2',
    '    buy(qty = 2, tag = "b")',
    'if bar.index == 4',
    '    close(tag = "a")',
    '    close(tag = "b")',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(ran(run, 7), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [2, 2]);
  assert.equal(run.engine.column(0)[6], 0, 'the leg did not end flat');
});

/**
 * The bar, not the execution.
 *
 * A file declared `onUnconfirmed` applies its effects on every execution of the
 * moving bar, and the orders of the earlier executions really were handed over.
 * So the record a close is measured against is the bar's: an engine that
 * cleared it per execution sends the whole position once per tick, which is the
 * same defect arriving three times a second.
 */
test('a close on a bar executed three times sends one position', () => {
  const run = runFor([
    'version 1',
    'strategy("Probe", qty = 3, pyramiding = 50, onUnconfirmed = true)',
    'if bar.index == 0',
    '    buy(qty = 3)',
    'if bar.index == 1',
    '    close()',
  ]);
  run.engine.append(at(0, 100), CONFIRMED, 3);
  run.engine.deliver(frame(1, 3, 100));
  assert.equal(run.engine.append(at(1, 101), MOVING, 3).diagnostic, undefined);
  assert.equal(run.engine.update(at(1, 102), MOVING).diagnostic, undefined);
  assert.equal(run.engine.update(at(1, 103), CONFIRMED).diagnostic, undefined);

  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [3], 'each execution sent the whole position again');
});

/**
 * A close beside the other call that sends a closing order of its own.
 *
 * `order.reverse` closes the outgoing position itself, and a close after it on
 * the same bar was measured against a leg that had not moved.
 */
test('a reverse and a close on one bar send one position between them', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 3)',
    'if bar.index == 3',
    '    order.reverse()',
    '    close()',
  ]);
  assert.equal(ran(run, 6), undefined);
  assert.deepEqual(crossings(run), []);
  // Three out of the outgoing position and three into its replacement, and the
  // close has nothing left to send.
  assert.deepEqual(quantities(run, 'sell'), [3, 3]);
  const refs = references(run, 'sell');
  assert.notEqual(refs[0], refs[1], 'the replacement settled the position it replaced');
});

/**
 * A bracket between two closes sends no order at all, so it commits nothing.
 *
 * Catches a count taken over every intent a bar produced rather than over the
 * orders that reduce a position: `exit` sets the leg's level and nothing has
 * been ordered by it, so the close after it still has the leg to close.
 */
test('a close, an exit and a close on one bar send one position', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 3)',
    'if bar.index == 3',
    '    exit(loss = 5)',
    '    close()',
    '    close()',
  ]);
  assert.equal(ran(run, 6), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [3]);
});

/**
 * An entry that crosses zero, which is path three of the same sentence.
 *
 * `docs/strategies/orders.md` teaches `sell(qty = abs(pos.size) + newQty)` as
 * one instruction the engine splits into two orders, and the engine sent one
 * order of five against a leg holding three: the leg ended two short under one
 * position reference, and a late fill had no way to say which of the two
 * positions it settled. Catches an `entering` that maps one order at the
 * quantity written.
 */
test('an entry that crosses sends two orders with two position references', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 3)',
    'if bar.index == 3',
    '    sell(qty = abs(pos.size) + 2)',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(ran(run, 6), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [3, 2], 'one order was sent at the size written');
  const refs = references(run, 'sell');
  assert.notEqual(refs[0], refs[1], 'both halves settled one position');
  assert.equal(run.engine.column(0)[5], -2, 'the flip did not leave the size it asked for');
});

/**
 * The same split through the general form, and the two edges beside it.
 *
 * An order the size of the position closes it and opens nothing, and an order
 * inside the position reduces it: neither is a flip, and an engine that split
 * every opposing order would send two orders for both.
 */
test('order.place splits the same way, and an exact or partial order does not', () => {
  const flip = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 3)',
    'if bar.index == 3',
    '    order.place("sell", 5)',
  ]);
  assert.equal(ran(flip, 6), undefined);
  assert.deepEqual(crossings(flip), []);
  assert.deepEqual(quantities(flip, 'sell'), [3, 2]);

  const exact = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 3)',
    'if bar.index == 3',
    '    sell(qty = 3)',
  ]);
  assert.equal(ran(exact, 6), undefined);
  assert.deepEqual(quantities(exact, 'sell'), [3]);

  const part = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 3)',
    'if bar.index == 3',
    '    sell(qty = 1)',
  ]);
  assert.equal(ran(part, 6), undefined);
  assert.deepEqual(quantities(part, 'sell'), [1]);
});

/**
 * A reducing entry and a close on one bar.
 *
 * `sell(qty = 2)` on a leg of five reduces it, and the close after it was
 * measured against five. The two are different calls with one budget between
 * them.
 */
test('a reducing sell and a close on one bar never sum past the leg', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 5)',
    'if bar.index == 3',
    '    sell(qty = 2)',
    '    close()',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(ran(run, 6), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [2, 3]);
  assert.equal(run.engine.column(0)[5], 0);
});

/**
 * And the other order of the same pair.
 *
 * With the close first, the leg is on its way out and the sell after it opens a
 * position rather than reducing one, so it belongs to a reference of its own.
 * Catches an engine that attaches it to the outgoing position, which is the
 * same late fill with no owner that the split exists to prevent.
 */
test('a close and then a sell opens a position of its own', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 3)',
    'if bar.index == 3',
    '    close()',
    '    sell(qty = 4)',
  ]);
  assert.equal(ran(run, 6), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [3, 4]);
  const refs = references(run, 'sell');
  assert.notEqual(refs[0], refs[1]);
});

/**
 * Pyramiding, where the leg holds several entries under one reference.
 *
 * The number a close works from is the position rather than the entries, so
 * three entries of two are one position of six and one close sends six. The
 * second close has nothing left.
 */
test('a close under pyramiding sends the position once', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index <= 2',
    '    buy(qty = 2)',
    'if bar.index == 4',
    '    close()',
    '    close()',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(ran(run, 7), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [6]);
  assert.equal(run.engine.column(0)[6], 0);
});
