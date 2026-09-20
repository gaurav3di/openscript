/**
 * What a close sends, and the one quantity it will not send.
 *
 * `stdlib.md` 17.1 states it outright: **no order crosses zero.** A close is
 * the one call whose size has a ceiling, and for a whole release it applied
 * none to the quantity a script stated. Measured against the built engine, on a
 * leg holding one unit long, `close(qty = 5)` sent one sell of five: the leg
 * ended the bar four short, under one position reference, and nothing was said.
 * A call named close had opened a position.
 *
 * It is refused now, OS7017, and the half of this file that matters most is the
 * half that proves what was not refused. A close that states no quantity works
 * the number out itself, and closing a tag that holds nothing sends nothing and
 * says nothing. Those are the shapes a strategy is ordinarily written in, and
 * they are what a future fix to this area would break, so each of them is
 * asserted here beside the refusal rather than left to be inferred from it.
 *
 * The two look inconsistent side by side and are not. A quantity is an argument
 * the script wrote, so it is a claim about the strategy's own position and the
 * claim can be false. A call with no quantity asks the engine for the right
 * number, and there is nothing there to be wrong about.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { Diagnostic } from '../../src/core/index.js';
import type { HostBar, OrderFrame, OrderIntent } from '../../src/core/engine/index.js';
import { Engine } from '../../src/core/engine/index.js';
import { HOST, running, timeOf } from './support.js';

const CONFIRMED = { isConfirmed: true };

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

/** A leg that may hold several tags at once, so a part can be told from the whole. */
const PROBE = ['version 1', 'strategy("Probe", qty = 2, pyramiding = 50)'];

/** The quantities of one side, which is what most assertions below count. */
function quantities(run: Run, side: string): readonly (number | null)[] {
  return run.sent.filter((one) => one.kind === 'place' && one.side === side).map((one) => one.qty);
}

/**
 * The defect, measured.
 *
 * Catches the implementation this replaced, which passed the stated quantity
 * through as written: that one sends a sell of five, reports no diagnostic, and
 * leaves the leg four short.
 */
test('a close larger than the leg holds is OS7017 and reaches no destination', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 1)',
    'if bar.index == 3',
    '    close(qty = 5)',
  ]);
  const diagnostic = ran(run, 6);
  assert.equal(diagnostic?.code, 'OS7017');
  assert.equal(diagnostic?.span.line, 6);
  assert.equal(diagnostic?.span.column, 5);
  // The entry left and the close did not, so the leg is never short.
  assert.deepEqual(quantities(run, 'buy'), [1]);
  assert.deepEqual(quantities(run, 'sell'), []);
});

/**
 * The refusal is a refusal in the full sense the engine already means.
 *
 * A bar that places a good order and then meets this one sends nothing at all,
 * the good order included, because every call on a bar is mapped before any of
 * them is routed. Catches a refusal raised inside the routing loop, which would
 * have handed the first order over before reaching the second call.
 */
test('a bar that places a good order and then hits OS7017 sends nothing', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 1, tag = "good")',
    'if bar.index == 3',
    '    buy(qty = 1, tag = "good2")',
    '    close(qty = 5)',
  ]);
  const diagnostic = ran(run, 6);
  assert.equal(diagnostic?.code, 'OS7017');
  assert.deepEqual(quantities(run, 'buy'), [1], 'the good order on the refused bar was sent');
  // And the ledger holds a row for exactly what left, `stdlib.md` 17.7.
  assert.equal(run.engine.orders().length, 1);
});

/**
 * The test that matters most, and the one a future fix here would break.
 *
 * `close()` with no quantity goes on working the number out for itself. An
 * implementation that refused every close against a stated ceiling, or that
 * keyed the refusal on the call rather than on a quantity the script wrote,
 * sends nothing here and fails.
 */
test('close() with no quantity still flattens the leg, at the size it holds', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 3)',
    'if bar.index == 3',
    '    close()',
  ]);
  assert.equal(ran(run, 6), undefined);
  assert.deepEqual(quantities(run, 'sell'), [3]);
});

/**
 * The other half of the same guard: idempotence on a tag.
 *
 * Closing a tag twice, and closing one whose entry has not fired yet, are how a
 * strategy is written (`stdlib.md` 17.2). Both stay silent, and the leg holds
 * another tag throughout so that the silence is about the part rather than
 * about the leg being flat. Catches a refusal keyed on "this part holds nothing
 * now" that did not first ask whether a quantity was stated.
 */
test('closing a tag that holds nothing says nothing when no quantity is stated', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 1, tag = "core")',
    'if bar.index == 2',
    '    buy(qty = 1, tag = "runner")',
    'if bar.index == 4 or bar.index == 6',
    '    close(tag = "runner")',
    'if bar.index == 8',
    '    close(tag = "later")',
    'if bar.index == 9',
    '    buy(qty = 1, tag = "later")',
  ]);
  assert.equal(ran(run, 11), undefined);
  // One exit only: the second close of "runner", and the close written before
  // "later" entered, both had nothing to close.
  assert.deepEqual(quantities(run, 'sell'), [1]);
});

/**
 * The consequence, stated deliberately rather than discovered.
 *
 * The same tag, with a quantity written on it, is refused: the part holds
 * nothing and the call says it holds one. The leg still holds the other tag
 * throughout, so this is a refusal about the part and not about the leg.
 * Catches a refusal measured against the leg's whole position, which lets this
 * through.
 */
test('a stated quantity on a tag that has flattened is OS7017, naming the tag', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 1, tag = "core")',
    'if bar.index == 2',
    '    buy(qty = 1, tag = "runner")',
    'if bar.index == 4',
    '    close(tag = "runner")',
    'if bar.index == 6',
    '    close(tag = "runner", qty = 1)',
  ]);
  const diagnostic = ran(run, 9);
  assert.equal(diagnostic?.code, 'OS7017');
  assert.equal(diagnostic?.span.line, 10);
  assert.equal(diagnostic?.values['held'], 0);
  assert.deepEqual(quantities(run, 'sell'), [1], 'the refused close sent an order');
});

/**
 * A stated quantity inside what is held is an ordinary partial close.
 *
 * Both edges: four of ten, and ten of ten. Catches a comparison written as
 * `stated < held`, which refuses a close of exactly what the leg holds, and it
 * catches a blanket refusal of every quantity a close states.
 */
test('a stated quantity no larger than the position is sent as written', () => {
  const part = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 10)',
    'if bar.index == 3',
    '    close(qty = 4)',
  ]);
  assert.equal(ran(part, 6), undefined);
  assert.deepEqual(quantities(part, 'sell'), [4]);

  const whole = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 10)',
    'if bar.index == 3',
    '    close(qty = 10)',
  ]);
  assert.equal(ran(whole, 6), undefined);
  assert.deepEqual(quantities(whole, 'sell'), [10]);
});

/**
 * The narrowing, measured rather than promised.
 *
 * A quantity a script states is in the declaration's own unit and a position is
 * folded from filled quantities (`host-interface.md` 7.1), so the two are the
 * same kind of number only where that unit is units. A declaration counting in
 * lots is left alone, which `refuse.ts` says in its own list of what it will not
 * evaluate, and the lot size that would join the two is a fact the ledger is not
 * given. Catches a comparison that ignores the declaration.
 */
test('a declaration counting in lots is not held to this comparison', () => {
  const run = runFor([
    'version 1',
    'strategy("Probe", qty = 2, qtyType = "lots", pyramiding = 50)',
    'if bar.index == 1',
    '    buy(qty = 2)',
    'if bar.index == 3',
    '    close(qty = 40)',
  ]);
  assert.equal(ran(run, 6), undefined);
  assert.deepEqual(quantities(run, 'sell'), [40]);
});

/**
 * The catalogue's own worked example, run rather than read.
 *
 * `scripts/check-examples-compile.mjs` puts both blocks through the compiler
 * and the engine already. This holds the same pair against the quantities, so
 * an edit that keeps the example compiling while changing what it demonstrates
 * fails in this suite rather than in an editor.
 */
const CATALOGUE = new URL('../../../spec/errors.json', import.meta.url);

interface Entry {
  readonly code: string;
  readonly example?: { readonly before: string; readonly after: string };
}

function example(code: string): { readonly before: string; readonly after: string } {
  const parsed = JSON.parse(readFileSync(CATALOGUE, 'utf8')) as {
    readonly entries: readonly Entry[];
  };
  const found = parsed.entries.find((one) => one.code === code);
  assert.ok(found?.example, `${code} has no worked example in the catalogue`);
  return found.example;
}

test("the catalogue's before for OS7017 is refused, and no exit leaves", () => {
  const run = runFor([...PROBE, ...example('OS7017').before.split('\n')]);
  const diagnostic = ran(run, 6);
  assert.equal(diagnostic?.code, 'OS7017');
  assert.deepEqual(quantities(run, 'sell'), []);
});

test("the catalogue's after for OS7017 runs, and flattens what it entered", () => {
  const run = runFor([...PROBE, ...example('OS7017').after.split('\n')]);
  assert.equal(ran(run, 8), undefined);
  assert.ok(quantities(run, 'buy').length > 0, 'the entry never left');
  assert.deepEqual(quantities(run, 'sell'), quantities(run, 'buy'), 'the close was not the entry');
});
