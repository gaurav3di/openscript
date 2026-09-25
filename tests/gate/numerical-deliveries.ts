import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { HostBar } from '../../src/core/engine/index.js';
import { compileText, loadCompiled } from './support.js';
import { encode } from '../stdlib/transcendental-cases.js';

export interface Delivery { index: number; bar: HostBar }

/** Compare actual compiled history and forming updates in both runtimes. */
export function compared(expression: string, deliveries: Delivery[]): (string | null)[][] {
  const compiled = compileText('numerical-recovery', 'version 1\nstudy("Numerical recovery")\n' +
    `value = ${expression}\nplot(value,"Current")\nplot(value[1],"Previous")\n`);
  const engine = loadCompiled(compiled, 'numerical-recovery');
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
