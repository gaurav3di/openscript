import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codes, expression, shape } from './parse-support.js';

/**
 * The precedence table of language.md 9.1, checked pair by pair rather than by
 * example.
 *
 * The table is written out here rather than read from the compiler on purpose.
 * A test that asked the parser what its own precedence was would agree with
 * whatever it answered, and the one thing this has to catch is the parser and
 * the specification drifting apart.
 */

/** Levels 3 to 8 of the table, tightest first. Level 1 is postfix and 2 is unary. */
const BINARY_LEVELS: readonly (readonly string[])[] = [
  ['*', '/', '%'],
  ['+', '-'],
  ['<', '<=', '>', '>='],
  ['==', '!='],
  ['and'],
  ['or'],
];

/** The two levels 9.3 refuses to chain, so two of them on one line is OS1008. */
const UNCHAINABLE: ReadonlySet<string> = new Set(['<', '<=', '>', '>=', '==', '!=']);

const EVERY_BINARY: readonly string[] = BINARY_LEVELS.flat();

const UNARY: readonly string[] = ['-', '+', 'not'];

/** The source is one bare expression on a line, so no statement form is in the way. */
function tree(source: string): string {
  return shape(expression(source));
}

test('the table is the thirteen binary operators of 9.1, over six levels', () => {
  // Stated so that the loops below cannot pass by running over nothing.
  assert.equal(BINARY_LEVELS.length, 6);
  assert.equal(EVERY_BINARY.length, 13);
  assert.equal(new Set(EVERY_BINARY).size, 13);
});

test('a tighter operator binds first, for every pair of levels in 9.1', () => {
  for (let tighter = 0; tighter < BINARY_LEVELS.length; tighter++) {
    for (let looser = tighter + 1; looser < BINARY_LEVELS.length; looser++) {
      for (const inner of BINARY_LEVELS[tighter] ?? []) {
        for (const outer of BINARY_LEVELS[looser] ?? []) {
          const left = `a ${inner} b ${outer} c`;
          const right = `a ${outer} b ${inner} c`;
          assert.equal(tree(left), `(${outer} (${inner} a b) c)`, left);
          assert.equal(tree(right), `(${outer} a (${inner} b c))`, right);
          assert.deepEqual(codes(left), [], left);
          assert.deepEqual(codes(right), [], right);
        }
      }
    }
  }
});

test('operators of one level fold to the left, and the two levels that cannot chain say so', () => {
  for (const level of BINARY_LEVELS) {
    for (const first of level) {
      for (const second of level) {
        const source = `a ${first} b ${second} c`;
        // The chain is folded left after the report as well, so the tree holds
        // everything the reader wrote and the next mistake on the line is found
        // on the same compile.
        assert.equal(tree(source), `(${second} (${first} a b) c)`, source);
        assert.deepEqual(codes(source), UNCHAINABLE.has(first) ? ['OS1008'] : [], source);
      }
    }
  }
});

test('one comparison on each side of an equality is not a chain', () => {
  assert.deepEqual(codes('x = a < b == c < d'), []);
  assert.equal(tree('a < b == c < d'), '(== (< a b) (< c d))');
});

test('a unary operator binds tighter than every binary one', () => {
  for (const operator of UNARY) {
    for (const binary of EVERY_BINARY) {
      const source = `${operator} a ${binary} b`;
      assert.equal(tree(source), `(${binary} (unary${operator} a) b)`, source);
      assert.deepEqual(codes(source), [], source);
    }
  }
});

test('a unary operator is right associative, so they nest', () => {
  assert.equal(tree('not not ready'), '(unarynot (unarynot ready))');
  assert.equal(tree('- -x'), '(unary- (unary- x))');
  assert.equal(tree('- + -x'), '(unary- (unary+ (unary- x)))');
  assert.equal(tree('not -x'), '(unarynot (unary- x))');
  // A binary operator with a unary on its right is the other reading of the
  // same characters, and the tree says which one it took.
  assert.equal(tree('a - -b'), '(- a (unary- b))');
});

test('the level 1 operators bind tighter than a unary operator', () => {
  assert.equal(tree('-f(x)'), '(unary- (call f (argument x)))');
  assert.equal(tree('-a[0]'), '(unary- (index a 0))');
  assert.equal(tree('-a.b'), '(unary- (member a b))');
  assert.equal(tree('not f(x)'), '(unarynot (call f (argument x)))');
});

test('the level 1 operators apply left to right', () => {
  assert.equal(tree('a.b(1)[2].c'), '(member (index (call (member a b) (argument 1)) 2) c)');
});

test('the ternary is looser than every binary operator', () => {
  for (const binary of EVERY_BINARY) {
    const source = `a ${binary} b ? c : d`;
    assert.equal(tree(source), `(if-else (${binary} a b) c d)`, source);
    assert.deepEqual(codes(source), [], source);
  }
  assert.equal(tree('x ? a + b : c - d'), '(if-else x (+ a b) (- c d))');
});

test('the ternary nests to the right, in both arms', () => {
  assert.equal(
    tree('x > 0 ? "up" : x < 0 ? "down" : "flat"'),
    '(if-else (> x 0) "up" (if-else (< x 0) "down" "flat"))',
  );
  // The true arm is a whole expression, so a ternary written there closes with
  // its own colon and the outer one takes what is left.
  assert.equal(tree('a ? b ? c : d : e'), '(if-else a (if-else b c d) e)');
  assert.deepEqual(codes('x = a ? b ? c : d : e'), []);
});

test('brackets override precedence, and the tree keeps the ones a script wrote', () => {
  assert.equal(tree('(a + b) * c'), '(* (grouping (+ a b)) c)');
  assert.equal(tree('(a or b) and c'), '(and (grouping (or a b)) c)');
  assert.equal(tree('-(a + b)'), '(unary- (grouping (+ a b)))');
  assert.equal(tree('(x ? a : b) + 1'), '(+ (grouping (if-else x a b)) 1)');
  assert.equal(tree('((1))'), '(grouping (grouping 1))');
});

test('assignment is not in the table, because it is a statement and not an operator', () => {
  // 9.1 has no row for it, so nothing in an expression can consume one: the
  // second `=` here is left over at the end of a statement rather than nesting.
  assert.deepEqual(codes('x = y = 1'), ['OS1018']);
  assert.deepEqual(codes('if x = 1\n    y = 2\n'), ['OS1006']);
});
