import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { HostBar } from '../../src/core/engine/index.js';

export interface AnchoredTotalCase {
  id: string;
  name: 'pvt' | 'vwapAnchor';
  bars: (HostBar & { close: number | null; volume: number | null })[];
  anchors: boolean[];
  expected: (number | null)[];
}

/** Fixtures share an independent rounded-operation oracle with the second engine. */
export function anchoredTotalCases(): AnchoredTotalCase[] {
  const result = spawnSync('python', ['-B', '-m', 'tests.test_anchored_total_overflow', '--cases'], {
    cwd: resolve('engine'), encoding: 'utf8', maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as AnchoredTotalCase[];
}
