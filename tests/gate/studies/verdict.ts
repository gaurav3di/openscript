/**
 * How this half of the gate compares a study against its reference.
 *
 * Two rules, and both are the first half's rules restated where the files that
 * use them can reach them rather than copied out of it.
 *
 * **A value is compared exactly, never within a tolerance.**
 * `compiled-program.md` section 8 makes the order of floating point operations
 * part of the contract, so a comparison that accepted a value within an epsilon
 * would pass an implementation that reassociated a sum, which is the one thing
 * the contract forbids outright. A tolerance here would make the whole
 * specification unenforceable while looking careful.
 *
 * **A warmup is compared as an index.** The first bar with a value, and then
 * every bar after it. Comparing the values alone cannot catch a study that
 * produces the right numbers one bar early, which is the failure every warmup
 * in `stdlib.md` exists to rule out, and one bar early on a moving average is a
 * study that says a cross happened on a bar where it did not.
 *
 * When a comparison does fail, the message carries the two things needed to act
 * on it: the largest distance between the two columns and the first bar they
 * differ on. A report that says only "not equal" sends the next reader back to
 * the beginning of the series.
 */
import assert from 'node:assert/strict';

import type { Series } from '../../../src/core/stdlib/index.js';
import { assertWarmup } from '../../stdlib/support.js';

/** How far apart two columns are, measured rather than asserted. */
export interface Distance {
  readonly largest: number;
  readonly largestAt: number;
  readonly firstAt: number;
  /** Bars where one column has a value and the other does not. */
  readonly absences: number;
}

export function distance(actual: Series, expected: Series): Distance {
  let largest = 0;
  let largestAt = -1;
  let firstAt = -1;
  let absences = 0;
  const count = Math.max(actual.length, expected.length);
  for (let bar = 0; bar < count; bar += 1) {
    const left = actual[bar] ?? null;
    const right = expected[bar] ?? null;
    if (left === null && right === null) continue;
    if (left === null || right === null) {
      absences += 1;
      if (firstAt < 0) firstAt = bar;
      continue;
    }
    if (left === right) continue;
    if (firstAt < 0) firstAt = bar;
    const apart = Math.abs(left - right);
    if (apart > largest) {
      largest = apart;
      largestAt = bar;
    }
  }
  return { largest, largestAt, firstAt, absences };
}

function describe(actual: Series, expected: Series): string {
  const apart = distance(actual, expected);
  if (apart.firstAt < 0) return 'the columns agree';
  const first = apart.firstAt;
  return (
    `first differs at bar ${first}: ${String(actual[first] ?? null)} against ` +
    `${String(expected[first] ?? null)}; largest distance ${apart.largest} at bar ` +
    `${apart.largestAt}; ${apart.absences} bar(s) present on one side only`
  );
}

/**
 * One column of a study against its reference: the warmup bar, then every bar.
 *
 * The warmup is asserted first on purpose. A study that is one bar early is
 * wrong in a way that a value comparison reports as a wall of differences, and
 * naming the warmup makes the one line that matters the first line printed.
 */
export function matches(actual: Series, expected: Series, from: number, what: string): void {
  assert.equal(actual.length, expected.length, `${what}: length`);
  assertWarmup(expected, from, `${what}: the reference`);
  assertWarmup(actual, from, what);
  for (let bar = 0; bar < actual.length; bar += 1) {
    if (actual[bar] === expected[bar]) continue;
    assert.fail(`${what}: ${describe(actual, expected)}`);
  }
}

/**
 * A column whose warmup is not a single index, compared bar for bar.
 *
 * Some studies are absent again after they have produced a value: a division by
 * a range that closed, a pivot that was not confirmed, a marker that fired
 * once. Asserting a first bar and then every bar after it would be false of
 * those, so the reference carries the absences and this compares them.
 */
export function matchesWithGaps(actual: Series, expected: Series, what: string): void {
  assert.equal(actual.length, expected.length, `${what}: length`);
  for (let bar = 0; bar < actual.length; bar += 1) {
    if (actual[bar] === expected[bar]) continue;
    assert.fail(`${what}: ${describe(actual, expected)}`);
  }
}

/** The reference's not-a-number warmup turned into this language's absence. */
export function asSeries(values: readonly number[]): Series {
  return values.map((value) => (Number.isFinite(value) ? value : null));
}

/** A boolean reference column as the absent-or-present column a study plots. */
export function asFlags(values: readonly boolean[]): Series {
  return values.map((value) => (value ? 1 : 0));
}
