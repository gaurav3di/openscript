import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkRaw } from './check-support.js';

/**
 * OS8019: a deleted object still held by a name or an array. `language.md` 5.4.
 *
 * Each test beside a warning holds the fix the entry offers, so a checker that
 * warned on every delete would fail as surely as one that warned on none.
 *
 * These are the tests `unit:draw/deleted-still-held` names in
 * `spec/feature-matrix.md`.
 */

function reported(...lines: readonly string[]): readonly string[] {
  const text = ['version 1', 'study("T", overlay = true)', ...lines, 'plot(close, "C")', ''].join('\n');
  return checkRaw(text).diagnostics.map(
    (one) => `${one.code} ${one.span.line}:${one.span.column} ${JSON.stringify(one.values)}`,
  );
}

const ZONES = ['var zones: array<box> = []', 'push(zones, draw.box(time, low, time, high))'];

// Catches a checker that does not follow a deletion at all, which is where
// this code sat for a whole phase: the element stays in the array and the next
// setter that reaches it is OS4005, many bars later.
test('an element deleted and left in its array is OS8019 at the element', () => {
  assert.deepEqual(reported(...ZONES, 'if size(zones) > 20', '    draw.delete(element(zones, 0))'), [
    'OS8019 6:17 {"name":"zones","kind":"box","line":6}',
  ]);
});

test('the same element read with brackets is OS8019 as well', () => {
  const found = reported(...ZONES, 'if size(zones) > 20', '    draw.delete(zones[0])');
  assert.equal(found.length, 1);
  assert.ok(found[0]?.startsWith('OS8019 6:17'), found[0]);
});

// Catches a checker that warns whether or not the element was removed.
test('an element deleted and then removed is not OS8019', () => {
  assert.deepEqual(
    reported(...ZONES, 'if size(zones) > 20', '    draw.delete(element(zones, 0))', '    shift(zones)'),
    [],
  );
});

// Catches a checker that follows arrays and forgets the plain name.
test('a var deleted and left holding the object is OS8019 at the name', () => {
  assert.deepEqual(
    reported('var ln = draw.line(time, low, time, high)', 'if close > open', '    draw.delete(ln)'),
    ['OS8019 5:17 {"name":"ln","kind":"line","line":5}'],
  );
});

test('a var assigned none on the same path as the delete is not OS8019', () => {
  assert.deepEqual(
    reported(
      'var ln = draw.line(time, low, time, high)',
      'if close > open',
      '    draw.delete(ln)',
      '    ln = none',
    ),
    [],
  );
});

// Catches the overreach: a name recomputed every bar cannot carry a stale
// object into the next one, so there is nothing to warn about.
test('a plain name deleted on the bar it was made is not OS8019', () => {
  assert.deepEqual(reported('mark = draw.label(time, high, "x")', 'draw.delete(mark)'), []);
});
