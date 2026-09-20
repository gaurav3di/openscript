/**
 * Where a position comes from.
 *
 * The defect these exist to catch is the one that cost this phase a strategy:
 * `pos.size` read absent on a host built from the specification, because the
 * only thing that answered it was a position row the host interface says a host
 * is never asked for. `flat = pos.size == 0` was absent rather than true, the
 * branch was not taken, and a shipped strategy placed nothing, said nothing and
 * drew its plots as if it were working.
 *
 * So the first test below runs a target strategy on a host that supplies bars, a
 * route and nothing else, and asserts that it trades. Every test after it is
 * about the fold that makes the number honest: frames repeat, cross in flight
 * and arrive after the order they are about has ended, and an engine that added
 * each frame's quantity to a running total would report a position the strategy
 * never held.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  HostBar,
  OrderFrame,
  OrderIntent,
  RoutedEffect,
} from '../../src/core/engine/index.js';
import { Engine } from '../../src/core/engine/index.js';
import { HOST, bars, compileTarget, engineFor, running, states, timeOf } from './support.js';

/** A run that collects what it sent, so a test can answer with frames. */
interface Run {
  readonly engine: Engine;
  readonly sent: OrderIntent[];
  readonly effects: RoutedEffect[];
}

function runFor(text: string): Run {
  const sent: OrderIntent[] = [];
  const effects: RoutedEffect[] = [];
  const engine = running(text, {
    host: {
      ...HOST,
      route: (effect) => {
        effects.push(effect);
        for (const intent of effect.intents) sent.push(intent);
      },
    },
  });
  return { engine, sent, effects };
}

/** A bar at one price, dated so that a series stays strictly increasing. */
function at(index: number, close: number): HostBar {
  return { open: close, high: close, low: close, close, volume: 1, time: timeOf(index) };
}

const CONFIRMED = { isConfirmed: true };

/** A frame in the shape `host-interface.md` 7.2 fixes. */
function frame(
  intentId: number,
  status: string,
  filledQty: number,
  avgFillPrice?: number,
): OrderFrame {
  return avgFillPrice === undefined
    ? { intentId, status, filledQty }
    : { intentId, status, filledQty, avgFillPrice };
}

test('a strategy on a host with no position row still trades', () => {
  // The whole defect in one assertion. The host here is the one a reader of
  // `host-interface.md` would build: bars, an instrument record, a route, and
  // no position anywhere, because the document says the engine is neither
  // handed one nor asks for one.
  const sent: OrderIntent[] = [];
  const engine = engineFor(compileTarget('10-strategy-ema-cross.oscript'), {
    host: {
      ...(HOST.instrument === undefined ? {} : { instrument: HOST.instrument }),
      ...(HOST.now === undefined ? {} : { now: HOST.now }),
      route: (effect) => {
        for (const intent of effect.intents) sent.push(intent);
      },
    },
  });
  const run = engine.run(bars(200), states(200));
  assert.equal(run.diagnostic, undefined, run.diagnostic?.code);
  const orders = sent.filter((intent) => intent.kind === 'place');
  assert.ok(orders.length > 0, 'the strategy placed nothing at all');
  assert.ok(
    orders.every((intent) => intent.side === 'buy' || intent.side === 'sell'),
    'an order that stated no side',
  );
  assert.ok(
    sent.some((intent) => intent.kind === 'bracket'),
    'the stop and target the script attaches to its entry reached nobody',
  );
});

test('an intent carries the fields a host is promised, and an id of its own', () => {
  const run = runFor(
    ['version 1', 'strategy("Probe", qty = 2)', 'if bar.index == 1', '    buy(tag = "in")'].join(
      '\n',
    ),
  );
  run.engine.run([at(0, 100), at(1, 101), at(2, 102)], [CONFIRMED, CONFIRMED, CONFIRMED]);

  assert.equal(run.sent.length, 1);
  const intent = run.sent[0] as OrderIntent;
  assert.equal(intent.kind, 'place');
  assert.equal(intent.side, 'buy');
  // The declaration's size, because the call named none. Written by the
  // declaration and not invented here: `qty = 2` is in the source above.
  assert.equal(intent.qty, 2);
  assert.equal(intent.qtyType, 'units');
  assert.equal(intent.type, 'market');
  assert.equal(intent.tag, 'in');
  assert.equal(intent.product, 'intraday');
  assert.equal(intent.bar.index, 1);
  assert.equal(intent.bar.time, timeOf(1));
  assert.equal(intent.instrument.symbol, 'AAA');
  assert.ok(intent.intentId > 0, 'an intent with no id has nothing a frame can name');
});

test('a position is folded from the fills reported for the orders the run sent', () => {
  const source = [
    'version 1',
    'strategy("Probe", qty = 10)',
    'if bar.index == 0',
    '    buy()',
    'plot(pos.size, "Size")',
    'plot(pos.avgPrice, "Entry")',
  ].join('\n');
  const run = runFor(source);
  const sizes = () => run.engine.column(0);
  const prices = () => run.engine.column(1);

  run.engine.append(at(0, 100), CONFIRMED, 4);
  // Bar 0: the order has left and nothing has come back. Flat is zero rather
  // than absent, because zero is the true size.
  assert.equal(sizes()[0], 0);
  assert.equal(prices()[0], null);

  run.engine.deliver(frame(1, 'filled', 10, 101.5));
  run.engine.append(at(1, 101), CONFIRMED, 4);
  assert.equal(sizes()[1], 10);
  assert.equal(prices()[1], 101.5);

  // The same frame again, which a reconnecting session resends. A cumulative
  // quantity that is not greater adds nothing.
  run.engine.deliver(frame(1, 'filled', 10, 101.5));
  run.engine.append(at(2, 102), CONFIRMED, 4);
  assert.equal(sizes()[2], 10, 'a repeated frame was counted twice');
});

test('a frame changes nothing until the bar it arrived in has ended', () => {
  const run = runFor(
    [
      'version 1',
      'strategy("Probe", qty = 4)',
      'if bar.index == 0',
      '    buy()',
      'plot(pos.size, "Size")',
    ].join('\n'),
  );
  run.engine.append(at(0, 100), CONFIRMED, 3);
  run.engine.deliver(frame(1, 'filled', 4, 100));
  // The same bar again, which is what a live feed does on every tick. Nothing
  // reaches a running execution, so the re-execution sees what the first saw.
  run.engine.update(at(0, 100), CONFIRMED);
  assert.equal(run.engine.column(0)[0], 0, 'a frame reached an execution that had already begun');

  run.engine.append(at(1, 101), CONFIRMED, 3);
  assert.equal(run.engine.column(0)[1], 4);
});

test('a fill after a terminal status raises the quantity and keeps the word', () => {
  // A venue reports a fill after a cancellation acknowledgement whenever a
  // cancel races a fill. An engine that refused that frame has lost a real
  // fill, and the loss is invisible from inside the script.
  const run = runFor(
    [
      'version 1',
      'strategy("Probe", qty = 5)',
      'if bar.index == 0',
      '    buy()',
      'plot(pos.size, "Size")',
    ].join('\n'),
  );
  run.engine.append(at(0, 100), CONFIRMED, 3);
  run.engine.deliver(frame(1, 'cancelled', 0));
  run.engine.deliver(frame(1, 'cancelled', 5, 100));
  run.engine.append(at(1, 101), CONFIRMED, 3);

  assert.equal(run.engine.column(0)[1], 5, 'the late fill was thrown away');
  const row = run.engine.orders()[0];
  assert.equal(row?.status, 'cancelled', 'the status forgot how the order ended');
  assert.equal(row?.filledQty, 5);
});

test('a frame naming an order this run never placed is refused and recorded', () => {
  const run = runFor(['version 1', 'strategy("Probe")', 'plot(pos.size, "Size")'].join('\n'));
  run.engine.append(at(0, 100), CONFIRMED, 2);
  run.engine.deliver(frame(4321, 'filled', 9, 100));
  const result = run.engine.append(at(1, 101), CONFIRMED, 2);

  assert.equal(result.frames.length, 1);
  assert.equal(result.frames[0]?.refused, 'unknownIntent');
  assert.equal(run.engine.column(0)[1], 0, 'a stranger fill moved this strategy');
});

test('a flattening order sends what the strategy holds, on the other side', () => {
  const run = runFor(
    [
      'version 1',
      'strategy("Probe", qty = 7)',
      'if bar.index == 0',
      '    buy()',
      'if bar.index == 2',
      '    close()',
    ].join('\n'),
  );
  run.engine.append(at(0, 100), CONFIRMED, 4);
  run.engine.deliver(frame(1, 'filled', 7, 100));
  run.engine.append(at(1, 101), CONFIRMED, 4);
  run.engine.append(at(2, 102), CONFIRMED, 4);

  assert.equal(run.sent.length, 2);
  const out = run.sent[1] as OrderIntent;
  assert.equal(out.side, 'sell');
  // Units, because this quantity was folded from filled quantities rather than
  // stated by the script.
  assert.equal(out.qty, 7);
  assert.equal(out.qtyType, 'units');
  // The same position, so a fill that arrives late settles the position it
  // belonged to.
  assert.equal(out.positionRef, (run.sent[0] as OrderIntent).positionRef);
});

test('flattening a position the strategy does not hold sends nothing', () => {
  const run = runFor(
    ['version 1', 'strategy("Probe")', 'if bar.index == 1', '    close()'].join('\n'),
  );
  run.engine.run([at(0, 100), at(1, 101)], [CONFIRMED, CONFIRMED]);
  assert.deepEqual(run.sent, [], 'an order was invented for a position nobody held');
});

test('reducing a position leaves the price the position was opened at', () => {
  const source = [
    'version 1',
    'strategy("Probe", qty = 10)',
    'if bar.index == 0',
    '    buy()',
    'if bar.index == 2',
    '    close(qty = 4)',
    'plot(pos.size, "Size")',
    'plot(pos.avgPrice, "Entry")',
  ].join('\n');
  const run = runFor(source);
  run.engine.append(at(0, 100), CONFIRMED, 5);
  run.engine.deliver(frame(1, 'filled', 10, 100));
  run.engine.append(at(1, 101), CONFIRMED, 5);
  run.engine.append(at(2, 102), CONFIRMED, 5);
  run.engine.deliver(frame(2, 'filled', 4, 130));
  run.engine.append(at(3, 103), CONFIRMED, 5);

  assert.equal(run.engine.column(0)[3], 6);
  // 100, not the 130 the four units left at and not an average of the two: what
  // remains is still the average of what was bought, and every level measured
  // from the entry is measured from this.
  assert.equal(run.engine.column(1)[3], 100);
});

test('a position that closes reads flat again, and its price goes absent', () => {
  const source = [
    'version 1',
    'strategy("Probe", qty = 3)',
    'if bar.index == 0',
    '    buy()',
    'if bar.index == 2',
    '    close()',
    'plot(pos.size, "Size")',
    'plot(pos.avgPrice, "Entry")',
  ].join('\n');
  const run = runFor(source);
  run.engine.append(at(0, 100), CONFIRMED, 5);
  run.engine.deliver(frame(1, 'filled', 3, 100));
  run.engine.append(at(1, 101), CONFIRMED, 5);
  run.engine.append(at(2, 102), CONFIRMED, 5);
  run.engine.deliver(frame(2, 'filled', 3, 110));
  run.engine.append(at(3, 103), CONFIRMED, 5);

  assert.equal(run.engine.column(0)[3], 0);
  assert.equal(run.engine.column(1)[3], null, 'a flat position reported a price');
});

test('a study never reaches the ledger, and a run of one sends nothing', () => {
  const run = runFor(['version 1', 'study("Probe")', 'plot(close, "Close")'].join('\n'));
  run.engine.run([at(0, 100), at(1, 101)], [CONFIRMED, CONFIRMED]);
  assert.deepEqual(run.effects, []);
  assert.deepEqual(run.engine.orders(), []);
});

test('a bracket reaches the host as the level the script wrote', () => {
  // An entry and its bracket on one bar, which is the shape every strategy in
  // examples/ is written in. The entry has not filled, so there is no price to
  // measure a distance from: a distance reaches the host as a distance, and the
  // host measures it from the fill it is about to report.
  const run = runFor(
    [
      'version 1',
      'strategy("Probe", qty = 1)',
      'if bar.index == 0',
      '    buy(tag = "in")',
      '    exit(tag = "in", stop = 95, limit = 110)',
      'if bar.index == 1',
      '    order.bracket(tag = "in", profit = 4, loss = 2)',
    ].join('\n'),
  );
  run.engine.run([at(0, 100), at(1, 101)], [CONFIRMED, CONFIRMED]);

  assert.equal(run.sent.length, 3);
  const absolute = run.sent[1] as OrderIntent;
  assert.equal(absolute.kind, 'bracket');
  assert.equal(absolute.stop, 95);
  assert.equal(absolute.target, 110);
  assert.equal(absolute.tag, 'in');

  const distances = run.sent[2] as OrderIntent;
  assert.equal(distances.kind, 'bracket');
  assert.equal(distances.profit, 4);
  assert.equal(distances.loss, 2);

  // A level is not an order: neither of them appended a row or moved anything.
  assert.equal(run.engine.orders().length, 1);
});

test('a cancellation names a tag and states no side, size or price', () => {
  const run = runFor(
    [
      'version 1',
      'strategy("Probe", qty = 1)',
      'if bar.index == 0',
      '    buy(limit = 90, tag = "rest")',
      'if bar.index == 1',
      '    cancelAll()',
    ].join('\n'),
  );
  run.engine.run([at(0, 100), at(1, 101)], [CONFIRMED, CONFIRMED]);

  assert.equal(run.sent.length, 2);
  const cancel = run.sent[1] as OrderIntent;
  assert.equal(cancel.kind, 'cancel');
  assert.equal(cancel.tag, 'rest');
  assert.equal(cancel.side, null);
  assert.equal(cancel.qty, null);
  assert.equal(run.engine.orders().length, 1, 'a cancellation appended a row of its own');
});
