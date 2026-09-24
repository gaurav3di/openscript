import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codes, spanFor, typeOfName, valuesFor } from './check-support.js';

/**
 * `language.md` 5.4, row by row.
 *
 * A declaration handle is the compile-time half of a declaration and has no
 * run-time representation at all, so every row of that table is a place where
 * accepting one produces instructions that read a slot nothing ever writes. The
 * study then draws absence on every bar, which is worse than refusing to
 * compile, and worse again than crashing: the numbers look like numbers.
 *
 * So each row is asserted here in both directions where the table has both: the
 * form it allows compiles, and the form it refuses carries a code.
 */

const PLOT = 'p = plot(close, "C", aqua)\n';
const SECOND = 'q = plot(open, "O", aqua)\n';

test('a declaration handle may be named at the top level and passed to fill', () => {
  assert.deepEqual(codes(`${PLOT}${SECOND}fill(p, q, color = fade(aqua, 88))`), []);
  assert.equal(typeOfName(`${PLOT}${SECOND}fill(p, q)`, 'p'), 'plot');
});

test('a second name for a handle is refused, because there is nothing to copy', () => {
  assert.deepEqual(codes(`${PLOT}r = p\nfill(r, p)`), ['OS2003']);
  assert.deepEqual(codes(`${PLOT}r = (p)\nfill(r, p)`), ['OS2003']);
});

test('a handle is refused inside a block, where a declaration cannot be written', () => {
  const body = `${PLOT}if close > open\n    r = p\n    print(r)`;
  assert.deepEqual(codes(body), ['OS2003']);
});

test('a var cannot hold a handle', () => {
  assert.deepEqual(codes('var p = plot(close, "C", aqua)\nfill(p, p)'), ['OS2003']);
  assert.deepEqual(valuesFor('var p = plot(close, "C", aqua)\nfill(p, p)', 'OS2003'), {
    leftType: 'a per-bar value',
    rightType: 'plot',
  });
  // The caret covers the call, which is the half of the line to delete or move.
  assert.equal(spanFor('var p = plot(close, "C", aqua)\nfill(p, p)', 'OS2003'), '3:9+22');
});

test('a live var cannot hold a handle either', () => {
  assert.deepEqual(codes('live var p = plot(close, "C", aqua)\nfill(p, p)'), ['OS8011', 'OS2003']);
});

test('an array cannot hold a handle, and says so as an element type', () => {
  assert.deepEqual(codes(`${PLOT}xs = [p]\nprint(size(xs))`), ['OS2019']);
  assert.deepEqual(codes(`${PLOT}var xs: array<number> = []\npush(xs, p)`), ['OS2003']);
});

test('a library call that does not declare a band refuses a handle', () => {
  assert.deepEqual(codes(`${PLOT}print(text(p))`), ['OS2003']);
  assert.deepEqual(codes(`${PLOT}t = table("T", 2, 2)\ncell(t, 0, 0, p)`), ['OS3011']);
  // fill takes two plots and nothing else: a level handle is OS3020.
  assert.deepEqual(codes(`${PLOT}l = level(0, "Z", gray)\nfill(l, p)`), ['OS3020']);
});

test('a handle cannot be passed to a user function', () => {
  const body = `fn widen(a) =>\n    return 1\n${PLOT}plot(widen(p), "W", red)`;
  assert.deepEqual(codes(body), ['OS2003']);
});

test('a handle cannot be returned from a user function', () => {
  const body = `${PLOT}fn hold() =>\n    return p\nplot(hold(), "H", red)`;
  assert.deepEqual(codes(body), ['OS2003']);
});

test('a handle is never equal to anything, and is never absent', () => {
  assert.deepEqual(codes(`${PLOT}plot(p == none ? 1 : 2, "X", red)`), ['OS2003']);
  assert.deepEqual(codes(`${PLOT}${SECOND}plot(p != q ? 1 : 2, "X", red)`), ['OS2003', 'OS2003']);
  assert.deepEqual(codes(`${PLOT}plot(isNone(p) ? 1 : 2, "X", red)`), ['OS2003']);
});

test('a handle has no history, and neither has a runtime object', () => {
  assert.deepEqual(codes(`${PLOT}plot(p[1], "X", red)`), ['OS2004']);
  const object = 'l = draw.line(time, close, time, open)\nprint(l[1])';
  assert.deepEqual(codes(object), ['OS2004']);
});

test('a handle is not a number, a condition or a ternary arm', () => {
  assert.deepEqual(codes(`${PLOT}plot(p + 1, "X", red)`), ['OS2003']);
  assert.deepEqual(codes(`${PLOT}${SECOND}plot(p < q ? 1 : 2, "X", red)`), ['OS2003', 'OS2003']);
  assert.deepEqual(codes(`${PLOT}if p\n    print("x")`), ['OS2003']);
  assert.deepEqual(codes(`${PLOT}${SECOND}r = close > open ? p : q\nfill(r, q)`), [
    'OS2003',
    'OS2003',
  ]);
  assert.deepEqual(codes(`${PLOT}r = close > open ? p : none\nprint(r)`), ['OS2003']);
});

/**
 * The shape the rows above are instances of.
 *
 * Every position that was not written out in 5.4's table is still a position
 * where a value is required, so the refusal is the default and the three places
 * a handle may stand are the exceptions. These are the positions nobody
 * enumerated, and each one reads a name the emitter would have to find a slot
 * for.
 */
test('a position 5.4 does not list refuses a handle as well', () => {
  assert.deepEqual(codes(`${PLOT}${SECOND}switch p\n    case q\n        print("x")`), [
    'OS2003',
    'OS2003',
  ]);
  assert.deepEqual(codes(`${PLOT}for x in p\n    print(x)`), ['OS2003']);
  assert.deepEqual(codes(`${PLOT}p`), ['OS2003']);
  assert.deepEqual(codes(`${PLOT}x = orElse(p, none)\nprint(x)`), ['OS2003']);
});

// Catches a checker that treats a declaration handle like any other value: the
// catalogue's OS8010 cause exempts one, and a three rail study that names all
// three rails alike is the shape `stdlib.md` 14.2 calls legal. A checker that
// exempted only fill and level, the two that sentence names, fails the plot.
test('a named handle nothing reads is not OS8010, whichever call made it', () => {
  const body = [
    'topRail = plot(high, "Top", red)',
    'lowRail = plot(low, "Low", blue)',
    'middle = plot(hl2, "Middle", orange)',
    'shade = fill(topRail, lowRail, gray)',
    'mark = level(100, "Mark", gray)',
  ].join('\n');
  assert.deepEqual(codes(body), []);
});

// Catches the exemption swallowing the warning it sits beside: a value that is
// computed on every bar and never read is still OS8010.
test('an unread value next to unread handles is still OS8010', () => {
  const body = 'middle = plot(hl2, "Middle", orange)\nunused = close * 2';
  assert.deepEqual(codes(body), ['OS8010']);
});
