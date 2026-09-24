import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bodyOf, codesOf, imported, pointsOf, v5 } from './support.js';

/**
 * The importer's reader of the source dialect: lines, blocks, continuations and
 * comments. A reader that joined the wrong lines would translate a statement
 * that is not the one the source wrote, and one that dropped comments would
 * hand back a script its author no longer recognises.
 */

// The source dialect continues a statement on a line indented off the block
// grid, inside an open bracket, and after an operator that cannot end one.
test('a statement written over several lines is read as one', () => {
  const text = v5(
    'indicator("X")',
    'total = close +',
    '     open',
    'basis = ta.sma(close,',
    '     20)',
    'diff = high -',
    '  low',
    'plot(total + basis + diff)',
  );
  const body = bodyOf(imported(text));
  assert.ok(body.includes('total = close + open'), body.join('\n'));
  assert.ok(body.includes('basis = sma(close, 20)'), body.join('\n'));
  assert.ok(body.includes('diff = high - low'), body.join('\n'));
});

// A finding on a continued line points at that line, not at the statement's
// first one, because the caret has to land under what the reader wrote.
test('a finding on a continued line points into that line', () => {
  const text = v5('indicator("X")', 'x = close +', '     ta.percentrank(close, 5)', 'plot(x)');
  assert.deepEqual(pointsOf(text, imported(text), 'OS9003'), [
    { code: 'OS9003', covers: 'ta.percentrank', line: 4, column: 6 },
  ]);
});

// Comments are the author's, and they survive: on their own line, after code,
// and inside a block, at the block's depth.
test('comments are kept where the source wrote them', () => {
  const text = v5(
    '// Header comment',
    'indicator("X")  // the declaration',
    '// Before the average',
    'basis = ta.sma(close, 10)  // ten bars',
    'if close > basis',
    '    // inside the block',
    '    basis := close  // replaced',
    'plot(basis)',
  );
  const result = imported(text);
  assert.equal(
    result.source,
    [
      'version 1',
      '',
      '// Header comment',
      'study("X")  // the declaration',
      '// Before the average',
      'basis = sma(close, 10)  // ten bars',
      'if close > basis',
      '    // inside the block',
      '    basis = close  // replaced',
      'plot(basis, "basis")',
      '',
    ].join('\n'),
  );
});

// A comment between an if's branches or between a switch's arms is the
// author's; a reader that let it end the statement would refuse the else as an
// else with no if, and one that skipped it would drop the comment.
test('a comment between branches or arms keeps the statement whole', () => {
  const text = v5(
    'indicator("X")',
    'n = 0',
    'if close > open',
    '    n := 1',
    '// between',
    'else',
    '    n := 2',
    'switch',
    '    // first',
    '    close > open => n := 3',
    '    // second',
    '    => n := 4',
    'plot(n)',
  );
  const result = imported(text);
  assert.deepEqual(codesOf(result), []);
  assert.deepEqual(bodyOf(result).slice(1), [
    'n = 0',
    'if close > open',
    '    n = 1',
    '    // between',
    'else',
    '    n = 2',
    'switch',
    '    case close > open',
    '        // first',
    '        n = 3',
    '        // second',
    '    default',
    '        n = 4',
    'plot(n, "n")',
  ]);
});

// A comment before the annotation stays before the version line, where
// OpenScript allows one, and the version line replaces the annotation.
test('comments before the annotation stay above the version line', () => {
  const text = '// Licence text\n// Second line\n//@version=5\nindicator("X")\nplot(close)\n';
  assert.equal(imported(text).source, '// Licence text\n// Second line\nversion 1\n\nstudy("X")\nplot(close, "close")\n');
});

// A file saved with carriage returns and a byte order mark reads the same, and
// a tab indents one block, as the source dialect counts it.
test('line endings, a byte order mark and tab indentation read as the source dialect reads them', () => {
  const text = '﻿//@version=5\r\nindicator("X")\r\nn = 0\r\nif close > open\r\n\tn := 1\r\nplot(n)\r\n';
  const result = imported(text);
  assert.deepEqual(codesOf(result), []);
  assert.ok(bodyOf(result).includes('    n = 1'), result.source);
});

// Both string delimiters, and escapes inside them, arrive as OpenScript's own
// spelling of the same text.
test('strings keep their text whichever quote the source used', () => {
  const text = v5("indicator('Quote \"test\"')", "word = 'It\\'s'", 'plot(close, word == "x" ? "a" : "b")');
  const body = bodyOf(imported(text));
  assert.equal(body[0], 'study("Quote \\"test\\"")');
  assert.ok(body.includes('word = "It\'s"'), body.join('\n'));
});

// Numbers keep their value and take OpenScript's spelling.
test('number literals are written in OpenScript spelling', () => {
  const text = v5('indicator("X")', 'a = 2.', 'b = .5', 'c = 1E3', 'plot(a + b + c)');
  const body = bodyOf(imported(text));
  assert.ok(body.includes('a = 2.0'));
  assert.ok(body.includes('b = .5'));
  assert.ok(body.includes('c = 1e3'));
});
