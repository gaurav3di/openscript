import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { compileText, loadCompiled } from './support.js';
import type { Delivery } from './numerical-deliveries.js';
import { directionalCases } from '../stdlib/directional-recovery-cases.js';
import { encode } from '../stdlib/transcendental-cases.js';

function compared(lengths: number[], deliveries: Delivery[]): (string | null)[][] {
  const compiled = compileText('directional-recovery', 'version 1\nstudy("Directional recovery")\n' +
    `reading = adx(${lengths.join(',')})\na=element(reading,0)\np=element(reading,1)\nm=element(reading,2)\n` +
    'plot(a,"Strength")\nplot(p,"Rise")\nplot(m,"Fall")\nplot(a[1],"Previous strength")\n' +
    'plot(p[1],"Previous rise")\nplot(m[1],"Previous fall")\n');
  const engine = loadCompiled(compiled, 'directional-recovery');
  let previous = -1;
  const output = deliveries.map(({ index, bar }) => {
    const result = index === previous ? engine.update(bar) : engine.append(bar);
    assert.equal(result.diagnostic, undefined);
    previous = index;
    return compiled.program.outputs.plots.map(plot => encode(engine.column(plot.channel)[index] as number | null));
  });
  const python = spawnSync('python', ['-B', '-m', 'tests.test_directional_recovery', '--compiled'], {
    cwd: resolve('engine'), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    input: JSON.stringify({ program: compiled.program, deliveries }),
  });
  assert.equal(python.status, 0, python.stderr);
  assert.deepEqual(JSON.parse(python.stdout), output);
  return output;
}

for (const row of directionalCases()) {
  test(`compiled directional ${row.id} recovers through accepted and repeated forming observations`, () => {
    const history = compared(row.lengths, row.bars.map((bar, index) => ({ index, bar })));
    const expected = row.expected.map((values, index) => [
      ...values, ...(index ? row.expected[index - 1]! : [null, null, null]),
    ].map(encode));
    assert.deepEqual(history, expected);
    const revised = compared(row.lengths, row.bars.flatMap((bar, index) => [
      { index, bar: { ...bar, high: 1e308, low: -1e308, close: 0 } },
      { index, bar: { ...bar, high: null, low: null } },
      { index, bar },
    ])).filter((_, index) => index % 3 === 2);
    assert.deepEqual(revised, expected);
  });
}
