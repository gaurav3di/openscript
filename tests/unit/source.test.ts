import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normaliseSource, sourceFile } from '../../src/core/index.js';

test('a byte order mark is dropped, so the first character is at offset 0', () => {
  const file = sourceFile('study.oscript', '﻿version 1\n');

  assert.equal(file.text.startsWith('version'), true);
  assert.deepEqual(file.positionAt(0), { line: 1, column: 1 });
});

test('CRLF becomes LF, so the same file compiles identically on either system', () => {
  assert.equal(normaliseSource('a\r\nb\r\n'), 'a\nb\n');
});

test('a lone carriage return survives normalisation, because it is the lexer to reject', () => {
  assert.equal(normaliseSource('a\rb'), 'a\rb');
});

test('offsets and positions agree in both directions', () => {
  const file = sourceFile('study.oscript', 'version 1\nstudy("S")\n    len = 9\n');

  assert.deepEqual(file.positionAt(0), { line: 1, column: 1 });
  assert.deepEqual(file.positionAt(10), { line: 2, column: 1 });
  assert.deepEqual(file.positionAt(25), { line: 3, column: 5 });
  assert.equal(file.offsetAt({ line: 3, column: 5 }), 25);
});

test('a line does not include its newline, and the last line needs no newline', () => {
  const file = sourceFile('study.oscript', 'one\ntwo\nthree');

  assert.equal(file.lineCount, 3);
  assert.equal(file.lineText(1), 'one');
  assert.equal(file.lineText(3), 'three');
});

test('a line number outside the file is clamped rather than thrown on', () => {
  const file = sourceFile('study.oscript', 'one\n');

  assert.equal(file.lineText(0), 'one');
  assert.equal(file.lineText(99), '');
});

test('spanAt works out the line and the column of an offset', () => {
  const file = sourceFile('study.oscript', 'version 1\nlen = 9\n');

  assert.deepEqual(file.spanAt(10, 3), { offset: 10, length: 3, line: 2, column: 1 });
});

test('a column counts UTF-16 code units, which is what an editor asks for', () => {
  // The astral character is two code units and one code point, so a column that
  // counted characters would differ from this by one.
  const file = sourceFile('study.oscript', 'a = "\u{1D11E}" + b\n');
  const plus = file.text.indexOf('+');

  assert.equal(file.positionAt(plus).column, 10);
});
