import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { Bar } from '../../src/core/stdlib/index.js';

export type StatisticsOverflowCase = {
  length: number;
  expected: (number | null)[];
} & ({ name: 'cci'; bars: Bar[] } | { name: 'correlation'; a: number[]; b: number[] });

export function statisticsOverflowCases(): StatisticsOverflowCase[] {
  const result = spawnSync('python', ['-B', '-m', 'tests.test_statistics_overflow', '--cases'], {
    cwd: resolve('engine'), encoding: 'utf8', maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as StatisticsOverflowCase[];
}
