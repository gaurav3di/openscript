import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderDiagnostic } from '../../src/core/index.js';
import { codes, lexed, words } from './lex-support.js';

/** The one diagnostic a script produces, which most of these scripts have. */
function only(text: string) {
  const { diagnostics } = lexed(text);
  assert.equal(diagnostics.length, 1, `expected one diagnostic, got ${diagnostics.length}`);
  const first = diagnostics[0];
  assert.ok(first);
  return first;
}

test('a character the language does not have is OS1001 where it sits', () => {
  const diagnostic = only('len = input(\u00a014)\n');
  assert.equal(diagnostic.code, 'OS1001');
  assert.equal(diagnostic.span.line, 1);
  assert.equal(diagnostic.span.column, 13);
  assert.equal(diagnostic.values.suggestion, 'Use a plain space instead.');
  assert.equal(String(diagnostic.values.char).includes('no-break space'), true);
  assert.equal(String(diagnostic.values.char).includes('U+00A0'), true);
});

test('one bad character does not hide the rest of the file', () => {
  const { diagnostics, tokens } = lexed('x = 1\ny = @\nz = 3\n');
  assert.equal(diagnostics.length, 1);
  assert.equal(
    tokens.some((token) => token.text === 'z'),
    true,
  );
});

test('an operator the language does not have names the one that replaces it', () => {
  assert.equal(only('if !ready\n    x = 1\n').values.suggestion, 'Write not instead.');
  assert.equal(only('x = a && b\n').values.suggestion, 'Write and instead.');
  assert.equal(only('x = a || b\n').values.suggestion, 'Write or instead.');
  assert.equal(only('x = a ^ b\n').values.suggestion, 'Write pow(a, b) instead.');
  assert.equal(only('x = a ** b\n').values.suggestion, 'Write pow(a, b) instead.');
  assert.equal(only('x = a ++\n').values.suggestion, 'Write a += 1 instead.');
  assert.equal(
    only('if a {\n').values.suggestion,
    'Use indentation instead, which is how a block is written.',
  );
  assert.equal(only('x = $name\n').values.suggestion, 'Delete it, or put the text in a string.');
});

test('a rejected operator is named whole, not one character of it', () => {
  assert.equal(only('x = a && b\n').values.char, '"&&"');
  assert.equal(only('x = a && b\n').span.length, 2);
});

test('the not operator is only refused on its own, since != is an operator', () => {
  assert.deepEqual(codes('x = a != b\n'), []);
});

test('a typographic quotation mark names the straight quote', () => {
  // A pair of them is a pair of errors: each one has to be replaced.
  const { diagnostics } = lexed('x = \u201cBUY\u201d\n');
  assert.equal(diagnostics.length, 2);
  for (const diagnostic of diagnostics) {
    assert.equal(diagnostic.code, 'OS1001');
    assert.equal(diagnostic.values.suggestion, 'Use a straight quote instead.');
  }
});

test('a non-ASCII letter in a name is reported once and the name reads as one name', () => {
  const script = 'l\u00e4ngd = 9\n';
  const diagnostic = only(script);
  assert.equal(diagnostic.code, 'OS1001');
  assert.equal(diagnostic.values.suggestion, 'Use the ASCII spelling of the name instead.');
  assert.deepEqual(words(script), ['l\u00e4ngd', '=', '9']);
});

test('a name that starts with a digit is reported once and reads as one name', () => {
  const diagnostic = only('2fast = 9\n');
  // OS1029, not OS1001: the digit is a character the language accepts, and
  // OS1001's advice to delete it would leave `fast = 9`, which compiles and is
  // a different program from the one on the page.
  assert.equal(diagnostic.code, 'OS1029');
  assert.deepEqual(diagnostic.values, { written: '2fast', number: '2' });
  assert.equal(diagnostic.span.column, 1);
  assert.equal(diagnostic.span.length, 5);
  assert.deepEqual(words('2fast = 9\n'), ['2fast', '=', '9']);
});

test('a lone carriage return is named rather than silently repaired', () => {
  const diagnostic = only('x = 1\ry = 2\n');
  assert.equal(diagnostic.code, 'OS1001');
  assert.equal(String(diagnostic.values.char).includes('carriage return'), true);
});

test('a tab outside the indentation asks for a plain space', () => {
  const diagnostic = only('x =\t1\n');
  assert.equal(diagnostic.code, 'OS1001');
  assert.equal(diagnostic.values.suggestion, 'Use a plain space instead.');
});

test('a colour literal of the wrong length is OS1027, and a bare hash is OS1001', () => {
  // A hash with a run written against it was nearly a colour, so it gets a code
  // that says so. OS1001's substitution row advises deleting the character or
  // moving the text into a string, which would throw the colour away.
  const malformed = only('x = #ff88\n');
  assert.equal(malformed.code, 'OS1027');
  assert.deepEqual(malformed.values, { written: '#ff88' });
  assert.equal(malformed.span.column, 5);
  assert.equal(malformed.span.length, 5);

  // A hash with nothing written against it is not a colour anybody started, so
  // the substitution row is the right answer and it covers the hash alone.
  const bare = only('x = # y\n');
  assert.equal(bare.code, 'OS1001');
  assert.equal(bare.span.length, 1);

  assert.deepEqual(codes('x = #ff8800\n'), []);
  assert.deepEqual(codes('x = #ff880080\n'), []);
});

test('a malformed colour is dropped, so the argument it stood in is lost', () => {
  // The run is not a colour and there is no token kind for it, so it is dropped
  // the way every other refused run is. The comma before it is then read as
  // trailing, and OS1022's fix, to delete that comma, would throw away an
  // argument the writer did write.
  //
  // Pinned rather than endorsed: this is the second diagnostic being wrong
  // about the program, and the day the colour is emitted as a token of its own
  // this test fails and is rewritten to the one diagnostic the line deserves.
  assert.deepEqual(codes('plot(close, "Close", #ff88)\n'), ['OS1027']);
  const { diagnostics } = lexed('plot(close, "Close", #ff88)\n');
  assert.equal(diagnostics[0]?.span.column, 22);
  assert.deepEqual(words('plot(close, "Close", #ff88)\n'), [
    'plot',
    '(',
    'close',
    ',',
    '"Close"',
    ',',
    ')',
  ]);
});

test('a semicolon is OS1007 and the line reads as the two statements it holds', () => {
  const script = 'fast = 1; slow = 2\n';
  assert.equal(only(script).code, 'OS1007');
  assert.deepEqual(
    lexed(script)
      .tokens.map((token) => token.kind)
      .filter((kind) => kind === 'newline').length,
    2,
  );
});

test('an unterminated string literal is OS1004 at the opening quote', () => {
  const diagnostic = only('signal("BUY)\n');
  assert.equal(diagnostic.code, 'OS1004');
  assert.equal(diagnostic.values.quote, '"');
  assert.equal(diagnostic.span.column, 8);
  assert.equal(diagnostic.span.length, 1);
});

test('an unterminated literal still produces a token, so the line reports once', () => {
  assert.deepEqual(words('signal("BUY)\n'), ['signal', '(', '"BUY)']);
});

test('a backslash sequence the language does not define is OS1005', () => {
  const { diagnostics } = lexed('path = "C:\\data\\bars"\n');
  assert.deepEqual(
    diagnostics.map((one) => one.code),
    ['OS1005', 'OS1005'],
  );
  assert.equal(diagnostics[0]?.values.sequence, '\\d');
  assert.equal(diagnostics[1]?.values.sequence, '\\b');
});

test('a unicode escape needs its four digits', () => {
  const diagnostic = only('x = "\\u12"\n');
  assert.equal(diagnostic.code, 'OS1005');
  assert.equal(diagnostic.values.sequence, '\\u12');
});

test('a diagnostic renders under the text it is about', () => {
  const { file, diagnostics } = lexed('if trending\n    fast = 1\n     slow = 2\n');
  const first = diagnostics[0];
  assert.ok(first);
  const [line, caret] = renderDiagnostic(file, first).split('\n');
  assert.equal(line, '3 |      slow = 2');
  assert.equal(caret, '  | ^^^^^');
});
