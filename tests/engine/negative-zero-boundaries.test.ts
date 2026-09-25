import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Channels } from '../../src/core/engine/channels.js';
import { Memory } from '../../src/core/engine/memory.js';
import { Registers } from '../../src/core/engine/registers.js';
import type { Value } from '../../src/core/engine/values/index.js';
import { compile, engineFor, flat, running, timeOf } from './support.js';

const header = 'version 1\nstudy("Zero stores")\n';
const expressions = {
  raw: 'close', present: 'orElse(close, 1)', nested: 'orElse(orElse(close, 1), 2)',
  slot: 'held', cell: 'saved', history: 'held[1]', fallback: 'orElse(none, close)',
  nestedFallback: 'orElse(orElse(none, close), 1)', literal: 'orElse(none, -0)',
};

function positive(values: readonly Value[]): void {
  for (const value of values) if (value === 0) assert.equal(Object.is(value, -0), false);
}

test('register ingress normalizes zero before the current value becomes history', () => {
  const registers = new Registers(1);
  registers.set(0, -0);
  assert.equal(Object.is(registers.get(0), 0), true);
  registers.close(0);
  assert.equal(Object.is(registers.at(0, 1, 1), 0), true);
});

test('persistent stores normalize before a checkpoint or rollback can observe the value', () => {
  const memory = new Memory([{ id: 0, kind: 'var', name: 'saved' }], []);
  memory.store(0, -0);
  assert.equal(Object.is(memory.load(0), 0), true);
  memory.commit();
  memory.store(0, 2);
  assert.equal(Object.is(memory.previousCells().get(0), 0), true);
  memory.rollback();
  assert.equal(Object.is(memory.load(0), 0), true);
});

test('a channel stores positive zero before publication', () => {
  const channels = new Channels([{ id: 0, type: 'number', defer: false, once: false }]);
  channels.write(0, -0);
  assert.equal(Object.is(channels.read(0), 0), true);
});

test('compiled bar ingress normalizes direct, nested, stored and historical values', () => {
  const source = header + 'held = close\nvar saved = close\n' +
    Object.entries(expressions).map(([name, expression]) => `plot(${expression}, "${name}")`).join('\n');
  const engine = running(source);
  for (const [index, value] of [-0, 2, -0].entries()) {
    assert.equal(engine.append(flat(value, timeOf(index)), { isConfirmed: true }).diagnostic, undefined);
  }
  for (const plot of engine.program.outputs.plots) {
    const values = engine.column(plot.channel);
    positive(values);
    const expected = plot.title === 'history' ? [null, 0, 2] :
      plot.title === 'cell' || plot.title === 'literal' ? [0, 0, 0] : [0, 2, 0];
    assert.deepEqual(values, expected, String(plot.title));
  }
});

test('numeric defaults, runtime settings and source inputs normalize before function calls', () => {
  const source = header + 'fn identity(x) => x\n' +
    'amount = input(-0, "Amount")\nsrc = input(close, "Source")\n' +
    'plot(identity(amount), "Setting")\nplot(identity(src), "Source")\n';
  const compiled = compile('zero-inputs', source);
  assert.deepEqual(compiled.diagnostics, []);
  for (const settings of [{}, { amount: -0 }]) {
    const engine = engineFor(compiled, { settings });
    const result = engine.append(flat(-0), { isConfirmed: true });
    assert.equal(result.diagnostic, undefined);
    assert.deepEqual(engine.program.outputs.plots.map(plot => engine.column(plot.channel)[0]), [0, 0]);
  }
});

test('library host results normalize before function arguments and persistent storage', () => {
  const engine = running(header + 'fn identity(x) => x\nvar saved = chart.pointValue\n' +
    'plot(identity(chart.pointValue), "Argument")\nplot(saved, "Saved")\n',
  { host: { instrument: { symbol: 'AAA', exchange: 'XX', interval: '1', pointValue: -0 } } });
  const result = engine.append(flat(1), { isConfirmed: true });
  assert.equal(result.diagnostic, undefined);
  assert.deepEqual(engine.program.outputs.plots.map(plot => engine.column(plot.channel)[0]), [0, 0]);
});

test('typed host columns and requested contexts preserve the same positive-zero rule', () => {
  const engine = running(header + 'amount = input(1, "Amount")\n' +
    'plot(req.timeframe("5m", orElse(close, amount), mode = "developing"), "Read")\n' +
    'plot(req.timeframe("5m", amount, mode = "developing"), "Setting")\n',
  { settings: { amount: -0 } });
  const zero = new Float64Array([-0, -0]);
  const result = engine.run({ time: new Float64Array([timeOf(0), timeOf(1)]),
    open: zero, high: zero, low: zero, close: zero, volume: zero });
  assert.equal(result.diagnostic, undefined);
  assert.equal(engine.program.outputs.plots.length, 2);
  for (const plot of engine.program.outputs.plots) assert.deepEqual(engine.column(plot.channel), [0, 0]);
});

test('forming corrections and persistent history never restore a negative zero', () => {
  const engine = running(header + 'var saved = close\nheld = close\n' +
    'plot(saved, "Saved")\nplot(orElse(held[1], close), "Previous")\n');
  assert.equal(engine.append(flat(-0, timeOf(0)), { isConfirmed: true }).diagnostic, undefined);
  assert.equal(engine.append(flat(-0, timeOf(1)), { isConfirmed: false }).diagnostic, undefined);
  assert.equal(engine.update(flat(2, timeOf(1)), { isConfirmed: true }).diagnostic, undefined);
  for (const plot of engine.program.outputs.plots) assert.deepEqual(engine.column(plot.channel), [0, 0]);
});
