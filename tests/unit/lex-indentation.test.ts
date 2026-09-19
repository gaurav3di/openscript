import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codes, kinds, layout, lexed } from './lex-support.js';

/**
 * The block rules of language.md 3.10 and the continuation rules of 3.11, taken
 * one clause at a time.
 *
 * Section 3.10 says what a line is before it says anything else: throughout the
 * section, a line means a line that carries at least one token. Most of what
 * follows is that sentence being applied, which is why so many of these scripts
 * hold a blank line or a comment.
 */

/** Where the blocks of a script open and close, without the statements between. */
function blocks(text: string): readonly string[] {
  return layout(text).filter((kind) => kind !== 'newline');
}

test('a block is any consistent indentation, as long as it is deeper than its header', () => {
  // The convention is four spaces and nothing enforces it, so one space and
  // eight produce the same block.
  for (const width of [1, 4, 8]) {
    const source = `if a\n${' '.repeat(width)}x = 1\nb = 2\n`;
    assert.deepEqual(blocks(source), ['indent', 'dedent'], `${width} spaces`);
    assert.deepEqual(codes(source), [], `${width} spaces`);
  }
});

test('a line at the header indentation is not a body, and opens no block', () => {
  // OS1010 is the parser's to report: the lexer has nothing to say about a
  // header whose next line is simply the next statement.
  assert.deepEqual(blocks('if a\nx = 1\n'), []);
  assert.deepEqual(codes('if a\nx = 1\n'), []);
});

test('a blank line or a comment between a header and its body does not stop the body being one', () => {
  for (const between of ['', '// a note', '        // an indented note', '   ']) {
    const source = `if a\n${between}\n    x = 1\n`;
    assert.deepEqual(blocks(source), ['indent', 'dedent'], JSON.stringify(between));
    assert.deepEqual(codes(source), [], JSON.stringify(between));
  }
});

test('a header with nothing but blank and comment lines under it opens no block', () => {
  const source = 'if a\n\n// a note\n\nx = 1\n';
  assert.deepEqual(blocks(source), []);
  assert.deepEqual(codes(source), []);
});

test('a line that carries no token never ends a block, however it is indented', () => {
  const source = [
    'if a',
    '    x = 1',
    '',
    '// dragged to column zero, which every editor does',
    '                    // and one indented past the block it sits in',
    '   ',
    '    y = 2',
    'b = 0',
    '',
  ].join('\n');
  assert.deepEqual(blocks(source), ['indent', 'dedent']);
  assert.deepEqual(codes(source), []);
});

test('several blocks end on the one line that closes them', () => {
  assert.deepEqual(blocks('if a\n    if b\n        x = 1\ny = 2\n'), [
    'indent',
    'indent',
    'dedent',
    'dedent',
  ]);
  // And the end of the file closes every block still open, whether or not the
  // file ends in a newline.
  assert.deepEqual(blocks('if a\n    if b\n        x = 1\n'), ['indent', 'indent', 'dedent', 'dedent']);
  assert.deepEqual(blocks('if a\n    if b\n        x = 1'), ['indent', 'indent', 'dedent', 'dedent']);
});

test('a block reopens at the width it used before, and that is not a mismatch', () => {
  const source = 'if a\n    x = 1\nif b\n    y = 2\n';
  assert.deepEqual(blocks(source), ['indent', 'dedent', 'indent', 'dedent']);
  assert.deepEqual(codes(source), []);
});

test('a tab in the indentation is OS1002 once for the line, and the line still opens its block', () => {
  const source = 'if a\n\t\tx = 1\n';
  assert.deepEqual(codes(source), ['OS1002']);
  assert.deepEqual(blocks(source), ['indent', 'dedent']);
  // The whole of the leading whitespace is underlined, which is what the fix
  // asks the reader to replace.
  const diagnostic = lexed(source).diagnostics[0];
  assert.equal(diagnostic?.span.line, 2);
  assert.equal(diagnostic?.span.column, 1);
  assert.equal(diagnostic?.span.length, 2);
});

test('a tab is only OS1002 where it indents something', () => {
  // A line that carries no token carries no indentation either, so there is
  // nothing for the rule to be about.
  assert.deepEqual(codes('if a\n\t\n\t// a note\n    x = 1\n'), []);
});

test('one space of difference between siblings is OS1003, and the line stays in its block', () => {
  const source = 'if a\n    x = 1\n     y = 2\n    z = 3\n';
  assert.deepEqual(codes(source), ['OS1003']);
  assert.deepEqual(lexed(source).diagnostics[0]?.values, { found: 5, expected: 4, line: 1 });
  // One lost space is one error rather than a reshaping of everything below it.
  assert.deepEqual(blocks(source), ['indent', 'dedent']);
});

test('a statement continues onto the next line in the three cases of 3.11 and no others', () => {
  // An open bracket.
  assert.deepEqual(layout('plot(a,\n     b)\n'), ['newline']);
  assert.deepEqual(layout('x = [1,\n     2]\n'), ['newline']);
  // A trailing binary operator, comma, question mark, colon or equals.
  for (const ending of ['+', '-', '*', '/', '%', '==', '!=', '<', '<=', '>', '>=', 'and', 'or', '=']) {
    assert.deepEqual(layout(`x = a ${ending}\n    b\n`), ['newline'], ending);
  }
  assert.deepEqual(layout('x = a ?\n    b :\n    c\n'), ['newline']);
  // A trailing backslash.
  assert.deepEqual(layout('x = "a" + \\\n    "b"\n'), ['newline']);
  // And nothing else: a dot is not on the list, so a line that ends in one ends.
  assert.deepEqual(layout('x = a.\nb = 1\n'), ['newline', 'newline']);
});

test('a continuation line has only to sit deeper than the line that began the statement', () => {
  assert.deepEqual(codes('total = a +\n b\n'), []);
  assert.deepEqual(codes('total = a +\n                    b\n'), []);
  // Level with the statement is OS1003, because it could otherwise be read as a
  // statement of its own.
  assert.deepEqual(codes('total = a +\nb\n'), ['OS1003']);
});

test('a continuation inside a block is measured against its own statement, not the block', () => {
  const source = 'if a\n    total = b +\n        c\n    d = 1\n';
  assert.deepEqual(codes(source), []);
  assert.deepEqual(blocks(source), ['indent', 'dedent']);
});

test('a blank line and a comment inside a continuation neither continue it nor end it', () => {
  const source = 'plot(a,\n\n     // a note about b\n\n     b)\nx = 1\n';
  assert.deepEqual(codes(source), []);
  assert.deepEqual(layout(source), ['newline', 'newline']);
});

test('a comment after the last token of a line does not stop the line ending', () => {
  assert.deepEqual(kinds('x = 1 // a note\ny = 2\n'), [
    'identifier',
    '=',
    'numberLiteral',
    'newline',
    'identifier',
    '=',
    'numberLiteral',
    'newline',
  ]);
});

test('an indented line under a statement that is not a header is OS1003 and opens nothing', () => {
  const source = 'x = 1\n    y = 2\nz = 3\n';
  assert.deepEqual(codes(source), ['OS1003']);
  assert.deepEqual(blocks(source), []);
});

test('the single line function form opens no block and the multi-line form does', () => {
  // 3.10: `fn` is the one header with a form that fits on its own line, because
  // it has `=>` to end its body with and there is no statement separator.
  assert.deepEqual(blocks('fn f(x) => x + 1\ny = 2\n'), []);
  assert.deepEqual(blocks('fn f(x) =>\n    x + 1\n'), ['indent', 'dedent']);
  // The `=>` is an `=` and a `>` that touch, and a `>` on its own continues the
  // line rather than opening a block under it.
  assert.deepEqual(layout('x = a >\n    b\n'), ['newline']);
});
