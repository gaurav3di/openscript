import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PUNCTUATORS } from '../../src/core/index.js';
import { codes, kinds, lexed, words } from './lex-support.js';

/** The value a script's one number literal denotes. */
function numberValue(text: string): number {
  for (const token of lexed(text).tokens) {
    if (token.kind === 'numberLiteral') return token.value;
  }
  throw new Error(`no number literal in ${text}`);
}

/** The text a script's one string literal denotes, with escapes resolved. */
function stringValue(text: string): string {
  for (const token of lexed(text).tokens) {
    if (token.kind === 'stringLiteral') return token.value;
  }
  throw new Error(`no string literal in ${text}`);
}

test('a byte order mark is accepted and ignored', () => {
  const { tokens, diagnostics } = lexed('\ufefflen = 14\n');
  assert.deepEqual(diagnostics, []);
  assert.equal(tokens[0]?.text, 'len');
  assert.equal(tokens[0]?.span.offset, 0);
  assert.equal(tokens[0]?.span.column, 1);
});

test('a file written with carriage returns lexes identically to one without', () => {
  assert.deepEqual(kinds('if a\r\n    b = 1\r\n'), kinds('if a\n    b = 1\n'));
  assert.deepEqual(codes('if a\r\n    b = 1\r\n'), []);
});

test('a comment runs to the end of the line and produces no token', () => {
  assert.deepEqual(kinds('len = 14 // the length\n'), [
    'identifier',
    '=',
    'numberLiteral',
    'newline',
  ]);
});

test('a comment marker inside a string literal is ordinary text', () => {
  assert.equal(stringValue('msg = "https://x"\n'), 'https://x');
});

test('a block comment marker is reported once, where it sits', () => {
  // The form does not exist (3.2), and the marker is reported rather than read
  // as a divide against a multiply. Read as tokens it makes the prose between
  // the markers a statement, and the reader is handed several diagnostics that
  // are each true of a program they never wrote and none of which mentions the
  // comment they were writing.
  const source = 'lookback = 14 /* bars */\n';
  const { diagnostics } = lexed(source);
  assert.deepEqual(
    diagnostics.map((one) => one.code),
    ['OS1026'],
  );
  assert.deepEqual(diagnostics[0]?.values, { marker: '/*' });
  assert.equal(diagnostics[0]?.span.column, 15);
  assert.equal(diagnostics[0]?.span.length, 2);
  // And what is left is a sound line, not a line with its operands missing.
  assert.deepEqual(words(source), ['lookback', '=', '14']);
});

test('a closer with nothing open is reported where it is written', () => {
  const { diagnostics } = lexed('a = 1\nb = 2 */\n');
  assert.deepEqual(
    diagnostics.map((one) => one.code),
    ['OS1026'],
  );
  assert.deepEqual(diagnostics[0]?.values, { marker: '*/' });
  assert.equal(diagnostics[0]?.span.line, 2);
});

test('a star written against a line comment is a multiply and a comment', () => {
  // The comment form the language does have wins, so a correct line is not
  // reported. A diagnostic on a correct program is the one mistake a lexer may
  // never make.
  assert.deepEqual(codes('x = a*// note\n'), []);
  assert.deepEqual(kinds('x = a*// note\n'), ['identifier', '=', 'identifier', '*', 'newline']);
});

test('there is no block comment, so nothing swallows the rest of a file', () => {
  // A marked region costs its own lines and is reported at the opener, so the
  // lines below the closer are read as usual.
  assert.deepEqual(words('a = 1\n/* note\n   more */\nb = 2\n'), ['a', '=', '1', 'b', '=', '2']);
  assert.deepEqual(codes('a = 1\n/* note\n   more */\nb = 2\n'), ['OS1026']);

  // An opener whose closer was never written costs its own line and nothing
  // below it. Reading the rest of the file as a comment is the silent swallow
  // that 3.2 gives as the reason the form does not exist, and one marker may
  // not cost a reader every other mistake in their file.
  assert.equal(words('a = 1\n/* x\nb = 2\n').includes('b'), true);
  assert.deepEqual(codes('a = 1\n/* x\nb = 2\n'), ['OS1026']);
});

test('an identifier begins with a letter or an underscore and is case sensitive', () => {
  assert.deepEqual(words('fastLength = _scratch\n'), ['fastLength', '=', '_scratch']);
  assert.deepEqual(kinds('Close = close\n'), ['identifier', '=', 'identifier', 'newline']);
});

test('a reserved word carries its own kind and a name does not', () => {
  assert.deepEqual(kinds('if ready\n    x = 1\n').slice(0, 2), ['if', 'identifier']);
});

test('a reserved word keeps its kind where a parser will read it as an argument label', () => {
  // 3.4: the label is matched against the callee's parameter list and never
  // looked up, and only the parser can tell that list from a parameter list.
  assert.deepEqual(kinds('plot(x, "X", color = aqua)\n').slice(0, 9), [
    'identifier',
    '(',
    'identifier',
    ',',
    'stringLiteral',
    ',',
    'color',
    '=',
    'identifier',
  ]);
});

test('a number literal is read in every form section 3.5 allows', () => {
  assert.equal(numberValue('x = 42\n'), 42);
  assert.equal(numberValue('x = 3.14\n'), 3.14);
  assert.equal(numberValue('x = .5\n'), 0.5);
  assert.equal(numberValue('x = 1_000_000\n'), 1000000);
  assert.equal(numberValue('x = 2.5e-4\n'), 2.5e-4);
  assert.equal(numberValue('x = 1E3\n'), 1000);
  assert.equal(numberValue('x = 0xFF\n'), 255);
});

test('there is no octal form, so a leading zero is only a leading zero', () => {
  assert.equal(numberValue('x = 010\n'), 10);
});

test('a negative number is an operator applied to a literal', () => {
  assert.deepEqual(kinds('x = -2\n'), ['identifier', '=', '-', 'numberLiteral', 'newline']);
});

test('a dot only joins a number when a digit follows it', () => {
  assert.deepEqual(kinds('x = bar.index\n'), [
    'identifier',
    '=',
    'identifier',
    '.',
    'identifier',
    'newline',
  ]);
});

test('the two string delimiters mean the same thing', () => {
  assert.equal(stringValue('x = "BUY"\n'), 'BUY');
  assert.equal(stringValue("x = 'BUY'\n"), 'BUY');
  assert.equal(stringValue("x = 'He said \"go\"'\n"), 'He said "go"');
});

test('every escape sequence the language defines is resolved on the token', () => {
  assert.equal(stringValue('x = "a\\nb"\n'), 'a\nb');
  assert.equal(stringValue('x = "a\\tb"\n'), 'a\tb');
  assert.equal(stringValue('x = "a\\rb"\n'), 'a\rb');
  assert.equal(stringValue('x = "a\\\\b"\n'), 'a\\b');
  assert.equal(stringValue('x = "a\\"b"\n'), 'a"b');
  assert.equal(stringValue("x = 'a\\'b'\n"), "a'b");
  assert.equal(stringValue('x = "a\\0b"\n'), 'a\u0000b');
  assert.equal(stringValue('x = "\\u2713"\n'), '\u2713');
});

test('a boolean and the absent literal are words, not literals of their own', () => {
  assert.deepEqual(kinds('x = true\n'), ['identifier', '=', 'true', 'newline']);
  assert.deepEqual(kinds('x = none\n'), ['identifier', '=', 'none', 'newline']);
});

test('a named colour is an ordinary name and a hex colour is a literal', () => {
  assert.deepEqual(kinds('x = aqua\n'), ['identifier', '=', 'identifier', 'newline']);
  assert.deepEqual(kinds('x = #ff8800\n'), ['identifier', '=', 'hexColor', 'newline']);
  assert.deepEqual(kinds('x = #ff880080\n'), ['identifier', '=', 'hexColor', 'newline']);
});

test('every punctuation token of section 3.12 is read as one token', () => {
  for (const mark of PUNCTUATORS) {
    assert.deepEqual(kinds(`a ${mark} b\n`).slice(0, 3), ['identifier', mark, 'identifier'], mark);
  }
});

test('a longer punctuation token is preferred to the one it starts with', () => {
  assert.deepEqual(kinds('a <= b\n').slice(1, 2), ['<=']);
  assert.deepEqual(kinds('a != b\n').slice(1, 2), ['!=']);
  assert.deepEqual(kinds('a += b\n').slice(1, 2), ['+=']);
});
