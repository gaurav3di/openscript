import assert from 'node:assert/strict';
import { test } from 'node:test';

import { entryFor } from '../../src/core/index.js';
import type { DiagnosticCode } from '../../src/core/index.js';
import { codes, fixes, items, messages, parsed, shape } from './parse-support.js';

/**
 * Every code this parser raises.
 *
 * The list is stated rather than collected, so that a code added by accident
 * shows up as a failure here and a code that stops being raised shows up as one
 * in the test that raises it.
 */
const EMITTED: readonly DiagnosticCode[] = [
  'OS1006',
  'OS1008',
  'OS1009',
  'OS1010',
  'OS1011',
  'OS1012',
  'OS1013',
  'OS1014',
  'OS1015',
  'OS1016',
  'OS1017',
  'OS1018',
  'OS1019',
  'OS1020',
  'OS1021',
  'OS1022',
  'OS5005',
];

test('every code the parser raises is a parse stage code in the catalogue', () => {
  for (const code of EMITTED) {
    assert.equal(entryFor(code).stage, 'parse', code);
    assert.equal(entryFor(code).severity, 'error', code);
  }
});

test('OS1006: an assignment where a condition belongs', () => {
  const source = 'if len = 14\n    signal("DEFAULT")\n';
  assert.deepEqual(codes(source), ['OS1006']);
  assert.equal(messages(source)[0], '= assigns a value, and a condition needs a comparison.');
  // The condition is built as == so the rest of the file still checks.
  assert.equal(
    shape(items(source)[0] as never),
    '(ifStatement (ifBranch (== len 14) (block (expressionStatement (call signal (argument "DEFAULT"))))))',
  );
  assert.deepEqual(codes('while x = 1\n    y = 2\n'), ['OS1006']);
});

test('OS1008: a chained comparison, reported once', () => {
  const source = 'zone = 30 < r < 70\n';
  assert.deepEqual(codes(source), ['OS1008']);
  assert.equal(
    messages(source)[0],
    'A comparison cannot be chained: < is already applied before <.',
  );
  assert.deepEqual(codes('x = a < b < c < d\n'), ['OS1008']);
  assert.deepEqual(codes('x = a == b == c\n'), ['OS1008']);
  // One comparison inside each side of an equality is not a chain.
  assert.deepEqual(codes('x = a < b == c < d\n'), []);
});

test('OS1009: break and continue outside a loop', () => {
  assert.deepEqual(codes('break\n'), ['OS1009']);
  assert.deepEqual(codes('continue\n'), ['OS1009']);
  assert.equal(messages('break\n')[0], 'break is only valid inside a for or a while body.');
  assert.deepEqual(codes('for i = 0 to 9\n    if a\n        break\n'), []);
  assert.deepEqual(codes('while a\n    continue\n'), []);
});

test('OS1010: a header with no body', () => {
  const source = 'if crossUp(fast, slow)\nsignal("BUY")\n';
  assert.deepEqual(codes(source), ['OS1010']);
  assert.equal(
    messages(source)[0],
    'if opens a block, and the next line is not indented more deeply.',
  );
  // The line that failed to be a body is still read as a statement of its own.
  assert.equal(items(source).length, 2);
  assert.deepEqual(codes('else\n'), ['OS1016']);
  assert.deepEqual(codes('for i = 0 to 9\n'), ['OS1010']);
  assert.deepEqual(codes('while a\n'), ['OS1010']);
  assert.deepEqual(codes('switch a\n'), ['OS1010']);
});

test('OS1011: var with no initial value', () => {
  const source = 'var runningHigh\n';
  assert.deepEqual(codes(source), ['OS1011']);
  assert.equal(messages(source)[0], 'var runningHigh has no initial value.');
  assert.equal(fixes(source)[0], 'Give it a starting value; var runningHigh = none is the empty start.');
  // The name is still declared, so every later diagnostic about it can be made.
  assert.equal(shape(items(source)[0] as never), '(var runningHigh missingExpression)');
});

test('OS1012: a bracket that is never closed, reported at the bracket', () => {
  const source = 'plot(ema(close, 9), "EMA", aqua\n';
  assert.deepEqual(codes(source), ['OS1012']);
  assert.equal(messages(source)[0], 'The ( opened at line 1 is never closed.');
  assert.equal(parsed(source).diagnostics[0]?.span.column, 5);
  assert.deepEqual(codes('x = [1, 2\n'), ['OS1012']);
});

test('OS1013: the wrong closing bracket', () => {
  const source = 'total = sum(closes]\n';
  assert.deepEqual(codes(source), ['OS1013']);
  assert.equal(
    messages(source)[0],
    'Found ] where ) was expected, closing the ( opened at line 1.',
  );
});

test('OS1014: two arguments with no comma between them', () => {
  const source = 'plot(ema(close, 9) "EMA", aqua)\n';
  assert.deepEqual(codes(source), ['OS1014']);
  assert.equal(messages(source)[0], 'Two arguments run together; a comma is missing before "EMA".');
  // Each missing comma is its own mistake, so each is reported.
  assert.deepEqual(codes('f(a b c)\n'), ['OS1014', 'OS1014']);
});

test('OS1015: a ternary with one arm', () => {
  const source = 'plot(ready ? value, "Value", aqua)\n';
  assert.deepEqual(codes(source), ['OS1015']);
  assert.equal(messages(source)[0], 'This ? has no matching :');
  // The arm that is missing is a hole, and the arguments after it still parse.
  assert.equal(
    shape(items(source)[0] as never),
    '(expressionStatement (call plot (argument (if-else ready value missingExpression))' +
      ' (argument "Value") (argument aqua)))',
  );
});

test('OS1016: an else that does not line up with an if', () => {
  const source = 'if trending\n    signal("BUY")\n  else\n    signal("WAIT")\n';
  // The lexer reports the indentation, and the parser reports the pairing.
  assert.deepEqual(codes(source), ['OS1003', 'OS1016']);
  assert.equal(
    messages(source)[1],
    'This else is indented 2 spaces and the nearest if is indented 0.',
  );
  assert.deepEqual(codes('x = 1\nelse\n    y = 2\n'), ['OS1016']);
  assert.deepEqual(codes('if a\n    x = 1\n    else\n        y = 2\n'), ['OS1016']);
});

test('OS1017: case and default out of place', () => {
  assert.deepEqual(codes('case "fast"\n    len = 9\n'), ['OS1017']);
  assert.deepEqual(codes('default\n    len = 14\n'), ['OS1017']);
  assert.equal(
    messages('default\n    len = 14\n')[0],
    'default is only valid inside a switch, and default must be its last arm.',
  );
  // A case after the default, which would otherwise be unreachable.
  const outOfOrder = 'switch m\n    default\n        len = 14\n    case "fast"\n        len = 9\n';
  assert.deepEqual(codes(outOfOrder), ['OS1017']);
});

test('OS1018: a second statement on one line', () => {
  const source = 'fast = ema(close, 9) slow = ema(close, 21)\n';
  assert.deepEqual(codes(source), ['OS1018']);
  assert.equal(messages(source)[0], 'Unexpected slow after the end of this statement.');
  assert.deepEqual(codes('plot(a) plot(b)\n'), ['OS1018']);
});

test('OS1019: a reserved word used as a name', () => {
  const source = 'type = input("fast", "Mode")\n';
  assert.deepEqual(codes(source), ['OS1019']);
  assert.equal(messages(source)[0], 'type is a reserved word and cannot be used as a name.');
  assert.equal(fixes(source)[0], 'Rename it; typeValue keeps the meaning and is not reserved.');
  // A parameter is a name; a label is not.
  assert.deepEqual(codes('fn f(color = red) => red\n'), ['OS1019']);
  assert.deepEqual(codes('plot(v, "V", color = aqua)\n'), []);
  assert.deepEqual(codes('var series = 1\n'), ['OS1019']);
  assert.deepEqual(codes('for step = 0 to 9\n    x = 1\n'), ['OS1019']);
});

test('OS1020: a for header that is neither form', () => {
  const source = 'for i = 0, 9\n    total += close[i]\n';
  assert.deepEqual(codes(source), ['OS1020']);
  assert.equal(messages(source)[0], 'A for header needs = start to end or in array; found ,.');
  // The body is still read, so a mistake inside it is found on the same compile.
  assert.equal(
    shape(items(source)[0] as never),
    '(forRangeStatement i 0 missingExpression (block (+= total (index close i))))',
  );
  assert.deepEqual(codes('for i to 9\n    x = 1\n'), ['OS1020']);
});

test('OS1021: a version declaration that is not first', () => {
  const source = 'study("EMA cross")\nversion 1\n';
  assert.deepEqual(codes(source), ['OS1021']);
  assert.equal(
    messages(source)[0],
    'version must be the first line that is not blank and not a comment; line 1 came before it.',
  );
  // Comments and blank lines are not lines for this rule.
  assert.deepEqual(codes('// a note\n\nversion 1\nstudy("A")\n'), []);
});

test('OS1022: a statement that lost its right-hand side', () => {
  const source = 'len = input(14, "Length") +\n';
  assert.deepEqual(codes(source), ['OS1022']);
  assert.equal(messages(source)[0], 'An expression was expected after +.');
  assert.equal(fixes(source)[0], 'Supply the missing operand, or delete the trailing +.');
  assert.deepEqual(codes('x = f(a, b,)\n'), ['OS1022']);
  assert.deepEqual(codes('x = a.\n'), ['OS1022']);
});

test('OS5005: nesting past the ceiling costs the statement and nothing more', () => {
  const deep = `x = ${'('.repeat(200)}1${')'.repeat(200)}\ny = 2\n`;
  assert.deepEqual(codes(deep), ['OS5005']);
  assert.equal(messages(deep)[0], 'An expression is nested 129 deep and the ceiling is 128.');
  // The next statement is read as though nothing had happened.
  assert.equal(items(deep).length, 2);

  const blocks = Array.from({ length: 200 }, (_, at) => `${' '.repeat(at * 2)}if a`).join('\n');
  const inner = `\n${' '.repeat(400)}x = 1\n`;
  assert.deepEqual(codes(blocks + inner), ['OS5005']);
  assert.equal(messages(blocks + inner)[0], 'A block is nested 129 deep and the ceiling is 128.');
});

test('three mistakes in a file produce three diagnostics', () => {
  const source = 'x = 1\nif y = 2\n    a = 1\nz = )\nvar w\nq = 9\n';
  assert.deepEqual(codes(source), ['OS1006', 'OS1022', 'OS1011']);
  // And every statement of the file, sound or not, is in the tree.
  assert.equal(items(source).length, 5);
});

test('a mistake is reported once, and each unclosed bracket is its own mistake', () => {
  assert.deepEqual(codes('if a\n    x = )\n    y = 2\n'), ['OS1022']);
  assert.deepEqual(codes('plot(ema(close, 9), "EMA"\n'), ['OS1012']);
  // Three brackets are three things to close, and each names its own line.
  assert.deepEqual(codes('x = f(g(h(1 +\n'), ['OS1012', 'OS1012', 'OS1012', 'OS1022']);
});

test('a broken statement costs its own line and its block, and nothing after', () => {
  const source = 'case "x"\n    a = 1\nb = 2\n';
  assert.deepEqual(codes(source), ['OS1017']);
  assert.equal(items(source).length, 1);
  assert.equal(shape(items(source)[0] as never), '(= b 2)');
});
