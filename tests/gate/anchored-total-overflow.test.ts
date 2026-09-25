import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compared } from './numerical-deliveries.js';
import { anchoredTotalCases } from '../stdlib/anchored-total-overflow-cases.js';
import { encode } from '../stdlib/transcendental-cases.js';

// Each fixture marks an anchor bar with an open of 1, so the compiled call reads it.
const expressions = { pvt: 'pvt()', vwapAnchor: 'vwapAnchor(close, open > 0)' } as const;

for (const row of anchoredTotalCases()) {
  test(`compiled ${row.id} agrees with independent history and forming updates in both engines`, () => {
    const expression = expressions[row.name];
    const historical = compared(expression, row.bars.map((bar, index) => ({ index, bar })));
    assert.deepEqual(historical, row.expected.map((value, at) => [encode(value), encode(at ? row.expected[at - 1]! : null)]));
    const live = compared(expression, row.bars.flatMap((bar, index) => [
      { index, bar: { ...bar, close: index % 2 ? 1e308 : -1e308, volume: Number.MAX_VALUE } },
      { index, bar: { ...bar, volume: null } },
      { index, bar },
    ])).filter((_, at) => at % 3 === 2);
    assert.deepEqual(live, historical);
  });
}
