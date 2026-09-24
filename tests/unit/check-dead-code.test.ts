import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkBody, codes, spanFor, valuesFor } from './check-support.js';

/**
 * The four warnings about code that has one answer for the whole run: a
 * comparison that is always absent, a loop that never runs, a line after a
 * return that always runs, and a condition that folds to a constant.
 * `language.md` 6.4, 10.2, 10.3 and 11.3.
 *
 * A warning that stops appearing looks exactly like a script that stopped
 * having the problem, so each test below also holds the shape next door that
 * must not warn: a checker that reported every comparison, every loop or every
 * `if` would pass the first half of each and fail the second.
 */

// Catches a checker that treats `none` as an ordinary operand, which would say
// nothing about a branch that can never be taken on any bar.
test('an ordered comparison against none is OS8012 at the comparison', () => {
  const body = 'value = close\nif value > none\n    signal("READY")\nplot(close, "C")';
  assert.ok(codes(body).includes('OS8012'));
  assert.equal(spanFor(body, 'OS8012'), '4:4+12');
  assert.deepEqual(valuesFor(body, 'OS8012'), { op: '>' });
});

// Catches the overreach: equality is the operator that answers the question,
// and warning on it would push a reader away from the fix the entry offers.
test('an equality against none is not OS8012', () => {
  assert.ok(!codes('value = close\nif value == none\n    signal("GAP")\nplot(close, "C")').includes('OS8012'));
});

// Catches a checker that reads a descending range as counting down, which is
// the silent reversal the language refuses to perform.
test('a descending range with the default step is OS8015 at the loop', () => {
  const body = 'var total = 0.0\nfor i = 9 to 0\n    total += close[i]\nplot(total, "T")';
  assert.ok(codes(body).includes('OS8015'));
  assert.equal(spanFor(body, 'OS8015'), '4:1+36');
  assert.deepEqual(valuesFor(body, 'OS8015'), { start: 9, end: 0, step: 1 });
});

// Catches a checker that warns on every descending bound, including the fix.
test('the same range with step -1 runs and is not OS8015', () => {
  const body = 'var total = 0.0\nfor i = 9 to 0 step -1\n    total += close[i]\nplot(total, "T")';
  assert.ok(!codes(body).includes('OS8015'));
});

// Catches a checker that stops walking a function body at its first return
// and so never sees the line that follows it.
test('a line after a return that always runs is OS8016 at that line', () => {
  const body = 'fn pick(x) =>\n    return x\n    x * 2\nplot(pick(close), "P")';
  assert.ok(codes(body).includes('OS8016'));
  assert.equal(spanFor(body, 'OS8016'), '5:5+5');
  assert.deepEqual(valuesFor(body, 'OS8016'), { line: 5 });
});

// Catches a checker that treats a return inside an if as always running.
test('a return behind a condition does not make the next line unreachable', () => {
  const body = 'fn pick(x) =>\n    if x > 0\n        return x\n    x * 2\nplot(pick(close), "P")';
  assert.ok(!codes(body).includes('OS8016'));
});

// Catches a checker that folds a literal condition silently, which leaves a
// test pinned during debugging looking like a working signal.
test('a literal condition is OS8017 at the condition, naming what it folds to', () => {
  const body = 'if true\n    signal("BUY")\nplot(close, "C")';
  assert.ok(codes(body).includes('OS8017'));
  assert.equal(spanFor(body, 'OS8017'), '3:4+4');
  assert.deepEqual(valuesFor(body, 'OS8017'), { value: 'true' });
});

// Catches a checker that folds too eagerly, treating a series comparison as a
// constant because both sides are bar fields.
test('a condition over bar data is not OS8017', () => {
  const checked = checkBody('if close > open\n    signal("UP")\nplot(close, "C")');
  assert.ok(!checked.diagnostics.some((one) => one.code === 'OS8017'));
});
