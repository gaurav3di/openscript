/**
 * Harvesting a conformance case out of a run.
 *
 * **This is the debt Phase 5 recorded and could not pay.** A record was always
 * meant to be a conformance case: `conformance.md` section 2 says a case is one
 * directory of named files, and a run already knows every one of them. What it
 * did not know was the script itself, because a record carried the source's
 * hash and a hash is a fingerprint: it settles whether two files are the same
 * and yields neither of them.
 *
 * So the tests here are about one question. Can somebody who has never seen
 * this repository take what comes out, put it in a directory, and run it against
 * an engine we did not write? That means every required file present, every byte
 * of input inside the case, and a refusal rather than a hole when a record
 * cannot make a whole one.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { backtest, caseFilesFrom } from '../../src/core/backtest/index.js';
import type { RunRecord } from '../../src/core/backtest/index.js';
import { compile } from '../engine/support.js';
import { inAndOut, probeText, rising, runSettings } from './support.js';

const BARS = rising(8);

const IDENTITY = {
  id: 'strategy/in-and-out',
  description: 'A long entered on one bar and closed on another folds to one trade.',
};

/** A run that carries its own script, which is what makes it a case. */
function harvestable(): RunRecord {
  const text = probeText();
  const out = backtest(compile('probe.oscript', text).program, BARS, runSettings(), {
    sourceText: text,
  });
  assert.equal(out.ok, true);
  if (!out.ok) throw new Error('the probe did not run');
  return out.record;
}

function filesOf(record: RunRecord = harvestable()): Readonly<Record<string, string>> {
  const made = caseFilesFrom(record, IDENTITY);
  if (!made.ok) throw new Error(made.reason);
  return made.files;
}

test('a case carries every file conformance.md requires of it', () => {
  // Named here rather than counted, because the failure this catches is a file
  // quietly dropped: a case missing one fails on somebody else's engine and the
  // blame lands on them.
  const files = filesOf();
  for (const name of ['case.json', 'script.os', 'bars.csv', 'expected.json']) {
    assert.equal(typeof files[name], 'string', `${name} is missing`);
  }
});

test('the script in the case is the script that ran', () => {
  // The whole of the debt. A case whose script is a different revision than the
  // one that produced the expected output cannot make that output, and the
  // engine under test gets blamed for a disagreement that was in the case.
  const files = filesOf();
  assert.equal(files['script.os']?.trimEnd(), probeText().trimEnd());
});

test('every bar the run saw is in the case, and none of them is a reference', () => {
  // A case never fetches: it is run on a laptop with no connection and on a
  // build machine in another country, and in five years.
  const rows = (files: string) => files.trimEnd().split('\n');
  const lines = rows(filesOf()['bars.csv'] ?? '');
  assert.equal(lines[0], 'time,open,high,low,close,volume');
  assert.equal(lines.length - 1, BARS.length);
});

test('an absent reading is written none rather than left blank', () => {
  // An empty cell between two commas is indistinguishable from a file an editor
  // trimmed, and a language whose central idea is the absent value cannot be
  // vague about it.
  const text = probeText();
  const holed = [...BARS];
  holed[3] = { ...holed[3], volume: null } as (typeof holed)[number];
  const out = backtest(compile('probe.oscript', text).program, holed, runSettings(), {
    sourceText: text,
  });
  assert.equal(out.ok, true);
  if (!out.ok) return;

  const csv = filesOf(out.record)['bars.csv'] ?? '';
  assert.equal(csv.includes(',none'), true);
});

test('the case declares what it asserts, and its id', () => {
  const declared = JSON.parse(filesOf()['case.json'] ?? '{}') as {
    id: string;
    profile: string;
    asserts: string[];
    description: string;
  };
  assert.equal(declared.id, IDENTITY.id);
  assert.equal(declared.profile, 'strategy');
  assert.equal(declared.description, IDENTITY.description);
  // A case asserts the channels it names and no others, so a change to drawing
  // output cannot break a case about money.
  assert.deepEqual(declared.asserts.slice().sort(), [
    'diagnostics',
    'orders',
    'performance',
    'trades',
  ]);
});

test('the expected output holds what the run actually produced', () => {
  const record = harvestable();
  const expected = JSON.parse(filesOf(record)['expected.json'] ?? '{}') as {
    orders: unknown[];
    trades: unknown[];
    performance: Record<string, unknown>;
  };
  assert.equal(expected.orders.length, record.orders.length);
  assert.equal(expected.trades.length, record.report.trades.length);
  assert.equal(expected.trades.length > 0, true);
  // The trades are their own channel and are not repeated inside the summary: a
  // figure stated twice in one case is a figure that can disagree with itself.
  assert.equal('trades' in expected.performance, false);
});

test('a record with no script text refuses rather than writing a case without one', () => {
  // The failure this prevents is a case that looks complete and is not.
  const out = backtest(inAndOut(), BARS, runSettings());
  assert.equal(out.ok, true);
  if (!out.ok) return;

  const made = caseFilesFrom(out.record, IDENTITY);
  assert.equal(made.ok, false);
  assert.equal(made.ok === false && /script\.os/.test(made.reason), true);
});

test('a record that only points at its bars refuses too', () => {
  // The operational form exists because nothing that grows with history may
  // travel in a request body. It is not a case: a case holds its own input.
  const text = probeText();
  const out = backtest(compile('probe.oscript', text).program, BARS, runSettings(), {
    sourceText: text,
    form: 'referenced',
  });
  assert.equal(out.ok, true);
  if (!out.ok) return;

  const made = caseFilesFrom(out.record, IDENTITY);
  assert.equal(made.ok, false);
  assert.equal(made.ok === false && /inline/.test(made.reason), true);
});

test('a case will not be made without an id or a description', () => {
  // The id is the directory and the description is the failure message a runner
  // prints. A case with neither is a case nobody can act on when it fails.
  const record = harvestable();
  assert.equal(caseFilesFrom(record, { id: '  ', description: 'x' }).ok, false);
  assert.equal(caseFilesFrom(record, { id: 'x', description: '  ' }).ok, false);
});

test('the same run harvests to the same bytes', () => {
  // A case is compared as text, so a number written two ways is a disagreement
  // that is not one. One canonical writer, here as everywhere.
  assert.deepEqual(filesOf(harvestable()), filesOf(harvestable()));
});

test('every file ends with a newline', () => {
  for (const [name, text] of Object.entries(filesOf())) {
    assert.equal(text.endsWith('\n'), true, `${name} does not end with a newline`);
  }
});
