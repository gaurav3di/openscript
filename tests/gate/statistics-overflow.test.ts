import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HostBar } from '../../src/core/engine/index.js';
import { compared } from './numerical-deliveries.js';
import { statisticsOverflowCases } from '../stdlib/statistics-overflow-cases.js';
import { encode } from '../stdlib/transcendental-cases.js';

for (const [index, row] of statisticsOverflowCases().entries()) {
  test(`compiled ${row.name} named overflow case ${index} agrees with independent history and updates`, () => {
    const expression = row.name === 'cci' ? `cci(${row.length})` : `correlation(close,open,${row.length})`;
    const bars = row.expected.map((_, at): HostBar => ({
      time: 1700000000000 + at * 60000,
      ...(row.name === 'cci' ? row.bars[at]! : {
        open: row.b[at]!, close: row.a[at]!, high: row.a[at]!, low: row.a[at]!, volume: 1,
      }),
    }));
    const historical = compared(expression, bars.map((bar, at) => ({ index: at, bar })));
    assert.deepEqual(historical, row.expected.map((value, at) => [encode(value), encode(at ? row.expected[at - 1]! : null)]));
    const live = compared(expression, bars.flatMap((bar, at) => [
      { index: at, bar: { ...bar, close: at % 2 ? 1e308 : -1e308 } },
      { index: at, bar },
    ])).filter((_, at) => at % 2 === 1);
    assert.deepEqual(live, historical);
  });
}
