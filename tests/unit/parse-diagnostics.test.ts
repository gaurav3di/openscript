import assert from 'node:assert/strict';
import { test } from 'node:test';

import { entryFor } from '../../src/core/index.js';
import type { DiagnosticCode } from '../../src/core/index.js';
import {
  codes,
  codesTheParserRaises,
  fixes,
  items,
  parsed,
  shape,
  spans,
  values,
} from './parse-support.js';

/**
 * Every code this parser raises.
 *
 * The list is stated, and then checked against the calls in the parser's own
 * source in both directions: a code raised by a rule and missing here is a
 * failure, and a code named here that no rule raises any more is a failure too.
 * Stated on its own the list said only what somebody believed on the day they
 * wrote it, and the sentence claiming a code added by accident would show up
 * was not true of anything.
 *
 * What is asserted about each code is the code and where it points, never the
 * sentence. The catalogue owns the wording and may improve it; a second copy of
 * it here would turn every improvement into a test to edit, which is how the
 * copy that is wrong gets left behind. Where a message names something, the
 * values it was filled from are asserted instead, because those are what an
 * editor reads to build a fix and they are part of what the diagnostic claims.
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
  'OS1023',
  'OS1024',
  'OS1025',
  'OS5005',
];

test('every code the parser raises is a parse stage code in the catalogue', () => {
  for (const code of EMITTED) {
    assert.equal(entryFor(code).stage, 'parse', code);
    assert.equal(entryFor(code).severity, 'error', code);
  }
});

test('the codes the parser raises are the codes named here, and no others', () => {
  assert.deepEqual(
    codesTheParserRaises(),
    [...EMITTED].sort(),
    'the parser source and this list disagree: a code raised by a rule and not named here, ' +
      'or named here and no longer raised',
  );
});

test('OS1006: an assignment where a condition belongs', () => {
  const source = 'if len = 14\n    signal("DEFAULT")\n';
  assert.deepEqual(codes(source), ['OS1006']);
  assert.deepEqual(spans(source), ['1:8+1']);
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
  // The caret sits on the second comparison, and the message names both.
  assert.deepEqual(spans(source), ['1:15+1']);
  assert.deepEqual(values(source)[0], { op1: '<', op2: '<' });
  assert.deepEqual(codes('x = a < b < c < d\n'), ['OS1008']);
  assert.deepEqual(codes('x = a == b == c\n'), ['OS1008']);
  // One comparison inside each side of an equality is not a chain.
  assert.deepEqual(codes('x = a < b == c < d\n'), []);
});

test('OS1009: break and continue outside a loop', () => {
  assert.deepEqual(codes('break\n'), ['OS1009']);
  assert.deepEqual(codes('continue\n'), ['OS1009']);
  assert.deepEqual(values('break\n')[0], { word: 'break' });
  assert.deepEqual(values('continue\n')[0], { word: 'continue' });
  assert.deepEqual(codes('for i = 0 to 9\n    if a\n        break\n'), []);
  assert.deepEqual(codes('while a\n    continue\n'), []);
});

test('OS1010: a header with no body', () => {
  const source = 'if crossUp(fast, slow)\nsignal("BUY")\n';
  assert.deepEqual(codes(source), ['OS1010']);
  assert.deepEqual(values(source)[0], { header: 'if' });
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
  // The caret covers the whole declaration, not just the word var.
  assert.deepEqual(spans(source), ['1:1+15']);
  assert.deepEqual(values(source)[0], { name: 'runningHigh' });
  // The name is still declared, so every later diagnostic about it can be made.
  assert.equal(shape(items(source)[0] as never), '(var runningHigh missingExpression)');
});

test('OS1012: a bracket that is never closed, reported at the bracket', () => {
  const source = 'plot(ema(close, 9), "EMA", aqua\n';
  assert.deepEqual(codes(source), ['OS1012']);
  assert.deepEqual(values(source)[0], { bracket: '(', line: 1 });
  assert.equal(parsed(source).diagnostics[0]?.span.column, 5);
  assert.deepEqual(codes('x = [1, 2\n'), ['OS1012']);
});

test('OS1013: the wrong closing bracket', () => {
  const source = 'total = sum(closes]\n';
  assert.deepEqual(codes(source), ['OS1013']);
  // The caret is on the closer that was written, and the message names the
  // opener it does not match and the line that opener sits on.
  assert.deepEqual(spans(source), ['1:19+1']);
  assert.deepEqual(values(source)[0], { found: ']', expected: ')', opener: '(', line: 1 });
});

test('OS1014: two arguments with no comma between them', () => {
  const source = 'plot(ema(close, 9) "EMA", aqua)\n';
  assert.deepEqual(codes(source), ['OS1014']);
  // The caret sits on the argument that should have had a comma before it.
  assert.deepEqual(spans(source), ['1:20+5']);
  assert.deepEqual(values(source)[0], { token: '"EMA"' });
  // Each missing comma is its own mistake, so each is reported.
  assert.deepEqual(codes('f(a b c)\n'), ['OS1014', 'OS1014']);
});

test('OS1015: a ternary with one arm', () => {
  const source = 'plot(ready ? value, "Value", aqua)\n';
  assert.deepEqual(codes(source), ['OS1015']);
  assert.deepEqual(spans(source), ['1:12+1']);
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
  assert.deepEqual(values(source)[1], { found: 2, expected: 0 });
  assert.deepEqual(codes('x = 1\nelse\n    y = 2\n'), ['OS1016']);
  assert.deepEqual(codes('if a\n    x = 1\n    else\n        y = 2\n'), ['OS1016']);
});

test('OS1017: case and default out of place', () => {
  assert.deepEqual(codes('case "fast"\n    len = 9\n'), ['OS1017']);
  assert.deepEqual(codes('default\n    len = 14\n'), ['OS1017']);
  assert.deepEqual(values('default\n    len = 14\n')[0], { word: 'default' });
  // A case after the default, which would otherwise be unreachable.
  const outOfOrder = 'switch m\n    default\n        len = 14\n    case "fast"\n        len = 9\n';
  assert.deepEqual(codes(outOfOrder), ['OS1017']);
  assert.deepEqual(values(outOfOrder)[0], { word: 'case' });
});

test('OS1018: a second statement on one line', () => {
  const source = 'fast = ema(close, 9) slow = ema(close, 21)\n';
  assert.deepEqual(codes(source), ['OS1018']);
  // The caret is on the first token of what follows, which is where the second
  // statement begins.
  assert.deepEqual(spans(source), ['1:22+4']);
  assert.deepEqual(values(source)[0], { token: 'slow' });
  assert.deepEqual(codes('plot(a) plot(b)\n'), ['OS1018']);
});

test('OS1018 is still the answer for a target an assignment cannot reach either', () => {
  // A call and a literal are neither an index nor a member, so neither OS1024
  // nor OS1025 is true of them and the nearest thing the catalogue has is that
  // the statement ended before the operator.
  assert.deepEqual(codes('f() = 1\n'), ['OS1018']);
  assert.deepEqual(values('f() = 1\n')[0], { token: '=' });
  assert.deepEqual(codes('1 = 2\n'), ['OS1018']);
});

test('OS1019: a reserved word used as a name', () => {
  const source = 'type = input("fast", "Mode")\n';
  assert.deepEqual(codes(source), ['OS1019']);
  assert.deepEqual(values(source)[0], { word: 'type', suggestion: 'typeValue' });
  assert.equal(fixes(source)[0]?.includes('typeValue'), true);
  // A parameter is a name; a label is not.
  assert.deepEqual(codes('fn f(color = red) => red\n'), ['OS1019']);
  assert.deepEqual(codes('plot(v, "V", color = aqua)\n'), []);
  assert.deepEqual(codes('var series = 1\n'), ['OS1019']);
  assert.deepEqual(codes('for step = 0 to 9\n    x = 1\n'), ['OS1019']);
});

test('OS1019: a reserved word where a value belongs is the same one mistake', () => {
  // A reserved word in expression position is read as the name it was meant to
  // be, so the reader is told to rename it once. Read as a reserved word it
  // ended the expression, and the argument list then reported a second thing
  // about a program nobody wrote.
  const source = 'plot(color)\n';
  assert.deepEqual(codes(source), ['OS1019']);
  assert.deepEqual(spans(source), ['1:6+5']);
  assert.deepEqual(values(source)[0], { word: 'color', suggestion: 'colorValue' });
  assert.equal(
    shape(items(source)[0] as never),
    '(expressionStatement (call plot (argument color)))',
  );

  assert.deepEqual(codes('x = type\n'), ['OS1019']);
  assert.equal(shape(items('x = type\n')[0] as never), '(= x type)');
  assert.deepEqual(codes('x = array + 1\n'), ['OS1019']);
  assert.equal(shape(items('x = array + 1\n')[0] as never), '(= x (+ array 1))');
});

test('OS1019 stops at the words a rule beside the expression reads', () => {
  // and, or, not, in, to and step are reserved as well, and each of them is
  // read by a rule standing next to the expression. Taking one as a name would
  // swallow the token that rule is waiting for, and the fix, to rename it,
  // would be advice about a program nobody wrote.
  assert.deepEqual(codes('x = a and\n'), ['OS1022']);
  assert.deepEqual(values('x = a and\n')[0], { token: 'and' });
  assert.deepEqual(codes('for i = 0 to 9\n    x = 1\n'), []);
  assert.deepEqual(codes('for i = 9 to 0 step -1\n    x = 1\n'), []);
  assert.deepEqual(codes('for v in values\n    x = 1\n'), []);
});

test('OS1020: a for header that is neither form', () => {
  const source = 'for i = 0, 9\n    total += close[i]\n';
  assert.deepEqual(codes(source), ['OS1020']);
  assert.deepEqual(values(source)[0], { token: ',' });
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
  // The caret covers the whole declaration, and the message names the line that
  // came before it.
  assert.deepEqual(spans(source), ['2:1+9']);
  assert.deepEqual(values(source)[0], { line: 1 });
  // Comments and blank lines are not lines for this rule.
  assert.deepEqual(codes('// a note\n\nversion 1\nstudy("A")\n'), []);
});

test('OS1022: a statement that lost its right-hand side', () => {
  const source = 'len = input(14, "Length") +\n';
  assert.deepEqual(codes(source), ['OS1022']);
  assert.deepEqual(values(source)[0], { token: '+' });
  // The hole is empty and sits where the operand should have been, so the caret
  // never lands on the neighbour.
  assert.deepEqual(spans(source), ['2:1+0']);
  assert.deepEqual(codes('x = f(a, b,)\n'), ['OS1022']);
  assert.deepEqual(codes('x = a.\n'), ['OS1022']);
});

test('OS1023: a function declared inside a block', () => {
  const source = 'if trending\n    fn smoothed(src) => src\n    plot(smoothed(close), "S")\n';
  assert.deepEqual(codes(source), ['OS1023']);
  // The caret covers fn and the name, the way OS1011 covers var and the name.
  assert.deepEqual(spans(source), ['2:5+11']);
  assert.deepEqual(values(source)[0], { name: 'smoothed' });
  // Reported once, and only once, however many statements share the block.
  assert.deepEqual(codes('if a\n    fn f(x) => x\n    fn g(x) => x\n'), ['OS1023', 'OS1023']);
  assert.deepEqual(codes('fn smoothed(src) => src\nplot(smoothed(close), "S")\n'), []);
});

test('OS1024: an assignment whose target is an indexed element', () => {
  const source = 'prices[0] = close\n';
  assert.deepEqual(codes(source), ['OS1024']);
  // The caret is on the target, not on the operator after it: the statement did
  // not end at the operator, and what is wrong is what stands before it.
  assert.deepEqual(spans(source), ['1:1+9']);
  assert.deepEqual(values(source)[0], { name: 'prices' });
  // The tree keeps what was written. An assignment built over the name taken
  // out of the target would be a different program from the one on the page.
  assert.equal(shape(items(source)[0] as never), '(expressionStatement (index prices 0))');

  // A compound operator is the same mistake, and so is a target in brackets.
  assert.deepEqual(codes('prices[0] += close\n'), ['OS1024']);
  assert.deepEqual(codes('(prices[0]) = x\n'), ['OS1024']);
  assert.deepEqual(values('(prices[0]) = x\n')[0], { name: 'prices' });

  // The value is read rather than skipped, so a mistake inside it is reported
  // on this compile rather than on the one after the target is fixed.
  assert.deepEqual(codes('prices[0] = f(\n'), ['OS1024', 'OS1012']);
});

test('OS1025: an assignment whose target is a member', () => {
  const source = 'chart.tickStep = 0.05\n';
  assert.deepEqual(codes(source), ['OS1025']);
  assert.deepEqual(spans(source), ['1:1+14']);
  assert.deepEqual(values(source)[0], { name: 'chart', member: 'tickStep' });
  assert.equal(shape(items(source)[0] as never), '(expressionStatement (member chart tickStep))');

  // A longer dotted name names what was written before the dot, so the message
  // is about the member of a.b and not about a.
  assert.deepEqual(codes('a.b.c = 1\n'), ['OS1025']);
  assert.deepEqual(values('a.b.c = 1\n')[0], { name: 'a.b', member: 'c' });
});

test('OS5005: nesting past the ceiling costs the statement and nothing more', () => {
  const deep = `x = ${'('.repeat(200)}1${')'.repeat(200)}\ny = 2\n`;
  assert.deepEqual(codes(deep), ['OS5005']);
  // The depth reported is the one the file reached, one past the ceiling.
  const reached = values(deep)[0];
  assert.equal(Number(reached?.['found']), Number(reached?.['max']) + 1);
  // The next statement is read as though nothing had happened.
  assert.equal(items(deep).length, 2);

  const blocks = Array.from({ length: 200 }, (_, at) => `${' '.repeat(at * 2)}if a`).join('\n');
  const inner = `\n${' '.repeat(400)}x = 1\n`;
  assert.deepEqual(codes(blocks + inner), ['OS5005']);
  const nested = values(blocks + inner)[0];
  assert.equal(Number(nested?.['found']), Number(nested?.['max']) + 1);
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
