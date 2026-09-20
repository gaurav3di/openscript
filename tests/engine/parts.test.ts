/**
 * The part a call names, and the side of the reference it lands on,
 * `stdlib.md` 17.1, 17.2 and 17.7.
 *
 * `attaching.test.ts` asks which position an order is sent against and
 * `ending.test.ts` asks whether every position can get back to zero. This asks
 * the two questions those two left, and both of them were reachable at
 * `9061c97` with nothing failing:
 *
 * - **A close takes its direction from the leg's net rather than from the part
 *   the tag names**, so `close(tag)` sent an order that added to that part. A
 *   leg holding ten long under one tag and four short under another was handed
 *   a sell of four for the short one, which took it to eight short and cut the
 *   long one to six. 17.2 says the call flattens the part carrying that tag,
 *   and says of the other reading that it would let close open a position.
 * - **A reference's side was read from a sum whose two halves could drift**,
 *   because the working half of a reduction the engine cannot count in units
 *   was what was left to close when the order was sent rather than the order's
 *   own size. A second stated close carries zero there and still reduces what
 *   has settled, so the sum went negative, the reference read as the side it is
 *   not on, and an opposing entry was handed it as an order that adds.
 *
 * Two more came out of this suite's own fuzz rather than out of the issue, and
 * both are the same sentence again: **a close is sent against the position it
 * is closing.** One was a close the engine cannot size being handed the
 * reference an entry was opening on the other side, and the other was a bracket
 * minting a reference for an instruction that orders nothing, so the entry
 * after it opened on the next one.
 *
 * Every assertion here is about what the destination was handed, or about what
 * its own answers come to, and never about a number the engine kept.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { OrderIntent } from '../../src/core/engine/index.js';
import {
  CONFIRMED,
  PROBE,
  at,
  crossings,
  ended,
  frame,
  partial,
  ranAnswering,
  reversed,
  runFor,
  sentOn,
} from './orders-support.js';
import type { Run } from './orders-support.js';

/** The orders of one tag, in the order the destination was handed them. */
function tagged(run: Run, tag: string): readonly OrderIntent[] {
  return run.sent.filter((one) => one.kind === 'place' && one.tag === tag);
}

/** What one tag holds, folded from the fills the destination itself answered. */
function heldUnder(run: Run, tag: string, filled: ReadonlyMap<number, number>): number {
  let held = 0;
  for (const one of tagged(run, tag)) {
    const qty = filled.get(one.intentId) ?? 0;
    held += one.side === 'buy' ? qty : -qty;
  }
  return held;
}

/** The headline of issue 0019: a leg long under one tag and short under another. */
const TWO_SIGNED_TAGS = [
  ...PROBE,
  'if bar.index == 0',
  '    buy(qty = 10, tag = "A")',
  'if bar.index == 1',
  '    sell(qty = 14, tag = "B")',
];

/**
 * The rejection that leaves one tag short while the leg is long.
 *
 * The sell of fourteen is two orders: ten against the position the buy opened
 * and four opening one of its own. The first is rejected and the second fills,
 * so tag A holds ten long on reference 1 and tag B holds four short on
 * reference 2, and the leg's net is six long.
 */
const SPLIT = { 1: [frame(1, 10, 100)], 2: [ended(2, 'rejected', 'no'), frame(3, 4, 100)] };

/**
 * A close of a tag is on the side that reduces **that tag**.
 *
 * Catches the implementation this replaced, which took the side from
 * `ctx.size()`: that one answers a leg six long with a sell, so `close(tag)`
 * on a part holding four short sent a sell of four and took it to eight short,
 * on the reference the other tag's ten long is on.
 */
test('a close of a tagged part is on the side that reduces that part', () => {
  const run = runFor([...TWO_SIGNED_TAGS, 'if bar.index == 4', '    close(tag = "B")']);
  assert.equal(ranAnswering(run, 6, SPLIT), undefined);
  assert.equal(run.sent.length, 4, 'the close sent one order');
  const close = run.sent[3] as OrderIntent;
  assert.equal(close.side, 'buy', 'the close of a short part was sent as a sell');
  assert.equal(close.qty, 4, 'the quantity is what that tag holds');
  assert.equal(close.positionRef, 2, 'the close went to the reference holding the short');
  assert.deepEqual(crossings(run), []);
});

/** And the same with the quantity written out, which takes the same path. */
test('a stated close of a tagged part is on the same side', () => {
  const run = runFor([...TWO_SIGNED_TAGS, 'if bar.index == 4', '    close(tag = "B", qty = 4)']);
  assert.equal(ranAnswering(run, 6, SPLIT), undefined);
  const close = run.sent[3] as OrderIntent;
  assert.equal(close.side, 'buy');
  assert.equal(close.qty, 4);
  assert.equal(close.positionRef, 2);
  assert.deepEqual(crossings(run), []);
});

/**
 * And the close flattens the part rather than doubling it, on the destination's
 * own answers.
 *
 * The property itself: after the close is answered in full, the tag it named
 * holds nothing, folded from the fills the destination sent and from nothing
 * the engine kept. The implementation this replaced leaves it eight short.
 */
test('a tag that has been closed holds nothing, folded from the fills', () => {
  const run = runFor([...TWO_SIGNED_TAGS, 'if bar.index == 4', '    close(tag = "B")']);
  const filled = new Map<number, number>([
    [1, 10],
    [3, 4],
  ]);
  for (let index = 0; index < 6; index += 1) {
    for (const one of (SPLIT as Record<number, readonly ReturnType<typeof frame>[]>)[index] ?? []) {
      run.engine.deliver(one);
    }
    if (index === 5) {
      const close = run.sent[3] as OrderIntent;
      run.engine.deliver(frame(close.intentId, close.qty as number, 100));
      filled.set(close.intentId, close.qty as number);
    }
    assert.equal(run.engine.append(at(index, 100 + index), CONFIRMED, 6).diagnostic, undefined);
  }
  assert.equal(heldUnder(run, 'B', filled), 0, 'the close moved the tag away from flat');
  assert.equal(heldUnder(run, 'A', filled), 10, 'the close was taken out of the other tag');
});

/**
 * The part has a direction where the leg has none.
 *
 * Ten long under tag A on reference 1 and ten short under tag B on reference 2
 * is a leg whose net is zero and which holds two positions, and 17.1 is
 * explicit that the two are not the same thing. `close(tag = "B")` flattens the
 * part, so it is a buy of ten on reference 2. Taken from the leg it is no side
 * at all and the call sends nothing, which leaves a script that asked for a
 * part to be flattened holding it.
 */
test('a tagged close acts on a part while the leg nets to nothing', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 10, tag = "A")',
    'if bar.index == 1',
    '    sell(qty = 20, tag = "B")',
    'if bar.index == 4',
    '    close(tag = "B")',
  ]);
  const answers = { 1: [frame(1, 10, 100)], 2: [ended(2, 'rejected', 'no'), frame(3, 10, 100)] };
  assert.equal(ranAnswering(run, 6, answers), undefined);
  assert.equal(run.sent.length, 4, 'the part was left holding ten short');
  const close = run.sent[3] as OrderIntent;
  assert.equal(close.side, 'buy');
  assert.equal(close.qty, 10);
  assert.equal(close.positionRef, 2);
  assert.deepEqual(crossings(run), []);
});

/**
 * A second close of one tag holds what the first one already has going.
 *
 * 17.2's idempotence read at the part rather than at the leg. The leg is long
 * and the part is short, so what is already working against the part is on the
 * side the leg's net calls an addition: counted from the leg, the buy that is
 * on its way to flatten tag B is not counted at all, and the second close sends
 * the part a second time. Tag B holds four short and is handed eight units of
 * buy, which leaves it four long: a call named close having opened a position,
 * one bar later than the headline and by the same reading.
 *
 * The other tag on that reference is what makes it reachable. `holdings.ts`
 * offers a close only what has settled on a reference less what is already
 * coming off it, so a reference holding nothing but this part would refuse the
 * second order on its own. Tag C's five short is the room that lets it through,
 * which is why the fixture has three tags and not two.
 */
test('a second close of a tag sends nothing while the first is still working', () => {
  const run = runFor([
    ...TWO_SIGNED_TAGS,
    'if bar.index == 2',
    '    sell(qty = 5, tag = "C")',
    'if bar.index == 3',
    '    close(tag = "B")',
    'if bar.index == 4',
    '    close(tag = "B")',
  ]);
  // The reference 1 half of the sell is never answered, which is what leaves
  // the leg long while the part is short.
  const answers = { 1: [frame(1, 10, 100)], 2: [frame(3, 4, 100)], 3: [frame(4, 5, 100)] };
  assert.equal(ranAnswering(run, 6, answers), undefined);
  assert.equal(run.sent.length, 5, 'the second close sent the part again');
  const close = run.sent[4] as OrderIntent;
  assert.equal(close.side, 'buy');
  assert.equal(close.qty, 4);
  assert.equal(close.bar.index, 3, 'the order on bar 4 is the one that should not exist');
  assert.deepEqual(crossings(run), []);
});

/** Two stated closes and an opposing entry, which is issue 0019's second shape. */
const TWO_STATED_CLOSES = [
  'if bar.index == 0',
  '    buy(qty = 10)',
  'if bar.index == 1',
  '    close(qty = 1)',
  'if bar.index == 2',
  '    close(qty = 1)',
  'if bar.index == 4',
  '    sell(qty = 9)',
];

/**
 * A reference that opened on one sign never settles on the other, in every unit.
 *
 * Every order is answered in full, nothing is rejected, nothing is over-filled
 * and nothing is left working, so this is the case `stdlib.md` 17.1 answers for
 * outright rather than the one it says no engine keeps.
 *
 * Catches the implementation this replaced, which read a reference's side from
 * what settled plus what a reduction claimed when it was sent. The second
 * stated close claims nothing, because the first already spoke for the whole
 * leg, and it still fills: the settled half falls, the working half does not,
 * the sum goes negative, reference 1 reads short, and the sell of nine is
 * handed it as an order that adds. It then settles one short having opened ten
 * long.
 */
test('a reference that opened long never settles short, in every qtyType', () => {
  for (const qtyType of ['units', 'lots', 'cash', 'equityPercent']) {
    const run = runFor([
      'version 1',
      `strategy("Probe", qty = 3, pyramiding = 50, qtyType = "${qtyType}")`,
      ...TWO_STATED_CLOSES,
    ]);
    // Answered in full, one order at a time, with the second close answered
    // before the first: a destination is under no obligation to answer in the
    // order it was asked, and 17.8 folds frames in the order they arrive.
    const due = [1, 5, 3, 5];
    let seen = 0;
    const waiting: { readonly intent: OrderIntent; readonly due: number }[] = [];
    for (let index = 0; index < 8; index += 1) {
      for (const one of waiting) {
        if (one.due === index) run.engine.deliver(frame(one.intent.intentId, one.intent.qty as number, 100));
      }
      const result = run.engine.append(at(index, 100 + index), CONFIRMED, 8);
      assert.equal(result.diagnostic, undefined, qtyType);
      while (seen < run.sent.length) {
        const intent = run.sent[seen] as OrderIntent;
        waiting.push({ intent, due: due[seen] ?? index + 1 });
        seen += 1;
      }
    }
    assert.deepEqual(reversed(run), [], qtyType);
    assert.deepEqual(crossings(run), [], qtyType);
    if (qtyType !== 'units') {
      assert.deepEqual(
        sentOn(run, 'sell'),
        ['1 on 1', '1 on 1', '9 on 2'],
        `under ${qtyType} the opposing entry was handed the outgoing reference`,
      );
    }
  }
});

/**
 * A close the engine cannot size goes on the position it is closing.
 *
 * The leg holds twelve long on reference 1 and the whole of it is inside a
 * close the destination still has, so reference 1 has nothing left for an
 * engine-sized close to send and is not in the book of what a leg holds. The
 * short entry after it opens a reference of its own. `close(qty = 1)` in cash
 * is a quantity the engine cannot read, so it is not choosing a number and that
 * exclusion is not about it: the position it is closing is still the long one.
 *
 * Catches an implementation that takes the book's answer alone. That one hands
 * the close the reference the short entry is opening and sends a sell on it,
 * which is a call named close adding to a position. This suite's fuzz found it
 * rather than a reader; the quantity, the unit and the silence of the
 * destination all have to line up, and none of them is unusual on its own.
 */
test('a close the engine cannot size is sent against the position it is closing', () => {
  const run = runFor([
    'version 1',
    'strategy("Probe", qty = 2, pyramiding = 50, qtyType = "cash")',
    'if bar.index == 0',
    '    buy(qty = 12)',
    'if bar.index == 1',
    '    close()',
    'if bar.index == 2',
    '    sell(qty = 1)',
    'if bar.index == 3',
    '    close(qty = 1)',
  ]);
  assert.equal(ranAnswering(run, 5, { 1: [frame(1, 12, 100)] }), undefined);
  assert.deepEqual(sentOn(run, 'sell'), ['12 on 1', '1 on 2', '1 on 1']);
});

/**
 * The opening half of a reverse is a position of its own, always.
 *
 * It is the one entry that never goes through the division every other entry
 * takes, and that is correct by construction rather than by luck: a reference
 * minted here has nothing on it, so the order cannot cross it and cannot settle
 * it on a side it did not open on.
 *
 * **Dividing it instead is a defect, and this is what catches it.** The orders
 * of a call are all mapped before any of them appends a row (`ledger.ts`), so
 * at the moment the opening half is mapped the closing half is not in the
 * ledger yet: divided against what the leg holds, the opening half is sent
 * against the very position the closing half is already flattening, and both
 * halves of the reverse go on reference 1. Reference 1 then opens ten long and
 * settles ten short, with nothing having opened the replacement at all.
 */
test('a reverse opens its replacement on a reference of its own', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 10)',
    'if bar.index == 1',
    '    order.reverse()',
  ]);
  assert.equal(ranAnswering(run, 4, { 1: [frame(1, 10, 100)] }), undefined);
  assert.deepEqual(sentOn(run, 'sell'), ['10 on 1', '10 on 2']);
  assert.deepEqual(crossings(run), []);
});

/**
 * A bracket names the position it protects, and no position where there is
 * none.
 *
 * `stdlib.md` 17.2 and `host-interface.md` 7.1. A bracket appends no row and
 * moves nothing, so it has no position of its own to mint: the reference it
 * carries is the one the leg is holding or opening, and zero where the leg
 * holds none, which is the value a cancellation carries for the same reason.
 *
 * Catches the implementation this replaced, which minted a reference for it. A
 * script whose first order call is `exit()` burned reference 1 on an
 * instruction that ordered nothing: the buy after it opened on reference 2, and
 * the bracket named a reference no order ever carried, so a host reconciling
 * the two would not find it on the other side.
 */
test('a bracket carries the position it protects, or none', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    exit(profit = 4, loss = 2)',
    'if bar.index == 1',
    '    buy(qty = 3)',
    '    exit(profit = 4, loss = 2)',
  ]);
  assert.equal(ranAnswering(run, 3, {}), undefined);
  assert.equal(run.sent.length, 3);
  const early = run.sent[0] as OrderIntent;
  assert.equal(early.kind, 'bracket');
  assert.equal(early.positionRef, 0, 'a bracket before there is a position named one');
  const entry = run.sent[1] as OrderIntent;
  assert.equal(entry.positionRef, 1, 'the bracket took the reference the entry should have');
  const beside = run.sent[2] as OrderIntent;
  assert.equal(beside.kind, 'bracket');
  assert.equal(beside.positionRef, 1, 'a bracket beside an entry names the position it opens');
});

/** The leg's settled net, folded from the ledger's own filled quantities. */
function legOf(run: Run): number {
  return run.engine
    .orders()
    .reduce((total, row) => total + (row.side === 'buy' ? row.filledQty : -row.filledQty), 0);
}

/**
 * A bracket names the position the leg is holding, not the reference minted
 * last.
 *
 * `stdlib.md` 17.7 and `host-interface.md` 7.1. The reference a bracket carries
 * was a slot on the position book: set by the mint, cleared when that one
 * reference returned to zero, and never pointed at another. A leg holding two
 * positions, whose newer one closes while the older is still held, was then
 * reported as holding none, and `exit()` handed a host `0`, which is the one
 * value 7.1 tells a host means there is no position to look up. Nothing in this
 * suite failed on it: 1427 tests passed over a bracket that named nothing while
 * the strategy carried six units.
 *
 * Nothing unusual is needed to reach it. One entry, one opposing entry large
 * enough to open a second position, an ordinary partial fill on the order that
 * reduces the first, and the second position closing.
 */
test('a bracket names the position the leg is still holding', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 10)',
    'if bar.index == 1',
    '    sell(qty = 15)',
    'if bar.index == 2',
    '    buy(qty = 5)',
    'if bar.index == 3',
    '    exit(profit = 4, loss = 2)',
  ]);
  const stopped = ranAnswering(run, 5, {
    1: [frame(1, 10, 100)],
    2: [partial(2, 4, 100), frame(3, 5, 100)],
    3: [frame(4, 5, 100)],
  });
  assert.equal(stopped, undefined);
  const bracket = run.sent.find((one) => one.kind === 'bracket') as OrderIntent;
  assert.notEqual(bracket, undefined);
  // Six of the first entry are still held: ten filled, four of the fifteen sold.
  assert.equal(legOf(run), 6, 'the leg still holds the first position');
  assert.equal(bracket.positionRef, 1, 'the bracket names the position the leg holds');
});

/**
 * And it never names a reference that holds nothing while the leg holds one.
 *
 * The same slot read the other way. A reference minted for an order the
 * destination then refused stayed the answer for every bracket after it, so the
 * bracket named a position that never opened while the leg's own sat on an
 * older reference. A host reconciling the two finds a number on the intent and
 * nothing on the other side, which is exactly what 7.1's rule about `0` exists
 * to prevent.
 */
test('a bracket never names a reference nothing ever opened', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 10)',
    'if bar.index == 1',
    '    sell(qty = 15)',
    'if bar.index == 2',
    '    exit(profit = 4, loss = 2)',
  ]);
  const stopped = ranAnswering(run, 4, {
    1: [frame(1, 10, 100)],
    2: [ended(2, 'rejected'), ended(3, 'rejected')],
  });
  assert.equal(stopped, undefined);
  const bracket = run.sent.find((one) => one.kind === 'bracket') as OrderIntent;
  assert.notEqual(bracket, undefined);
  assert.equal(legOf(run), 10, 'the leg holds the entry the destination filled');
  assert.equal(bracket.positionRef, 1, 'the bracket names the position, not the refused order');
  const settled = run.engine
    .orders()
    .filter((row) => row.positionRef === bracket.positionRef)
    .reduce((total, row) => total + (row.side === 'buy' ? row.filledQty : -row.filledQty), 0);
  assert.notEqual(settled, 0, 'the reference a bracket names is one the leg holds something on');
});

/**
 * Holding first and opening second, which is the order `stdlib.md` 17.7 states
 * the two in.
 *
 * A leg holds more than one position whenever an order that opposes it is
 * outstanding, and then the two halves of that sentence give different answers:
 * one reference carries what the leg's fills settled and another is being
 * opened against it. The position a bracket protects is the one the leg has,
 * not the one an opposing entry is on its way to open. Taking the book's newest
 * entry first inverts it, and this is the shape that says so.
 */
test('a bracket protects what the leg holds, not what is being opened against it', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 10)',
    'if bar.index == 1',
    '    sell(qty = 15)',
    'if bar.index == 2',
    '    exit(profit = 4, loss = 2)',
  ]);
  const stopped = ranAnswering(run, 4, { 1: [frame(1, 10, 100)] });
  assert.equal(stopped, undefined);
  const opening = run.sent.filter((one) => one.kind === 'place' && one.side === 'sell');
  assert.deepEqual(
    opening.map((one) => one.positionRef),
    [1, 2],
    'the opposing entry takes ten off the position and opens a second with five',
  );
  const bracket = run.sent.find((one) => one.kind === 'bracket') as OrderIntent;
  assert.equal(legOf(run), 10, 'nothing of the opposing entry has settled');
  assert.equal(bracket.positionRef, 1, 'the bracket names the position the leg holds');
});
