/**
 * The comparison of `conformance.md` section 6, each step against the
 * implementation that would get it wrong.
 *
 * The rule is in `scripts/lib/compare.mjs`, which the adapter and the runner
 * share, and it is reached here by a dynamic load because the compiled test
 * tree cannot import a module under `scripts/` statically without a second
 * build configuration. The specifier is a name holding a literal, which is
 * the shape the no-eval rules ask for.
 *
 * Every test below names, in its comment, the wrong implementation it exists
 * to catch. A test that no implementation could fail is a green tick on a
 * sentence.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

const COMPARE_MODULE = '../../../scripts/lib/compare.mjs';

interface Numeric {
  readonly outcome: string;
  readonly bound?: string;
  readonly difference?: number;
}

interface Placed {
  readonly outcome: string;
  readonly channel?: string;
  readonly index?: number | null;
  readonly column?: string | null;
  readonly expected?: string;
  readonly actual?: string;
  readonly bound?: string;
}

interface Tolerance {
  readonly abs: number;
  readonly rel: number;
}

interface CompareModule {
  compareNumbers(actual: unknown, expected: unknown, abs: number, rel: number): Numeric;
  compareValues(actual: unknown, expected: unknown, tolerance: Tolerance): Numeric;
  compareChannel(channel: string, actual: unknown, expected: unknown, tolerance: Tolerance): Placed | null;
  compareChannels(
    asserted: readonly string[],
    actual: Record<string, unknown>,
    expected: Record<string, unknown>,
    tolerance: Tolerance,
  ): Placed;
  toleranceFrom(declared: unknown, caps: Tolerance): { ok: boolean; abs?: number; rel?: number; reason?: string };
  written(value: unknown): string;
  bits64(value: number): bigint;
}

const compare = (await import(COMPARE_MODULE)) as CompareModule;

const EXACT: Tolerance = { abs: 0, rel: 0 };
const CAPS: Tolerance = { abs: 1e-12, rel: 1e-9 };
/** The loosest tolerance a case may declare. */
const LOOSEST: Tolerance = { abs: 1e-12, rel: 1e-9 };

test('two absent values match, and absence is never inside a tolerance', () => {
  // Catches an implementation that reads absence as zero: it would pass a
  // number against an absent expectation whenever the number was within
  // tolerance of zero, which is a value one bar before warmup ends.
  assert.equal(compare.compareNumbers(null, null, LOOSEST.abs, LOOSEST.rel).outcome, 'pass');
  assert.equal(compare.compareNumbers(0, null, LOOSEST.abs, LOOSEST.rel).outcome, 'fail');
  assert.equal(compare.compareNumbers(null, 0, LOOSEST.abs, LOOSEST.rel).bound, 'absence');
  assert.equal(compare.compareNumbers(undefined, 1e-15, LOOSEST.abs, LOOSEST.rel).outcome, 'fail');
});

test('a non-finite actual is its own outcome, never a failure and never inside a tolerance', () => {
  // Catches an implementation that lets step 7 decide: `NaN <= bound` is false
  // and `Infinity - x` is infinite, so such an implementation reports `fail`
  // and the defect is buried among ordinary numeric failures.
  for (const actual of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.equal(compare.compareNumbers(actual, 1, LOOSEST.abs, LOOSEST.rel).outcome, 'nonFinite');
  }
  assert.equal(compare.compareNumbers(1, Number.NaN, 0, 0).outcome, 'nonFinite');
});

test('signed zero is normalised before the bits are compared', () => {
  // Catches a raw bit comparison: negative zero and positive zero differ in
  // the sign bit and in nothing a script can observe.
  assert.equal(compare.compareNumbers(-0, 0, 0, 0).outcome, 'pass');
  assert.equal(compare.compareNumbers(0, -0, 0, 0).outcome, 'pass');
  assert.notEqual(compare.bits64(-0), compare.bits64(0));
});

test('equality is over the binary64 bits, not over a decimal rendering', () => {
  // Catches a comparison through a rounded rendering, `toFixed(15)` or
  // `toPrecision(15)`, under which 0.1 + 0.2 and 0.3 are the same text.
  const result = compare.compareNumbers(0.1 + 0.2, 0.3, 0, 0);
  assert.equal(result.outcome, 'fail');
  assert.equal(result.bound, 'exact');
  assert.equal(compare.compareNumbers(1 + Number.EPSILON, 1, 0, 0).outcome, 'fail');
  assert.equal(compare.compareNumbers(0.3, 0.3, 0, 0).outcome, 'pass');
});

test('exact is the default: a non-zero difference fails when both bounds are zero', () => {
  // Catches an implementation with a bound of its own where the case declares
  // none, which is the tolerance an engine author widens until the suite is
  // green.
  assert.equal(compare.compareNumbers(1e6 + 1e-9, 1e6, 0, 0).outcome, 'fail');
});

test('the tolerance is the max of the two bounds, never their sum', () => {
  // Catches the additive form `abs + rel * |e|`. At e = 2e-3 the relative
  // bound is 2e-12 and the absolute one 1e-12: the max form admits 2e-12 and
  // the additive form admits 3e-12, so a difference of 2.5e-12 separates them.
  const e = 2e-3;
  const near = compare.compareNumbers(e + 2.5e-12, e, 1e-12, 1e-9);
  assert.equal(near.outcome, 'fail');
  assert.equal(near.bound, 'rel');
  assert.equal(compare.compareNumbers(e + 1.5e-12, e, 1e-12, 1e-9).outcome, 'pass');
});

test('exactly one bound is in force at any magnitude, and a failure names it', () => {
  // Catches an implementation that names the wrong bound, or the same bound
  // always: near zero the absolute bound decides, away from it the relative.
  const nearZero = compare.compareNumbers(1e-15 + 2e-12, 1e-15, 1e-12, 1e-9);
  assert.equal(nearZero.outcome, 'fail');
  assert.equal(nearZero.bound, 'abs');
  assert.equal(compare.compareNumbers(1e-15 + 5e-13, 1e-15, 1e-12, 1e-9).outcome, 'pass');
  const large = compare.compareNumbers(1e6 + 2e-3, 1e6, 1e-12, 1e-9);
  assert.equal(large.outcome, 'fail');
  assert.equal(large.bound, 'rel');
  assert.equal(compare.compareNumbers(1e6 + 5e-4, 1e6, 1e-12, 1e-9).outcome, 'pass');
});

test('a declared tolerance is refused, not clamped, past the cap or without a reason', () => {
  // Catches an implementation that clamps a loose tolerance to the cap and
  // runs, or that admits a bound with no reason beside it: section 6 says
  // the first is not a conformance case and the second fails the build.
  assert.deepEqual(compare.toleranceFrom(undefined, CAPS), { ok: true, abs: 0, rel: 0 });
  assert.equal(compare.toleranceFrom({ abs: 0, rel: 0, reason: null }, CAPS).ok, true);
  assert.equal(compare.toleranceFrom({ abs: 0, rel: 1e-10 }, CAPS).ok, false);
  assert.equal(compare.toleranceFrom({ abs: 1e-6, rel: 0, reason: 'a reference' }, CAPS).ok, false);
  assert.equal(compare.toleranceFrom({ abs: 0, rel: 1e-8, reason: 'a reference' }, CAPS).ok, false);
  assert.equal(compare.toleranceFrom({ abs: -1e-13, rel: 0, reason: 'a reference' }, CAPS).ok, false);
  const within = compare.toleranceFrom({ abs: 1e-13, rel: 1e-10, reason: 'a reference' }, CAPS);
  assert.deepEqual(within, { ok: true, abs: 1e-13, rel: 1e-10 });
});

test('a length mismatch fails before any element is compared, at the first index one list lacks', () => {
  // Catches an implementation that walks the shorter list first: it would
  // report index 0, column x, and hide that a row is missing altogether.
  const found = compare.compareChannel('orders', [{ x: 9 }], [{ x: 1 }, { x: 2 }], EXACT);
  assert.equal(found?.outcome, 'fail');
  assert.equal(found?.index, 1);
  assert.equal(found?.column, null);
  assert.equal(found?.bound, 'length');
});

test('an element is compared on the fields the expected element names and no others', () => {
  // Catches an implementation that compares every field the actual element
  // carries: an engine that records one more column than the case names
  // would fail a case that says nothing about that column.
  const expected = [{ side: 'buy', qty: 3 }];
  assert.equal(compare.compareChannel('orders', [{ side: 'buy', qty: 3, extra: 1 }], expected, EXACT), null);
  const missing = compare.compareChannel('orders', [{ side: 'buy' }], expected, EXACT);
  assert.equal(missing?.outcome, 'fail');
  assert.equal(missing?.column, 'qty');
  assert.equal(missing?.bound, 'absence');
});

test('a diagnostic is compared on code, line, column and severity only', () => {
  // Catches an implementation that compares a diagnostic on every field: a
  // recorded bar index, or a message whose wording improved, would fail a
  // case that section 4 says must not care.
  const expected = [{ code: 'OS2002', line: 3, column: 5, severity: 'error', barIndex: 7 }];
  const same = [{ code: 'OS2002', line: 3, column: 5, severity: 'error', barIndex: 9, message: 'reworded' }];
  assert.equal(compare.compareChannel('diagnostics', same, expected, EXACT), null);
  const other = [{ code: 'OS2003', line: 3, column: 5, severity: 'error', barIndex: 7 }];
  assert.equal(compare.compareChannel('diagnostics', other, expected, EXACT)?.column, 'code');
});

test('a string is compared as its code points, a bool exactly, and a kind mismatch fails', () => {
  // Catches trimming, case folding and loose equality: each would pass one
  // of these pairs.
  assert.equal(compare.compareValues('a ', 'a', EXACT).outcome, 'fail');
  assert.equal(compare.compareValues('A', 'a', EXACT).outcome, 'fail');
  assert.equal(compare.compareValues('a', 'a', EXACT).outcome, 'pass');
  assert.equal(compare.compareValues(false, true, EXACT).outcome, 'fail');
  assert.equal(compare.compareValues('true', true, EXACT).bound, 'kind');
  assert.equal(compare.compareValues(1, '1', EXACT).bound, 'kind');
});

test('a non-finite value inside a channel is reported as nonFinite, placed', () => {
  // Catches an implementation whose list walk downgrades the outcome to fail.
  const found = compare.compareChannel('trades', [{ p: Number.NaN }], [{ p: 1 }], EXACT);
  assert.equal(found?.outcome, 'nonFinite');
  assert.equal(found?.index, 0);
  assert.equal(found?.column, 'p');
});

test('the first asserted channel that differs is the one reported, in the case order', () => {
  // Catches an implementation that walks channels in its own order.
  const actual = { b: [{ v: 1 }], a: [{ v: 1 }] };
  const expected = { b: [{ v: 2 }], a: [{ v: 2 }] };
  assert.equal(compare.compareChannels(['a', 'b'], actual, expected, EXACT).channel, 'a');
  assert.equal(compare.compareChannels(['b', 'a'], actual, expected, EXACT).channel, 'b');
  assert.equal(compare.compareChannels(['a'], actual, actual, EXACT).outcome, 'pass');
});

test('a value in a report is the shortest round-tripping decimal, and absence is none', () => {
  // Catches a rendering that rounds: the last bit has to be visible in the
  // report rather than rounded away by the reporting.
  assert.equal(compare.written(0.1 + 0.2), '0.30000000000000004');
  assert.equal(compare.written(null), 'none');
  assert.equal(compare.written(true), 'true');
  assert.equal(compare.written('text'), 'text');
});
