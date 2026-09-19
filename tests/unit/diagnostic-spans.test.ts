import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allCodes, endOffset, entryFor, renderDiagnostic } from '../../src/core/index.js';
import type { Diagnostic } from '../../src/core/index.js';
import { parsed } from './parse-support.js';

/**
 * Where a diagnostic points.
 *
 * The code is the promise and the wording may improve, so nothing here reads a
 * message. What is asserted is the span: the characters a caret will be drawn
 * under, which is the part of a diagnostic a reader acts on before they have
 * finished reading the sentence.
 *
 * Each row names the code, the script, and the text the span has to cover.
 */
const POINTS: readonly (readonly [string, string, string, number, number])[] = [
  // The lexer.
  ['OS1001', 'len = input(\u00a014)\n', '\u00a0', 1, 13],
  ['OS1001', 'x = a && b\n', '&&', 1, 7],
  ['OS1002', 'if a\n\tx = 1\n', '\t', 2, 1],
  ['OS1003', 'if a\n    x = 1\n     y = 2\n', '     ', 3, 1],
  ['OS1004', 'signal("BUY)\n', '"', 1, 8],
  ['OS1005', 'x = "a\\qb"\n', '\\q', 1, 7],
  ['OS1005', 'x = "\\u12"\n', '\\u12', 1, 6],
  ['OS1007', 'fast = 1; slow = 2\n', ';', 1, 9],
  ['OS1026', 'lookback = 14 /* bars */\n', '/*', 1, 15],
  ['OS1027', 'tint = #ff88\n', '#ff88', 1, 8],
  // A continuation carries no character of its own to point at, so the caret
  // sits empty at the start of the line whose indentation is the mistake.
  ['OS1028', 'total = a +\nb\n', '', 2, 1],
  ['OS1029', 'mask = 0b1011\n', '0b1011', 1, 8],

  // The parser.
  ['OS1006', 'if len = 14\n    x = 1\n', '=', 1, 8],
  ['OS1008', 'zone = 30 < r < 70\n', '<', 1, 15],
  ['OS1009', 'break\n', 'break', 1, 1],
  ['OS1010', 'if a\nx = 1\n', 'if', 1, 1],
  ['OS1011', 'var runningHigh\n', 'var runningHigh', 1, 1],
  ['OS1012', 'plot(ema(close, 9), "EMA"\n', '(', 1, 5],
  ['OS1013', 'total = sum(closes]\n', ']', 1, 19],
  ['OS1014', 'plot(a "EMA")\n', '"EMA"', 1, 8],
  ['OS1015', 'plot(ready ? value, "V")\n', '?', 1, 12],
  ['OS1016', 'x = 1\nelse\n    y = 2\n', 'else', 2, 1],
  ['OS1017', 'default\n    len = 14\n', 'default', 1, 1],
  ['OS1018', 'a = 1 b = 2\n', 'b', 1, 7],
  ['OS1019', 'type = 1\n', 'type', 1, 1],
  ['OS1020', 'for i = 0, 9\n    x = 1\n', ',', 1, 10],
  ['OS1021', 'study("A")\nversion 1\n', 'version 1', 2, 1],
  // A hole is empty and sits where the expression should have been, so it never
  // takes a caret meant for its neighbour.
  ['OS1022', 'x = f(a, b,)\n', '', 1, 12],
  ['OS1023', 'if a\n    fn helper(x) => x\n', 'fn helper', 2, 5],
  ['OS1024', 'prices[0] = close\n', 'prices[0]', 1, 1],
  ['OS1025', 'chart.tickStep = 0.05\n', 'chart.tickStep', 1, 1],
];

/**
 * The code whose span is asserted in a test of its own rather than in the table.
 *
 * OS5005 has no fixed column to state, because the column it lands on is the
 * nesting ceiling plus the width of the line before it, and the ceiling is the
 * compiler's own number rather than one the specification fixes.
 */
const TESTED_SEPARATELY: ReadonlySet<string> = new Set(['OS5005']);

/** The first diagnostic a script produces under one code, and the text it was read from. */
function pointOf(code: string, source: string): { text: string; diagnostic: Diagnostic } {
  const { file, diagnostics } = parsed(source);
  const found = diagnostics.find((one) => one.code === code);
  assert.ok(found, `${code} was not reported for ${JSON.stringify(source)}`);
  return { text: file.text, diagnostic: found };
}

test('a diagnostic covers exactly the characters it is about', () => {
  for (const [code, source, covered, line, column] of POINTS) {
    const { text, diagnostic } = pointOf(code, source);
    const where = `${code} in ${JSON.stringify(source)}`;

    assert.equal(text.slice(diagnostic.span.offset, endOffset(diagnostic.span)), covered, where);
    assert.equal(diagnostic.span.length, covered.length, where);
    assert.equal(diagnostic.span.line, line, where);
    assert.equal(diagnostic.span.column, column, where);
  }
});

test('every code the front end can raise has a span stated somewhere', () => {
  // The catalogue is the list, so a code added to the lexer or the parser
  // arrives here without anybody remembering to add it.
  const stated = new Set([...POINTS.map(([code]) => code), ...TESTED_SEPARATELY]);
  for (const code of allCodes()) {
    const stage = entryFor(code).stage;
    if (stage !== 'lex' && stage !== 'parse') continue;
    assert.equal(stated.has(code), true, `${code} is raised by the ${stage} and has no span test`);
  }
});

test('the nesting ceiling points at the token that went past it', () => {
  const source = `x = ${'('.repeat(200)}1${')'.repeat(200)}\n`;
  const { file, diagnostics } = parsed(source);
  const first = diagnostics[0];
  assert.ok(first);

  assert.equal(first.code, 'OS5005');
  assert.equal(first.span.length, 1);
  assert.equal(file.text.slice(first.span.offset, endOffset(first.span)), '(');
  // The depth reported is the one the file reached, which is one past the
  // ceiling that refused it.
  assert.equal(Number(first.values.found), Number(first.values.max) + 1);
});

test('every diagnostic sits inside the file, and its line and column agree with its offset', () => {
  const broken = [
    'version 1',
    'study("A"',
    'len = input(\u00a014) +',
    'if len = 14',
    '  else',
    '    x = 30 < r < 70',
    'var w',
    'f(a b)',
    'case "x"',
    '',
  ].join('\n');

  const { file, diagnostics } = parsed(broken);
  assert.notEqual(diagnostics.length, 0);

  for (const diagnostic of diagnostics) {
    const { offset, length, line, column } = diagnostic.span;
    assert.equal(offset >= 0, true, diagnostic.code);
    assert.equal(offset + length <= file.text.length, true, diagnostic.code);
    assert.deepEqual(file.positionAt(offset), { line, column }, diagnostic.code);
    // A span never runs past the line it starts on except where an unclosed
    // bracket makes the statement itself span lines, and even then the caret is
    // drawn from the offsets rather than the column.
    assert.equal(line >= 1 && line <= file.lineCount, true, diagnostic.code);
  }
});

test('a caret is drawn under the characters the span covers', () => {
  const source = 'plot(ema(close, 9) "EMA", aqua)\n';
  const { file, diagnostics } = parsed(source);
  const first = diagnostics[0];
  assert.ok(first);

  const [shown, caret] = renderDiagnostic(file, first).split('\n');
  assert.equal(shown, '1 | plot(ema(close, 9) "EMA", aqua)');
  assert.equal(caret, '  |                    ^^^^^');
});

test('two diagnostics on one line keep their own carets', () => {
  const source = 'f(a b c)\n';
  const { file, diagnostics } = parsed(source);
  assert.equal(diagnostics.length, 2);

  const columns = diagnostics.map((one) => one.span.column);
  assert.deepEqual(columns, [5, 7]);
  assert.equal(renderDiagnostic(file, diagnostics[0] as Diagnostic).split('\n')[1], '  |     ^');
  assert.equal(renderDiagnostic(file, diagnostics[1] as Diagnostic).split('\n')[1], '  |       ^');
});
