/**
 * What a case carries of the run's settings, and the record it refuses to make
 * one of.
 *
 * The projection once wrote a case from a run and carried none of three facts
 * the report was folded under: the digit count money was rounded to, a charge
 * schedule the host supplied, and a narrowed report window. A second engine
 * handed such a case ran under other values and was blamed for the difference.
 * So each test here asks one question: does the case say what the run ran
 * under, and where it cannot, does the projection say so rather than write a
 * case that lies.
 *
 * The tolerance cap is the same question from the other side. `conformance.md`
 * section 6 caps what a case may declare; a record past the cap is a comparison
 * somebody may find useful and is not a case, and the projection refuses it
 * with the catalogue's own code and makes no file, because a directory the
 * suite will not accept fails every runner it meets.
 *
 * Every figure here that the page prints is read out of the page, so the
 * document is the input and a cap moved on the page moves the tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { ChargeSchedule, Contract } from '../../src/core/accounting/index.js';
import { TOLERANCE_CAP } from '../../src/core/backtest/case.js';
import { backtest, caseFilesFrom, settingsFor } from '../../src/core/backtest/index.js';
import type { BacktestSettings, RunRecord } from '../../src/core/backtest/index.js';
import { compile } from '../engine/support.js';
import { CONTRACT, FACTS, HOUR, START, SUPPLIED, probeText, rising } from './support.js';

const BARS = rising(8);

/**
 * A contract rounding to a count neither the test contract nor the gate's
 * fixture uses, both of which round to two.
 *
 * Every run here is under it, because a projection that wrote the digit count
 * from anywhere but the run's own contract, a constant, the fixture, a
 * schedule, passed every test while the runs all rounded to two. The supplied
 * schedule follows it, since a schedule that disagrees with its contract is
 * refused before the first bar.
 */
const ODD: Contract = { ...CONTRACT, digits: 4 };
const ODD_SUPPLIED: ChargeSchedule = { ...SUPPLIED, digits: ODD.digits };

/**
 * A declared commission with a third decimal, so the count is visible in the
 * charge: 0.075 per fill at four digits, and 0.08 at two.
 */
const COMMISSION = 0.075;

/** The page whose section 6 prints the cap, read from the source tree. */
const CONFORMANCE = new URL('../../../spec/conformance.md', import.meta.url);

/** The file sections 2 and 3 give the three facts. */
const FILE = 'backtest.json';

const IDENTITY = {
  id: 'perf/in-and-out',
  description: 'A long entered on one bar and closed on another folds to one trade.',
};

/** What the file holds, as a reader parses it. */
interface BacktestFile {
  readonly digits: number;
  readonly costs: unknown;
  readonly range: { readonly from: number | null; readonly to: number | null };
}

/** A harvestable run under whatever settings a test chose, and the odd contract. */
function run(chosen: Omit<Partial<BacktestSettings>, 'contract'> = {}, commission = 0): RunRecord {
  const text = probeText({ commission });
  const out = backtest(compile('probe.oscript', text).program, BARS, settingsFor(ODD, chosen), {
    sourceText: text,
    instrument: FACTS,
  });
  assert.equal(out.ok, true, out.ok ? '' : out.diagnostic.message);
  if (!out.ok) throw new Error('the probe did not run');
  return out.record;
}

function filesOf(record: RunRecord): Readonly<Record<string, string>> {
  const made = caseFilesFrom(record, IDENTITY);
  if (!made.ok) throw new Error(made.reason);
  return made.files;
}

function backtestFile(record: RunRecord): BacktestFile {
  return JSON.parse(filesOf(record)[FILE] ?? '{}') as BacktestFile;
}

/**
 * The caps section 6 prints, read by the sentence that states them.
 *
 * A page that no longer prints the sentence is a failure and not an empty
 * cap, because a test that read nothing would hold the constants to nothing.
 */
function capsIn(page: string): { readonly rel: number; readonly abs: number } {
  const flat = page.replace(/\r\n/g, '\n').replace(/\n/g, ' ');
  const found = /caps a declared tolerance at `rel = ([0-9.e-]+)` and `abs = ([0-9.e-]+)`/.exec(flat);
  if (found === null) {
    throw new Error('conformance.md section 6 no longer prints the sentence that caps a declared tolerance');
  }
  const caps = { rel: Number(found[1]), abs: Number(found[2]) };
  assert.equal(Number.isFinite(caps.rel) && Number.isFinite(caps.abs), true, 'the caps are not numbers');
  return caps;
}

const CAPS = capsIn(readFileSync(CONFORMANCE, 'utf8'));

/** The charges figure of the one summary a case holds. */
function chargesIn(record: RunRecord): number | undefined {
  const expected = JSON.parse(filesOf(record)['expected.json'] ?? '{}') as {
    performance: readonly { charges: number }[];
  };
  return expected.performance[0]?.charges;
}

test('backtest.json carries the digits, the schedule and the window the report was folded under', () => {
  // Catches the projection this replaced, which wrote no such file, and one
  // that takes the digit count from anywhere but the run's own contract: the
  // count differs from the test contract's and the fixture's, and the charge
  // the run produced shows it was in force, two fills at 0.075 and not at the
  // 0.08 two digits would make of each. A run under no supplied schedule and
  // no stated window says so in the file rather than leaving a runner to
  // assume it.
  const record = run({}, COMMISSION);
  const held = backtestFile(record);
  assert.equal(held.digits, ODD.digits);
  assert.notEqual(held.digits, CONTRACT.digits, 'the run rounds to a count the test contract does not');
  assert.equal(chargesIn(record), 0.15);
  assert.equal(held.costs, null);
  assert.deepEqual(held.range, { from: null, to: null });
  assert.deepEqual(Object.keys(held).sort(), ['costs', 'digits', 'range']);
});

test('a run charged under a supplied schedule writes that schedule, and the figures it produced', () => {
  // The defect this file exists to close: a case that silently ran under
  // different costs. Catches a projection that writes null whatever the host
  // supplied, and the charges figure ties the file to the summary a second
  // engine is held to: two fills at fifteen each, which is the supplied
  // schedule and not the declaration's commission of zero.
  const record = run({ costs: ODD_SUPPLIED });
  assert.deepEqual(backtestFile(record).costs, ODD_SUPPLIED);
  assert.equal(backtestFile(record).digits, ODD.digits);
  assert.equal(chargesIn(record), 30);
});

test('a run reported over a window writes the window, and every bar it executed', () => {
  // Catches a projection that writes the whole range whatever the host stated,
  // and one that drops the warmup bars from bars.csv: every bar supplied
  // executes and only the window is reported, so a case has to carry both.
  const range = { from: START + 2 * HOUR, to: START + 6 * HOUR };
  const record = run({ range });
  assert.deepEqual(backtestFile(record).range, range);
  const rows = (filesOf(record)['bars.csv'] ?? '').trimEnd().split('\n');
  assert.equal(rows.length - 1, BARS.length);
});

test('a setting the case has no file for is refused by name, never carried silently', () => {
  // Catches a projection that writes the fields it knows and passes over the
  // rest, which is how three settings came to have no file in the first place.
  // A record read back from JSON is whatever was written, so the question is
  // asked of the record rather than of the type.
  const record = run();
  const stray = {
    ...record,
    settings: { ...record.settings, venue: 'simulated' },
  } as unknown as RunRecord;
  const made = caseFilesFrom(stray, IDENTITY);
  assert.equal(made.ok, false);
  if (made.ok) return;
  assert.equal(/venue/.test(made.reason), true, made.reason);
  assert.equal(made.code, null);
});

test('a record past the tolerance cap is refused with OS6021, and no file is written', () => {
  // Catches a projection that compares against the wrong bound (the two caps
  // differ by three orders of magnitude, so each is probed past on its own),
  // one that checks only the first bound it finds, and one that writes the
  // files and then refuses. The run itself accepts these bounds, because a
  // reasoned bound is a setting a run can be carried out under; the cap is the
  // suite's rule and not the run's.
  for (const tolerance of [
    { abs: CAPS.abs * 10, rel: 0, reason: 'past the absolute cap' },
    { abs: 0, rel: CAPS.rel * 10, reason: 'past the relative cap' },
    { abs: CAPS.abs, rel: CAPS.rel * 2, reason: 'at one cap and past the other' },
  ]) {
    const made = caseFilesFrom(run({ tolerance }), IDENTITY);
    assert.equal(made.ok, false, JSON.stringify(tolerance));
    if (made.ok) continue;
    assert.equal(made.code, 'OS6021');
    assert.equal('files' in made, false);
  }
});

test('a bound that is not a finite number is refused the same way', () => {
  // A record built in the same process can hold one, and JSON cannot carry it
  // at all, so a case would be written with a bound no runner could read.
  const record = run();
  const unbounded = {
    ...record,
    settings: { ...record.settings, tolerance: { abs: Infinity, rel: 0, reason: 'anything goes' } },
  };
  const made = caseFilesFrom(unbounded, IDENTITY);
  assert.equal(made.ok, false);
  assert.equal(made.ok === false && made.code, 'OS6021');
});

test('a tolerance at the cap is a conformance case, and case.json carries it', () => {
  // The boundary: catches a comparison written with the strict operator, which
  // would refuse the one tolerance the page says is the loosest allowed.
  const tolerance = { abs: CAPS.abs, rel: CAPS.rel, reason: 'an outside reference accumulates in another order' };
  const made = caseFilesFrom(run({ tolerance }), IDENTITY);
  assert.equal(made.ok, true, made.ok ? '' : made.reason);
  if (!made.ok) return;
  const declared = JSON.parse(made.files['case.json'] ?? '{}') as { tolerance: unknown };
  assert.deepEqual(declared.tolerance, tolerance);
});

test('the cap the projection enforces is the one section 6 prints', () => {
  // Core reads no page, so the figures are written in case.ts; this is what
  // holds them to the page. Catches a cap moved on the page without the
  // constant following, and the other way round.
  assert.deepEqual({ rel: TOLERANCE_CAP.rel, abs: TOLERANCE_CAP.abs }, CAPS);
});
