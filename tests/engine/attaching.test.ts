/**
 * Which position an order is sent against, `stdlib.md` 17.1 and 17.7.
 *
 * Three suites before this one asked how much a reducing order may send: against
 * the call, against the bar, then against the run. This one asks the question
 * none of them did. Every fixture here was reachable at `72f627f` and none of
 * them was written, because every test of an opposing order spelled it
 * `close()`, and a close is routed through the reducing path. An opposing
 * **entry** takes the adding path, and that is where issue 0018 lived:
 *
 *     if bar.index == 0
 *         buy(qty = 6)
 *     if bar.index == 1
 *         sell(qty = 9)
 *
 * with the destination silent put both orders on position reference 1, which
 * opened six long and settled three short.
 *
 * **So every fixture is written twice**, once with an opposing close and once
 * with an opposing entry, and against a destination that answers before, after,
 * partially, with a rejection, and not at all. The assertions are the
 * repository's own `crossings`, which reads the destination's inbox, and
 * `reversed`, which reads the ledger after the frames have folded.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROBE,
  crossings,
  ended,
  frame,
  partial,
  quantities,
  ranAnswering,
  references,
  reversed,
  runFor,
  sentOn,
  settledBook,
  total,
} from './orders-support.js';

/** The headline of issue 0018: an entry, then an entry that opposes it. */
const OPPOSING_ENTRY = [
  ...PROBE,
  'if bar.index == 0',
  '    buy(qty = 6)',
  'if bar.index == 1',
  '    sell(qty = 9)',
];

/**
 * The defect of issue 0018, measured, with the destination silent.
 *
 * Catches the implementation this replaced, which decided whether an order
 * crossed by comparing its side against `ctx.size()`. That number is folded from
 * settled fills, so on bar one it read zero, the sell was not seen as opposing
 * anything, and it was attached with `ctx.reference()`, which is the reference
 * the unanswered buy is already on: one sell of nine on position 1, and
 * `crossings` names it.
 */
test('an entry that opposes an unanswered entry does not join it', () => {
  const run = runFor(OPPOSING_ENTRY);
  assert.equal(ranAnswering(run, 4, {}), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(sentOn(run, 'sell'), ['6 on 1', '3 on 2']);
  assert.deepEqual(sentOn(run, 'buy'), ['6 on 1']);
});

/**
 * The same instruction, and five different destinations behind it.
 *
 * **What a bar sends does not depend on how fast the destination answers**, and
 * that is the whole of the correction: a position with six units coming is a
 * position holding six, whether they have settled, are still in flight, or have
 * partly arrived. The two that differ differ because the position really is
 * different: an order that ended having filled three leaves three, and one that
 * ended having filled nothing leaves nothing at all.
 *
 * Catches any implementation that measures the split from the settled net. That
 * one sends six and three only in the row where the entry was acknowledged
 * first, and one order of nine in every other.
 */
test('the split is the same whenever the destination answers', () => {
  const answers: Record<string, Record<number, ReturnType<typeof frame>[]>> = {
    'not at all': {},
    'before the sell': { 1: [frame(1, 6, 100)] },
    'after the sell': { 2: [frame(1, 6, 100)] },
    'half of it': { 1: [partial(1, 3, 100)] },
  };
  for (const [when, frames] of Object.entries(answers)) {
    const run = runFor(OPPOSING_ENTRY);
    assert.equal(ranAnswering(run, 4, frames), undefined, when);
    assert.deepEqual(crossings(run), [], when);
    assert.deepEqual(sentOn(run, 'sell'), ['6 on 1', '3 on 2'], when);
    assert.deepEqual(reversed(run), [], when);
  }

  // Three filled and then rejected: the position holds three and takes three.
  const part = runFor(OPPOSING_ENTRY);
  const rejected = { intentId: 1, status: 'rejected', filledQty: 3, avgFillPrice: 100, text: 'no' };
  assert.equal(ranAnswering(part, 4, { 1: [partial(1, 3, 100), rejected] }), undefined);
  assert.deepEqual(sentOn(part, 'sell'), ['3 on 1', '6 on 2']);
  assert.deepEqual(crossings(part), []);

  // Rejected having filled nothing: the position was never opened and the whole
  // instruction opens one of its own.
  const none = runFor(OPPOSING_ENTRY);
  assert.equal(ranAnswering(none, 4, { 1: [ended(1, 'rejected', 'no')] }), undefined);
  assert.deepEqual(sentOn(none, 'sell'), ['9 on 2']);
  assert.deepEqual(crossings(none), []);
});

/**
 * The close spelling of the same bar, which is the fixture that already existed.
 *
 * A close states no quantity of its own, so it sends what has settled and
 * nothing that is still coming: with the entry unanswered it sends nothing at
 * all, which is 17.2's idempotence, and with the entry acknowledged it sends the
 * six. The pair is here so that the two spellings sit beside each other: an
 * entry is sent at the size the script wrote whatever the leg holds, and the
 * only question is where its units land; a close chooses its own number and may
 * only choose one that settled.
 */
test('a close that opposes an unanswered entry sends nothing, and sends it later', () => {
  const lines = [...PROBE, 'if bar.index == 0', '    buy(qty = 6)', 'if bar.index == 1', '    close()'];

  const silent = runFor(lines);
  assert.equal(ranAnswering(silent, 4, {}), undefined);
  assert.deepEqual(quantities(silent, 'sell'), [], 'a close sold a position that had not settled');

  const answered = runFor(lines);
  assert.equal(ranAnswering(answered, 4, { 1: [frame(1, 6, 100)] }), undefined);
  assert.deepEqual(sentOn(answered, 'sell'), ['6 on 1']);
  assert.deepEqual(crossings(answered), []);
});

/**
 * Issue 0017's runaway exit, reborn with an entry in place of the close.
 *
 * The mis-classified entry recorded no reduction, so the close after it held
 * nothing back for it: the destination was handed a buy of six and sells of
 * fifteen where the script asked to be three short, all on position 1. Catches
 * an implementation that attaches an opposing entry to the outgoing reference,
 * whether or not it also splits the quantity, because the sells are only held to
 * six once the first nine are recorded against the position they reduce.
 */
test('a close after an opposing entry holds back what that entry is already taking', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 6)',
    'if bar.index == 1',
    '    sell(qty = 9)',
    'if bar.index == 3',
    '    if pos.size != 0',
    '        close()',
  ]);
  assert.equal(ranAnswering(run, 5, { 2: [frame(1, 6, 100)] }), undefined);
  assert.deepEqual(crossings(run), []);
  assert.equal(total(run, 'sell'), 9, `the bars sent ${total(run, 'sell')} against a buy of 6`);
  assert.deepEqual(sentOn(run, 'sell'), ['6 on 1', '3 on 2']);
});

/**
 * A leg holding two positions of opposite signs, which a rejection produces.
 *
 * `buy(qty = 10)` fills, `close()` sends the whole of it, an opposing entry
 * finds nothing left to take and opens a position of its own, and then the
 * close is rejected. The leg now holds ten long on one reference and nine short
 * on another, and its net is one long.
 *
 * Both spellings of the next order are wrong in the same way and for the same
 * reason. An order that agrees with the leg's **net** was treated as adding and
 * took `ctx.reference()`, which is the reference minted for the opposing entry
 * and carries the other sign: `buy(qty = 12)` took position 2 from nine short to
 * three long, and `close()` sent its sell against the same nine short. Catches
 * both.
 */
test('an order agreeing with the leg does not land on a position of the other sign', () => {
  const opened = [
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 10)',
    'if bar.index == 1',
    '    close()',
    'if bar.index == 2',
    '    sell(qty = 9)',
  ];
  const answers = { 1: [frame(1, 10, 100)], 3: [ended(2, 'rejected', 'no'), frame(3, 9, 110)] };

  const entry = runFor([...opened, 'if bar.index == 4', '    buy(qty = 12)']);
  assert.equal(ranAnswering(entry, 6, answers), undefined);
  assert.deepEqual(crossings(entry), []);
  // Nine come off the short position and end it; three join the long one.
  assert.deepEqual(sentOn(entry, 'buy'), ['10 on 1', '9 on 2', '3 on 1']);

  const closing = runFor([...opened, 'if bar.index == 4', '    close()']);
  assert.equal(ranAnswering(closing, 6, answers), undefined);
  assert.deepEqual(crossings(closing), []);
  // The leg is one long, and the one is sold out of the position that is long.
  assert.deepEqual(sentOn(closing, 'sell'), ['10 on 1', '9 on 2', '1 on 1']);
});

/**
 * A reducing order that spans two positions is two orders.
 *
 * `flattening` sized against the whole leg and attached the result to one
 * reference, with nothing asking whether that reference could absorb it. Here
 * the leg holds seventy two short across two positions and the close is one
 * order of seventy two: sent against either of them alone it takes that position
 * through zero and out the other side.
 *
 * Reachable through a bare close and through `order.reverse`, so both are here.
 * The reason is 17.1's own: a late fill has to be able to say which of the two
 * positions it settled, and one order against two cannot.
 */
test('a close and a reverse each send one order per position they reduce', () => {
  const opened = [
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 36)',
    'if bar.index == 1',
    '    sell(qty = 90)',
    'if bar.index == 2',
    '    sell(qty = 18)',
  ];
  const answers = {
    3: [frame(1, 36, 100), frame(2, 36, 100), frame(3, 54, 100), frame(4, 18, 100)],
  };

  const closing = runFor([...opened, 'if bar.index == 4', '    close()']);
  assert.equal(ranAnswering(closing, 6, answers), undefined);
  assert.deepEqual(crossings(closing), []);
  assert.deepEqual(sentOn(closing, 'sell'), ['36 on 1', '54 on 2', '18 on 2']);
  assert.deepEqual(sentOn(closing, 'buy'), ['36 on 1', '72 on 2']);
  assert.equal(settledBook(closing).get(2), -72, 'the close did not flatten the short position');

  const reverse = runFor([...opened, 'if bar.index == 4', '    order.reverse()']);
  assert.equal(ranAnswering(reverse, 6, answers), undefined);
  assert.deepEqual(crossings(reverse), []);
  const refs = references(reverse, 'buy');
  assert.notEqual(refs[refs.length - 1], refs[refs.length - 2], 'the replacement took the position it replaced');
});

/**
 * Frames that arrive out of order, and frames that arrive after the bar they
 * describe.
 *
 * A host does not have to sort its frames, and what a reducing order is measured
 * against is folded from them. The split of the entry on bar three is the same
 * whichever order the two frames about bar one arrive in, because both of them
 * are about a quantity that is already on the position either way.
 */
test('the split is the same however the frames are ordered', () => {
  const lines = [
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 4)',
    'if bar.index == 1',
    '    buy(qty = 6)',
    'if bar.index == 3',
    '    sell(qty = 14)',
  ];
  const forwards = runFor(lines);
  assert.equal(ranAnswering(forwards, 5, { 2: [frame(1, 4, 100), frame(2, 6, 105)] }), undefined);

  const backwards = runFor(lines);
  assert.equal(ranAnswering(backwards, 5, { 2: [frame(2, 6, 105), frame(1, 4, 100)] }), undefined);

  const late = runFor(lines);
  assert.equal(ranAnswering(late, 5, { 4: [frame(2, 6, 105), frame(1, 4, 100)] }), undefined);

  for (const [name, run] of [['forwards', forwards], ['backwards', backwards], ['late', late]] as const) {
    assert.deepEqual(crossings(run), [], name);
    assert.deepEqual(sentOn(run, 'sell'), ['10 on 1', '4 on 2'], name);
  }
});

/**
 * An entry placed while the whole of a position is on its way out.
 *
 * The position is spoken for: if the close fills, it reaches zero and ends
 * (17.7), and an entry joining it would have to be settled into a position that
 * has already ended. So the entry opens one of its own, and if the close is
 * rejected instead the leg simply holds two positions on one side, each of which
 * a later close sends an order for.
 *
 * Catches an implementation that attaches an adding order to whichever reference
 * is current. That one puts the buy on position 1, which then reaches zero, ends,
 * and is brought back to life by the buy's own fill.
 */
test('an entry beside a close that covers the position opens one of its own', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 10)',
    'if bar.index == 1',
    '    close()',
    'if bar.index == 2',
    '    buy(qty = 5)',
    'if bar.index == 5',
    '    close()',
  ]);
  assert.equal(
    ranAnswering(run, 7, { 1: [frame(1, 10, 100)], 3: [ended(2, 'rejected', 'no'), frame(3, 5, 130)] }),
    undefined,
  );
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(sentOn(run, 'buy'), ['10 on 1', '5 on 2']);
  // The close after the rejection sends one order per position, not one of
  // fifteen against whichever position is current.
  assert.deepEqual(sentOn(run, 'sell'), ['10 on 1', '10 on 1', '5 on 2']);
});

/**
 * Pyramiding counts entries in a direction, which is now more than one position.
 *
 * `language.md` 13.3 says entries in one direction and OS7008 says the strategy
 * already holds them, so the count is over every position the leg still holds on
 * that side. It used to be over one reference, which was the same number while
 * every entry in a direction shared one, and is not now: the fixture above opens
 * a second long position, and a count keyed to a single reference reports none
 * and lets a declaration of one entry hold two.
 *
 * The other half is that an order the mapping is sending **against** a position
 * is not an entry at all, however the leg's net reads. With the destination
 * silent the net is flat and called every order an entry, and the six that come
 * off position 1 here are a reduction.
 */
test('pyramiding counts the entries the leg holds, and a reduction is not one', () => {
  const single = ['version 1', 'strategy("Probe", qty = 2)'];

  const second = runFor([
    ...single,
    'if bar.index == 0',
    '    buy(qty = 10)',
    'if bar.index == 1',
    '    close()',
    'if bar.index == 2',
    '    sell(qty = 9)',
    'if bar.index == 4',
    '    buy(qty = 12)',
  ]);
  const refused = ranAnswering(second, 6, {
    1: [frame(1, 10, 100)],
    3: [ended(2, 'rejected', 'no'), frame(3, 9, 110)],
  });
  assert.equal(refused?.code, 'OS7008');
  assert.equal(refused?.values['found'], 1, 'the leg holds one long entry on a position of its own');

  const splitting = runFor([...single, 'if bar.index == 0', '    buy(qty = 6)', 'if bar.index == 1', '    sell(qty = 9)']);
  assert.equal(ranAnswering(splitting, 3, {}), undefined, 'a reduction was counted as an entry');
  assert.deepEqual(sentOn(splitting, 'sell'), ['6 on 1', '3 on 2']);

  // Nine long on one position and nine short on another net to nothing, so the
  // leg reads flat and calls every order an entry. The sell of three comes off
  // the long position and is a reduction, and the count of short entries the leg
  // holds is one, so the answer the net gives is a refusal of an order that
  // opens nothing.
  const netted = runFor([
    ...single,
    'if bar.index == 0',
    '    buy(qty = 9)',
    'if bar.index == 1',
    '    close()',
    'if bar.index == 2',
    '    sell(qty = 9)',
    'if bar.index == 4',
    '    sell(qty = 3)',
  ]);
  assert.equal(
    ranAnswering(netted, 6, { 1: [frame(1, 9, 100)], 3: [ended(2, 'rejected', 'no'), frame(3, 9, 110)] }),
    undefined,
    'a reduction on a leg reading flat was refused as an entry',
  );
  assert.deepEqual(sentOn(netted, 'sell'), ['9 on 1', '9 on 2', '3 on 1']);
});
