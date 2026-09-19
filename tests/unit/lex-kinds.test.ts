import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PUNCTUATORS, RESERVED_WORDS } from '../../src/core/index.js';
import type { TokenKind } from '../../src/core/index.js';
import { codes, kinds, lexed } from './lex-support.js';

/**
 * Every kind a token can carry, which is section 3 counted out: the reserved
 * words of 3.4, the punctuation of 3.12, the literals that are not words, a
 * name, and the layout of 3.10.
 *
 * The list is built from the two tables the language publishes, so a word or a
 * mark added to either is covered here the moment it is added.
 */
const LITERAL_KINDS: readonly TokenKind[] = ['numberLiteral', 'stringLiteral', 'hexColor'];
const LAYOUT_KINDS: readonly TokenKind[] = ['newline', 'indent', 'dedent', 'endOfFile'];

const EVERY_KIND: readonly TokenKind[] = [
  ...RESERVED_WORDS,
  ...PUNCTUATORS,
  ...LITERAL_KINDS,
  'identifier',
  ...LAYOUT_KINDS,
];

/** A script that carries the kind, so the table above can be checked one kind at a time. */
function sourceFor(kind: TokenKind): string {
  if ((RESERVED_WORDS as readonly string[]).includes(kind)) return `${kind}\n`;
  if ((PUNCTUATORS as readonly string[]).includes(kind)) return `a ${kind} b\n`;
  switch (kind) {
    case 'numberLiteral':
      return 'x = 42\n';
    case 'stringLiteral':
      return 'x = "BUY"\n';
    case 'hexColor':
      return 'x = #ff8800\n';
    case 'identifier':
      return 'x = close\n';
    default:
      // The four layout kinds, which one block produces between them.
      return 'if a\n    x = 1\n';
  }
}

/** The text a script's first string literal denotes, with its escapes resolved. */
function stringValue(source: string): string | undefined {
  const token = lexed(source).tokens.find((one) => one.kind === 'stringLiteral');
  return token?.kind === 'stringLiteral' ? token.value : undefined;
}

/** A script that reaches most of the language, for the invariants that hold of every token. */
const CORPUS = [
  'version 1',
  'study("Name", overlay = true, range = [0, 100])',
  'limits(loops = 50_000)',
  'len = input(14, "Length") // a comment',
  'var stop: series number = none',
  'live var count = 0',
  'fn zscore(src, n: number = 20) =>',
  '    m = sma(src, n)',
  '    (src - m) / stdev(src, n)',
  'if close > open and not flat',
  '    stop = low[1]',
  'else if close < open',
  '    stop = high',
  'else',
  '    stop = none',
  'for i = 0 to len - 1 step 2',
  '    count += 1',
  '    if count > 3',
  '        break',
  'for price in prices',
  '    continue',
  'while count < 10',
  '    count *= 2',
  'switch mode',
  '    case "fast", "quick"',
  '        len = 9',
  '    default',
  '        len = 21',
  'tint = up ? #ff8800 : rgb(0, 0, 0)',
  "msg = 'a' + \"b\\tc\"",
  'plot(draw.line(1, 2).x, "Z", aqua)',
  '',
].join('\n');

test('every token kind of section 3 is produced by some script', () => {
  // Thirty-six reserved words, twenty-five marks, three literals that are not
  // words, a name and four layout tokens. Stated so that a loop over an empty
  // table cannot pass.
  assert.equal(EVERY_KIND.length, 69);
  assert.equal(new Set(EVERY_KIND).size, 69);

  for (const kind of EVERY_KIND) {
    const produced = lexed(sourceFor(kind)).tokens.map((token) => token.kind);
    assert.equal(produced.includes(kind), true, `nothing produced a ${kind} token`);
  }
});

test('every token a script produces is one of those kinds', () => {
  const known = new Set<string>(EVERY_KIND);
  for (const token of lexed(CORPUS).tokens) {
    assert.equal(known.has(token.kind), true, `${token.kind} is not a kind section 3 describes`);
  }
});

test('a reserved word carries the word as its kind, and a name does not', () => {
  for (const word of RESERVED_WORDS) {
    const first = lexed(`${word}\n`).tokens[0];
    assert.equal(first?.kind, word);
    assert.equal(first?.text, word);
  }
  // A word one letter away from a reserved one is an ordinary name, and so is a
  // reserved word in another case: names are case sensitive (3.3).
  assert.deepEqual(kinds('vars = 1\n').slice(0, 1), ['identifier']);
  assert.deepEqual(kinds('VAR = 1\n').slice(0, 1), ['identifier']);
});

test('a token span covers exactly the text the token was read from', () => {
  const { file, tokens } = lexed(CORPUS);
  for (const token of tokens) {
    if (token.kind === 'newline' || token.kind === 'dedent' || token.kind === 'endOfFile') continue;
    const { offset, length, line, column } = token.span;
    assert.equal(file.text.slice(offset, offset + length), token.text, token.text);
    // The line and the column say the same thing as the offset, which is what
    // lets a renderer draw a caret from one and an editor jump from the other.
    assert.deepEqual(file.positionAt(offset), { line, column });
  }
});

test('an indent carries the whitespace that opened its block, and the other layout tokens carry none', () => {
  const { tokens } = lexed('if a\n      x = 1\n');
  const indent = tokens.find((token) => token.kind === 'indent');
  assert.equal(indent?.text, '      ');
  assert.equal(indent?.span.length, 6);

  for (const token of tokens) {
    if (token.kind !== 'newline' && token.kind !== 'dedent' && token.kind !== 'endOfFile') continue;
    assert.equal(token.text, '', `${token.kind} carries text`);
  }
});

test('a dedent sits where the block ended and covers nothing', () => {
  const { file, tokens } = lexed('if a\n    x = 1\nb = 2\n');
  const dedent = tokens.find((token) => token.kind === 'dedent');
  assert.equal(dedent?.span.length, 0);
  // At the first token of the line that closed the block, so a caret drawn on a
  // dedent lands on the line a reader would blame.
  assert.equal(file.text.slice(dedent?.span.offset ?? 0, (dedent?.span.offset ?? 0) + 1), 'b');
});

test('the stream ends with one end of file token, empty, at the end of the text', () => {
  for (const source of ['', '// only a comment\n', 'x = 1', 'if a\n    x = 1\n']) {
    const { file, tokens } = lexed(source);
    const ends = tokens.filter((token) => token.kind === 'endOfFile');
    assert.equal(ends.length, 1, JSON.stringify(source));
    assert.equal(tokens[tokens.length - 1]?.kind, 'endOfFile');
    assert.equal(ends[0]?.span.offset, file.text.length);
    assert.equal(ends[0]?.span.length, 0);
  }
});

test('a number literal keeps the text as written and the value it denotes', () => {
  const written: readonly (readonly [string, number])[] = [
    ['42', 42],
    ['3.14', 3.14],
    ['.5', 0.5],
    ['1_000_000', 1000000],
    ['2.5e-4', 2.5e-4],
    ['1E3', 1000],
    ['0xFF', 255],
    ['010', 10],
  ];
  for (const [text, value] of written) {
    const token = lexed(`x = ${text}\n`).tokens[2];
    assert.equal(token?.kind, 'numberLiteral', text);
    assert.equal(token?.text, text);
    assert.equal(token?.kind === 'numberLiteral' ? token.value : undefined, value, text);
  }
});

test('a string literal keeps its delimiters in the text and resolves escapes in the value', () => {
  assert.equal(lexed('x = "a\\tb"\n').tokens[2]?.text, '"a\\tb"');
  assert.equal(stringValue('x = "a\\tb"\n'), 'a\tb');

  assert.equal(lexed("x = 'a'\n").tokens[2]?.text, "'a'");
  assert.equal(stringValue("x = 'a'\n"), 'a');

  // Nothing inside a literal is read as anything else: not a comment, not a
  // digit group, not a reserved word.
  assert.equal(stringValue('x = "1_0 // if"\n'), '1_0 // if');
});

test('a colour literal is the hex form only, in either case, with or without an alpha byte', () => {
  for (const text of ['#ff8800', '#FF8800', '#ff880080']) {
    const token = lexed(`x = ${text}\n`).tokens[2];
    assert.equal(token?.kind, 'hexColor', text);
    assert.equal(token?.text, text);
  }
  // The nineteen names of 3.8 are ordinary globals, so the standard library can
  // add more without a grammar change.
  assert.equal(lexed('x = aqua\n').tokens[2]?.kind, 'identifier');
});

test('a run of characters that is not a literal is one name and one diagnostic', () => {
  // 3.5 has no bare `0x`, no trailing underscore and no exponent with no digits,
  // and 3.3 has no name beginning with a digit, so each of these is one mistake.
  // OS1029 rather than OS1001: every character in the run is one the language
  // accepts, so naming the leading digit would name something legal and
  // deleting it, which is what OS1001 advises, would leave a valid name behind
  // and a program that means something else.
  for (const [text, number] of [
    ['0x', '0'],
    ['1_', '1'],
    ['1e', '1'],
    ['1__0', '1'],
  ] as const) {
    const { tokens, diagnostics } = lexed(`x = ${text}\n`);
    assert.deepEqual(
      diagnostics.map((one) => one.code),
      ['OS1029'],
      text,
    );
    // The caret covers the whole run, and the message names the part of it that
    // is a number literal.
    assert.deepEqual(diagnostics[0]?.values, { written: text, number }, text);
    assert.equal(diagnostics[0]?.span.length, text.length, text);
    assert.equal(tokens[2]?.kind, 'identifier', text);
    assert.equal(tokens[2]?.text, text);
  }
});

test('a base the language does not have, and a unit written against a number', () => {
  // 3.5 has no binary form and no octal form, and there is nothing between a
  // quantity and a name to make them two things.
  assert.deepEqual(codes('mask = 0b1011\n'), ['OS1029']);
  assert.deepEqual(lexed('mask = 0b1011\n').diagnostics[0]?.values, {
    written: '0b1011',
    number: '0',
  });
  assert.deepEqual(codes('lookback = 14bars\n'), ['OS1029']);
  assert.deepEqual(lexed('lookback = 14bars\n').diagnostics[0]?.values, {
    written: '14bars',
    number: '14',
  });
  // An exponent with no digits after it, where the number part carries a
  // fractional part of its own.
  assert.deepEqual(lexed('x = 2.5e\n').diagnostics[0]?.values, { written: '2.5e', number: '2.5' });
  // And the forms 3.5 does have are still read as numbers.
  assert.deepEqual(codes('x = 0xFF\ny = 1_000_000\nz = 2.5e-4\nw = .5\n'), []);
});

test('a dot belongs to a number only when a digit follows it', () => {
  assert.deepEqual(kinds('x = 1.\n'), ['identifier', '=', 'numberLiteral', '.', 'newline']);
  assert.deepEqual(kinds('x = a.b\n'), ['identifier', '=', 'identifier', '.', 'identifier', 'newline']);
});
