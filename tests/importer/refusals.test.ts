import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bodyOf, codesOf, imported, pointsOf, v5, v6 } from './support.js';

/**
 * What the importer refuses, and where it says so.
 *
 * Each test names the code and the characters of the imported text the finding
 * covers. The wrong importer each one is aimed at is written above it.
 */

// A whole-script refusal that still wrote something would hand back text that
// means nothing; one that pointed nowhere would leave the reader to guess.
test('OS9001: a version other than 5 or 6, or none at all, translates nothing', () => {
  const older = '//@version=4\nstudy("Range")\nplot(high - low)\n';
  const refused = imported(older);
  assert.equal(refused.source, '');
  assert.deepEqual(pointsOf(older, refused, 'OS9001'), [{ code: 'OS9001', covers: '//@version=4', line: 1, column: 1 }]);
  assert.deepEqual(codesOf(refused), ['OS9001']);

  const bare = 'indicator("X")\nplot(close)\n';
  const none = imported(bare);
  assert.equal(none.source, '');
  assert.deepEqual(pointsOf(bare, none, 'OS9001'), [{ code: 'OS9001', covers: '', line: 1, column: 1 }]);
  assert.equal(none.findings[0]?.values.found, 'declares no version');
});

// An importer that read an annotation after code had started, or that treated
// the version annotation as any other comment, would read version 4 as 5.
test('OS9001: the annotation is read only before the first line of code', () => {
  const late = 'indicator("X")\n//@version=5\nplot(close)\n';
  assert.deepEqual(codesOf(imported(late)), ['OS9001']);
  assert.notEqual(imported(v6('indicator("X")', 'plot(close)')).source, '');
});

// An importer that invented a declaration would decide by itself whether the
// translation may place orders.
test('OS9004: no declaration, or a library, translates nothing', () => {
  const missing = v5('basis = ta.sma(close, 20)', 'plot(basis)');
  const none = imported(missing);
  assert.equal(none.source, '');
  assert.deepEqual(pointsOf(missing, none, 'OS9004'), [{ code: 'OS9004', covers: '', line: 2, column: 1 }]);

  const library = v5('library("Tools")', 'export f(x) => x');
  const tools = imported(library);
  assert.equal(tools.source, '');
  assert.deepEqual(pointsOf(library, tools, 'OS9004'), [{ code: 'OS9004', covers: 'library', line: 2, column: 1 }]);
});

// Two declarations translated as two would not compile; dropping the second
// silently would hide that the script was not what it looked like.
test('OS9004: a second declaration is kept as a comment and the first one is used', () => {
  const text = v5('indicator("First")', 'plot(close)', 'indicator("Second")');
  const result = imported(text);
  assert.deepEqual(pointsOf(text, result, 'OS9004'), [{ code: 'OS9004', covers: 'indicator', line: 4, column: 1 }]);
  assert.match(result.source, /^study\("First"\)$/m);
  assert.match(result.source, /^\/\/ not translated \(OS9004\): indicator\("Second"\)$/m);
});

// Each of these has a spelling OpenScript would accept and a meaning it would
// not keep. An importer that translated any of them would compile and lie.
test('OS9002: a construct with no equivalent is kept whole as comment lines', () => {
  const cases: readonly (readonly [string, string, string])[] = [
    ['side = if close > open\n    1\nelse\n    -1', 'if', 'an if used as a value'],
    ['flat = close == na', 'close == na', 'a comparison with na'],
    ['type Pivot\n    float price', 'type', 'a type declaration'],
    ['method twice(float x) => x * 2', 'method', 'a method declaration'],
    ['pair() => [close, open]', '[close, open]', 'an array or tuple literal'],
    ['x = close & open', '&', 'the character &'],
  ];
  for (const [statement, covers, construct] of cases) {
    const text = v5('indicator("X")', statement, 'plot(close)');
    const result = imported(text);
    const [point] = pointsOf(text, result, 'OS9002');
    assert.deepEqual(point, { code: 'OS9002', covers, line: 3, column: text.split('\n')[2]!.indexOf(covers) + 1 }, statement);
    assert.equal(result.findings.find((one) => one.code === 'OS9002')?.values.construct, construct);
    for (const line of statement.split('\n')) {
      assert.ok(result.source.includes(`// not translated (OS9002): ${line}`), `${statement}: ${line} is not kept`);
    }
    assert.ok(bodyOf(result).includes('plot(close, "close")'), `${statement}: the rest was not translated`);
  }
});

// Version 5 evaluates the right side of and every time; where that side holds
// state and the condition itself runs only sometimes, there is no line the
// importer could move it to, and translating it lazily would change its values.
test('OS9002: a stateful strict operand in an else if or a while is refused, not translated lazily', () => {
  const text = v5(
    'indicator("X")',
    'n = 0',
    'if close > open',
    '    n := 1',
    'else if close < open and ta.rsi(close, 14) > 50',
    '    n := 2',
    'plot(n)',
  );
  const result = imported(text);
  assert.deepEqual(pointsOf(text, result, 'OS9002'), [{ code: 'OS9002', covers: 'and', line: 6, column: 22 }]);
  assert.deepEqual(codesOf(imported(v6('indicator("X")', 'n = 0', 'if close > open', '    n := 1', 'else if close < open and ta.rsi(close, 14) > 50', '    n := 2', 'plot(n)'))).filter((code) => code === 'OS9002'), []);
});

// A function whose last line is an if returns the if's value in the source
// dialect and nothing in OpenScript.
test('OS9002: a function ending in a block is refused', () => {
  const text = v5('indicator("X")', 'f(x) =>', '    if x > 0', '        x', '    else', '        0', 'plot(f(close))');
  const result = imported(text);
  assert.deepEqual(pointsOf(text, result, 'OS9002').map((one) => one.covers), ['if x > 0']);
  assert.deepEqual(codesOf(result), ['OS9002', 'OS9005']);
});

// An importer that guessed at a built-in by its name would compile a function
// with different arguments, warmup or arithmetic and draw a plausible line.
test('OS9003: a built-in with no row is refused at the built-in', () => {
  const text = v5('indicator("X")', 'rank = ta.percentrank(close, 20)', 'daily = request.security("ABC", "D", close)', 'plot(close)');
  const result = imported(text);
  assert.deepEqual(pointsOf(text, result, 'OS9003'), [
    { code: 'OS9003', covers: 'ta.percentrank', line: 3, column: 8 },
    { code: 'OS9003', covers: 'request.security', line: 4, column: 9 },
  ]);
  assert.equal(result.findings[0]?.values.name, 'ta.percentrank');
});

// A name the source never declares is not a built-in either, and a reader has
// to be told rather than handed a translation reading an undefined name.
test('OS9003: a name the source never declares is refused', () => {
  const text = v5('indicator("X")', 'plot(undeclared + 1)');
  assert.deepEqual(pointsOf(text, imported(text), 'OS9003').map((one) => one.covers), ['undeclared']);
});

// Without the cascade the output would read a name the comment declares and
// not compile; with a cascade that ran backwards it would comment the cause.
test('OS9005: a statement reading a refused one is kept as a comment, down the chain', () => {
  const text = v5(
    'indicator("X")',
    'rank = ta.percentrank(close, 20)',
    'smooth = ta.sma(rank, 5)',
    'twice = smooth * 2',
    'plot(twice)',
    'plot(close)',
  );
  const result = imported(text);
  assert.deepEqual(pointsOf(text, result, 'OS9005'), [
    { code: 'OS9005', covers: 'rank', line: 4, column: 17 },
    { code: 'OS9005', covers: 'smooth', line: 5, column: 9 },
    { code: 'OS9005', covers: 'twice', line: 6, column: 6 },
  ]);
  assert.deepEqual(
    result.findings.filter((one) => one.code === 'OS9005').map((one) => one.values.line),
    [3, 4, 5],
  );
  assert.ok(bodyOf(result).includes('plot(close, "close")'));
});

// The importer does not type the source; the compiler does, and a statement it
// refuses must not reach the output uncommented.
test('OS9012: a translation the compiler refuses is kept as a comment, with the compiler code', () => {
  const numeric = v5('indicator("X")', 'traded = volume ? 1 : 0', 'plot(close)');
  const result = imported(numeric);
  assert.deepEqual(pointsOf(numeric, result, 'OS9012'), [
    { code: 'OS9012', covers: 'traded = volume ? 1 : 0', line: 3, column: 1 },
  ]);
  assert.equal(result.findings[0]?.values.code, 'OS2011');

  const local = v5('indicator("X")', 'p = 0.0', 'if close > open', '    body = close - open', '    p := body[1]', 'plot(p)');
  const history = imported(local);
  assert.deepEqual(codesOf(history), ['OS9012']);
  assert.equal(history.findings[0]?.values.code, 'OS2004');
});

// Commenting out one line inside a block would leave a block that means
// something the original did not; the whole top level statement goes.
test('a refusal inside a block keeps the whole top level statement, every line of it', () => {
  const text = v5('indicator("X")', 'var n = 0', 'if close > open', '    n := n + 1', '    x = ta.percentrank(close, 5)', 'plot(n)');
  const result = imported(text);
  const kept = result.source.split('\n').filter((line) => line.startsWith('// not translated (OS9003): '));
  assert.deepEqual(kept, [
    '// not translated (OS9003): if close > open',
    '// not translated (OS9003):     n := n + 1',
    '// not translated (OS9003):     x = ta.percentrank(close, 5)',
  ]);
  assert.ok(bodyOf(result).includes('plot(n, "n")'));
});
