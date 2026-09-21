/**
 * A lower minor of this engine's own format major loads, `compiled-program.md`
 * 9.4 step 3 and decision 56.
 *
 * 9.5 promises that a program that ran yesterday runs today. A table a later
 * minor added is exactly what such a program lacks, so an engine that required
 * every table of its own minor refused every program compiled before that
 * minor existed: a 1.0 program was refused by the 1.1 engine at load, at
 * `requests`, with a message about a malformed program aimed at a program
 * nothing was wrong with. That is the wrong implementation this file catches,
 * and it was this engine's until the decision.
 *
 * The history is the input. `spec/format-history.json` says which version
 * added which table, so the table the engine has to read as empty for an
 * earlier minor is one the file names, and a file that gains a version gains
 * a case here without anyone remembering to write one. The other direction is
 * tested too: a program at this minor or a later one that omits a table is
 * still refused, because section 2 says an empty table is written and never
 * omitted, and an engine that read every absence as emptiness would let a
 * malformed current program through.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { COMPILED_FORMAT_VERSION } from '../../src/core/index.js';
import { DEFAULT_LIMITS, capabilitiesFor, load, verify } from '../../src/core/engine/index.js';
import { compile, mutable, refusalOf } from './support.js';

const ROOT = new URL('../../../', import.meta.url);
const HISTORY = new URL('spec/format-history.json', ROOT);

interface Version {
  readonly format: string;
  readonly fields: readonly string[];
}

const HISTORY_VERSIONS = (JSON.parse(readFileSync(HISTORY, 'utf8')) as { versions: Version[] }).versions;

const SOURCE = [
  'version 1',
  '',
  'study("Earlier")',
  '',
  'plot(sma(close, 3), "Mean", aqua)',
].join('\n');

function program(): Record<string, unknown> {
  return mutable(compile('earlier.oscript', SOURCE).program);
}

const parts = (format: string): readonly [number, number] => {
  const [major, minor] = format.split('.');
  return [Number(major), Number(minor ?? '0')];
};

/** The top-level tables a version added: a field path with no dot and no bracket. */
function tablesAddedBy(version: Version): readonly string[] {
  return version.fields.filter((path) => !/[.[]/.test(path));
}

/** The history's versions of this engine's major below the one the compiler stamps. */
function earlierMinors(): readonly Version[] {
  const [major, minor] = parts(COMPILED_FORMAT_VERSION);
  return HISTORY_VERSIONS.filter((one) => {
    const [thatMajor, thatMinor] = parts(one.format);
    return thatMajor === major && thatMinor < minor;
  });
}

/** Every version after `since`, in the history's order. */
function after(since: Version): readonly Version[] {
  return HISTORY_VERSIONS.slice(HISTORY_VERSIONS.indexOf(since) + 1);
}

function stamped(format: string): Record<string, unknown> {
  const one = program();
  const version = one['openscript'] as { language: number };
  one['openscript'] = { format, language: version.language };
  return one;
}

test('the history holds an earlier minor of this major, so the cases below test something', () => {
  // Without this, a history that lost its first entry would make every loop
  // below run over nothing and pass.
  assert.ok(earlierMinors().length >= 1, 'no earlier minor to load a program from');
  assert.equal(HISTORY_VERSIONS[HISTORY_VERSIONS.length - 1]?.format, COMPILED_FORMAT_VERSION);
});

test('a program at an earlier minor that lacks the tables later minors added loads', () => {
  for (const version of earlierMinors()) {
    const one = stamped(version.format);
    const missing: string[] = [];
    for (const later of after(version)) {
      for (const table of tablesAddedBy(later)) {
        delete one[table];
        missing.push(table);
      }
    }
    assert.ok(missing.length >= 1, `${version.format}: no later table to remove, so this proves nothing`);

    const loaded = load(one);
    assert.equal(loaded.ok, true, `a ${version.format} program without ${missing.join(', ')} was refused`);

    // What the engine read the absence as: the empty table 9.4 step 3 promises.
    const checked = verify(one, { capabilities: capabilitiesFor(false), limits: DEFAULT_LIMITS });
    assert.equal(checked.ok, true);
    if (!checked.ok) return;
    for (const table of missing) {
      assert.deepEqual((checked.program as unknown as Record<string, unknown>)[table], [], table);
    }
  }
});

test('a program at this engine\'s own minor that omits a table is OS6018 naming it', () => {
  // The wrong implementation this catches reads every absence as emptiness,
  // whatever the version, and lets a malformed current program through.
  for (const later of after(earlierMinors()[earlierMinors().length - 1] as Version)) {
    for (const table of tablesAddedBy(later)) {
      const one = program();
      delete one[table];
      const refusal = refusalOf(one);
      assert.equal(refusal.code, 'OS6018');
      assert.equal(refusal.values['location'], table);
    }
  }
});

test('a program at a later minor that omits a table is refused the same way', () => {
  // A later minor carries everything this one does and more, so an absence
  // there is an absence and not an age.
  const [major, minor] = parts(COMPILED_FORMAT_VERSION);
  const one = stamped(`${major}.${minor + 1}`);
  const tables = after(earlierMinors()[earlierMinors().length - 1] as Version).flatMap(tablesAddedBy);
  assert.ok(tables.length >= 1);
  for (const table of tables) delete one[table];
  const refusal = refusalOf(one);
  assert.equal(refusal.code, 'OS6018');
  assert.equal(refusal.values['location'], tables[0]);
});
