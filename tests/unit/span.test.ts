import assert from 'node:assert/strict';
import { test } from 'node:test';

import { containsOffset, endOffset, makeSpan, spanning } from '../../src/core/index.js';

test('a span ends one past its last code unit', () => {
  assert.equal(endOffset(makeSpan(10, 3, 1, 11)), 13);
});

test('spanning runs from the start of the first to the end of the last', () => {
  const callee = makeSpan(4, 3, 2, 5);
  const closingBracket = makeSpan(14, 1, 2, 15);
  const whole = spanning(callee, closingBracket);

  assert.deepEqual(whole, { offset: 4, length: 11, line: 2, column: 5 });
});

test('spanning a pair the parser recovered out of order has no negative length', () => {
  const later = makeSpan(40, 2, 9, 1);
  const earlier = makeSpan(4, 1, 2, 5);

  assert.equal(spanning(later, earlier).length, 0);
});

test('a zero length span contains nothing, which is what points between two characters', () => {
  const between = makeSpan(7, 0, 1, 8);

  assert.equal(containsOffset(between, 7), false);
  assert.equal(containsOffset(between, 6), false);
});

test('a span contains its first code unit and not the one past its end', () => {
  const word = makeSpan(7, 3, 1, 8);

  assert.equal(containsOffset(word, 7), true);
  assert.equal(containsOffset(word, 9), true);
  assert.equal(containsOffset(word, 10), false);
});
