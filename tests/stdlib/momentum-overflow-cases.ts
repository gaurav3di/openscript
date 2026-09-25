import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export interface MomentumCase {
  name: 'tsi' | 'rsi' | 'cmo';
  source: (number | null)[];
  lengths: number[];
  expected: (number | null)[];
}

/** Inputs and independent exact-operation oracle, shared with the second engine. */
export function momentumCases(): MomentumCase[] {
  const result = spawnSync('python', ['-B', '-m', 'tests.test_momentum_overflow', '--cases'], {
    cwd: resolve('engine'), encoding: 'utf8', maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as MomentumCase[];
}
