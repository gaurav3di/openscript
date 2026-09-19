import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { isDiagnosticCode } from '../../src/core/index.js';
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

/**
 * The before examples that report more than the one code they illustrate, and
 * the whole of what each one reports.
 *
 * Asserting the whole list rather than a membership is the point: an example
 * that produces the right code and four wrong ones alongside it teaches a
 * reader to expect four messages the compiler will not send about their own
 * file, and reads as correct because the code it names is in there somewhere.
 * Anything not named here reports its own code and nothing else, which is what
 * a worked example should do.
 */
const ALSO_REPORTS: Readonly<Record<string, readonly string[]>> = {
  // Two backslash sequences the language does not define, on one line. Both
  // are true of the example, which writes a path with two of them.
  OS1005: ['OS1005', 'OS1005'],

  // The else is written two spaces in, which is wrong about the block as well
  // as about the pairing. The lexer states the first and the parser the
  // second, and a reader has to fix the indentation either way.
  OS1016: ['OS1003', 'OS1016'],

  // Both of the rows below are defects in what a reader is shown, kept here so
  // that the list is pinned rather than unnoticed, and so that repairing
  // either one fails this test and takes its row out with it.

  // The unterminated string runs to the end of the line, so the ( is left
  // unclosed and is reported first, at the earlier column. A reader of this
  // documented example is shown a bracket as the cause and offered a closing
  // bracket as the fix, and adding one would not terminate the string.
  OS1004: ['OS1012', 'OS1004'],

  // The malformed colour is dropped rather than emitted as a token, so the
  // argument list loses an argument and the comma before it is read as
  // trailing. OS1022's fix, to delete that comma, would throw away an
  // argument the writer did write.
  OS1027: ['OS1027', 'OS1022'],
};

/**
 * The before examples whose first diagnostic is not the code they document.
 *
 * A reader reads downwards and takes the first message as the cause, so an
 * example that leads with a consequence of the mistake teaches the wrong
 * lesson however true the second line is. Stated as a list so that the day one
 * of these is put right, this test fails and the entry is removed with it.
 */
const LEADS_WITH_ANOTHER: readonly string[] = [
  // A defect. The unterminated string is what is wrong with the line, and what
  // a reader is shown first is the bracket it left open, at the earlier column,
  // with a fix that adds a closing bracket and does not terminate anything.
  'OS1004',

  // Not a defect. Both diagnostics are about the same two spaces, and OS1003's
  // fix, to line the indentation up, is the one that puts the file right; the
  // reader acts on the first message and the second goes away with it.
  'OS1016',
];

function codesOf(example: CatalogueExample): readonly string[] {
  const compiled = compile(`${example.code} before`, `${example.before}\n`);
  return compiled.diagnostics.map((one) => one.code);
}

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
    const expected = ALSO_REPORTS[example.code] ?? [example.code];

    assert.deepEqual(
      broken.diagnostics.map((one) => one.code),
      expected,
      `the before example of ${example.code} reported ${
        broken.diagnostics.map((one) => `${one.code}: ${one.message}`).join(' | ') || 'nothing'
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

test('a documented mistake is the first thing its example reports', () => {
  const leading = examples
    .filter((example) => codesOf(example)[0] !== example.code)
    .map((example) => example.code);

  assert.deepEqual(
    leading,
    LEADS_WITH_ANOTHER,
    'an example whose first diagnostic is not the code it documents, and which is not ' +
      'already named as one',
  );
});

test('every code a documented example reports is one the catalogue defines', () => {
  // A worked example that raises a code with no entry would send a reader to a
  // page that is not there, and the before side is the one place the catalogue
  // runs the compiler on its own text.
  for (const example of examples) {
    for (const code of codesOf(example)) {
      assert.equal(isDiagnosticCode(code), true, `${example.code} reported ${code}`);
    }
  }
});
