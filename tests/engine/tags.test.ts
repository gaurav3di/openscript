import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { Diagnostic } from '../../src/core/index.js';
import type { HostBar, OrderFrame, OrderIntent } from '../../src/core/engine/index.js';
import { Engine } from '../../src/core/engine/index.js';
import { HOST, running, timeOf } from './support.js';

/**
 * What a tag does at the engine, `stdlib.md` 17.2 and 17.3.
 *
 * Two things are held here, and they pull in opposite directions.
 *
 * **A tag that defaults to `""` is a label**, so a bracket or an entry carrying
 * a tag no order was ever placed with is an ordinary call that sends its intent.
 * The catalogue taught the opposite for a whole release: OS7009's worked example
 * was an `order.bracket` with an unknown tag, presented as a refusal, and a probe
 * against the built engine showed the intent going out with no diagnostic at all.
 *
 * **A close that flattens nothing stays silent**, which is the shape a refusal
 * for the mistyped tag was most likely to break. Closing a tag twice is how a
 * strategy is written, and closing one whose entry has not fired yet is what an
 * exit signal looks like on the first bar it is true. Neither is an error, and
 * neither may become one: the mistyped tag is settled by the checker, before any
 * bar runs, where the file can prove what the run cannot (OS7016).
 */

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

const PROBE = ['version 1', 'strategy("Probe", qty = 2, pyramiding = 50)'];

/** The intents of one kind and side, which is what each assertion below counts. */
function count(run: Run, kind: string, side?: string): number {
  return run.sent.filter((one) => one.kind === kind && (side === undefined || one.side === side)).length;
}

/**
 * The test that stops a future fix from breaking a working shape.
 *
 * A tag closed once and closed again after it flattened sends one order and
 * says nothing about the second call. Any refusal keyed on "this tag holds
 * nothing now" fails here, and so does one that sends a second order: closing a
 * part of a position that is already gone would open the other way round.
 */
test('closing a tag twice sends one order and says nothing', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 1, tag = "entry")',
    'if bar.index == 3 or bar.index == 5',
    '    close(tag = "entry")',
  ]);
  assert.equal(ran(run, 8), undefined);
  assert.equal(count(run, 'place', 'buy'), 1);
  assert.equal(count(run, 'place', 'sell'), 1, 'the second close sent an order of its own');
});

/**
 * The same silence, with the leg still holding something.
 *
 * The first shape is answered by the leg being flat. This one is not: the leg
 * holds the other tag's position throughout, so the close is asked about a tag
 * whose own rows have netted to nothing, and the answer is still nothing.
 */
test('closing a tag that holds nothing leaves the rest of the leg alone', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 1, tag = "core")',
    'if bar.index == 2',
    '    buy(qty = 1, tag = "runner")',
    'if bar.index == 4 or bar.index == 6',
    '    close(tag = "runner")',
  ]);
  assert.equal(ran(run, 9), undefined);
  assert.equal(count(run, 'place', 'buy'), 2);
  assert.equal(count(run, 'place', 'sell'), 1);
});

/**
 * A close on a tag whose entry has not happened yet.
 *
 * This is the shape that decided where OS7016 lives. On bar 3 the tag has never
 * named a ledger row, and the script is not wrong: its exit signal simply fired
 * before its entry did, which is an ordinary chart. An engine that refused a tag
 * naming no row would stop the bar here, and no guard a script can write today
 * would prevent it, because every call that reads the ledger is planned.
 */
test('a close whose entry has not fired yet is not refused', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 3',
    '    close(tag = "runner")',
    'if bar.index == 5',
    '    buy(qty = 1, tag = "runner")',
    'if bar.index == 7',
    '    close(tag = "runner")',
  ]);
  assert.equal(ran(run, 9), undefined);
  assert.equal(count(run, 'place', 'buy'), 1);
  // The close before the entry sent nothing; the one after it sent the exit.
  assert.equal(count(run, 'place', 'sell'), 1);
});

/**
 * The label half, measured rather than argued.
 *
 * `order.bracket`'s tag defaults to `""`, so it is a label carried to the
 * destination and not a reference to an order that must exist. The intent goes
 * out and nothing is refused, which is what OS7009's worked example denied.
 */
test('a bracket naming no order is sent, and nothing is refused', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 1, tag = "entry")',
    'if bar.index == 3',
    '    order.bracket(tag = "entries", loss = 10)',
  ]);
  assert.equal(ran(run, 6), undefined);
  assert.equal(count(run, 'bracket'), 1);
  assert.equal(run.sent.find((one) => one.kind === 'bracket')?.tag, 'entries');
});

// The same for the spelling that takes prices as well as distances, because a
// refusal added to one of the two and not the other is the disagreement this
// whole area was in.
test('an exit naming no order is sent, and nothing is refused', () => {
  const run = runFor([...PROBE, 'if bar.index == 1', '    exit(tag = "entries", loss = 10)']);
  assert.equal(ran(run, 4), undefined);
  assert.equal(count(run, 'bracket'), 1);
});

// And a bracket with no tag at all, which sends the empty label. A reference
// that defaulted to the empty string would be nonsense, and this is the
// measurement that says the default is a label.
test('a bracket with no tag written is sent with the empty tag', () => {
  const run = runFor([...PROBE, 'if bar.index == 1', '    order.bracket(loss = 10)']);
  assert.equal(ran(run, 4), undefined);
  assert.equal(run.sent.find((one) => one.kind === 'bracket')?.tag, '');
});

/**
 * The reference half: `cancel` requires its tag, and a tag naming no working
 * order is refused before anything reaches the destination.
 */
test('a cancellation naming no working order is refused and sends nothing', () => {
  const run = runFor([...PROBE, 'if bar.index == 1', '    cancel("entries")']);
  const diagnostic = ran(run, 4);
  assert.equal(diagnostic?.code, 'OS7009');
  assert.equal(diagnostic?.span.line, 4);
  assert.deepEqual(run.sent, []);
});

/**
 * The catalogue's worked examples, run rather than read.
 *
 * OS7009's before was an `order.bracket` that raises nothing, and its after
 * called `order.working`, which is planned, so the fix the catalogue handed a
 * reader was itself a refusal. Both halves are read out of the catalogue here so
 * that an edit which breaks them fails in this suite rather than in an editor.
 */
const CATALOGUE = new URL('../../../spec/errors.json', import.meta.url);

interface Entry {
  readonly code: string;
  readonly example?: { readonly before: string; readonly after: string };
}

function example(code: string): { readonly before: string; readonly after: string } {
  const parsed = JSON.parse(readFileSync(CATALOGUE, 'utf8')) as { readonly entries: readonly Entry[] };
  const found = parsed.entries.find((one) => one.code === code);
  assert.ok(found?.example, `${code} has no worked example in the catalogue`);
  return found.example;
}

test("the catalogue's before for OS7009 is refused, and sends nothing", () => {
  const run = runFor([...PROBE, ...example('OS7009').before.split('\n')]);
  const diagnostic = ran(run, 6);
  assert.equal(diagnostic?.code, 'OS7009');
  assert.equal(diagnostic?.span.line, 4);
  assert.deepEqual(run.sent, [], 'a refused call reached the destination');
});

test("the catalogue's after for OS7009 runs, and its orders leave", () => {
  const run = runFor([...PROBE, ...example('OS7009').after.split('\n')]);
  assert.equal(ran(run, 6), undefined);
  assert.equal(count(run, 'place', 'buy'), 6);
  assert.equal(count(run, 'cancel'), 6);
});

test("the catalogue's after for OS7016 runs, and flattens what it entered", () => {
  const run = runFor([...PROBE, ...example('OS7016').after.split('\n')]);
  assert.equal(ran(run, 6), undefined);
  // Flat on the even bars and long on the odd ones, so the entry and the exit
  // both happen and neither pair lands on one bar (OS7013).
  assert.ok(count(run, 'place', 'buy') > 0, 'the entry never left');
  assert.ok(count(run, 'place', 'sell') > 0, 'the close never left');
});
