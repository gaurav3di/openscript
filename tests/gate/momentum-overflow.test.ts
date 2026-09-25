import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HostBar } from '../../src/core/engine/index.js';
import { compared } from './numerical-deliveries.js';
import { momentumCases } from '../stdlib/momentum-overflow-cases.js';
import { encode } from '../stdlib/transcendental-cases.js';

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
