/**
 * What the order layer refuses, `errors.md` OS7002 to OS7013.
 *
 * The defect these exist to catch is one silence with two shapes. A call the
 * language says is refused returned an empty list, so the script was told
 * nothing and nothing was sent; or a value the engine filled in for itself
 * reached a venue as an order nobody wrote. Five documents and a shipped
 * example taught the refusals as behaviour, and a probe on a page-built host
 * found that `buy(qty = none)` filled at the declared size, that two opposite
 * orders on one bar both filled while the position read zero, and that a
 * pyramiding limit of one let three entries through.
 *
 * Every test below asserts a code and the line the refusal points at, never the
 * wording, and every one of them asserts that the destination was handed
 * nothing: a refusal that reports an order after sending it is the failure this
 * whole area is about.
 *
 * The two tests at the end are the other direction. An order layer that refused
 * everything would pass every test above it, so one holds the documented
 * default that absence on `buy` still means, and one holds the fix OS7008's own
 * entry offers.
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

/**
 * Runs bars until one fails, filling every order the bar sent.
 *
 * The venue answers because three of the rules below are about a position, and
 * a position is folded from settled fills and from nothing else. Frames are
 * delivered at the boundary, which is where `host-interface.md` 7.4 puts them.
 */
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

/** The refusal a script produced, with the destination held to having seen nothing. */
function refusalOf(lines: readonly string[], bars = 5): Diagnostic {
  const run = runFor(lines);
  const diagnostic = ran(run, bars);
  assert.notEqual(diagnostic, undefined, 'the script ran to the end and nothing was refused');
  return diagnostic as Diagnostic;
}

const PROBE = ['version 1', 'strategy("Probe", qty = 2)'];

test('an order argument the surface requires and the script left absent is OS7002', () => {
  // The quantity and the side of order.place are required, so absence in either
  // is a number the script did not have rather than a default it left out.
  const qty = refusalOf([...PROBE, 'if bar.index == 1', '    order.place("buy", none)']);
  assert.equal(qty.code, 'OS7002');
  assert.equal(qty.span.line, 4);

  const side = refusalOf([...PROBE, 'if bar.index == 1', '    order.place(none, 2)']);
  assert.equal(side.code, 'OS7002');

  const tag = refusalOf([...PROBE, 'if bar.index == 1', '    cancel(none)']);
  assert.equal(tag.code, 'OS7002');
});

test('a quantity of zero or less is OS7004, and no order leaves', () => {
  const run = runFor([...PROBE, 'if bar.index == 1', '    buy(qty = 0 - 3)']);
  const diagnostic = ran(run, 4);
  assert.equal(diagnostic?.code, 'OS7004');
  assert.equal(diagnostic?.span.line, 4);
  assert.deepEqual(run.sent, [], 'a quantity the engine refused was sent anyway');

  const zero = refusalOf([...PROBE, 'if bar.index == 1', '    buy(qty = 0)']);
  assert.equal(zero.code, 'OS7004');
});

test('a resting price between two ticks is OS7006', () => {
  // The host's record states a tick size of 0.05, so a price at a third of a
  // tick is one the instrument cannot trade and a backtest must not fill.
  const run = runFor([...PROBE, 'if bar.index == 1', '    buy(qty = 1, limit = 100.017)']);
  const diagnostic = ran(run, 4);
  assert.equal(diagnostic?.code, 'OS7006');
  assert.equal(diagnostic?.span.line, 4);
  assert.deepEqual(run.sent, []);
});

test('a price that falls on a tick is not refused', () => {
  // The other half of the rule, because a tick test written with a bare equality
  // refuses this one as well: 100.05 divided by 0.05 is not exact in binary.
  const run = runFor([...PROBE, 'if bar.index == 1', '    buy(qty = 1, limit = 100.05)']);
  assert.equal(ran(run, 4), undefined);
  assert.equal(run.sent.length, 1);
});

test('a type that names a price it was not given is OS7007', () => {
  const limit = refusalOf([...PROBE, 'if bar.index == 1', '    order.place("buy", 1, type = "limit")']);
  assert.equal(limit.code, 'OS7007');
  assert.equal(limit.span.line, 4);

  const stop = refusalOf([...PROBE, 'if bar.index == 1', '    order.place("buy", 1, type = "stop")']);
  assert.equal(stop.code, 'OS7007');
});

test('an entry beyond the declared pyramiding limit is OS7008', () => {
  const run = runFor([
    'version 1',
    'strategy("Probe", qty = 2, pyramiding = 1)',
    'if bar.index == 1 or bar.index == 3',
    '    buy(qty = 1)',
  ]);
  const diagnostic = ran(run, 6);
  assert.equal(diagnostic?.code, 'OS7008');
  assert.equal(diagnostic?.span.line, 4);
  // The first entry left and the second did not, which is the whole of what the
  // limit means: refused rather than added to a position the declaration forbade.
  assert.equal(run.sent.length, 1);
});

test('a limit the declaration raises lets the second entry through', () => {
  const run = runFor([
    'version 1',
    'strategy("Probe", qty = 2, pyramiding = 2)',
    'if bar.index == 1 or bar.index == 3',
    '    buy(qty = 1)',
  ]);
  assert.equal(ran(run, 6), undefined);
  assert.equal(run.sent.length, 2);
});

test('a cancellation naming no working order is OS7009', () => {
  const diagnostic = refusalOf([...PROBE, 'if bar.index == 1', '    cancel("nope")']);
  assert.equal(diagnostic.code, 'OS7009');
  assert.equal(diagnostic.span.line, 4);
});

test('a bracket price on the wrong side of the entry is OS7010', () => {
  // The stop is above a long entry, where it fills at once and turns every
  // trade into an instant loss that looks like a strategy result.
  const diagnostic = refusalOf([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 1, tag = "in")',
    'if bar.index == 3',
    '    exit(tag = "in", stop = 500)',
  ]);
  assert.equal(diagnostic.code, 'OS7010');
  assert.equal(diagnostic.span.line, 6);
});

test('a bracket on the entry bar is not refused, because there is no entry yet', () => {
  // The shape every strategy in examples/ is written in. The entry has not
  // filled, so there is nothing for the level to be on the wrong side of.
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 1, tag = "in")',
    '    exit(tag = "in", stop = 50, limit = 150)',
  ]);
  assert.equal(ran(run, 4), undefined);
  assert.equal(run.sent.length, 2);
});

test('two opposite orders on one bar are OS7013, and neither reaches the destination', () => {
  const run = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 1)',
    'if bar.index == 1',
    '    sell(qty = 1)',
  ]);
  const diagnostic = ran(run, 4);
  assert.equal(diagnostic?.code, 'OS7013');
  // The second call is where the pair becomes visible, and it is the one a
  // reader has to change.
  assert.equal(diagnostic?.span.line, 6);
  assert.deepEqual(run.sent, [], 'an order of a refused pair was handed over');
});

test('an order call that names no quantity still takes the declared size', () => {
  // The one absence that is not OS7002. A compiled program carries no
  // difference between an argument left out and one written as absent
  // (`compiled-program.md` 4.10), and `stdlib.md` 17.2 gives this one a
  // default, so refusing it would refuse every script that uses the default.
  const run = runFor([...PROBE, 'if bar.index == 1', '    buy(tag = "in")']);
  assert.equal(ran(run, 4), undefined);
  assert.equal(run.sent.length, 1);
  assert.equal((run.sent[0] as OrderIntent).qty, 2);
});

test('the fix OS7008 offers is one that works', () => {
  // A fix that would not stop the refusal is worse than no fix, because a
  // reader trusts it. The entry names pos.size, so a script guarded on it runs
  // to the end however many bars its signal is true on.
  const run = runFor([
    'version 1',
    'strategy("Probe", qty = 2, pyramiding = 1)',
    'if pos.size == 0 and bar.index > 0',
    '    buy(qty = 1)',
  ]);
  assert.equal(ran(run, 8), undefined);
  assert.equal(run.sent.length, 1);
});

/**
 * The catalogue's own worked example for OS7002, run.
 *
 * `spec/errors.json` prints `buy(qty = 1, stop = lowest(low, 20))` as the before
 * of OS7002 and the guarded form as the after. Run on a host built from the
 * specification, the before raised nothing at all. The window is absent for its
 * first twenty bars, an absent stop reached the engine as the same value as a
 * stop nobody wrote, and the call became a **market** order on every one of
 * those bars: nineteen unprotected entries, then stop orders, from the example
 * the catalogue teaches the refusal with. A stop entry silently became a market
 * entry on every warmup bar.
 *
 * Both halves are read out of the catalogue rather than copied here, so an edit
 * that breaks the example fails here rather than in a reader's editor.
 */
const CATALOGUE = new URL('../../../spec/errors.json', import.meta.url);

function example(code: string): { readonly before: string; readonly after: string } {
  const text = readFileSync(CATALOGUE, 'utf8');
  const parsed = JSON.parse(text) as { readonly entries: readonly Entry[] };
  const found = parsed.entries.find((one) => one.code === code);
  assert.ok(found?.example, `${code} has no worked example in the catalogue`);
  return found.example;
}

interface Entry {
  readonly code: string;
  readonly example?: { readonly before: string; readonly after: string };
}

/** A declaration that lets an entry repeat, so the after runs past its first. */
const ROOM = ['version 1', 'strategy("Probe", qty = 2, pyramiding = 50)'];

test("the catalogue's before for OS7002 is refused, and sends nothing", () => {
  const run = runFor([...ROOM, ...example('OS7002').before.split('\n')]);
  const diagnostic = ran(run, 25);
  assert.equal(diagnostic?.code, 'OS7002');
  // The stop, not the quantity: the quantity was written and is a number.
  assert.equal(diagnostic?.values['argument'], 'stop');
  assert.equal(diagnostic?.span.line, 3);
  assert.deepEqual(run.sent, [], 'the window had not filled and an order was sent anyway');
});

test("the catalogue's after for OS7002 runs, and every order it sends is a stop", () => {
  const run = runFor([...ROOM, ...example('OS7002').after.split('\n')]);
  assert.equal(ran(run, 25), undefined);
  // Bar 19 is the first with twenty lows behind it, so the guard opens there.
  assert.equal(run.sent.length, 6);
  for (const intent of run.sent) {
    assert.equal(intent.kind === 'place' ? intent.type : null, 'stop');
  }
});

/**
 * Every order argument that carries a default, written and absent.
 *
 * One shape, swept rather than sampled, because the defect was the shape and
 * not the argument: a default the compiler substituted for a value the script
 * wrote. An absent quantity sent the declared size, an absent limit or stop sent
 * a market order, an absent quantity on a close flattened the whole position,
 * and an absent tag untagged the order. Each row writes the argument as `none`
 * and expects to be named by the refusal.
 *
 * `cancelAll` is not here because it takes no argument, and `leg` is not here
 * because a file with one leg names no leg (`stdlib.md` 17.2).
 */
const WRITTEN_ABSENT: readonly (readonly [string, string])[] = [
  ['buy(qty = none)', 'qty'],
  ['buy(qty = 1, limit = none)', 'limit'],
  ['buy(qty = 1, stop = none)', 'stop'],
  ['buy(qty = 1, tag = none)', 'tag'],
  ['sell(qty = none)', 'qty'],
  ['sell(qty = 1, limit = none)', 'limit'],
  ['sell(qty = 1, stop = none)', 'stop'],
  ['sell(qty = 1, tag = none)', 'tag'],
  ['close(tag = none)', 'tag'],
  ['close(qty = none)', 'qty'],
  ['exit(tag = none)', 'tag'],
  ['exit(tag = "in", qty = none)', 'qty'],
  ['exit(tag = "in", limit = none)', 'limit'],
  ['exit(tag = "in", stop = none)', 'stop'],
  ['exit(tag = "in", profit = none)', 'profit'],
  ['exit(tag = "in", loss = none)', 'loss'],
  ['cancel(none)', 'tag'],
  ['order.place(none, 1)', 'side'],
  ['order.place("buy", none)', 'qty'],
  ['order.place("buy", 1, type = none)', 'type'],
  ['order.place("buy", 1, price = none)', 'price'],
  ['order.place("buy", 1, trigger = none)', 'trigger'],
  ['order.place("buy", 1, tag = none)', 'tag'],
  ['order.reverse(qty = none)', 'qty'],
  ['order.reverse(tag = none)', 'tag'],
  ['order.bracket(tag = none)', 'tag'],
  ['order.bracket(profit = none)', 'profit'],
  ['order.bracket(loss = none)', 'loss'],
];

for (const [source, argument] of WRITTEN_ABSENT) {
  test(`${source} is OS7002 naming ${argument}`, () => {
    const run = runFor([...PROBE, 'if bar.index == 1', `    ${source}`]);
    const diagnostic = ran(run, 4);
    assert.equal(diagnostic?.code, 'OS7002');
    assert.equal(diagnostic?.values['argument'], argument);
    assert.equal(diagnostic?.span.line, 4);
    assert.deepEqual(run.sent, [], 'a call the engine refused reached the destination');
  });
}

/**
 * The other half, which is the half that must not become a refusal.
 *
 * An argument the script does not write takes the default `stdlib.md` prints,
 * and that is what the defaults work earlier in this phase exists for. A rule
 * that refused absence outright would refuse every one of these.
 */
test('an argument left out takes its documented default and is not refused', () => {
  // No prices written at all: a market order, stdlib.md 17.2.
  const market = runFor([...PROBE, 'if bar.index == 1', '    buy(qty = 1)']);
  assert.equal(ran(market, 4), undefined);
  assert.equal(market.sent.length, 1);
  assert.equal(
    market.sent[0]?.kind === 'place' ? market.sent[0].type : null,
    'market',
  );

  // A stop written: a stop order, which is what the market order above was
  // standing in for on every warmup bar of the catalogue's example.
  const resting = runFor([...PROBE, 'if bar.index == 1', '    buy(qty = 1, stop = 99.95)']);
  assert.equal(ran(resting, 4), undefined);
  assert.equal(resting.sent[0]?.kind === 'place' ? resting.sent[0].type : null, 'stop');

  // No quantity written: the declaration's own size.
  const sized = runFor([...PROBE, 'if bar.index == 1', '    buy(tag = "in")']);
  assert.equal(ran(sized, 4), undefined);
  assert.equal(sized.sent[0]?.qty, 2);

  // No quantity written on a close: the whole position.
  const flat = runFor([
    ...PROBE,
    'if bar.index == 1',
    '    buy(qty = 3, tag = "in")',
    'if bar.index == 3',
    '    close()',
  ]);
  assert.equal(ran(flat, 6), undefined);
  assert.equal(flat.sent.length, 2);
  assert.equal(flat.sent[1]?.qty, 3);
});
