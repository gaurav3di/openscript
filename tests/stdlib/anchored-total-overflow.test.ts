/**
 * An overflowing term is absent on its own bar and leaves the anchored total alone.
 *
 * The wrong implementation this catches adds a term without checking it, so an
 * overflow in the change, the proportion or the product stores an infinite total
 * and every later reading is absent (`compiled-program.md` 3.1 with `stdlib.md`
 * 20.6). The expected values come from an independent oracle in the second
 * engine's tests, which rounds each stated operation from exact operands.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as lib from '../../src/core/stdlib/index.js';
import { anchoredTotalCases, type AnchoredTotalCase } from './anchored-total-overflow-cases.js';

function whole(row: AnchoredTotalCase, bars = row.bars, anchors = row.anchors): lib.Value[] {
  if (row.name === 'pvt') return lib.pvt(bars);
  return lib.vwapAnchor(bars.map(bar => bar.close), bars.map(bar => bar.volume), anchors);
}

function step(row: AnchoredTotalCase, state: lib.StateRecord, bar: AnchoredTotalCase['bars'][number], reset: boolean) {
  if (row.name === 'pvt') return lib.pvtStep(state, 'one', bar);
  return lib.vwapAnchorStep(state, 'one', { src: bar.close, volume: bar.volume, reset });
}

test('pvt keeps its total when a change overflows, as the specification computes it', () => {
  const bars = [1, 1e308, -1e308, 2, 3].map(close => ({ open: close, high: close, low: close, close, volume: 1 }));
  assert.deepEqual(lib.pvt(bars), [null, 1e308, null, 1e308, 1e308]);
});

test('vwapAnchor skips an overflowing product and keeps both totals', () => {
  assert.deepEqual(lib.vwapAnchor([10, 1e308, 20, 30], [2, 1e10, 6, 2], [true, false, false, false]),
    [10, null, 17.5, 20]);
});

for (const row of anchoredTotalCases()) {
  test(`${row.id} preserves the independent exact values at every prefix`, () => {
    for (let end = 0; end <= row.bars.length; end++) {
      assert.deepEqual(whole(row, row.bars.slice(0, end), row.anchors.slice(0, end)), row.expected.slice(0, end));
    }
  });

  test(`${row.id} restores forming observation state`, () => {
    let state = lib.newState();
    const values = row.bars.map((bar, at) => {
      const saved = lib.copyState(state);
      step(row, state, { ...bar, close: at % 2 ? 1e308 : -1e308, volume: Number.MAX_VALUE }, row.anchors[at]!);
      state = lib.copyState(saved);
      return step(row, state, bar, row.anchors[at]!);
    });
    assert.deepEqual(values, row.expected);
  });

  if (row.name === 'vwapAnchor') {
    test(`${row.id} is the same calculation through the session average`, () => {
      assert.deepEqual(lib.vwap(row.bars.map(bar => bar.close), row.bars.map(bar => bar.volume), row.anchors),
        row.expected);
    });
  }
}
