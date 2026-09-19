import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codes, kinds, layout, lexed } from './lex-support.js';

test('a block is the lines indented more deeply than the header above them', () => {
  assert.deepEqual(kinds('if close > open\n    body = 1\nbase = 0\n'), [
    'if',
    'identifier',
    '>',
    'identifier',
    'newline',
    'indent',
    'identifier',
    '=',
    'numberLiteral',
    'newline',
    'dedent',
    'identifier',
    '=',
    'numberLiteral',
    'newline',
  ]);
});

test('a block still open at the end of the file is closed there', () => {
  assert.deepEqual(layout('if a\n    x = 1\n'), ['newline', 'indent', 'newline', 'dedent']);
});

test('a file that does not end in a newline still ends its last statement', () => {
  assert.deepEqual(layout('x = 1'), ['newline']);
});

test('a blank line and a comment-only line take no part in the indentation', () => {
  const script = ['if a', '    x = 1', '', '// dragged to column zero', '    y = 2', 'z = 0', ''];
  assert.deepEqual(layout(script.join('\n')), [
    'newline',
    'indent',
    'newline',
    'newline',
    'dedent',
    'newline',
  ]);
  assert.deepEqual(codes(script.join('\n')), []);
});

test('any leading whitespace is accepted on a line that carries no token', () => {
  // Including a tab, which is OS1002 only where it indents something.
  assert.deepEqual(codes('if a\n\t// nothing here\n    x = 1\n'), []);
});

test('a tab in the indentation of a line that carries a token is OS1002', () => {
  assert.deepEqual(codes('if a\n\tx = 1\n'), ['OS1002']);
});

test('a line indented differently from its siblings is OS1003', () => {
  const { diagnostics } = lexed('if trending\n    fast = 1\n     slow = 2\n');
  assert.deepEqual(
    diagnostics.map((one) => one.code),
    ['OS1003'],
  );
  assert.deepEqual(diagnostics[0]?.values, { found: 5, expected: 4, line: 1 });
});

test('a line indented past its siblings stays in the block it is in', () => {
  // One lost space reports one error, rather than reshaping every line below it.
  assert.deepEqual(layout('if a\n    x = 1\n     y = 2\n    z = 3\n'), [
    'newline',
    'indent',
    'newline',
    'newline',
    'newline',
    'dedent',
  ]);
});

test('a line dedented to a width no open block has is OS1003', () => {
  const { diagnostics } = lexed('if a\n    if b\n        x = 1\n      y = 2\n');
  assert.deepEqual(
    diagnostics.map((one) => one.code),
    ['OS1003'],
  );
  assert.deepEqual(diagnostics[0]?.values, { found: 6, expected: 4, line: 1 });
});

test('an unclosed bracket continues the statement onto the next line', () => {
  assert.deepEqual(kinds('plot(a,\n     b)\n'), [
    'identifier',
    '(',
    'identifier',
    ',',
    'identifier',
    ')',
    'newline',
  ]);
});

test('a trailing binary operator, comma or assignment continues the statement', () => {
  assert.deepEqual(layout('total = a +\n        b\n'), ['newline']);
  assert.deepEqual(layout('total =\n        b\n'), ['newline']);
  assert.deepEqual(layout('x = a ?\n    b :\n    c\n'), ['newline']);
});

test('a trailing backslash continues the statement', () => {
  assert.deepEqual(layout('m = "a" + \\\n    "b"\n'), ['newline']);
  assert.deepEqual(layout('m = "a" \\\n    + "b"\n'), ['newline']);
});

test('a blank line inside a continuation neither continues nor ends it', () => {
  assert.deepEqual(layout('plot(a,\n\n     // a note\n     b)\n'), ['newline']);
});

test('a continuation line indented no more deeply than its statement is OS1028', () => {
  const { diagnostics } = lexed('total = a +\nb\n');
  assert.deepEqual(
    diagnostics.map((one) => one.code),
    ['OS1028'],
  );
  // The message names what this line is indented, what the line the statement
  // began on is indented, and which line that was. It names no block, because
  // there is no block: OS1003 would have named one that was never opened.
  assert.deepEqual(diagnostics[0]?.values, { found: 0, statement: 0, line: 1 });
  // Still one statement: the trailing operator said so, and the error names the
  // indentation to fix rather than inventing a second statement.
  assert.deepEqual(layout('total = a +\nb\n'), ['newline']);
});

test('a continuation inside a block is measured against its statement, not the block', () => {
  const source = 'if a\n    total = b +\n    c\n';
  const { diagnostics } = lexed(source);
  assert.deepEqual(
    diagnostics.map((one) => one.code),
    ['OS1028'],
  );
  // Four spaces is right for a line of this block and wrong for a continuation
  // of a statement that itself began four in, and the numbers say so.
  assert.deepEqual(diagnostics[0]?.values, { found: 4, statement: 4, line: 2 });
  assert.deepEqual(codes('if a\n    total = b +\n        c\n    d = 1\n'), []);
});

test('a multi-line function header opens a block and a single-line one does not', () => {
  assert.deepEqual(layout('fn zscore(src) =>\n    m = 1\n    m\n'), [
    'newline',
    'indent',
    'newline',
    'newline',
    'dedent',
  ]);
  assert.deepEqual(layout('fn barChange(src) => src - src[1]\ny = 2\n'), ['newline', 'newline']);
});

test('every header keyword opens a block, including the arms of a switch', () => {
  const script = [
    'switch',
    '    case a > 1',
    '        z = 1',
    '    default',
    '        z = 2',
    '',
  ].join('\n');
  assert.deepEqual(layout(script), [
    'newline',
    'indent',
    'newline',
    'indent',
    'newline',
    'dedent',
    'newline',
    'indent',
    'newline',
    'dedent',
    'dedent',
  ]);
  assert.deepEqual(codes(script), []);
});

test('a line indented under something that is not a header is OS1003', () => {
  const { diagnostics } = lexed('x = 1\n    y = 2\n');
  assert.deepEqual(
    diagnostics.map((one) => one.code),
    ['OS1003'],
  );
  assert.deepEqual(diagnostics[0]?.values, { found: 4, expected: 0, line: 1 });
});

test('a statement the end of the file interrupts is still ended', () => {
  // The parser reports the missing operand as OS1022, and it can only do that
  // if the statement it is holding was closed.
  assert.deepEqual(kinds('len = input(14) +\n'), [
    'identifier',
    '=',
    'identifier',
    '(',
    'numberLiteral',
    ')',
    '+',
    'newline',
  ]);
  // The same for a bracket that is never closed: one statement, ended at the end
  // of the file, with the opening bracket still in the stream to report against.
  assert.deepEqual(kinds('plot(ema(close, 9), "EMA", aqua\nx = 1\n').filter((k) => k === 'newline'), [
    'newline',
  ]);
});

test('an indent token carries the leading whitespace it opened the block with', () => {
  const indent = lexed('if a\n    x = 1\n').tokens.find((token) => token.kind === 'indent');
  assert.equal(indent?.text, '    ');
  assert.equal(indent?.span.line, 2);
  assert.equal(indent?.span.column, 1);
});
