import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codes, spanFor } from './check-support.js';

/**
 * OS8001, against every construct that can skip a call.
 *
 * `language.md` 11.4 states the rule about a call site rather than about a
 * statement: a call site that does not execute on a bar leaves its series
 * absent for that bar and its state untouched. The warning for a stateful call
 * written in one used to be decided by the pass that walked statements, so it
 * saw the bodies of `if`, `switch` and the loops and nothing else. A ternary
 * arm and the right operand of `and` or `or` skip a call just as readily, and
 * so does a condition after the first, and each of those compiled with nothing
 * reported while drawing a real number taken from a subset of the bars.
 *
 * So the two tables below are the point of this file rather than decoration.
 * One holds every place a bar can pass a call without evaluating it, the other
 * every place it cannot, and they are asserted the same way. A construct added
 * to the language with no row here is a construct nobody decided about, and a
 * row that moves between the tables is a change in what the language does.
 *
 * Each body is a whole study, and the assertion is the whole diagnostic list
 * rather than a membership: a case that starts reporting a second thing is a
 * case that has stopped being about what it says it is about.
 */

/** A call that holds state, written where a bar can pass without running it. */
const SKIPPED: Readonly<Record<string, string>> = {
  'a ternary true arm': 'v = close > open ? sma(close, 5) : none\nplot(v, "V")',
  // The false arm as well as the true one. A call here advances only on the
  // bars the condition failed, which is the same defect wearing the other sign.
  'a ternary false arm': 'v = close > open ? none : sma(close, 5)\nplot(v, "V")',
  'the right operand of and': 'v = close > open and sma(close, 5) > 0\nplot(v ? 1 : 0, "V")',
  'the right operand of or': 'v = close > open or sma(close, 5) > 0\nplot(v ? 1 : 0, "V")',
  'an if body': 'v = 0\nif close > open\n    v = sma(close, 5)\nplot(v, "V")',
  // The condition of a second branch runs only when the first was false, so it
  // is as conditional as the body it guards.
  'an else if condition':
    'v = 0\nif close > open\n    v = 1\nelse if sma(close, 5) > 0\n    v = 2\nplot(v, "V")',
  'a case arm': 'v = 0\nswitch\n    case close > open\n        v = sma(close, 5)\nplot(v, "V")',
  // The same shape again: a later arm is reached only when nothing above it
  // matched, and its values are evaluated there.
  'a case value after the first arm':
    'v = 0\nswitch\n    case close > open\n        v = 1\n' +
    '    case sma(close, 5) > 0\n        v = 2\nplot(v, "V")',
  'a default arm':
    'v = 0\nswitch\n    case close > open\n        v = 1\n' +
    '    default\n        v = sma(close, 5)\nplot(v, "V")',
  'a loop body': 'v = 0\nfor i = 0 to 2\n    v = sma(close, 5)\nplot(v, "V")',
  'a branch inside a function body':
    'fn pick(c) =>\n    out = 0\n    if c > 0\n        out = sma(close, 5)\n    out\n' +
    'v = pick(close)\nplot(v, "V")',
};

/** The same call where every bar the file runs on evaluates it. */
const ALWAYS: Readonly<Record<string, string>> = {
  'the top level': 'v = sma(close, 5)\nplot(v, "V")',
  'a ternary condition': 'v = sma(close, 5) > 0 ? 1 : 0\nplot(v, "V")',
  'the left operand of and': 'v = sma(close, 5) > 0 and close > open\nplot(v ? 1 : 0, "V")',
  'the first condition of an if': 'v = 0\nif sma(close, 5) > 0\n    v = 1\nplot(v, "V")',
  'the first arm of a switch': 'v = 0\nswitch\n    case sma(close, 5) > 0\n        v = 1\nplot(v, "V")',
  'the subject of a switch':
    'v = 0\nswitch sma(close, 5) > 0\n    case true\n        v = 1\nplot(v, "V")',
  'an argument of a call': 'plot(sma(close, 5), "V")',
  // A body runs when the function is called, so whether it runs on a bar is a
  // fact about the call site. This one is called at the top level.
  'a function body': 'fn smooth(c) => sma(c, 5)\nv = smooth(close)\nplot(v, "V")',
};

for (const [where, body] of Object.entries(SKIPPED)) {
  test(`a stateful call in ${where} is warned about`, () => {
    assert.deepEqual(codes(body), ['OS8001'], body);
  });
}

for (const [where, body] of Object.entries(ALWAYS)) {
  test(`a stateful call in ${where} is not warned about`, () => {
    assert.deepEqual(codes(body), [], body);
  });
}

test('the warning is drawn under the call and not under the construct', () => {
  // Catches a fix that reports at the ternary, or at the statement holding it,
  // where the caret would be under an expression that is not the mistake and a
  // reader with two calls on the line would not know which one was meant.
  assert.equal(spanFor('v = close > open ? sma(close, 5) : none\nplot(v, "V")', 'OS8001'), '3:20+13');
});

test('a stateful user function in a ternary arm is warned about', () => {
  // State is per call site (11.4), so a helper holding a `var` is skipped in an
  // arm exactly as a library call is. Catches a fix applied to the library path
  // alone, which is the half of the warning that is easy to find.
  const body =
    'fn counter(c) =>\n    var n = 0\n    n = n + 1\n    n\n' +
    'v = close > open ? counter(close) : none\nplot(v, "V")';
  assert.deepEqual(codes(body), ['OS8001']);
});

test('a call that holds no state in a ternary arm is not warned about', () => {
  // Catches a fix that warns on any call in an arm rather than a stateful one,
  // which would make the warning noise people learn to ignore: guarding a
  // division with a ternary is the ordinary way to write one.
  assert.deepEqual(codes('v = close > open ? abs(close - open) : none\nplot(v, "V")'), []);
});
