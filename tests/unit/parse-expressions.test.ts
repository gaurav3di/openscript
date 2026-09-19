import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codes, expression, parsed, shape } from './parse-support.js';

/** The source is one bare expression on a line, so no statement form is in the way. */
function tree(source: string): string {
  return shape(expression(source));
}

test('precedence follows the table of section 9.1', () => {
  assert.equal(tree('a + b * c'), '(+ a (* b c))');
  assert.equal(tree('a * b + c'), '(+ (* a b) c)');
  assert.equal(tree('-x % y'), '(% (unary- x) y)');
  assert.equal(tree('not a and b'), '(and (unarynot a) b)');
  assert.equal(tree('a or b and c'), '(or a (and b c))');
  assert.equal(tree('a == b and c'), '(and (== a b) c)');
  assert.equal(tree('a + b < c + d'), '(< (+ a b) (+ c d))');
  assert.equal(tree('not a == b'), '(== (unarynot a) b)');
});

test('the arithmetic levels are left associative', () => {
  assert.equal(tree('a - b - c'), '(- (- a b) c)');
  assert.equal(tree('a / b / c'), '(/ (/ a b) c)');
  assert.equal(tree('a and b and c'), '(and (and a b) c)');
  assert.equal(tree('a or b or c'), '(or (or a b) c)');
});

test('the ternary is right associative', () => {
  assert.equal(
    tree('x > 0 ? "up" : x < 0 ? "down" : "flat"'),
    '(if-else (> x 0) "up" (if-else (< x 0) "down" "flat"))',
  );
});

test('unary operators nest, because 9.1 calls the level right associative', () => {
  assert.equal(tree('not not ready'), '(unarynot (unarynot ready))');
  assert.equal(tree('- -x'), '(unary- (unary- x))');
  assert.equal(tree('-x[1]'), '(unary- (index x 1))');
});

test('the brackets a script wrote are kept', () => {
  assert.equal(tree('(a + b) * c'), '(* (grouping (+ a b)) c)');
  assert.equal(tree('((1))'), '(grouping (grouping 1))');
});

test('postfix operators apply left to right', () => {
  assert.equal(tree('a[1][2]'), '(index (index a 1) 2)');
  assert.equal(tree('f(x)(y)'), '(call (call f (argument x)) (argument y))');
  assert.equal(tree('a.b.c'), '(member (member a b) c)');
  assert.equal(tree('draw.box(1, 2)'), '(call (member draw box) (argument 1) (argument 2))');
  assert.equal(tree('req.symbol(s, i, close)[1]'), '(index (call (member req symbol) (argument s) (argument i) (argument close)) 1)');
});

test('every literal form of section 3 reaches the tree', () => {
  assert.equal(tree('42'), '42');
  assert.equal(tree('1_000_000'), '1000000');
  assert.equal(tree('0xFF'), '255');
  assert.equal(tree('.5'), '0.5');
  assert.equal(tree('"BUY"'), '"BUY"');
  assert.equal(tree('true'), 'true');
  assert.equal(tree('false'), 'false');
  assert.equal(tree('none'), 'none');
  assert.equal(tree('#ff8800'), '#ff8800');
  assert.equal(tree('#ff880080'), '#ff880080');
});

test('a named colour is an ordinary name, not a literal', () => {
  assert.equal(expression('aqua').kind, 'nameReference');
});

test('an array literal holds its elements, and may be empty', () => {
  assert.equal(tree('[1, 2, 3]'), '(arrayLiteral 1 2 3)');
  assert.equal(tree('[]'), 'arrayLiteral');
  assert.equal(tree('[[1], [2]]'), '(arrayLiteral (arrayLiteral 1) (arrayLiteral 2))');
});

test('an argument may carry a label, and a reserved word is legal as one', () => {
  assert.equal(
    tree('plot(v, "V", color = aqua)'),
    '(call plot (argument v) (argument "V") (argument color aqua))',
  );
  assert.deepEqual(codes('psar(start = 0.02, step = 0.02)'), []);
  assert.deepEqual(codes('input(14, "Length", min = 2)'), []);
});

test('a label is told from a comparison by one token of lookahead', () => {
  assert.equal(tree('f(a == 1)'), '(call f (argument (== a 1)))');
  assert.equal(tree('f(a = 1)'), '(call f (argument a 1))');
});

test('an expression continues across lines while a bracket is open', () => {
  const source = 'total = ema(close, 9) +\n        ema(close, 21)\n';
  assert.deepEqual(codes(source), []);
  assert.equal(tree('f(\n    1,\n    2)\n'), '(call f (argument 1) (argument 2))');
  assert.equal(parsed(source).script.items.length, 1);
});

test('a call and an index inside one expression keep their order', () => {
  assert.equal(tree('element(zones, i)[0]'), '(index (call element (argument zones) (argument i)) 0)');
  assert.equal(tree('history(prices, 1)'), '(call history (argument prices) (argument 1))');
});
