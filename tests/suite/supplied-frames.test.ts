/**
 * A case whose frames this engine's own destination would not have answered,
 * run through the adapter: `conformance.md` section 3, made mechanical.
 *
 * The suite could hold no such case until now. The adapter re-ran every case on
 * a simulated destination and held the frames its own run answered to
 * `frames.csv` byte for byte, so a case whose destination filled an order in
 * pieces was reported `unsupported` and, under section 8, was not a passing run
 * either. Every case in the suite was therefore one where an order worked and
 * then filled whole, which is the half of a destination's day that costs nobody
 * anything, and two engines agreeing on it proved nothing about the other half.
 *
 * So the case here is harvested from a run whose destination was told to fill
 * the entry in two pieces, and it is checked first to be a case the plain
 * destination does not produce: a case that would pass either way would leave
 * this file green and the adapter free to go back to ignoring the file. It is
 * checked as well to carry an `updatedAt` that the placement did not put there,
 * because that field is folded from a frame's own instant and is the one field
 * the two engines disagreed on while `frames.csv` had no column for it.
 *
 * The wrong adapters these catch: one that re-runs the case on a destination of
 * its own and compares, which reports `unsupported`; one that runs the case's
 * program and never delivers the file's rows, which fails on the ledger; one
 * that delivers them and drops the instant, which fails on `updatedAt` alone;
 * and one that passes over a row no boundary of the run delivers, which is the
 * last test here.
 *
 * **The two engines are held to each other over a case whose frames arrive at
 * the boundary that placed the order**, and the reason is a gap rather than a
 * preference. The second engine reads the `time` column and folds `updatedAt`
 * from a frame that carries one, and the driver between the two, its
 * `Desk.fold`, builds the frame it delivers without that field: a case whose
 * destination answered later than the bar that placed the order is therefore
 * one the two engines answer differently today, by that one field, which is
 * what decision 62 left to the file that owns the delivery. So the case below
 * that both engines answer is the one where the two instants are the same
 * instant, and it is still a case neither engine's own destination would have
 * answered.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DEFAULT_FILL, backtest, caseFilesFrom, settingsFor } from '../../src/core/backtest/index.js';
import type { CaseFiles, VenueAct } from '../../src/core/backtest/index.js';
import { CONTRACT, FACTS, probeText, rising } from '../backtest/support.js';
import { compile } from '../engine/support.js';
import { OWN_ADAPTER, runSuite, temporarySuite } from './support.js';
import type { SuiteDocument } from './support.js';

/** The second engine's adapter, which starts the Python package and relays it. */
const OTHER_ADAPTER = fileURLToPath(new URL('../../../engine/adapter.mjs', import.meta.url));

/** Eight bars closing at 100, 101 and up. */
const BARS = rising(8);

/** The probe: it buys two units on bar one and closes on bar four. */
const PROBE = { entryBar: 1, exitBar: 4, qty: 2 };

const ID = 'frames/in-pieces';
const FRAMES = 'frames.csv';
const EXPECTED = 'expected.json';

/**
 * The entry is acknowledged, then half filled, then completed.
 *
 * Three boundaries rather than one, so the order's `updatedAt` ends two bars
 * after its `placedAt` and the case asserts a field whose only source is the
 * instant its own file carries.
 */
const IN_PIECES: readonly VenueAct[] = [
  { order: 1, afterBars: 0, does: 'fill', units: 0 },
  { order: 1, afterBars: 1, does: 'fill', units: 1 },
  { order: 1, afterBars: 2, does: 'fill', units: 2 },
];

/**
 * The entry is acknowledged and half filled at the boundary that placed it, and
 * the rest of it never arrives.
 *
 * Still a destination this engine's own would not be: it fills an order once
 * and in full. What it is not is a case whose frames arrive later than the
 * placement, so the instant a row carries and the instant the placement put
 * there are the same instant, and the two engines can be held to each other
 * over it while one of them still drops a frame's own.
 */
const HALF: readonly VenueAct[] = [
  { order: 1, afterBars: 0, does: 'fill', units: 0 },
  { order: 1, afterBars: 0, does: 'fill', units: 1 },
];

/** One case, projected from a run of the probe against the given schedule. */
function harvested(schedule: readonly VenueAct[] | null): CaseFiles {
  const text = probeText(PROBE);
  const fill = schedule === null ? DEFAULT_FILL : { ...DEFAULT_FILL, schedule };
  const run = backtest(compile('probe.oscript', text).program, BARS, settingsFor(CONTRACT, { fill }), {
    sourceText: text,
    instrument: FACTS,
  });
  assert.equal(run.ok, true, run.ok ? '' : run.diagnostic.message);
  if (!run.ok) throw new Error('unreachable');
  const projected = caseFilesFrom(run.record, {
    id: ID,
    description: 'A destination that fills the entry in two pieces, so the case supplies frames this engine would not have answered.',
  });
  assert.equal(projected.ok, true, projected.ok ? '' : projected.reason);
  if (!projected.ok) throw new Error('unreachable');
  return projected.files;
}

/** A case, guarded: its frames are not the ones a plain destination answers. */
function supplied(schedule: readonly VenueAct[]): CaseFiles {
  const files = harvested(schedule);
  assert.notEqual(
    files[FRAMES],
    harvested(null)[FRAMES],
    'the scheduled run and the plain one answered the same frames, so the case cannot catch an adapter that answers its own',
  );
  return files;
}

/** The case, and the second guard: a row moved `updatedAt` off the placement. */
function inPieces(): CaseFiles {
  const files = supplied(IN_PIECES);
  const orders = (JSON.parse(files[EXPECTED] ?? '{}') as { orders: readonly Record<string, unknown>[] }).orders;
  assert.notEqual(
    orders[0]?.updatedAt,
    orders[0]?.placedAt,
    'the entry was last changed by a frame at its own placement, so the case cannot catch an adapter that drops the instant',
  );
  return files;
}

function held(document: SuiteDocument | null, stderr: string): SuiteDocument {
  assert.notEqual(document, null, `the runner wrote no document: ${stderr}`);
  if (document === null) throw new Error('unreachable');
  return document;
}

test('a case whose destination filled an order in pieces passes, because the adapter folds the frames the case supplies', () => {
  const suite = temporarySuite();
  try {
    suite.write(ID, inPieces());
    const run = runSuite(['--cases', suite.root]);
    const document = held(run.document, run.stderr);
    const row = document.cases.find((one) => one.id === ID);
    assert.equal(
      row?.outcome,
      'pass',
      `${row?.outcome ?? 'no row'}: ${row?.feature ?? row?.reason ?? `${row?.channel ?? ''} ${row?.column ?? ''}`}`,
    );
    assert.equal(run.status, 0, run.stderr);
  } finally {
    suite.remove();
  }
});

test('the two engines agree on a partly filled case, channel by channel, at tolerance zero', () => {
  const suite = temporarySuite();
  try {
    suite.write(ID, supplied(HALF));
    const run = runSuite(['--adapter', OWN_ADAPTER, '--against', OTHER_ADAPTER, '--cases', suite.root]);
    const document = held(run.document, run.stderr);
    const row = document.cases.find((one) => one.id === ID);
    assert.equal(
      row?.outcome,
      'pass',
      `${row?.engine ?? 'both'}: ${row?.feature ?? row?.reason ?? `${row?.channel ?? ''} ${row?.column ?? ''} expected ${row?.expected ?? ''} actual ${row?.actual ?? ''}`}`,
    );
    assert.equal(run.status, 0, run.stderr);
  } finally {
    suite.remove();
  }
});

/**
 * A row no boundary of the run delivers is named rather than passed over.
 *
 * Section 3 delivers a frame after the bar it names and folds it before the
 * next execution, so a row naming the last of eight bars has no fold left. An
 * adapter that ran the case anyway would answer a ledger that never saw part of
 * its own input, and the case would pass with a row of its file ignored.
 */
test('a case with a frame after its last bar is unsupported, and names the row', () => {
  const suite = temporarySuite();
  try {
    const files = { ...inPieces() };
    files[FRAMES] = `${files[FRAMES] ?? ''}7,1,filled,2,102,ORD-1,,none\n`;
    suite.write(ID, files);
    const run = runSuite(['--cases', suite.root]);
    const document = held(run.document, run.stderr);
    const row = document.cases.find((one) => one.id === ID);
    assert.equal(row?.outcome, 'unsupported');
    assert.equal(row?.feature?.includes(FRAMES), true, row?.feature);
    assert.notEqual(run.status, 0, 'a run with an unsupported case in the claimed profile is not a passing run');
  } finally {
    suite.remove();
  }
});
