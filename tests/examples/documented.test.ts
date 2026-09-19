import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { CATALOGUE_FILE, compile } from './support.js';

/**
 * The catalogue's own examples, run rather than read.
 *
 * Every entry in spec/errors.json carries a before and an after. A before that
 * does not produce the code it illustrates teaches a reader to look for a message
 * the compiler never sends, and an after that does not compile teaches a fix that
 * does not work. Both look authoritative on the page while being wrong, which is
 * why they are executed here instead of reviewed.
 *
 * The document is read rather than the generated module, because the generated
 * module carries what the compiler needs at runtime and an example is not that.
 */

const SYNTAX = 'OS1';

interface CatalogueExample {
  readonly code: string;
  readonly before: string;
  readonly after: string;
}

function syntaxExamples(): readonly CatalogueExample[] {
  const document = JSON.parse(readFileSync(CATALOGUE_FILE, 'utf8')) as {
    entries: readonly { code: string; example?: { before?: string; after?: string } }[];
  };

  return document.entries
    .filter((entry) => entry.code.startsWith(SYNTAX))
    .map((entry) => ({
      code: entry.code,
      before: entry.example?.before ?? '',
      after: entry.example?.after ?? '',
    }));
}

const examples = syntaxExamples();

test('every syntax code in the catalogue carries an example of both sides', () => {
  assert.notEqual(examples.length, 0, 'the catalogue was read and held no syntax codes');

  for (const example of examples) {
    assert.notEqual(example.before.trim(), '', `${example.code} illustrates nothing`);
    assert.notEqual(example.after.trim(), '', `${example.code} shows no way out`);
  }
});

for (const example of examples) {
  test(`${example.code}: the documented mistake produces it, the documented fix clears it`, () => {
    const broken = compile(`${example.code} before`, `${example.before}\n`);
    assert.equal(
      broken.diagnostics.some((one) => one.code === example.code),
      true,
      `the before example of ${example.code} reported ${
        broken.diagnostics.map((one) => one.code).join(', ') || 'nothing'
      }`,
    );

    const fixed = compile(`${example.code} after`, `${example.after}\n`);
    assert.deepEqual(
      fixed.diagnostics.map((one) => `${one.code}: ${one.message}`),
      [],
      `the fix documented for ${example.code} does not compile`,
    );
  });
}
