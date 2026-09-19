import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PUNCTUATORS, RESERVED_WORDS } from '../../src/core/index.js';

test('the reserved words are the thirty-six of language.md 3.4, each once', () => {
  assert.equal(RESERVED_WORDS.length, 36);
  assert.equal(new Set(RESERVED_WORDS).size, 36);
});

test('the words reserved and unused in version 1 are still reserved', () => {
  for (const word of ['import', 'map', 'matrix', 'type', 'as']) {
    assert.equal(RESERVED_WORDS.includes(word as never), true, `${word} is not reserved`);
  }
});

test('the words the grammar reads by position are not reserved', () => {
  // version and limits are keywords of the grammar and ordinary names to the
  // lexer, because 3.4 does not reserve them.
  assert.equal(RESERVED_WORDS.includes('version' as never), false);
  assert.equal(RESERVED_WORDS.includes('limits' as never), false);
});

test('the punctuators are the twenty-five of language.md 3.12, each once', () => {
  assert.equal(PUNCTUATORS.length, 25);
  assert.equal(new Set(PUNCTUATORS).size, 25);
});

test('a longer punctuator always comes before the one it starts with', () => {
  for (const [index, punctuator] of PUNCTUATORS.entries()) {
    for (const earlier of PUNCTUATORS.slice(0, index)) {
      assert.equal(
        punctuator.startsWith(earlier),
        false,
        `${earlier} is taken before ${punctuator}, so ${punctuator} could never be read`,
      );
    }
  }
});

test('the operators the language refuses are absent', () => {
  for (const absent of ['!', '&&', '||', '^', '**', '++', '{', '}', ';']) {
    assert.equal(PUNCTUATORS.includes(absent as never), false, `${absent} is not an operator`);
  }
});
