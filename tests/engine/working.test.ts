/**
 * What is available to reduce is the settled position less what is working.
 *
 * `crossing.test.ts` holds the same sentence of `stdlib.md` 17.1 inside one
 * bar. This file holds it across a run, which is where it was broken next and
 * where it was broken worst. Issue 0016 scoped the rule to the bar, and one bar
 * later the plainest exit a strategy can write,
 *
 *     if bar.index == 0
 *         buy(qty = 3)
 *     if bar.index > 0 and pos.size > 0
 *         close()
 *
 * sent one close per bar for the length of the run against a destination that
 * had not answered: six bars ended twelve short, ten bars ended twenty four
 * short, and it grew without limit. No diagnostic anywhere, one position
 * reference, and a leg that opened long three. The script is not wrong:
 * `pos.size` is folded from settled fills (17.8) and correctly still read three,
 * so the guard was true and the script re-issued.
 *
 * **Every assertion here is on the destination**, through `orders-support.ts`.
 * The one that matters across all of them is that a position reference never
 * goes from one sign to the other, whatever the engine chose to do about the
 * call. Beside it, each test names the wrong implementation it catches:
 *
 *   - a rule scoped to the bar, which every one of these passes through,
 *   - a rule that reads what was ordered rather than what settled,
 *   - a rule that counts an entry, so a close is sent for units that never
 *     settled.
 *
 * What releases an order that is working, and what a leg holds while one is,
 * are the other half of the same rule and are in `releasing.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONFIRMED,
  MOVING,
  PROBE,
  at,
  crossings,
  frame,
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
 * The defect of issue 0017, measured, and the shape it grew into.
 *
 * Catches every implementation scoped to the bar: those send one close on every
 * bar from the first, so ten bars hand the destination ten sells of three
 * against a leg holding three and reference 1 goes from three to minus
 * twenty-four. The length of the run is the assertion, because the defect grows
 * with it: a test over two bars would pass an engine that held only the bar
 * after.
 */
test('a close working for ten bars is not sent again on any of them', () => {
  const run = runFor(EXIT);
  assert.equal(ranAnswering(run, 12, { 1: [frame(1, 3, 100)] }), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [3], 'a bar-scoped rule sends one of these per bar');
  assert.deepEqual(references(run, 'sell'), [1]);
  assert.equal(run.engine.column(0)[11], 3, 'nothing settled, so the leg still holds three');
});

/**
 * An entry working against the same leg adds nothing to what a close may send.
 *
 * Nothing has settled, so there is nothing extra to close. Catches an
 * implementation that subtracts every unfilled order from the leg whatever side
 * it is on, or that adds an unfilled entry to what is available: either sends a
 * close for a position that may never exist.
 */
test('an unsettled entry does not add to what a close may reduce', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 3)',
    'if bar.index == 2',
    '    close()',
    'if bar.index == 3',
    '    buy(qty = 5)',
    'if bar.index == 4 and pos.size > 0',
    '    close()',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(ranAnswering(run, 7, { 1: [frame(1, 3, 100)] }), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [3], 'the working buy was counted as closable');
  assert.deepEqual(quantities(run, 'buy'), [3, 5]);
});

/**
 * And the entry that does settle, which really is more to close.
 *
 * The other direction of the same rule, so that the one above cannot be passed
 * by an implementation that simply never lets a close grow. Three were closed
 * and are still going, four more settled, and the next close sends four.
 */
test('a position that grows while a close is working closes only the growth', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 3)',
    'if bar.index == 2',
    '    close()',
    'if bar.index == 3',
    '    buy(qty = 4)',
    'if bar.index == 5',
    '    close()',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(ranAnswering(run, 8, { 1: [frame(1, 3, 100)], 5: [frame(3, 4, 105)] }), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [3, 4]);
  assert.equal(total(run, 'sell'), 7, 'the leg only ever settled seven');
});

/**
 * A bar declared `onUnconfirmed`, re-executed while a close is working.
 *
 * The run-scoped rule subsumes the bar-scoped one, so this holds for the same
 * reason the bar did: the orders of the earlier executions really were handed
 * over, and here they were handed over on an earlier bar as well.
 */
test('a bar executed four times with a close working sends one close', () => {
  const run = runFor([
    'version 1',
    'strategy("Probe", qty = 3, pyramiding = 50, onUnconfirmed = true)',
    'if bar.index == 0',
    '    buy(qty = 3)',
    'if bar.index >= 1 and pos.size > 0',
    '    close()',
  ]);
  run.engine.append(at(0, 100), CONFIRMED, 4);
  run.engine.deliver(frame(1, 3, 100));
  assert.equal(run.engine.append(at(1, 101), MOVING, 4).diagnostic, undefined);
  assert.equal(run.engine.update(at(1, 102), MOVING).diagnostic, undefined);
  assert.equal(run.engine.update(at(1, 103), MOVING).diagnostic, undefined);
  assert.equal(run.engine.update(at(1, 104), CONFIRMED).diagnostic, undefined);
  assert.equal(run.engine.append(at(2, 105), MOVING, 4).diagnostic, undefined);
  assert.equal(run.engine.update(at(2, 106), CONFIRMED).diagnostic, undefined);

  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [3]);
});

/**
 * The same bar, and the entry beside it, which is the scope 17.1 does not have.
 *
 * `close()` on a bar executed four times sends one order. `buy(qty = 3)` on
 * that same bar sends four, and the leg holds twelve where the script wrote one
 * entry. The engine is right, because `language.md` 7.5 says a script may not
 * assume it runs once and must guard with `bar.isConfirmed`, and this asserts it
 * so that the sentence in 17.1 cannot be read as a general rule about the bar.
 */
test('an entry on a bar executed four times sends four orders', () => {
  const run = runFor([
    'version 1',
    'strategy("Probe", qty = 3, pyramiding = 50, onUnconfirmed = true)',
    'if bar.index == 1',
    '    buy(qty = 3)',
  ]);
  run.engine.append(at(0, 100), CONFIRMED, 3);
  run.engine.append(at(1, 101), MOVING, 3);
  run.engine.update(at(1, 102), MOVING);
  run.engine.update(at(1, 103), MOVING);
  run.engine.update(at(1, 104), CONFIRMED);

  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'buy'), [3, 3, 3, 3], 'the entry is not held to the close rule');
  assert.deepEqual(references(run, 'buy'), [1, 1, 1, 1], 'four entries, one position');
});

/**
 * A stated quantity across bars, which is the refusal rather than the silence.
 *
 * A close that works the number out is idempotent and says nothing (17.2). A
 * close that states one is making a claim about the leg, and with the whole of
 * it already going the claim is false. Catches an implementation that fixed the
 * bare close and left the stated one measured against the leg alone, which
 * would send three more against three already working.
 */
test('a stated close is refused while the whole leg is already going', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 3)',
    'if bar.index == 2',
    '    close(qty = 3)',
    'if bar.index == 3',
    '    close(qty = 3)',
  ]);
  const diagnostic = ranAnswering(run, 6, { 1: [frame(1, 3, 100)] });
  assert.deepEqual(crossings(run), []);
  assert.equal(total(run, 'sell'), 3, 'the run sent more than the leg ever held');
  assert.equal(diagnostic?.code, 'OS7017');
  assert.equal(diagnostic?.values['held'], 0);
});

/**
 * Two tags, each closed on every bar, with the destination silent.
 *
 * The parts are counted apart, so each sends its own once, and neither sends it
 * again. Catches a run-scoped count that takes every reduction out of every
 * part, which would leave tag b on the leg for good.
 */
test('two tags closed on every bar each send their own part once', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 2, tag = "a")',
    'if bar.index == 1',
    '    buy(qty = 2, tag = "b")',
    'if bar.index >= 3',
    '    close(tag = "a")',
    '    close(tag = "b")',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(ranAnswering(run, 7, { 2: [frame(1, 2, 100), frame(2, 2, 100)] }), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [2, 2]);
  assert.equal(total(run, 'sell'), 4, 'the four bars that asked sent more than the leg held');
});

/**
 * A crossing entry sent while a close is working.
 *
 * The outgoing position has nothing left to close, so the entry is opening a
 * replacement and belongs to a position of its own. Catches an engine that
 * attaches it to the outgoing reference, which is the late fill with no owner
 * the split exists to prevent.
 */
test('a crossing entry while a close is working opens a position of its own', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 3)',
    'if bar.index == 2',
    '    close()',
    'if bar.index == 3',
    '    sell(qty = 5)',
  ]);
  assert.equal(ranAnswering(run, 6, { 1: [frame(1, 3, 100)] }), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [3, 5]);
  const refs = references(run, 'sell');
  assert.notEqual(refs[0], refs[1], 'the replacement settled the position it replaced');
});

/**
 * `order.reverse` sent while a close is working sends only its opening half.
 *
 * The outgoing position is already going, so there is nothing for the closing
 * half to take, and the replacement is minted as it always is.
 */
test('a reverse while a close is working sends the replacement alone', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 3)',
    'if bar.index == 2',
    '    close()',
    'if bar.index == 3',
    '    order.reverse()',
  ]);
  assert.equal(ranAnswering(run, 6, { 1: [frame(1, 3, 100)] }), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [3, 3]);
  const refs = references(run, 'sell');
  assert.notEqual(refs[0], refs[1]);
});

/**
 * Nothing settled at all, so there is nothing to close and nothing is sent.
 *
 * The entry is still working, the leg is flat, and `close()` is the idempotence
 * of 17.2. Catches an implementation that reads what was ordered rather than
 * what was filled.
 */
test('a close while the entry itself is still working sends nothing', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 3)',
    'if bar.index >= 1',
    '    close()',
  ]);
  assert.equal(ranAnswering(run, 5, {}), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), []);
});

/**
 * And the entry that has been ordered and has not settled, read as position.
 *
 * `pos.size` is folded from settled fills, so an entry still at the venue is not
 * part of it. Catches an implementation that measures what is available against
 * what has been ordered rather than against what has settled: that one sends a
 * close of eight against a leg holding three, for five units that may never
 * exist, and if the entry is then rejected the strategy is short five.
 */
test('what is available to reduce is measured against what settled', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 3)',
    'if bar.index == 2',
    '    buy(qty = 5)',
    'if bar.index == 3',
    '    close()',
    'plot(pos.size, "Size")',
  ]);
  assert.equal(ranAnswering(run, 6, { 1: [frame(1, 3, 100)] }), undefined);
  assert.deepEqual(crossings(run), []);
  assert.deepEqual(quantities(run, 'sell'), [3], 'the unsettled entry was counted as position');
  assert.equal(run.engine.column(0)[5], 3, 'only the first entry ever settled');
});

/**
 * The count, in each of the four units a declaration may state.
 *
 * A bare close works its own number out, and a number the engine works out is
 * in units whatever the declaration counts in (`host-interface.md` 7.1), so the
 * count that holds it is the same count in all four. The destination is
 * answered in units at twenty five to the lot, which is the whole point: a
 * position is folded in units and a stated quantity is not.
 *
 * Catches a count narrowed to `"units"` along with the OS7017 comparison, which
 * is the narrowing beside it and is about a different number: that one sends
 * the position again on every bar under the other three.
 */
test('a bare close across bars sends one position in every qtyType', () => {
  for (const qtyType of ['units', 'lots', 'cash', 'equityPercent']) {
    const run = runFor([
      'version 1',
      `strategy("Probe", qty = 2, pyramiding = 50, qtyType = "${qtyType}")`,
      'if bar.index == 0',
      '    buy(qty = 3)',
      'if bar.index > 0 and pos.size > 0',
      '    close()',
      'plot(pos.size, "Size")',
    ]);
    assert.equal(ranAnswering(run, 9, { 1: [frame(1, 75, 100)] }), undefined, qtyType);
    assert.deepEqual(
      quantities(run, 'sell'),
      [75],
      `under ${qtyType} the leg was sent again after the first close`,
    );
    assert.deepEqual(references(run, 'sell'), [1], qtyType);
    assert.equal(run.engine.column(0)[8], 75, qtyType);
  }
});

/**
 * And the same across bars for the other call that reduces without a quantity.
 *
 * `order.reverse` sizes its closing half itself, so it is held by the same
 * count: with the leg's close already going there is nothing for it to close
 * and it sends its replacement alone. Catches a count read only by `close`.
 */
test('a reverse on every bar sends one closing order between them', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 0',
    '    buy(qty = 3)',
    'if bar.index > 0 and bar.index < 4 and pos.size > 0',
    '    order.reverse()',
  ]);
  assert.equal(ranAnswering(run, 6, { 1: [frame(1, 3, 100)] }), undefined);
  assert.deepEqual(crossings(run), []);
  // Three on the way out once, and one replacement per bar that asked, each on
  // a position of its own because each is opening one.
  assert.deepEqual(quantities(run, 'sell'), [3, 3, 3, 3]);
  const refs = references(run, 'sell');
  assert.equal(new Set(refs).size, 4, 'two of these settled one position');
  assert.equal(refs[0], 1, 'the closing half left the position it was closing');
});
