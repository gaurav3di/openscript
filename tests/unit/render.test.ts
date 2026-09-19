import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  diagnosticFor,
  renderDiagnostic,
  renderDiagnostics,
  sourceFile,
} from '../../src/core/index.js';

/** Thirteen lines of filler, so the declaration this file is about is line 14. */
const text = [
  'version 1',
  'study("S")',
  'len = 1',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  'if close > open',
  '    len = 9',
  '',
].join('\n');

const file = sourceFile('study.oscript', text);
const secondLen = text.indexOf('len = 9');

test('a diagnostic renders as the line, the caret, the code and the fix', () => {
  const diagnostic = diagnosticFor('OS2002', file.spanAt(secondLen, 3), {
    name: 'len',
    line: 3,
  });

  assert.deepEqual(renderDiagnostic(file, diagnostic).split('\n'), [
    '14 |     len = 9',
    '   |     ^^^',
    `OS2002: ${diagnostic.message}`,
    `Fix: ${diagnostic.fix}`,
  ]);
});

test('the gutter is as wide as the line number, so the caret line stays aligned', () => {
  const diagnostic = diagnosticFor('OS1007', file.spanAt(text.indexOf('study'), 5), {});
  const [source, caret] = renderDiagnostic(file, diagnostic).split('\n');

  assert.equal(source, '2 | study("S")');
  assert.equal(caret, '  | ^^^^^');
});

test('a zero length span still draws one caret', () => {
  const diagnostic = diagnosticFor('OS1015', file.spanAt(secondLen, 0), {});
  const caret = renderDiagnostic(file, diagnostic).split('\n')[1];

  assert.equal(caret, '   |     ^');
});

test('a span running past the end of its line stops at the end of the line', () => {
  const diagnostic = diagnosticFor('OS1012', file.spanAt(secondLen, 500), {
    bracket: '(',
    line: 14,
  });
  const caret = renderDiagnostic(file, diagnostic).split('\n')[1];

  assert.equal(caret, '   |     ^^^^^^^');
});

test('a caret after an astral character lands under the right one in a terminal', () => {
  // The column is 10 because a column counts UTF-16 code units, and the caret
  // is padded by 8 because a terminal draws one character per code point. Both
  // numbers are right, which is why the renderer does not use the column.
  const withMusic = sourceFile('study.oscript', 'a = "\u{1D11E}" + b\n');
  const plus = withMusic.text.indexOf('+');
  const diagnostic = diagnosticFor('OS2003', withMusic.spanAt(plus, 1), {
    leftType: 'string',
    rightType: 'number',
  });

  assert.equal(diagnostic.span.column, 10);
  assert.equal(renderDiagnostic(withMusic, diagnostic).split('\n')[1], '  |         ^');
});

test('a tab is drawn one column wide, so the caret under it is where the tab is', () => {
  const tabbed = sourceFile('study.oscript', '\tlen = 9\n');
  const diagnostic = diagnosticFor('OS1002', tabbed.spanAt(0, 1), {});
  const [source, caret] = renderDiagnostic(tabbed, diagnostic).split('\n');

  assert.equal(source, '1 |  len = 9');
  assert.equal(caret, '  | ^');
});

test('nothing reported renders as nothing at all', () => {
  assert.equal(renderDiagnostics(file, []), '');
});

test('several diagnostics are named once by their file and separated by a blank line', () => {
  const first = diagnosticFor('OS1007', file.spanAt(0, 7), {});
  const second = diagnosticFor('OS1015', file.spanAt(secondLen, 3), {});
  const rendered = renderDiagnostics(file, [first, second]);

  assert.equal(rendered.startsWith('study.oscript\n\n'), true);
  assert.equal(rendered.includes('\n\n14 | '), true);
});
