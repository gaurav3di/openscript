import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { IfStatement, Script } from '../../src/core/index.js';
import { codes, firstStatement, items, parsed, shape } from './parse-support.js';

/**
 * What happens to the rest of a file when one line of it is wrong.
 *
 * A trader with three mistakes in a file wants three diagnostics, not one per
 * compile, and an editor asking about a half typed line wants a tree rather
 * than an exception. So the rules here are about the file around the mistake:
 * every statement still reaches the tree, every separate mistake is reported,
 * and no mistake is reported twice.
 */

test('four broken lines are four diagnostics, and every line is still in the tree', () => {
  const source = 'a = )\nb = )\nc = )\nd = 1\n';
  assert.deepEqual(codes(source), ['OS1022', 'OS1022', 'OS1022']);
  assert.deepEqual(
    items(source).map(shape),
    [
      '(= a missingExpression)',
      '(= b missingExpression)',
      '(= c missingExpression)',
      '(= d 1)',
    ],
  );
});

test('mistakes of different kinds in one file are each reported', () => {
  const source = 'if y = 2\n    a = 1\nvar w\nq = 30 < r < 70\nf(a b)\n';
  assert.deepEqual(codes(source), ['OS1006', 'OS1011', 'OS1008', 'OS1014']);
  assert.equal(items(source).length, 4);
});

test('a mistake inside a block costs its line and not the block', () => {
  const source = 'if a\n    x = )\n    y = 2\nz = 3\n';
  assert.deepEqual(codes(source), ['OS1022']);

  const statement = firstStatement(source) as IfStatement;
  const body = statement.branches[0]?.body;
  assert.equal(body?.statements.length, 2);
  assert.equal(items(source).length, 2);
});

test('a header that was not understood costs its body and nothing below the block', () => {
  const source = 'for i = 0, 9\n    x = 1\nz = 3\n';
  assert.deepEqual(codes(source), ['OS1020']);
  // The body is still read, so a second mistake inside it is found on the same
  // compile, and the statement after the block is read as though nothing had
  // happened.
  assert.equal(items(source).length, 2);
  assert.equal(shape(items(source)[1] as never), '(= z 3)');
});

test('a statement that has been reported on says nothing further about its wreckage', () => {
  // The body is missing because of what the header was already told, so OS1010
  // would be a second sentence about the first mistake.
  assert.deepEqual(codes('if a = 1\nx = 2\n'), ['OS1006']);
  // And the leftovers of a line that has already been reported on are not a
  // second statement that lost its newline.
  assert.deepEqual(codes('x = f(a, b,)\n'), ['OS1022']);
});

test('separate mistakes of the same kind are each reported', () => {
  assert.deepEqual(codes('f(a b c)\n'), ['OS1014', 'OS1014']);
  assert.deepEqual(codes('x = f(g(h(1 +\n'), ['OS1012', 'OS1012', 'OS1012', 'OS1022']);
  assert.deepEqual(codes('a = )\nb = )\n'), ['OS1022', 'OS1022']);
});

test('a line in a switch body that is not an arm costs that line only', () => {
  const source = 'switch a\n    x = 1\n    case 1\n        y = 2\n';
  assert.deepEqual(codes(source), ['OS1017']);
  assert.equal(
    shape(firstStatement(source)),
    '(switchStatement a (switchCase 1 (block (= y 2))))',
  );
});

test('a lexical mistake and a parse mistake in one file are both reported', () => {
  const source = 'x = 1 @\ny = )\n';
  assert.deepEqual(codes(source), ['OS1001', 'OS1022']);
  assert.equal(items(source).length, 2);
});

test('every prefix of a script parses without throwing and leaves a tree', () => {
  // This is the editor's case: a script is a broken file for as long as it is
  // being typed, and every keystroke asks the parser for a tree.
  const script = [
    'version 1',
    'study("Sample", overlay = true)',
    'len = input(14, "Length")',
    'fn zscore(src, n) =>',
    '    m = sma(src, n)',
    '    (src - m) / stdev(src, n)',
    'var stop = none',
    'if close > open and volume > 0',
    '    stop = low',
    'else',
    '    stop = high',
    'for i = 0 to len - 1',
    '    total += close[i]',
    'switch mode',
    '    case "fast"',
    '        len = 9',
    '    default',
    '        len = 21',
    'plot(zscore(close, len), "Z", aqua)',
    '',
  ].join('\n');

  for (let at = 0; at <= script.length; at++) {
    const text = script.slice(0, at);
    const tree: Script = parsed(text).script;
    assert.equal(tree.kind, 'script', `prefix of ${at} characters`);
  }
});

test('a file of tokens in no order at all still produces a tree and terminates', () => {
  // Generated source is how a parser meets shapes nobody would write, and a
  // compiler that hangs on one is worse than a compiler that gives up on it.
  const vocabulary = [
    'if',
    'else',
    'for',
    'in',
    'to',
    'step',
    'while',
    'switch',
    'case',
    'default',
    'fn',
    'var',
    'return',
    'break',
    '=>',
    '=',
    '+',
    '?',
    ':',
    ',',
    '(',
    ')',
    '[',
    ']',
    '.',
    'a',
    '1',
    '"s"',
    '\n',
    '\n    ',
  ];

  // A fixed generator rather than a random one: a test that fails only on some
  // runs is a test nobody can act on.
  let seed = 20240917;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed;
  };

  for (let file = 0; file < 200; file++) {
    const parts: string[] = [];
    for (let at = 0; at < 60; at++) {
      parts.push(vocabulary[next() % vocabulary.length] ?? 'a');
      parts.push(' ');
    }
    const text = parts.join('');
    const tree: Script = parsed(text).script;
    assert.equal(tree.kind, 'script', text);
  }
});

test('a semicolon is one mistake, and the parser reads the two statements it separated', () => {
  // The lexer reports OS1007 and hands the parser exactly what the fix asks the
  // reader to write, so the second statement is checked on the same compile.
  const source = 'fast = 1; slow = 2\n';
  assert.deepEqual(codes(source), ['OS1007']);
  assert.deepEqual(items(source).map(shape), ['(= fast 1)', '(= slow 2)']);
});

test('a file that is nothing but layout has a tree and nothing to report', () => {
  for (const source of ['', '\n\n\n', '// a note\n', '   \n\t\n// another\n']) {
    assert.deepEqual(items(source), [], JSON.stringify(source));
    assert.deepEqual(codes(source), [], JSON.stringify(source));
  }
});
