import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { StateRecord, Value } from '../../src/core/stdlib/index.js';
import * as lib from '../../src/core/stdlib/index.js';
import { ContributionHistory } from '../../src/core/stdlib/values/index.js';

const cases: readonly [string, readonly Value[], readonly Value[], readonly Value[]][] = [
  ['shrink', [1, 2, 3], [3, 3, 2], [null, null, 5]],
  ['maximum warmup', [1, 2, 3, 4, 5], [5, 2, 2, 2, 2], [null, null, null, null, 9]],
  ['growth', [1, 2, 3, 4, 5, 6], [2, 2, 2, 5, 5, 5], [null, 3, 5, null, 15, 20]],
  ['absent lengths', [1, 2, 3, 4], [null, null, 3, 2], [null, null, 6, 7]],
  ['holes', [1, null, 3, 4, 5, 6], [3, 3, 2, 2, 3, 3], [null, null, null, 7, 12, 15]],
];

for (const [name, source, lengths, expected] of cases) {
  test(`finite lookback ${name} uses contributions and the largest observed warmup`, () => {
    const state = lib.newState();
    assert.deepEqual(source.map((value, i) => lib.sumStep(state, 'sum', value, lengths[i]!)), expected);
  });
}

test('the current length sets the mean divisor after larger warmup', () => {
  const state = lib.newState();
  const values = [1, 2, 3, 4, 5].map((v, i) => lib.smaStep(state, 'mean', v, i === 0 ? 5 : 2));
  assert.deepEqual(values, [null, null, null, null, 4.5]);
});

test('paired holes retain alignment across growth and shrink', () => {
  const state = lib.newState();
  const lengths = [2, 2, 4, 2, 2];
  const pairs = [{ a: 1, b: 2 }, { a: 2, b: null }, { a: 3, b: 6 }, { a: 4, b: 8 }, { a: 5, b: 10 }];
  assert.deepEqual(pairs.map((pair, i) => lib.correlationStep(state, 'pair', pair, lengths[i]!)),
    [null, null, null, 1, 1]);
});

test('skipping sums keep holes but still obey maximum warmup', () => {
  const state = lib.newState();
  const values = [1, null, 3, null].map((v, i) => lib.sumSkipStep(state, 'sum', v, i === 0 ? 4 : 2));
  assert.deepEqual(values, [null, null, null, 3]);
});

test('different keys and branch-local contributions have independent clocks', () => {
  const state = lib.newState();
  const left: Value[] = [], right: Value[] = [];
  for (let at = 1; at <= 6; at += 1) {
    left.push(lib.sumStep(state, 'left', at, at === 1 ? 5 : 2));
    if (at % 2 === 0) right.push(lib.sumStep(state, 'right', at, at === 2 ? 3 : 2));
  }
  assert.deepEqual(left, [null, null, null, null, 9, 11]);
  assert.deepEqual(right, [null, null, 10]);
});

test('snapshots fork contribution history and restore a forming bar length', () => {
  const state = lib.newState();
  lib.sumStep(state, 'sum', 1, 3);
  lib.sumStep(state, 'sum', 2, 3);
  const checkpoint = lib.copyState(state);
  assert.equal(lib.sumStep(state, 'sum', 300, 10), null);
  const corrected = lib.copyState(checkpoint);
  assert.equal(lib.sumStep(corrected, 'sum', 7, 3), 10);
  assert.equal(lib.sumStep(corrected, 'sum', 8, 2), 15);
  const fork = lib.copyState(checkpoint);
  assert.equal(lib.sumStep(fork, 'sum', 4, 2), 6);
  assert.equal(lib.sumStep(corrected, 'sum', 9, 5), 27);
});

test('fixed-length addition stays oldest first and repeated pushes keep their view current', () => {
  const held = lib.makeLookback(3);
  for (const value of [1e16, -1e16, 1]) held.push(value);
  assert.equal(held.sum(), 1);
  held.push(2);
  assert.equal(held.at(0), 2);
  assert.equal(held.at(2), -1e16);
});

test('many small windows can later read the complete large window', () => {
  const state: StateRecord = lib.newState();
  for (let at = 1; at < 8192; at += 1) lib.sumStep(state, 'sum', at, 2);
  assert.equal(lib.sumStep(state, 'sum', 8192, 8192), 8192 * 8193 / 2);
});

test('cloud lines keep independent fixed and varying readiness', () => {
  const fixed = lib.newState(), varying = lib.newState();
  const fixedRows = [], varyingRows = [];
  for (let at = 1; at <= 5; at += 1) {
    const bar = { open: at, high: at + 1, low: at - 1, close: at, volume: 1 };
    fixedRows.push(lib.ichimokuStep(fixed, '', bar, 2, 3, 5));
    varyingRows.push(lib.ichimokuStep(varying, '', bar, at === 1 ? 5 : 2, 3, 2));
  }
  assert.deepEqual(fixedRows, [
    [null, null, null, null, null], [1.5, null, null, null, null],
    [2.5, 2, 2.25, null, 3], [3.5, 3, 3.25, null, 4], [4.5, 4, 4.25, 3, 5],
  ]);
  assert.deepEqual(varyingRows, [
    [null, null, null, null, null], [null, null, null, 1.5, null],
    [null, 2, null, 2.5, 3], [null, 3, null, 3.5, 4], [4.5, 4, 4.25, 4.5, 5],
  ]);
});

test('immutable checkpoints share sealed chunks while mutable queues remain detached', () => {
  let history = new ContributionHistory();
  let copiedCells = 0;
  for (let at = 0; at < 4096; at += 1) {
    const next = history.append(at);
    copiedCells += next.tail.length;
    if (next.head !== history.head) {
      assert.equal(next.head!.values, history.tail);
      assert.equal(next.head!.prior, history.head);
    }
    assert.ok(Object.isFrozen(next) && Object.isFrozen(next.tail));
    if (next.head) assert.ok(Object.isFrozen(next.head));
    history = next;
  }
  assert.ok(copiedCells <= 4096 * 32);
  const state: StateRecord = { history, mutable: [1, 2] };
  const snapshot = lib.copyState(state);
  assert.equal(snapshot['history'], history);
  assert.notEqual(snapshot['mutable'], state['mutable']);
  const left = history.append(9), right = history.append(11);
  assert.equal(left.head!.prior, right.head!.prior);
  assert.equal(left.view(1).at(0), 9);
  assert.equal(right.view(1).at(0), 11);
  assert.equal(history.view(1).at(0), 4095);
});

test('large-window indexing walks each chunk once and never revisits history per value', () => {
  let history = new ContributionHistory();
  for (let at = 0; at < 32768; at += 1) history = history.append(at);
  let links = 0;
  type Chunk = NonNullable<ContributionHistory['head']>;
  const measured = (node: Chunk | null): Chunk | null => node === null ? null : ({
    values: node.values,
    get prior() { links += 1; return measured(node.prior); },
  });
  const instrumented = new ContributionHistory(measured(history.head), history.tail, history.count);
  const view = instrumented.view(8192);
  const before = links;
  assert.ok(before <= 8192 / 32);
  let total = 0;
  for (let at = 0; at < 8192; at += 1) total += view.at(at)!;
  assert.equal(total, (24576 + 32767) * 8192 / 2);
  assert.equal(links, before);
  instrumented.view(2);
  assert.equal(links, before);
});
