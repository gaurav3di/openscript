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
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { backtest, caseFilesFrom } from '../../src/core/backtest/index.js';
import type { RunRecord } from '../../src/core/backtest/index.js';
import { compile } from '../engine/support.js';
import { CONTRACT, FACTS, inAndOut, probeText, rising, runSettings } from './support.js';

const BARS = rising(8);

/** The page whose areas a case id is drawn from, read from the source tree. */
const MATRIX = new URL('../../../spec/feature-matrix.md', import.meta.url);

const IDENTITY = {
  id: 'perf/in-and-out',
  description: 'A long entered on one bar and closed on another folds to one trade.',
};

/** A run that carries its own script and its instrument, which is what makes it a case. */
function harvestable(): RunRecord {
  const text = probeText();
  const out = backtest(compile('probe.oscript', text).program, BARS, runSettings(), {
    sourceText: text,
    instrument: FACTS,
  });
  assert.equal(out.ok, true);
  if (!out.ok) throw new Error('the probe did not run');
  return out.record;
}

/**
 * The areas `feature-matrix.md` lists, read out of the page.
 *
 * The list is the document's and not a copy here, so a fixture id is checked
 * against what the page says today. Two failures are refused by name rather
 * than read as an empty list: a page that no longer prints the sentence, and a
 * sentence that prints no area.
 */
function areasIn(page: string): readonly string[] {
  const flat = page.replace(/\r\n/g, '\n').replace(/\n/g, ' ');
  const found = /Areas: ((?:`[a-z]+`,? ?)+)\./.exec(flat);
  if (found === null) {
    throw new Error('feature-matrix.md prints no "Areas:" sentence for a case id to be checked against');
  }
  const areas = [...(found[1] ?? '').matchAll(/`([a-z]+)`/g)].map((one) => one[1] ?? '');
  if (areas.length === 0) throw new Error('the "Areas:" sentence of feature-matrix.md names no area');
  return areas;
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
  for (const name of ['case.json', 'script.os', 'bars.csv', 'expected.json', 'frames.csv']) {
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
    instrument: FACTS,
  });
  assert.equal(out.ok, true);
  if (!out.ok) return;

  const csv = filesOf(out.record)['bars.csv'] ?? '';
  assert.equal(csv.includes(',none'), true);
});

test('the frames the run was handed are in the case', () => {
  // Without this the case is unpassable on every engine, including the one that
  // wrote it. conformance.md section 3 ends "a case with no `frames.csv` is
  // handed no frames at all", and expected.json's orders channel asserts what
  // came of those frames: a status, a cumulative quantity, an average price. An
  // engine handed none folds nothing, disagrees with every row, and takes the
  // blame for a hole in the case.
  const record = harvestable();
  assert.equal(record.frames.length > 0, true, 'the probe placed no frames to assert on');

  const csv = filesOf(record)['frames.csv'] ?? '';
  const lines = csv.trimEnd().split('\n');
  assert.equal(lines[0], 'afterBar,intent,status,filledQty,avgFillPrice,orderRef,text');
  assert.equal(lines.length - 1, record.frames.length);
});

test('a frame names its intent by ordinal, never by an engine id', () => {
  // A case cannot know the id another engine minted and must not depend on its
  // spelling, so the runner maps an ordinal onto whatever that engine called it.
  const record = harvestable();
  const rows = (filesOf(record)['frames.csv'] ?? '').trimEnd().split('\n').slice(1);
  for (const row of rows) {
    const ordinal = Number(row.split(',')[1]);
    assert.equal(Number.isInteger(ordinal) && ordinal >= 1, true, `not an ordinal: ${row}`);
  }
});

test('a run that was handed no frames writes no frames file', () => {
  // An empty file and an absent one mean the same thing here, and the absent
  // one says it in fewer bytes.
  const record = harvestable();
  const without = { ...record, frames: [] };
  assert.equal('frames.csv' in filesOf(without), false);
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

test('the fixture id is under an area feature-matrix.md lists', () => {
  // The id is the directory and the matrix's test column, and conformance.md
  // section 2 fails a case with no matrix row. The areas are read out of the
  // page rather than copied here, so a fixture under an area the page does not
  // list, which is what "strategy/" was, fails at the fixture rather than on
  // the day the suite is assembled.
  const areas = areasIn(readFileSync(MATRIX, 'utf8'));
  const area = IDENTITY.id.split('/')[0] ?? '';
  assert.equal(areas.includes(area), true, `${area} is not an area the matrix lists`);
});

test('the expected output holds what the run actually produced', () => {
  const record = harvestable();
  const expected = JSON.parse(filesOf(record)['expected.json'] ?? '{}') as {
    orders: unknown[];
    trades: unknown[];
  };
  assert.equal(expected.orders.length, record.orders.length);
  assert.equal(expected.trades.length, record.report.trades.length);
  assert.equal(expected.trades.length > 0, true);
});

test('performance is a list of one flat object, and the object is the summary', () => {
  // conformance.md section 4. Catches the shape this replaced, a nested object
  // with the equity curve inside it, and the two ways of being wrong that are
  // left: a list of the wrong length, and an element with something nested in
  // it, which is what the trades, a marker list or a monthly table inside the
  // summary would be. The trades are their own channel and are not repeated
  // here, because a figure stated twice in one case can disagree with itself.
  const record = harvestable();
  const expected = JSON.parse(filesOf(record)['expected.json'] ?? '{}') as {
    performance: unknown;
  };
  assert.equal(Array.isArray(expected.performance), true);
  const list = expected.performance as readonly unknown[];
  assert.equal(list.length, 1);
  const only = list[0] as Record<string, unknown>;
  for (const [name, value] of Object.entries(only)) {
    assert.equal(value === null || typeof value !== 'object', true, `${name} is nested`);
  }
  assert.deepEqual(only, record.report.summary);
});

test('expected.json holds the channels case.json asserts, and no others', () => {
  // A channel written and not asserted is bytes no runner reads, which is what
  // the equity curve was; a channel asserted and not written is a case no
  // engine can pass. They are one defect read from either end, so the two
  // files are compared rather than each checked against a list typed here.
  const files = filesOf();
  const declared = JSON.parse(files['case.json'] ?? '{}') as { asserts: string[] };
  const written = Object.keys(JSON.parse(files['expected.json'] ?? '{}') as object);
  assert.deepEqual(written.sort(), declared.asserts.slice().sort());
});

test('instrument.json is the record of host-interface.md 4.1 the engine was handed', () => {
  // Catches the file this replaced, the money layer's contract: it carried a
  // rounding digit count no instrument record has, null for every fact nobody
  // stated where 4.1 leaves the fact out, and no volume flag at all, which is
  // the one fact that page requires of every host.
  const record = harvestable();
  const parsed = JSON.parse(filesOf(record)['instrument.json'] ?? '{}') as Record<string, unknown>;
  assert.deepEqual(parsed, record.instrument);
  assert.equal(parsed['hasVolume'], true);
  assert.equal('digits' in parsed, false);
  assert.equal(Object.values(parsed).includes(null), false);
  // The whole record, not the six facts beside the contract: a second engine
  // rounds to this tick size and names this symbol on every order row.
  assert.equal(parsed['tickSize'], CONTRACT.tickSize);
  assert.equal(parsed['symbol'], CONTRACT.symbol);
});

test('a run whose host stated no hasVolume refuses rather than guessing one', () => {
  // The one fact 4.1 requires of every host, and the one the engine does not
  // refuse a run without. A file stating it hands the second engine a
  // different study than the expected output came from; a file omitting it is
  // not the record section 2 names. Catches a projection that writes the
  // contract and calls it an instrument, and one that fills the flag in from
  // the bars, which 4.2 says no derivation can do.
  const text = probeText();
  const out = backtest(compile('probe.oscript', text).program, BARS, runSettings(), {
    sourceText: text,
  });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.record.instrument?.hasVolume, undefined, 'the probe stated the flag after all');

  const made = caseFilesFrom(out.record, IDENTITY);
  assert.equal(made.ok, false);
  assert.equal(made.ok === false && /hasVolume/.test(made.reason), true);
});

test('a record from before the instrument channel refuses too', () => {
  // A version 2 record reads with the channel absent, and absent is not a file.
  const older: RunRecord = { ...harvestable(), instrument: null };
  const made = caseFilesFrom(older, IDENTITY);
  assert.equal(made.ok, false);
  assert.equal(made.ok === false && /instrument\.json/.test(made.reason), true);
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
