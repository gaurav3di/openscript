import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import type { HostBar } from '../../src/core/engine/index.js';
import { compileText, loadCompiled } from './support.js';
import { momentumCases } from '../stdlib/momentum-overflow-cases.js';
import { encode } from '../stdlib/transcendental-cases.js';

interface Delivery { index: number; bar: HostBar }

function compared(expression: string, deliveries: Delivery[]): (string | null)[][] {
  const compiled = compileText('momentum-recovery', 'version 1\nstudy("Momentum recovery")\n' +
    `value = ${expression}\nplot(value,"Current")\nplot(value[1],"Previous")\n`);
  const engine = loadCompiled(compiled, 'momentum-recovery');
  let previous = -1;
  const output = deliveries.map(({ index, bar }) => {
    const result = index === previous ? engine.update(bar) : engine.append(bar);
    assert.equal(result.diagnostic, undefined);
    previous = index;
    return compiled.program.outputs.plots.map(plot => encode(engine.column(plot.channel)[index] as number | null));
  });
  const python = spawnSync('python', ['-B', '-m', 'tests.test_momentum_overflow', '--compiled'], {
    cwd: resolve('engine'), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    input: JSON.stringify({ program: compiled.program, deliveries }),
  });
  assert.equal(python.status, 0, python.stderr);
  assert.deepEqual(JSON.parse(python.stdout), output);
  return output;
}

for (const [index, row] of momentumCases().entries()) {
  test(`compiled ${row.name} case ${index} preserves overflow holes and recovers in history and forming updates`, () => {
    const expression = `${row.name}(close,${row.lengths.join(',')})`;
    const bars = row.source.map((close, at): HostBar => ({ time: 1700000000000 + at * 60000,
      open: close, high: close, low: close, close, volume: 1 }));
    const historical = compared(expression, bars.map((bar, at) => ({ index: at, bar })));
    assert.deepEqual(historical, row.expected.map((value, at) => [encode(value), encode(at ? row.expected[at - 1]! : null)]));
    const live = compared(expression, bars.flatMap((bar, at) => [
      { index: at, bar: { ...bar, close: at % 2 ? 1e308 : -1e308 } },
      { index: at, bar },
    ])).filter((_, at) => at % 2 === 1);
    assert.deepEqual(live, historical);
  });
}

test('compiled ultimate oscillator propagates named-range overflow and resumes on valid bars', () => {
  const bars = [1e308, -1e308, 1, 2].map((close, index): HostBar => ({
    time: 1700000000000 + index * 60000, open: close, high: close, low: close, close, volume: 1,
  }));
  const historical = compared('ultimateOsc(1,1,1)', bars.map((bar, index) => ({ index, bar })));
  assert.deepEqual(historical, [[null, null], [null, null], [encode(100), null], [encode(100), encode(100)]]);
});

test('compiled ultimate oscillator propagates window-sum overflow until it expires', () => {
  const bars = [1e308, 1e308, 1e308, 1, 1].map((high, index): HostBar => ({
    time: 1700000000000 + index * 60000, open: 0, high, low: 0, close: 0, volume: 1,
  }));
  const historical = compared('ultimateOsc(2,2,2)', bars.map((bar, index) => ({ index, bar })));
  assert.deepEqual(historical, [[null, null], [null, null], [null, null], [encode(0), null], [encode(0), encode(0)]]);
});
