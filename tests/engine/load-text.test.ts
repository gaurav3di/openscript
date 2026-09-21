/**
 * The text boundary: `compiled-program.md` 9.4 step 1, section 13 and
 * decision 57.
 *
 * A program an engine reads from outside its process arrives as the canonical
 * encoding of 2.14, and its hash was taken over those bytes. `loadText` is
 * where that is required: the text is parsed, written out again by the one
 * canonical writer, and refused if the two differ. An object built in the same
 * process was never text and is not held to it, which `load` has always been
 * the entry for.
 *
 * The wrong implementations these catch: a text entry that only parses, so
 * whitespace and key order pass and a stored hash names bytes nobody has; and
 * one that throws on text that does not parse, in an engine whose whole
 * surface answers with a diagnostic so that one script failing takes nothing
 * else down.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalise } from '../../src/core/emit/index.js';
import { load } from '../../src/core/engine/index.js';
import { loadText } from '../../src/core/engine/load.js';
import { compile } from './support.js';

const SOURCE = [
  'version 1',
  '',
  'study("Text")',
  '',
  'plot(sma(close, 3), "Mean", aqua)',
].join('\n');

const PROGRAM = compile('text.oscript', SOURCE).program;
const CANONICAL = canonicalise(PROGRAM);

function refusal(text: string): { readonly code: string; readonly location: unknown } {
  const loaded = loadText(text);
  if (loaded.ok) throw new Error('the text loaded and the test expected a refusal');
  return { code: loaded.diagnostic.code, location: loaded.diagnostic.values['location'] };
}

test('the canonical encoding of a program loads', () => {
  assert.equal(loadText(CANONICAL).ok, true);
});

test('text with whitespace in it is refused as not canonical, naming the character', () => {
  const pretty = JSON.stringify(JSON.parse(CANONICAL), null, 2);
  assert.notEqual(pretty, CANONICAL);
  const refused = refusal(pretty);
  assert.equal(refused.code, 'OS6018');
  // `{"` against `{\n`: the second character is where they part.
  assert.equal(refused.location, 'character 1');
});

test('text with keys in the order the document lists them is refused', () => {
  // The emitter builds the object in section 2's order and the canonical form
  // sorts, so the host serialiser's own spelling is the one a host would most
  // plausibly write and the one 2.14 does not allow.
  const listed = JSON.stringify(PROGRAM);
  assert.notEqual(listed, CANONICAL, 'the fixture is already canonical, so this proves nothing');
  assert.equal(refusal(listed).code, 'OS6018');
});

test('text that does not parse is refused with OS6018, and nothing is thrown', () => {
  const refused = refusal(CANONICAL.slice(0, 40));
  assert.equal(refused.code, 'OS6018');
  assert.ok(
    refused.location === 'the text' || String(refused.location).startsWith('character '),
    String(refused.location),
  );
});

test('a number the format cannot carry is refused rather than thrown', () => {
  // The object notation reads this as an infinity, which no program holds and
  // the canonical writer refuses to spell.
  assert.equal(refusal('1e400').code, 'OS6018');
});

test('canonical text is then refused for exactly what the object is refused for', () => {
  const other = JSON.parse(CANONICAL) as Record<string, unknown>;
  other['openscript'] = { format: '9.0', language: 1 };
  assert.equal(refusal(canonicalise(other)).code, 'OS6016');
});

test('an object built in the same process is not held to canonicity', () => {
  // The boundary is the text. The same program, parsed from a spelling the
  // text entry refuses, loads through the object entry.
  const pretty = JSON.stringify(JSON.parse(CANONICAL), null, 2);
  assert.equal(loadText(pretty).ok, false);
  assert.equal(load(JSON.parse(pretty)).ok, true);
});
