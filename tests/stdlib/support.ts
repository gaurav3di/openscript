/**
 * What the numeric library's tests assert, and how.
 *
 * Two rules, both here rather than repeated in every file.
 *
 * **A value is compared exactly.** Not within a tolerance. `compiled-program.md`
 * section 8 makes the order of floating point operations part of the contract,
 * so a test that accepted a value within an epsilon would pass for an
 * implementation that reassociated a sum, and reassociating a sum is precisely
 * what the contract forbids. A tolerance here would make the whole
 * specification unenforceable while looking like a careful test.
 *
 * **A warmup is compared as an index.** The first bar with a value, and the
 * count of bars with a value. Asserting the values alone would not catch a
 * function that produced the right numbers one bar early, which is the failure
 * every warmup in `stdlib.md` exists to rule out.
 */
import assert from 'node:assert/strict';

import type { Series, Tail, Value } from '../../src/core/stdlib/index.js';
import { fold } from '../../src/core/stdlib/index.js';

/** The index of the first bar that has a value, or -1 when none does. */
export function firstValueAt(series: Series): number {
  for (let index = 0; index < series.length; index += 1) {
    if (series[index] !== null && series[index] !== undefined) return index;
  }
  return -1;
}

/** Every bar from `from` onward has a value, and every bar before it does not. */
export function assertWarmup(series: Series, from: number, what: string): void {
  assert.equal(firstValueAt(series), from, `${what}: first value should be at bar ${from}`);
  for (let index = from; index < series.length; index += 1) {
    assert.notEqual(series[index], null, `${what}: bar ${index} should have a value`);
  }
}

/** Two series agree bar for bar, absence included, with no tolerance anywhere. */
export function assertSame(actual: Series, expected: Series, what: string): void {
  assert.equal(actual.length, expected.length, `${what}: length`);
  for (let index = 0; index < actual.length; index += 1) {
    assert.equal(
      actual[index],
      expected[index],
      `${what}: bar ${index} is ${String(actual[index])}, expected ${String(expected[index])}`,
    );
  }
}

/**
 * The tail path and the whole-series path produce the same thing.
 *
 * The two are one implementation by construction, so this is not testing that
 * they were kept in step. It is testing the construction: that the whole-series
 * form really is the fold and has not quietly grown a second path.
 */
export function assertTailAgrees<In>(
  makeTail: () => Tail<In, Value>,
  whole: (inputs: readonly In[]) => Value[],
  inputs: readonly In[],
  what: string,
): void {
  assertSame(fold(makeTail(), inputs), whole(inputs), `${what}: tail against whole series`);
}

/** One column of a multi-output study, as a series. */
export function column(rows: readonly Value[][], index: number): Value[] {
  return rows.map((row) => {
    const cell = row[index];
    return cell === undefined ? null : cell;
  });
}
