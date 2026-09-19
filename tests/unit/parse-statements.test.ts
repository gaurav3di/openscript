import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { FunctionDeclaration, IfStatement, Script } from '../../src/core/index.js';
import { codes, firstStatement, items, parsed, shape } from './parse-support.js';

function only(source: string): string {
  return shape(firstStatement(source));
}

test('assignment, in all six forms', () => {
  assert.equal(only('len = 14'), '(= len 14)');
  assert.equal(only('total += close'), '(+= total close)');
  assert.equal(only('total -= close'), '(-= total close)');
  assert.equal(only('total *= 2'), '(*= total 2)');
  assert.equal(only('total /= 2'), '(/= total 2)');
  assert.equal(only('total %= 2'), '(%= total 2)');
});

test('a bare call on a line is a statement', () => {
  assert.equal(only('signal("BUY")'), '(expressionStatement (call signal (argument "BUY")))');
});

test('var, live var, and an annotation on either', () => {
  assert.equal(only('var stop = none'), '(var stop none)');
  assert.equal(only('live var n = 0'), '(live-var n 0)');
  assert.equal(only('var x: number = 0'), '(var x type:number 0)');
  assert.equal(only('var x: series number = none'), '(var x (seriesType type:number) none)');
  assert.equal(only('var xs: array<number> = []'), '(var xs (arrayType type:number) arrayLiteral)');
});

test('an annotation that names no real type still reaches the tree', () => {
  // OS2016 is a check, so the parser hands the word on rather than refusing it:
  // the reader is owed a sentence naming the types that do exist.
  assert.equal(only('var x: whole = 0'), '(var x type:whole 0)');
  assert.deepEqual(codes('var x: whole = 0'), []);
});

test('the three lines that describe the file are statements like any other', () => {
  assert.equal(only('version 1'), '(versionLine 1)');
  assert.equal(only('study("RSI", precision = 2)'), '(study (argument "RSI") (argument precision 2))');
  assert.equal(only('strategy("Cross")'), '(strategy (argument "Cross"))');
  assert.equal(only('limits(loops = 50_000_000)'), '(limitsLine (argument loops 50000000))');
});

test('version and limits are recognised by position, not reserved', () => {
  assert.equal(only('version = 1'), '(= version 1)');
  assert.equal(only('x = limits(1)'), '(= x (call limits (argument 1)))');
  assert.deepEqual(codes('version = 1\nx = limits(1)\n'), []);
});

test('if, else if and else are one statement with several branches', () => {
  const source = 'if a\n    x = 1\nelse if b\n    x = 2\nelse\n    x = 3\n';
  const statement = firstStatement(source) as IfStatement;
  assert.equal(statement.kind, 'ifStatement');
  assert.equal(statement.branches.length, 2);
  assert.notEqual(statement.elseBranch, undefined);
  assert.deepEqual(codes(source), []);
});

test('an if nested in an if takes the else at its own indentation', () => {
  const source = 'if a\n    if b\n        x = 1\nelse\n    y = 2\n';
  const statement = firstStatement(source) as IfStatement;
  assert.equal(statement.branches.length, 1);
  assert.notEqual(statement.elseBranch, undefined);
  assert.deepEqual(codes(source), []);
});

test('both for forms, with and without a step', () => {
  assert.equal(
    only('for i = 0 to 9\n    total += i\n'),
    '(forRangeStatement i 0 9 (block (+= total i)))',
  );
  assert.equal(
    only('for i = 9 to 0 step -1\n    total += i\n'),
    '(forRangeStatement i 9 0 (unary- 1) (block (+= total i)))',
  );
  assert.equal(
    only('for price in prices\n    total += price\n'),
    '(forInStatement price prices (block (+= total price)))',
  );
});

test('while, break and continue', () => {
  assert.equal(
    only('while i < 3\n    i += 1\n    break\n'),
    '(whileStatement (< i 3) (block (+= i 1) breakStatement))',
  );
  assert.deepEqual(codes('for v in vs\n    continue\n'), []);
});

test('switch in the value form, with several values on one arm', () => {
  const source = 'switch method\n    case "fast"\n        len = 9\n    case "slow", "verySlow"\n        len = 21\n    default\n        len = 14\n';
  assert.equal(
    only(source),
    '(switchStatement method (switchCase "fast" (block (= len 9)))' +
      ' (switchCase "slow" "verySlow" (block (= len 21)))' +
      ' (switchDefault (block (= len 14))))',
  );
  assert.deepEqual(codes(source), []);
});

test('switch in the condition form has no subject', () => {
  const source = 'switch\n    case r > 70\n        zone = "high"\n    default\n        zone = "mid"\n';
  assert.equal(
    only(source),
    '(switchStatement (switchCase (> r 70) (block (= zone "high")))' +
      ' (switchDefault (block (= zone "mid"))))',
  );
  assert.deepEqual(codes(source), []);
});

test('return, with a value and without one', () => {
  assert.equal(only('return 5'), '(returnStatement 5)');
  assert.equal(only('return'), 'returnStatement');
});

test('a function in either of the two forms of 11.1', () => {
  assert.equal(
    only('fn barChange(src) => src - src[1]'),
    '(functionDeclaration barChange (parameter src) (- src (index src 1)))',
  );
  assert.equal(
    only('fn zscore(src, len) =>\n    m = sma(src, len)\n    src - m\n'),
    '(functionDeclaration zscore (parameter src) (parameter len)' +
      ' (block (= m (call sma (argument src) (argument len)))' +
      ' (expressionStatement (- src m))))',
  );
});

test('a parameter may carry a type and a default', () => {
  const declaration = firstStatement(
    'fn band(src: series number, len: number = 20, mult = 2) => src\n',
  ) as FunctionDeclaration;
  assert.equal(declaration.parameters.length, 3);
  assert.equal(shape(declaration.parameters[1] as never), '(parameter len type:number 20)');
  assert.equal(shape(declaration.parameters[2] as never), '(parameter mult 2)');
});

test('a blank line and a comment inside a block do not end it', () => {
  const source = 'if a\n    x = 1\n\n    // still the same block\n    y = 2\nz = 3\n';
  const parsedScript: Script = parsed(source).script;
  assert.equal(parsedScript.items.length, 2);
  assert.equal(
    only(source),
    '(ifStatement (ifBranch a (block (= x 1) (= y 2))))',
  );
});

test('an empty file and a file of comments both have a tree', () => {
  assert.deepEqual(items(''), []);
  assert.deepEqual(items('// nothing here\n'), []);
  assert.deepEqual(codes(''), []);
});

test('a function declared inside a block is OS1023 and stays where it was written', () => {
  // Functions may not be nested (11.1), which is OS1023. The declaration is
  // kept rather than dropped, and kept in the block rather than lifted: one
  // that vanished here would be invisible to every pass after the parser, so a
  // call to it could only ever be reported as a name nobody declared, and a
  // nested function nobody calls would go unreported for good.
  const source = 'if a\n    fn helper(x) => x + 1\n    y = helper(1)\n';
  assert.deepEqual(codes(source), ['OS1023']);

  const statement = firstStatement(source) as IfStatement;
  const body = statement.branches[0]?.body;
  assert.equal(body?.statements.length, 2);
  assert.equal(body?.statements[0]?.kind, 'functionDeclaration');
  assert.equal(shape(body?.statements[1] as never), '(= y (call helper (argument 1)))');

  // Nothing was lifted out: the file still holds the one statement written at
  // its top level.
  assert.deepEqual(
    items(source).map((item) => item.kind),
    ['ifStatement'],
  );
});

test('only fn has a body on its own line; every other header opens a block', () => {
  assert.deepEqual(codes('fn f(x) => x + 1\n'), []);
  assert.deepEqual(codes('if a signal("X")\n'), ['OS1018']);
  assert.deepEqual(codes('while a x = 1\n'), ['OS1018']);
});

test('a file keeps its items in source order', () => {
  const kinds = items('version 1\nstudy("A")\nx = 1\nfn f() => 1\n').map((item) => item.kind);
  assert.deepEqual(kinds, ['versionLine', 'scriptDeclaration', 'assignment', 'functionDeclaration']);
});
