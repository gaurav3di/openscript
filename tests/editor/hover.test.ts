/**
 * `hover`, and the question every test here is really asking: where did that
 * sentence come from.
 *
 * A tooltip is the easiest place in a language tool to write prose that is
 * nobody's job to maintain. So the tests below do not assert that a description
 * exists; they assert that it is **the same characters as the cell in
 * `spec/stdlib.md`**, read out of the document in the test. A sentence typed
 * into the source would fail on the day the specification improved, which is the
 * day it matters.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  RESERVED_WORDS,
  describedNames,
  entryFor,
  fillTemplate,
  isLibraryName,
  libraryEntries,
  libraryNames,
  namedColour,
  normaliseSource,
  proseFor,
} from '../../src/core/index.js';
import { hover } from '../../src/editor/index.js';
import { MALFORMED } from './support.js';

const HEAD = 'version 1\nstudy("t")\n';

const STDLIB = new URL('../../../spec/stdlib.md', import.meta.url);

/** The nineteen named colours, which stdlib.md 11.1 states in a block. */
function colourNames(): readonly string[] {
  return libraryNames().filter((name) => namedColour(name) !== undefined);
}

// ---------------------------------------------------------------------------
// The text came from the specification
// ---------------------------------------------------------------------------

test('the sentence a hover shows is the cell the specification prints', () => {
  // Catches a description typed into the editor tier, which is the one thing
  // this function must never contain. The row is found in the document here, in
  // the test, so the two would have to be edited together to stay equal.
  const source = `${HEAD}x = ema(close, 9)\n`;
  const held = hover(source, source.indexOf('ema'));

  const page = readFileSync(STDLIB, 'utf8');
  const row = page
    .split(/\r?\n/)
    .find((line) => line.startsWith('| `ema(src, len)`'));
  assert.ok(row !== undefined, 'the specification still has a row for ema');

  const cells = row.split('|').map((one) => one.trim());
  assert.equal(held?.summary, cells[4], 'the summary is the row\'s last cell');
  assert.equal(held?.warmup, cells[3], 'the warmup is the row\'s warmup cell');
});

test('every name the library holds is described, or is one of the nineteen colours', () => {
  // Catches the two ways the manifest and the specification drift apart: a
  // function added to one and not the other. Both directions fail here, and a
  // name with no description would otherwise be a tooltip that silently says
  // nothing.
  const colours = new Set(colourNames());
  const undescribed = libraryNames().filter(
    (name) => proseFor(name) === undefined && !colours.has(name),
  );
  assert.deepEqual(undescribed, [], 'a library name the specification does not describe');
  assert.equal(colours.size, 19, 'the nineteen named colours of stdlib.md 11.1');

  const unknown = describedNames().filter((name) => !isLibraryName(name));
  assert.deepEqual(unknown, [], 'a described name the library does not hold');
});

test('a signature carries the question mark and the default the manifest holds', () => {
  // Catches a rendering that prints every parameter the same way. An optional
  // argument shown as required, or shown without the value it resolves to, is
  // the tooltip saying something the compiler does not do.
  const source = `${HEAD}x = alma(close, 9)\n`;
  const held = hover(source, source.indexOf('alma'));
  // The signature is named rather than written inside the brackets: a string
  // joined to another inside a bracket is what the no-eval scan reads as a key
  // built out of pieces, and a rule that fires on an innocent line is a rule
  // somebody turns off.
  const signature =
    'alma(src: series number, len: number, offset?: number = 0.85, sigma?: number = 6)' +
    ' -> series number';
  assert.deepEqual(held?.signatures, [signature]);
});

test('a colour carries the channels the compiler writes rather than a sentence', () => {
  const source = `${HEAD}plot(close, "C", aqua)\n`;
  const held = hover(source, source.indexOf('aqua'));
  assert.deepEqual(held?.colour, namedColour('aqua'));
  assert.equal(held?.summary, undefined, 'the channels are the description');
});

// ---------------------------------------------------------------------------
// What it is
// ---------------------------------------------------------------------------

test('a library call carries every signature the manifest holds for it', () => {
  const source = `${HEAD}x = clear\n`;
  const held = hover(source, source.indexOf('clear'));
  assert.equal(held?.kind, 'library');
  assert.equal(
    held?.signatures.length,
    libraryEntries('clear').length,
    'a name with two signatures shows both, since a hover has no arguments to choose with',
  );
});

test('a dotted name is answered from either half of it', () => {
  // Catches the version that hovers the token: `box` on its own is a name the
  // library does not have, so pointing at it would say nothing at all.
  const source = `${HEAD}b = draw.box(1, 2, 3, 4)\n`;
  const onNamespace = hover(source, source.indexOf('draw'));
  const onMember = hover(source, source.indexOf('box'));
  assert.equal(onNamespace?.name, 'draw.box');
  assert.equal(onMember?.name, 'draw.box');
  assert.equal(onNamespace?.span.offset, source.indexOf('draw'));
  assert.equal(onNamespace?.span.length, 'draw.box'.length);
});

test('a declared name says where it was declared', () => {
  const source = `${HEAD}fast = ema(close, 9)\nplot(fast, "F")\n`;
  const held = hover(source, source.indexOf('plot(fast') + 5);
  assert.equal(held?.kind, 'declared');
  assert.equal(held?.type, 'series number');
  assert.equal(held?.declaredAt?.offset, source.indexOf('fast'));
  assert.equal(held?.declaredAt?.length, 4);
  assert.equal(held?.declaredAt?.line, 3);
  assert.equal(held?.declaredAt?.column, 1);
});

test('a name is answered on the line that declares it', () => {
  // Catches the scope rule being applied where it does not belong: a name is not
  // in scope inside its own right hand side, and pointing at it is still
  // pointing at it.
  const source = `${HEAD}fast = ema(close, 9)\n`;
  assert.equal(hover(source, source.indexOf('fast'))?.kind, 'declared');
});

test('a var carries its persistence in the signature line', () => {
  const source = `${HEAD}var held = 0\nplot(held, "H")\n`;
  assert.deepEqual(hover(source, source.indexOf('var held') + 4)?.signatures, ['var held: number']);
});

test('a planned call carries the catalogue\'s own refusal', () => {
  const source = `${HEAD}x = kama(close, 9)\n`;
  const held = hover(source, source.indexOf('kama'));
  assert.ok(held?.planned);
  assert.equal(held?.refusal, fillTemplate(entryFor('OS2020').message, { name: 'kama' }));
});

// ---------------------------------------------------------------------------
// A keyword, and the gap that is declared rather than filled
// ---------------------------------------------------------------------------

test('a reserved word is answered as one and carries no invented sentence', () => {
  // The gap is the assertion. There is no per-word explanation in a machine
  // readable form anywhere in the specification, and thirty-five sentences typed
  // into the source would be the copy that drifts. Recorded in
  // spec/editor-narrowings.json.
  const source = `${HEAD}var held = 0\n`;
  const held = hover(source, source.indexOf('var'));
  assert.equal(held?.kind, 'keyword');
  assert.equal(held?.name, 'var');
  assert.equal(held?.summary, undefined);
  assert.deepEqual(held?.signatures, []);
  assert.ok(RESERVED_WORDS.includes('var'), 'var is the language\'s reserved word, not ours');
});

test('a pointer on something that is not a word is answered with nothing', () => {
  const source = `${HEAD}x = 1 + 2\n`;
  assert.equal(hover(source, source.indexOf('1')), undefined, 'a number literal');
  assert.equal(hover(source, source.indexOf('+')), undefined, 'an operator');
  assert.equal(hover(source, source.indexOf(' = ')), undefined, 'a space');
  assert.equal(hover(`${HEAD}x = "a"\n`, source.indexOf('"') + 1), undefined, 'a string');
});

// ---------------------------------------------------------------------------
// A file that is not a program
// ---------------------------------------------------------------------------

test('every offset of every malformed file is answered with a span inside it', () => {
  for (const source of MALFORMED) {
    const normalised = normaliseSource(source);
    for (let offset = 0; offset <= normalised.length; offset += 1) {
      const held = hover(source, offset);
      if (held === undefined) continue;
      assert.ok(held.span.offset >= 0, JSON.stringify(source));
      assert.ok(
        held.span.offset + held.span.length <= normalised.length,
        `${JSON.stringify(source)} at ${offset}: a span past the end of the file`,
      );
      assert.ok(held.name.length > 0, 'a hover over nothing');
    }
  }
});

test('an offset outside the file is answered rather than thrown at', () => {
  assert.equal(hover(HEAD, -1), undefined);
  assert.equal(hover(HEAD, HEAD.length + 50), undefined);
});
