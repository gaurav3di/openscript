/**
 * The three settings `backtest.json` carries, read by the adapter and never
 * assumed: `conformance.md` section 3.
 *
 * The adapter once took the digit count from the gate's fixture, no charge
 * schedule and the whole window, and passed every harvested case, because
 * every harvested case had been run under exactly those. A suite that passes
 * by coincidence is the badge section 12 says is not a claim. So each case
 * here is made in this process from a run under a setting the fixture does not
 * use, through the same projection the harvest uses, and is checked first to
 * differ from the run under the fixture's value: a case that would pass either
 * way proves nothing, and the test says so rather than passing.
 *
 * The wrong adapters these catch, each by name: one that takes the digit count
 * from anywhere but the file; one that reads the digit count and not the
 * schedule; one that reads both and runs over the whole window; and one that
 * runs a strategy case with no file under a default, which the page says is
 * never done.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { Contract } from '../../src/core/accounting/index.js';
import { backtest, caseFilesFrom, settingsFor } from '../../src/core/backtest/index.js';
import type { BacktestSettings, CaseFiles } from '../../src/core/backtest/index.js';
import { CONTRACT, FACTS, HOUR, START, SUPPLIED, probeText, rising } from '../backtest/support.js';
import { compile } from '../engine/support.js';
import { runSuite, temporarySuite } from './support.js';
import type { CaseRow } from './support.js';

const BARS = rising(8);

/** A digit count neither the gate's fixture nor the test contract rounds to. */
const ODD: Contract = { ...CONTRACT, digits: 4 };

/** The file section 3 gives the three facts, and the one this file is about. */
const FILE = 'backtest.json';

/** The file the digit count moves a figure in. */
const EXPECTED = 'expected.json';

interface Made {
  readonly id: string;
  readonly files: CaseFiles;
}

/**
 * One case, projected from a run under the given contract and settings.
 *
 * `commission` is the declaration's, at a value with a third decimal so the
 * digit count decides the charge: at two digits it rounds to 0.08 per fill,
 * at four it stays 0.075.
 */
function made(
  id: string,
  contract: Contract,
  chosen: Omit<Partial<BacktestSettings>, 'contract'>,
  commission = 0,
): Made {
  const text = probeText({ commission });
  const run = backtest(compile('probe.oscript', text).program, BARS, settingsFor(contract, chosen), {
    sourceText: text,
    instrument: FACTS,
  });
  assert.equal(run.ok, true, run.ok ? '' : run.diagnostic.message);
  if (!run.ok) throw new Error('unreachable');
  const projected = caseFilesFrom(run.record, { id, description: `A probe under a setting the fixture does not use: ${id}.` });
  assert.equal(projected.ok, true, projected.ok ? '' : projected.reason);
  if (!projected.ok) throw new Error('unreachable');
  return { id, files: projected.files };
}

/** The guard: a case whose expected file the setting does not move proves nothing. */
function differing(one: Made, other: Made): Made {
  assert.notEqual(
    one.files[EXPECTED],
    other.files[EXPECTED],
    `${one.id}: the run under the setting and the run under the fixture's value expect the same file, so the case cannot catch an adapter that assumes`,
  );
  return one;
}

/** Every case this file makes: one per setting, each differing from the fixture's run. */
function cases(): readonly Made[] {
  const fixture = made('settings/fixture', CONTRACT, {}, 0.075);
  return [
    differing(made('settings/digits', ODD, {}, 0.075), fixture),
    differing(made('settings/costs', CONTRACT, { costs: SUPPLIED }), made('settings/fixture', CONTRACT, {})),
    differing(
      made('settings/range', CONTRACT, { range: { from: START + 5 * HOUR, to: START + 7 * HOUR } }),
      made('settings/fixture', CONTRACT, {}),
    ),
  ];
}

function rowOf(rows: readonly CaseRow[], id: string): CaseRow {
  const row = rows.find((one) => one.id === id);
  assert.notEqual(row, undefined, `the document has no row for ${id}`);
  return row as CaseRow;
}

test('a case run under a digit count, a schedule or a window the fixture does not use passes, because the adapter reads backtest.json', () => {
  const suite = temporarySuite();
  try {
    const all = cases();
    for (const one of all) {
      assert.equal(one.files[FILE] !== undefined, true, `${one.id} carries no ${FILE}`);
      suite.write(one.id, one.files);
    }
    const run = runSuite(['--cases', suite.root]);
    const document = run.document;
    assert.notEqual(document, null, 'the runner wrote no document');
    if (document === null) return;
    for (const one of all) {
      const row = rowOf(document.cases, one.id);
      assert.equal(row.outcome, 'pass', `${one.id}: ${row.reason ?? row.feature ?? `${row.channel ?? ''} ${row.column ?? ''}`}`);
    }
    assert.equal(run.status, 0, run.stderr);
  } finally {
    suite.remove();
  }
});

test('a negative digit count is the error outcome, not a case run under it', () => {
  // Written into the adapter and held by nothing until now. A digit count is a
  // number of decimal places; below zero it is not a rounding rule a case can
  // be run under, and passing it through would round money by a scale nobody
  // stated.
  const suite = temporarySuite();
  try {
    const one = made('settings/digits', ODD, {}, 0.075);
    suite.write(one.id, one.files);
    suite.rewrite(one.id, FILE, (held: Record<string, unknown>) => {
      held['digits'] = -1;
    });
    const run = runSuite(['--cases', suite.root]);
    assert.equal(run.status, 1);
    const row = rowOf(run.document?.cases ?? [], one.id);
    assert.equal(row.outcome, 'error');
    assert.equal(/digits/.test(row.reason ?? ''), true, row.reason);
  } finally {
    suite.remove();
  }
});

test('a strategy case without backtest.json is the error outcome, never a run under a default', () => {
  const suite = temporarySuite();
  try {
    const one = made('settings/digits', ODD, {}, 0.075);
    suite.write(one.id, one.files);
    suite.drop(one.id, FILE);
    const run = runSuite(['--cases', suite.root]);
    assert.equal(run.status, 1);
    const row = rowOf(run.document?.cases ?? [], one.id);
    assert.equal(row.outcome, 'error');
    assert.equal(/backtest\.json/.test(row.reason ?? ''), true, row.reason);
    assert.equal(/section 3/.test(row.reason ?? ''), true, row.reason);
  } finally {
    suite.remove();
  }
});

test('a backtest.json that is not section 3\'s shape is the error outcome, naming the field', () => {
  // Catches an adapter that reads the fields it knows and passes over the
  // rest, which is how a case comes to run under something it does not state.
  const suite = temporarySuite();
  try {
    const one = made('settings/digits', ODD, {}, 0.075);
    suite.write(one.id, one.files);
    for (const [change, named] of [
      [(held: Record<string, unknown>): void => { held['digits'] = 2.5; }, /digits/],
      [(held: Record<string, unknown>): void => { held['range'] = { from: 'monday', to: null }; }, /range\.from/],
      [(held: Record<string, unknown>): void => { held['venue'] = 'simulated'; }, /venue/],
    ] as const) {
      suite.write(one.id, one.files);
      suite.rewrite(one.id, FILE, change);
      const run = runSuite(['--cases', suite.root]);
      const row = rowOf(run.document?.cases ?? [], one.id);
      assert.equal(row.outcome, 'error', row.reason);
      assert.equal(named.test(row.reason ?? ''), true, row.reason);
    }
  } finally {
    suite.remove();
  }
});
