/**
 * No library name is a reserved word, and the message says so when one is written.
 *
 * This exists because of a defect that two subsystems held at once, in the same
 * file, for a release. `bool` and `number` were declared as live library
 * functions and documented as calls a reader should write, and both are reserved
 * words, so the lexer refused every spelling of them before the checker ever saw
 * one. The checker called them functions; the lexer called the same words
 * reserved; a reader who followed the reference page got OS1019 telling them to
 * rename a variable they had not declared, and no fix that led anywhere.
 *
 * The rule that settles it is in `language.md` 3.4: a call begins with a name, a
 * reserved word is not a name, so a library that publishes one publishes a call
 * nobody can make. The conversions are `toBool` and `toNumber`.
 *
 * Both halves are asserted, because either alone would have let the defect sit:
 * the first says no such name exists, and the second says that somebody who
 * writes the old spelling is told the one that works.
 *
 * The wrong implementation this would catch: any future entry added to
 * `src/core/check/library-*.ts` under a word from `RESERVED_WORDS`. Restore
 * either old name and the first test fails; drop the parser's table and the
 * second does.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { RESERVED_WORDS, isLibraryName, libraryNames } from '../../src/core/index.js';
import { codes, values } from './parse-support.js';

const reserved: ReadonlySet<string> = new Set<string>(RESERVED_WORDS);

test('no library name, and no namespace it hangs from, is a reserved word', () => {
  const unwritable: string[] = [];
  for (const name of libraryNames()) {
    // A member after a dot is matched against a published list rather than
    // looked up in a scope, so only the part a script writes as a name counts.
    const head = name.split('.')[0] as string;
    if (reserved.has(head)) unwritable.push(name);
  }
  assert.deepEqual(
    unwritable,
    [],
    'a call begins with a name and a reserved word is not one, so no script could ever write these',
  );
});

test('the conversions are the names the specification publishes', () => {
  for (const name of ['toBool', 'toNumber', 'text']) {
    assert.equal(isLibraryName(name), true, `${name} is the spelling stdlib.md 8.1 and 10 publish`);
  }
});

/**
 * The message a reader gets for the spelling the reference used to carry.
 *
 * The fix is asserted through the value the diagnostic filled its slot from
 * rather than through the sentence, on the terms `parse-support` explains: the
 * wording may improve, but the name it points at is what the message promises
 * and what an editor offers.
 */
test('writing the old spelling as a call is told the name that works', () => {
  for (const [written, works] of [
    ['bool', 'toBool'],
    ['number', 'toNumber'],
  ]) {
    const text = `version 1\nstudy("T")\nx = ${written}(close > open)\n`;
    assert.deepEqual(codes(text), ['OS1019'], `${written}(...) is one diagnostic, not several`);
    assert.deepEqual(values(text)[0], { word: written, suggestion: works });
    assert.equal(isLibraryName(works as string), true, 'the fix names a call that really exists');
  }
});

/**
 * The other half of the same rule: the fix is a name of their own, not the
 * library's.
 *
 * A reader assigning to `bool` wants a variable, and handing them `toBool` would
 * send them from OS1019 to OS2002 on the next compile. The suggestion follows
 * what they wrote rather than the word alone.
 */
test('writing the same word as a target is told to pick a name of its own', () => {
  const text = 'version 1\nstudy("T")\nbool = 5\n';
  assert.deepEqual(values(text)[0], { word: 'bool', suggestion: 'boolValue' });
  assert.equal(isLibraryName('boolValue'), false, 'a suggested name must be the reader to take');
});
