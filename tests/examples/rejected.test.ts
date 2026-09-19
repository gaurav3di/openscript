import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allCodes, isDiagnosticCode, isError } from '../../src/core/index.js';
import {
  REJECTED,
  asLine,
  compile,
  expectationsIn,
  read,
  report,
  scriptsIn,
} from './support.js';

/**
 * The other half of the gate: what the front end refuses.
 *
 * A parser that accepts everything passes the gate next door without being a
 * parser at all, so every syntax code has a script here that produces it. Each
 * case states its own claim, above the mistake it is about:
 *
 *     // expect OS1016 at 11:3, length 4
 *
 * The claim is the whole diagnostic list, in file order, so a case that starts
 * reporting a second thing fails rather than passing on the one code it names.
 * The span is claimed as well as the code, because a caret under the wrong
 * character sends a reader to the wrong part of their script and the message is
 * then worse than no message.
 */

/** The range that belongs to the front end: characters, layout and grammar. */
const SYNTAX = 'OS1';

const cases = scriptsIn(REJECTED);

test('every syntax code in the catalogue has a script that produces it', () => {
  const covered = new Set(
    cases.flatMap((name) => expectationsIn(name, read(REJECTED, name)).map((one) => one.code)),
  );

  const uncovered = allCodes().filter((code) => code.startsWith(SYNTAX) && !covered.has(code));
  assert.deepEqual(
    uncovered,
    [],
    'a syntax code the catalogue documents and no script in tests/examples/rejected produces',
  );
});

test('every case is named after a code, and there is one case per code', () => {
  const codes = cases.map((name) => name.replace(/\.oscript$/, ''));
  assert.deepEqual([...new Set(codes)], codes, 'two cases share a name');

  for (const code of codes) {
    assert.equal(
      isDiagnosticCode(code),
      true,
      `${code}.oscript is named after a code the catalogue does not define`,
    );
  }
});

for (const name of cases) {
  test(`${name} is refused, with the code and the span it claims`, () => {
    const text = read(REJECTED, name);
    const expected = expectationsIn(name, text);
    const compiled = compile(name, text);

    assert.notEqual(
      expected.length,
      0,
      `${name} claims nothing. A case with no claim asserts only that something went wrong.`,
    );

    assert.deepEqual(
      compiled.diagnostics.map(asLine),
      expected.map(asLine),
      `${name} did not report what it claims:\n${report(compiled)}`,
    );

    // The file is named after the mistake it is about, so a case that drifts to
    // being about something else is renamed rather than quietly kept.
    const about = name.replace(/\.oscript$/, '');
    assert.equal(
      expected.some((one) => one.code === about),
      true,
      `${name} claims ${expected.map((one) => one.code).join(', ')} and not ${about}`,
    );

    for (const diagnostic of compiled.diagnostics) {
      assert.equal(
        diagnostic.code.startsWith(SYNTAX),
        true,
        `${name} reported ${diagnostic.code}, which is not a syntax code`,
      );
      assert.equal(isError(diagnostic), true, `${name} reported ${diagnostic.code} as a warning`);
      assert.notEqual(
        diagnostic.fix.trim(),
        '',
        `${diagnostic.code} told the reader nothing to do`,
      );
    }
  });
}

test('a refused script still has a tree, so one mistake costs one statement', () => {
  for (const name of cases) {
    const compiled = compile(name, read(REJECTED, name));
    assert.equal(
      compiled.script.kind,
      'script',
      `${name} produced no tree, and an editor asking about a half typed line needs one`,
    );

    // Every case is a script with a header, and the header is sound. A mistake
    // that took the header with it took more than the line it was on, and an
    // editor would have nothing to offer for the rest of the file.
    assert.equal(
      compiled.script.items.length >= 2,
      true,
      `${name}: ${compiled.script.items.length} statements reached the tree, so the mistake ` +
        `cost the lines around it as well as its own`,
    );
  }
});
