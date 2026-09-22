/**
 * The calculation: the engine driven from a chart's recompute.
 *
 * Three properties matter more than any single number here, because each of them
 * fails silently and each of them draws a plausible chart while it does.
 *
 * A bar time crossing the boundary in the wrong unit is out by a factor of a
 * thousand, and a study anchored to a date then starts at the wrong bar or never
 * starts at all. The incremental path splices a tail onto a history, and a tail
 * computed from the wrong starting state is wrong from that bar onwards and
 * right before it. And a moving bar re-executes on every tick, so a path that
 * appends instead of re-executing draws a different study depending on how many
 * ticks a bar happened to take.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChartValues } from '../../../src/adapters/charts/index.js';
import { release } from '../../../src/adapters/charts/index.js';
import { BASE_TIME, bars, compile, context, descriptorOf, descriptorOfSource, refusalOf } from './support.js';
import { backtest, settingsFor } from '../../../src/core/backtest/index.js';

/** The tail the incremental path served, or a failure saying it refused one. */
function served(values: ChartValues | null | undefined): ChartValues {
  if (values === null || values === undefined) {
    throw new Error('the incremental path refused a run it was able to serve');
  }
  return values;
}

/** The values as one flat list, for comparing two runs entry by entry. */
function flat(values: ChartValues): string {
  return Object.keys(values)
    .sort()
    .map((key) => `${key}:${(values[key] ?? []).join(',')}`)
    .join('|');
}

test('every plot column is as long as the bars, with a gap where the warmup is', () => {
  const data = bars(200);
  const values = descriptorOf('01-ema-cross.oscript').calc(data, {}, {}, context(200));
  const fast = values['p0'];
  const slow = values['p1'];
  assert.ok(fast !== undefined && slow !== undefined);
  assert.equal(fast.length, data.length);
  assert.equal(slow.length, data.length);
  // A gap is a null and not a zero, or the line would be drawn down to the axis
  // through its own warmup and the pane would autoscale to it.
  assert.equal(fast[0], null);
  assert.equal(typeof fast[data.length - 1], 'number');
  // The slower average starts later than the faster one, which is the one
  // ordering a column built from the wrong channel would get wrong.
  assert.ok(slow.findIndex((one) => one !== null) > fast.findIndex((one) => one !== null));
});

test('a time input is read as a bar time, in the units the engine counts in', () => {
  // The whole of this test is the factor of a thousand between a chart's seconds
  // and the engine's milliseconds. An anchor written for bar 100 has to start
  // the study at bar 100: a missing conversion puts the anchor in 1970 and the
  // study starts at bar 0, and the plot still looks like a study.
  const data = bars(200);
  const anchor = new Date((BASE_TIME + 100 * 60) * 1000).toISOString().slice(0, 16).replace('T', ' ');
  const values = descriptorOf('03-anchored-vwap.oscript').calc(
    data,
    { anchorTime: anchor },
    {},
    context(200),
  );
  const column = values['p0'];
  assert.ok(column !== undefined);
  assert.equal(column.findIndex((one) => one !== null), 100);
});

test('the incremental path and the full path agree bar for bar', () => {
  // An anchored running total, deliberately: a study whose value on a bar is a
  // sum of every bar before it is the one a tail spliced onto the wrong starting
  // state gets wrong, and a stateless study would pass this test however the
  // tail was computed.
  const data = bars(150);
  const descriptor = descriptorOf('03-anchored-vwap.oscript');
  const whole = descriptor.calc(data, {}, {}, context(150));

  const store = {};
  descriptor.calc(data.slice(0, 149), {}, store, context(149));
  const tail = served(descriptor.calcTail?.(data, {}, 148, {}, store, context(150)));

  // Every key the full path produces has to come back from the tail, because a
  // key the tail leaves out is dropped from the spliced result rather than kept.
  assert.deepEqual(Object.keys(tail).sort(), Object.keys(whole).sort());
  for (const key of Object.keys(whole)) {
    const full = whole[key] ?? [];
    const part = tail[key] ?? [];
    assert.equal(part.length, 2, key);
    assert.deepEqual([part[0], part[1]], [full[148], full[149]], key);
  }
});

test('a moving bar draws the same study however many ticks it took', () => {
  // Catches a tail that appends the newest bar instead of re-executing it. The
  // running totals behind an anchored average would then carry all four ticks
  // rather than the one bar, and the line would sit somewhere no single
  // execution of the data would put it.
  const data = bars(120);
  const descriptor = descriptorOf('03-anchored-vwap.oscript');
  const settled = descriptor.calc(data, {}, {}, context(120));

  const store = {};
  descriptor.calc(data.slice(0, 119), {}, store, context(119));
  const last = data[119];
  assert.ok(last !== undefined);
  for (const close of [last.close + 4, last.close - 5, last.close + 2, last.close]) {
    const moving = [...data.slice(0, 119), { ...last, close }];
    descriptor.calcTail?.(moving, {}, 118, {}, store, context(120, true));
  }
  const replayed = served(descriptor.calcTail?.(data, {}, 119, {}, store, context(120)));
  for (const key of Object.keys(settled)) {
    assert.deepEqual(replayed[key]?.[0], (settled[key] ?? [])[119], key);
  }
});

test('a settings change refuses the incremental path rather than splicing onto it', () => {
  const data = bars(80);
  const descriptor = descriptorOf('01-ema-cross.oscript');
  const store = {};
  descriptor.calc(data, { fastLen: 9 }, store, context(80));
  assert.equal(descriptor.calcTail?.(data, { fastLen: 30 }, 79, {}, store, context(80)), null);
  assert.notEqual(descriptor.calcTail?.(data, { fastLen: 9 }, 79, {}, store, context(80)), null);
});

test('the incremental path refuses a store holding nothing, and one that was released', () => {
  // Catches a tail read off whatever happens to be in the store: a store with no
  // engine in it, or one a host has finished with, has to send the chart back to
  // a full recompute rather than splice onto a history that is not there.
  const data = bars(40);
  const descriptor = descriptorOf('01-ema-cross.oscript');
  assert.equal(descriptor.calcTail?.(data, {}, 39, {}, {}, context(40)), null);

  const store = {};
  descriptor.calc(data, {}, store, context(40));
  release(store);
  assert.equal(descriptor.calcTail?.(data, {}, 39, {}, store, context(40)), null);
});

test('a setting the host stored is what the study computes with', () => {
  const data = bars(120);
  const descriptor = descriptorOf('01-ema-cross.oscript');
  const nine = descriptor.calc(data, { fastLen: 9 }, {}, context(120));
  const thirty = descriptor.calc(data, { fastLen: 30 }, {}, context(120));
  assert.notEqual(flat(nine), flat(thirty));
});

test('a setting the input refuses stops the study rather than falling back', () => {
  // A settings dialog that silently ignores what a user typed is worse than one
  // that says the value is out of range, so the minimum of one is a refusal.
  const refusal = refusalOf(() =>
    descriptorOf('01-ema-cross.oscript').calc(bars(20), { fastLen: 0 }, {}, context(20)),
  );
  assert.equal(refusal.code, 'OS6019');
  assert.equal(refusal.line, 0);
  // A chart tells a bad setting from a defect by the name, because one of them
  // is something the user can fix from the dialog in front of them.
  assert.equal(refusal.name, 'IndicatorInputError');
});

test('a strategy with nowhere to send an order is refused, and runs when given one', () => {
  const data = bars(60);
  const refusal = refusalOf(() =>
    descriptorOf('10-strategy-ema-cross.oscript').calc(data, {}, {}, context(60)),
  );
  assert.equal(refusal.code, 'OS6006');

  const routed = descriptorOf('10-strategy-ema-cross.oscript', { orders: () => {} });
  const values = routed.calc(data, {}, {}, context(60));
  assert.equal(values['p0']?.length, data.length);
});

test('a simulated destination folds the position, so a reversal actually reverses', () => {
  // THE DEFECT THIS EXISTS FOR. A strategy handed a destination that answers
  // nothing runs, draws and is wrong about itself: no frame ever reaches the
  // ledger, so it never learns it holds anything, every close closes nothing and
  // every entry is allowed again on the next signal. Measured on a stop and
  // reverse script before this, five buys and no sells.
  //
  // The position is read back through the script rather than asserted on the
  // engine, because what a chart draws is what a reader sees.
  const source = [
    'version 1',
    'strategy("Reversing", overlay = true, qty = 1)',
    'up = close > close[1] and close[1] <= close[2]',
    'dn = close < close[1] and close[1] >= close[2]',
    'if up',
    '    buy(qty = 1 + abs(pos.size), tag = "L")',
    'if dn',
    '    sell(qty = 1 + abs(pos.size), tag = "S")',
    'plot(pos.size, "Position")',
    '',
  ].join('\n');

  const data = bars(80);
  const drawn = descriptorOfSource(source, { simulateOrders: true })
    .calc(data, {}, {}, context(80));
  const position = (drawn['p0'] ?? []).filter((one) => typeof one === 'number');

  // Both sides are held at some point, which is only true if the fills folded.
  assert.ok(
    position.some((one) => (one as number) > 0),
    'the strategy was never long, so no fill reached the ledger',
  );
  assert.ok(
    position.some((one) => (one as number) < 0),
    'the strategy was never short, so a reversal only ever flattened',
  );
});

test('a simulated chart run and a backtest of the same script agree', () => {
  // The reason the chart borrows the backtest's own venue rather than a simpler
  // one written for it. Two venues is two answers to what a bar would have
  // filled at, and a trader reading marks on the price and trades in a report
  // would be reading two different runs of one strategy.
  const source = [
    'version 1',
    'strategy("Agreeing", overlay = true, qty = 1)',
    'up = close > close[1] and close[1] <= close[2]',
    'dn = close < close[1] and close[1] >= close[2]',
    'if up',
    '    buy(qty = 1 + abs(pos.size), tag = "L")',
    'if dn',
    '    sell(qty = 1 + abs(pos.size), tag = "S")',
    'plot(pos.size, "Position")',
    '',
  ].join('\n');

  const data = bars(80);
  const onChart = descriptorOfSource(source, { simulateOrders: true })
    .calc(data, {}, {}, context(80));
  const position = (onChart['p0'] ?? []).filter((one) => typeof one === 'number') as number[];

  const ran = backtest(
    compile('agreeing.oscript', source),
    data.map((bar) => ({
      time: bar.time, open: bar.open, high: bar.high, low: bar.low,
      close: bar.close, volume: bar.volume ?? null, oi: bar.oi ?? null,
    })),
    // The contract the chart's venue builds for itself, with one difference
    // that cannot be helped: a backtest is refused without a currency, because
    // it charges and a charge with no unit on it is a number. A chart never
    // charges, so its venue states none. Neither reaches a fill, which is what
    // this test compares.
    settingsFor({
      symbol: null, exchange: null, currency: 'XXX',
      tickSize: null, lotSize: null, pointValue: 1, digits: 2,
    }),
    {},
  );
  assert.ok(ran.ok, 'the backtest of the same script was refused');
  if (!ran.ok) return;

  // The chart's last position and the report's open size are the same fact.
  const last = position[position.length - 1] ?? 0;
  const open = ran.record.report.trades
    .filter((one) => one.isOpen)
    .reduce((sum, one) => sum + (one.side === 'short' ? -one.units : one.units), 0);
  assert.equal(last, open);
});

test('a strategy is still refused where the host asked for no simulation', () => {
  // The refusal above this is the one a host that meant to wire a destination
  // and forgot has to see. Simulation is asked for; filling one in would turn
  // that mistake into a chart that draws convincingly and routes nothing.
  const source = [
    'version 1',
    'strategy("Unrouted", overlay = true, qty = 1)',
    'buy(tag = "L")',
    'plot(close, "Close")',
    '',
  ].join('\n');

  const refusal = refusalOf(() =>
    descriptorOfSource(source).calc(bars(20), {}, {}, context(20)),
  );
  assert.equal(refusal.code, 'OS6006');
});

test('a script that stops on a bar reports its own diagnostic, at its own line', () => {
  const descriptor = descriptorOfSource(
    [
      'version 1',
      'study("Runaway")',
      'limits(loops = 10)',
      'var total = 0',
      'for i = 0 to 100',
      '    total = total + 1',
      'plot(total, "Total")',
      '',
    ].join('\n'),
  );
  const refusal = refusalOf(() => descriptor.calc(bars(5), {}, {}, context(5)));
  assert.equal(refusal.code, 'OS5001');
  // The loop that was stopped, not the call that drew the plot.
  assert.equal(refusal.line, 5);
  assert.equal(refusal.name, 'OpenScriptError');
});

test('a per-bar colour reaches the plot instead of being lost on the way', () => {
  // A colour is not a number and a chart's values table holds only numbers, so
  // this is the one mapping that cannot be a rename. Catches it arriving as a
  // null column, which paints every bar in the plot's own colour and looks like
  // a study whose condition is never true.
  const data = bars(40);
  const descriptor = descriptorOfSource(
    'version 1\nstudy("Painted", overlay = true)\nplot(close, "Close", color = close > open ? lime : red)\n',
  );
  const values = descriptor.calc(data, {}, {}, context(40));
  const plot = descriptor.plots[0];
  assert.ok(plot !== undefined && plot.colorBy !== undefined);

  const painted = new Set<string>();
  for (let index = 0; index < data.length; index += 1) {
    const value = values['p0']?.[index];
    if (typeof value !== 'number') continue;
    const colour = plot.colorBy({ value, index, values, settings: {} });
    if (colour !== undefined) painted.add(colour);
  }
  assert.deepEqual([...painted].sort(), ['rgba(0, 255, 0, 1)', 'rgba(255, 0, 0, 1)']);
});

test('a level is drawn at the price the last bar wrote, and not drawn without one', () => {
  const descriptor = descriptorOf('04-rsi-divergence.oscript');
  const data = bars(120);
  const values = descriptor.calc(data, {}, {}, context(120));
  assert.deepEqual(
    descriptor.levels?.({ settings: {}, bars: data, values }).map((one) => one.price),
    [70, 50, 30],
  );

  // A level whose price is absent on the last bar is a level that is not drawn,
  // rather than one drawn at a substituted price the script never asked for.
  const late = descriptorOfSource(
    'version 1\nstudy("Late")\nlevel(sma(close, 20), "Average")\nplot(close, "Close")\n',
  );
  const few = bars(5);
  assert.deepEqual(late.levels?.({ settings: {}, bars: few, values: late.calc(few, {}, {}, context(5)) }), []);
});

test('the keys a chart does not draw are carried without colliding with a plot', () => {
  const data = bars(60);
  const values = descriptorOf('04-rsi-divergence.oscript').calc(data, {}, {}, context(60));
  assert.deepEqual(Object.keys(values).sort(), [
    'openscript:level:0',
    'openscript:level:1',
    'openscript:level:2',
    'p0',
  ]);
});

test('settings the program never declared are ignored rather than refused', () => {
  // A chart's settings object carries the generated appearance keys and its own
  // timezone, and an engine handed those would refuse a program that is fine.
  const data = bars(40);
  const values = descriptorOf('01-ema-cross.oscript').calc(
    data,
    { 'p0:color': '#ffffff', 'p0:width': 3, timezone: 'Etc/UTC' },
    {},
    context(40),
  );
  assert.equal(values['p0']?.length, data.length);
});
