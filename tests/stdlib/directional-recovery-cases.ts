import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { HostBar } from '../../src/core/engine/index.js';

export interface DirectionalCase {
  id: string;
  bars: (HostBar & { volume: number })[];
  lengths: [number, number];
  expected: (number | null)[][];
}

/** Fixtures share an independent rounded-operation oracle with the second engine. */
export function directionalCases(): DirectionalCase[] {
  const result = spawnSync('python', ['-B', '-m', 'tests.test_directional_recovery', '--cases'], {
    cwd: resolve('engine'), encoding: 'utf8', maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as DirectionalCase[];
}
