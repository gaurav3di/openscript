/**
 * The instruction set's behaviour, `compiled-program.md` sections 4 and 7.
 *
 * Section 7 makes a claim worth testing directly: absence propagates through
 * arithmetic and ordering comparison, is total under equality, is three-valued
 * under `and`, `or` and `not`, and is false at a branch, and those five rules
 * are implemented by the instructions of 4.5 to 4.8 and by nothing else. An
 * engine that gets all five right has the whole of `language.md` section 6, and
 * an engine that special cases absence anywhere else has a bug. So each rule
 * has a test, and each one names the wrong implementation it catches.
 *
 * Every assertion is on a value or on a diagnostic's code and span, never on a
 * message: wording is allowed to improve and a code is a promise.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { Value } from '../../src/core/engine/index.js';
import { flat, running, timeOf } from './support.js';

/** Runs one expression over one bar and returns what the plot column holds. */
function value(expression: string, close = 10): Value {
  const engine = running(
    ['version 1', '', 'study("Under test")', '', `x = ${expression}`, 'plot(x, "x", aqua)'].join(
      '\n',
    ),
  );
  const result = engine.append(flat(close), { isConfirmed: true });
  assert.equal(result.diagnostic, undefined, `the bar failed: ${result.diagnostic?.code ?? ''}`);
  return result.columns[0] ?? null;
}

/** The same for an expression whose type is not a number. */
function shown(expression: string, close = 10): Value {
  const engine = running(
    [
      'version 1',
      '',
      'study("Under test")',
      '',
      `x = ${expression}`,
      'plot(x ? 1 : 0, "x", aqua)',
      'signal(text(x))',
    ].join('\n'),
  );
  const result = engine.append(flat(close), { isConfirmed: true });
  assert.equal(result.diagnostic, undefined, `the bar failed: ${result.diagnostic?.code ?? ''}`);
  return result.columns[1] ?? null;
}

test('absence propagates through every arithmetic instruction', () => {
  // Catches an engine that represents absence as a number: every one of these
  // would produce a number, and `none + 1` would read as 1.
  for (const expression of ['none + 1', '1 + none', 'none - 1', 'none * 2', 'none / 2',
    '2 / none', 'none % 2', '-none']) {
    assert.equal(value(expression), null, expression);
  }
});

test('a result with no finite value is absent, checked after each operation', () => {
  // `(1e308 * 10) / 10` is absent, not 1e307. Catches an engine that checks
  // finiteness once at the end of an expression, where the answer depends on
  // where it happened to round.
  assert.equal(value('(1e308 * 10) / 10'), null);
  assert.equal(value('1e308 * 10'), null);
});

test('division and remainder by zero are absent, including zero over zero', () => {
  assert.equal(value('1 / 0'), null);
  assert.equal(value('0 / 0'), null);
  assert.equal(value('1 % 0'), null);
});

test('the remainder instruction follows the sign of its left operand', () => {
  // 4.5: truncated division. Catches an engine that used a floored remainder
  // here, which is what the library's own `mod` is and is a different number.
  assert.equal(value('-7 % 3'), -1);
  assert.equal(value('7 % -3'), 1);
});

test('negative zero is normalised on every result', () => {
  // Catches an engine that lets a negative zero reach a host, where `text()`
  // would show it and two engines would differ over a minus sign.
  assert.equal(Object.is(value('-1 * 0'), 0), true);
  assert.equal(Object.is(value('0 / -1'), 0), true);
});

test('an ordering comparison with an absent operand is absent, not false', () => {
  // The whole of warmup at a branch. Catches an engine that returns false here:
  // 12.4's bar 0 would take the branch and draw a marker on a warmup bar.
  assert.equal(shown('none > 1'), 'none');
  assert.equal(shown('1 < none'), 'none');
  assert.equal(shown('none >= none'), 'none');
});

test('equality is total: it answers even about absence', () => {
  // Catches an engine that propagated absence through `==` as well, which would
  // leave a script no way to ask whether a value is absent at all.
  assert.equal(shown('none == none'), 'true');
  assert.equal(shown('none == 1'), 'false');
  assert.equal(shown('none != 1'), 'true');
});

test('two colours are equal when all four channels match', () => {
  assert.equal(shown('aqua == aqua'), 'true');
  assert.equal(shown('aqua == red'), 'false');
  assert.equal(shown('fade(aqua, 50) == aqua'), 'false');
});

test('an array is equal only to itself, which is why arrayEqual exists', () => {
  assert.equal(shown('[1, 2] == [1, 2]'), 'false');
  assert.equal(shown('arrayEqual([1, 2], [1, 2])'), 'true');
});

test('and and or are three-valued and commutative', () => {
  // 4.7's two tables, both directions. Catches an engine that short-circuits an
  // absent left operand, which would make the operators disagree with each
  // other depending on which side the absence was on.
  assert.equal(shown('none and false'), 'false');
  assert.equal(shown('false and none'), 'false');
  assert.equal(shown('none and true'), 'none');
  assert.equal(shown('true and none'), 'none');
  assert.equal(shown('none or true'), 'true');
  assert.equal(shown('true or none'), 'true');
  assert.equal(shown('none or false'), 'none');
  assert.equal(shown('false or none'), 'none');
  assert.equal(shown('not none'), 'none');
});

test('a branch treats absence as false, which is the one place it is absorbed', () => {
  assert.equal(value('none ? 1 : 2'), 2);
});

test('a history read past the start of the dataset is absent, not clamped', () => {
  // Catches an engine that clamps to the oldest bar, which would draw a line
  // from bar 0 that no data supports.
  const engine = running(
    ['version 1', '', 'study("History")', '', 'plot(close[3], "back", aqua)'].join('\n'),
  );
  const prices = [10, 11, 12, 13, 14];
  const seen: Value[] = [];
  for (const [bar, price] of prices.entries()) {
    seen.push(engine.append(flat(price, timeOf(bar)), { isConfirmed: true }).columns[0] ?? null);
  }
  assert.deepEqual(seen, [null, null, null, 10, 11]);
});

test('a history index that is not a whole number is OS4001 at its own line', () => {
  const engine = running(
    [
      'version 1',
      '',
      'study("History")',
      '',
      'back = close > 0 ? 0.5 : 1',
      'plot(close[back], "back", aqua)',
    ].join('\n'),
  );
  const result = engine.append(flat(10), { isConfirmed: true });
  assert.equal(result.diagnostic?.code, 'OS4001');
  assert.equal(result.diagnostic?.span.line, 6, 'the line of the read, not of the index');
});

test('a history index past the retained depth is OS4002 rather than a gap', () => {
  // 4.4 cases 3 and 4 are different on purpose: in case 3 the value never
  // existed, in case 4 the engine threw it away. Catches an engine that
  // answers absence for both and hides a real bug behind a plausible gap.
  const engine = running(
    [
      'version 1',
      '',
      'study("Depth")',
      'limits(history = 4)',
      '',
      'back = close > 0 ? 9 : 1',
      'plot(close[back], "back", aqua)',
    ].join('\n'),
  );
  let last = engine.append(flat(10, timeOf(0)), { isConfirmed: true });
  for (let bar = 1; bar < 12; bar += 1) {
    last = engine.append(flat(10 + bar, timeOf(bar)), { isConfirmed: true });
    if (last.diagnostic !== undefined) break;
  }
  assert.equal(last.diagnostic?.code, 'OS4002');
  assert.equal(last.diagnostic?.span.line, 7);
});

test('an array index outside the array is OS4004 and names the array', () => {
  const engine = running(
    [
      'version 1',
      '',
      'study("Index")',
      '',
      'prices = [1.0, 2.0, 3.0]',
      'at = close > 0 ? 5 : 0',
      'plot(prices[at], "x", aqua)',
    ].join('\n'),
  );
  const result = engine.append(flat(10), { isConfirmed: true });
  assert.equal(result.diagnostic?.code, 'OS4004');
  assert.equal(result.diagnostic?.span.line, 7);
  assert.equal(result.diagnostic?.values['name'], 'prices');
});

test('a loop whose bound is absent is OS4013 rather than zero iterations', () => {
  // Catches an engine that treats an absent bound as "do not run": the loop
  // would silently produce nothing during warmup and the script would look
  // correct.
  const engine = running(
    [
      'version 1',
      '',
      'study("Bound")',
      '',
      'var total = 0.0',
      'upTo = sma(close, 5)',
      'for i = 0 to upTo',
      '    total += 1',
      'plot(total, "total", aqua)',
    ].join('\n'),
  );
  const result = engine.append(flat(10), { isConfirmed: true });
  assert.equal(result.diagnostic?.code, 'OS4013');
  assert.equal(result.diagnostic?.span.line, 7);
});

test('a for loop with a zero step is OS3004 rather than a loop that never ends', () => {
  const engine = running(
    [
      'version 1',
      '',
      'study("Step")',
      '',
      'var total = 0.0',
      'by = close > 0 ? 0 : 1',
      'for i = 0 to 10 step by',
      '    total += 1',
      'plot(total, "total", aqua)',
    ].join('\n'),
  );
  const result = engine.append(flat(10), { isConfirmed: true });
  assert.equal(result.diagnostic?.code, 'OS3004');
  assert.equal(result.diagnostic?.span.line, 7);
});

test('a descending range with a positive step runs zero times', () => {
  // 4.8 point 5: never silently reversed. Catches an engine that swaps the
  // bounds, which would run a loop the script asked not to run.
  const engine = running(
    [
      'version 1',
      '',
      'study("Range")',
      '',
      'var total = 0.0',
      'total = 0',
      'for i = 10 to 0',
      '    total += 1',
      'plot(total, "total", aqua)',
    ].join('\n'),
  );
  assert.equal(engine.append(flat(10), { isConfirmed: true }).columns[0], 0);
});
