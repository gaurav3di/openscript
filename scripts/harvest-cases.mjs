/**
 * The conformance suite, harvested rather than written.
 *
 * `conformance.md` section 1 says a strategy case is harvested from a run and
 * not written by hand, because a case written by hand asserts what somebody
 * believed a run does and a harvested one asserts what an engine did, over bars
 * that existed, under settings somebody chose. `caseFilesFrom` does the
 * projection and writes nothing. This is the caller that decides where a case
 * lives, which is the one thing a record cannot know, and it runs the shipped
 * strategy examples for the reason the Phase 5 gate does: they are the
 * programs a stranger reads first and the ones nobody wrote to make a test
 * pass.
 *
 * Two modes, one script. Run bare it writes the case directory of every
 * strategy it can harvest that is not there yet, leaves one that is there and
 * agrees, and refuses one that is there and disagrees. Run with `--check` it
 * writes nothing and holds the tree to the run: every case it would write is
 * there, byte for byte, or the build fails. The second mode is the one
 * `npm test` runs, and it is what makes the suite a check rather than a
 * directory: the engine that wrote the cases still produces them, on every
 * machine that runs the gate.
 *
 * ## What is refused, by name
 *
 * - **A script that reaches a gap of `stdlib.md` section 20.11.** Section 8 of
 *   `conformance.md` admits no case whose value reaches an open gap, because
 *   the engine under test would be compared against arithmetic no document
 *   fixes and a correct engine could fail it. The reading of the table and of
 *   a script is the gate's own, loaded from the built test tree, so what the
 *   gate counts as reaching a gap is what this refuses. The script is named
 *   with the call that reached the gap; it is never passed over.
 * - **A strategy this driver cannot run**, which is a capability the host does
 *   not offer: reported with the capability named, counted separately, not a
 *   failure, as section 8 says of an unsupported case.
 * - **A strategy nobody has chosen a case id for.** Every id names a row of
 *   `feature-matrix.md`, because that page's rule 3 fails the build on a case
 *   directory no row names, and a shipped strategy this driver can run and no
 *   row claims is a decision somebody has to take rather than one this script
 *   takes for them.
 * - **A case that is there and disagrees with the run.** Section 10: a case is
 *   never edited to make an engine pass, and neither is it overwritten to make
 *   one. A disagreement between what is committed and what this engine
 *   produces is a defect in the engine or in the page, settled by reading the
 *   specification, and the case stays as it was until it is.
 * - **A run that harvests nothing.** A harvest that wrote no case and reported
 *   success would be the check this repository has already shipped four times,
 *   the one that inspected nothing.
 *
 * ## What is proved before anything is written
 *
 * That two runs of one script harvest to the same bytes. Each example is
 * compiled and run twice, independently, and the two sets of files are
 * compared before the first is written, because a case that differs between
 * two runs of the engine that wrote it is a case no engine can pass. The
 * cross-machine half of the same claim is `--check` on every `npm test`.
 *
 * And that the gap rule can refuse. Before the examples are read, the rule is
 * handed a script that calls a name the table lists, one that only mentions it
 * in a comment, and one that selects it by name in a string, and has to answer
 * each the way section 20.11 says: a rule that can no longer match is
 * indistinguishable from a clean tree.
 *
 * ## What holds the matrix to the tree
 *
 * `feature-matrix.md` rule 5: an `implemented` row names a test that exists and
 * passed. For every case this harvests, the row it names has to say
 * `implemented`, because the case exists and this engine reproduced it; and
 * every `implemented` row naming a case directory has to name one that is
 * there. Both are checked on every run. What this cannot check, and says so,
 * is a `unit:` row, whose test is a compiler unit test the runner proves, and
 * a case directory this script did not harvest, which is somebody else's to
 * vouch for.
 *
 * Run: node scripts/harvest-cases.mjs [--check]
 * Needs `npm run build` and `npm run build:test` first: it runs the compiler and
 * the engine, and reads the gate's own reading of section 20.11.
 */
import { existsSync, readFileSync } from 'node:fs';
import { CORE_MODULE, EMITTER_MODULE, GAPS_MODULE, fromRoot } from './lib/built.mjs';
import {
  CASES,
  CONFORMANCE,
  caseDirectories,
  caseDirectory,
  differences,
  notesFor,
  readCaseFiles,
  suiteDefaultFacts,
  writeCaseFiles,
} from './lib/case-directory.mjs';
import { IDENTITIES } from './lib/case-identities.mjs';
import { matrixRows } from './lib/catalogue.mjs';
import { frontEndWith } from './lib/example-run.mjs';
import { nothingFound } from './lib/files.mjs';
import { MATRIX } from './lib/raise-documents.mjs';
import {
  BAR_COUNT,
  CONTRACT,
  formulaBars,
  isStrategy,
  missingCapability,
  shippedExamples,
} from './lib/strategy-drive.mjs';

/** The page whose section 20.11 lists the gaps. */
const STDLIB = 'spec/stdlib.md';

/** The status rule 5 of the matrix is about. */
const IMPLEMENTED = 'implemented';

/** A test identifier the matrix says is a compiler unit test rather than a case. */
const UNIT = 'unit:';

const CHECK = process.argv.includes('--check');

function refuse(message) {
  console.error(message);
  process.exit(1);
}

function read(path) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

// ---------------------------------------------------------------- the modules

for (const module of [CORE_MODULE, GAPS_MODULE]) {
  if (existsSync(fromRoot(module))) continue;
  refuse(
    `${fromRoot(module)} is not built, so this harvest would run nothing.\n` +
      'Run `npm run build` and `npm run build:test` first. This runs the compiler and the\n' +
      "engine rather than reading them, and refuses a script by the gate's own reading of\n" +
      `${STDLIB} section 20.11, which is compiled with the tests.`,
  );
}

const core = await import(CORE_MODULE);
const emitter = await import(EMITTER_MODULE);
const gaps = await import(GAPS_MODULE);
const compile = frontEndWith(core, emitter);
const { backtest, caseFilesFrom, settingsFor } = core;

// ------------------------------------------------------------- the gaps table

const gapsText = gaps.gapsSection(read(STDLIB));
if (gapsText === null) {
  refuse(
    `${STDLIB} holds no section headed "${gaps.GAPS_HEADING.trim()}", so this harvest cannot ` +
      'say which scripts reach a gap and would admit every one of them.',
  );
}
const gapRows = gaps.gapRows(gapsText);
if (gapRows.length === 0) {
  refuse(
    `the section headed "${gaps.GAPS_HEADING.trim()}" in ${STDLIB} holds no table this can ` +
      'read, so nothing here can refuse a script that reaches a gap.',
  );
}

/** Every gap one script reaches, with the name it reached it through. */
function gapsReachedBy(name, text) {
  const script = gaps.readScript(name, text);
  return gapRows.flatMap((row) =>
    gaps.namesReached(row, script).map((reached) => ({ gap: row.gap, name: reached })),
  );
}

/**
 * The gap rule, attacked before it is trusted.
 *
 * The probes are built from the table rather than typed here, so a gap that
 * closes does not leave a probe asserting the table says something it no
 * longer does. A call reaches; a comment does not; a string does, because an
 * average selected by name is the same arithmetic as a call to it.
 */
function gapSelfTest() {
  const row = gapRows.find((one) => one.names.length > 0);
  if (row === undefined) return 0;
  const name = row.names[0];
  const probes = [
    { text: `x = ${name}(close)`, expect: [`${row.gap}:${name}`] },
    { text: `// ${name} of the close\nx = ema(close, 9)`, expect: [] },
    { text: `y = ma(close, 9, "${name}")`, expect: [`${row.gap}:${name}`] },
  ];
  const broken = [];
  for (const probe of probes) {
    const found = gapsReachedBy('probe', probe.text).map((one) => `${one.gap}:${one.name}`);
    if (found.join(',') !== probe.expect.join(',')) {
      broken.push(`  ${JSON.stringify(probe.text)} reached ${found.join(', ') || 'nothing'}`);
    }
  }
  if (broken.length === 0) return probes.length;
  refuse(
    'The gap rule in this file no longer does what it says:\n\n' +
      broken.join('\n') +
      '\n\nA rule that can no longer match is indistinguishable from a clean tree, and every\n' +
      'case this wrote from then on would be admitted under arithmetic no document fixes.',
  );
  return 0;
}

const probed = gapSelfTest();

// ---------------------------------------------------------------- the matrix

/** Every feature row that names a test identifier, by that identifier. */
const rowsByTest = new Map();
for (const row of matrixRows(read(MATRIX))) {
  if (row.test === null) continue;
  const held = rowsByTest.get(row.test) ?? [];
  held.push(row);
  rowsByTest.set(row.test, held);
}
if (rowsByTest.size === 0) refuse(nothingFound(`feature row naming a test in ${MATRIX}`));

// --------------------------------------------------------------- the fixture

const bars = formulaBars(BAR_COUNT);
const facts = suiteDefaultFacts(read(CONFORMANCE), CONTRACT);
if (facts === null) {
  refuse(
    `${CONFORMANCE} section 3 no longer prints the instrument a runner assumes of a case ` +
      'that states none, so this harvest has no facts to state beside the contract.',
  );
}

// The interval the page states has to be the spacing the fixture has, or the
// case would carry an instrument that disagrees with its own bars. Only the
// bare-minute spelling is read here; the page writes that one.
const minutes = Number(facts.interval);
const spacing = bars[1].time - bars[0].time;
if (!Number.isFinite(minutes) || minutes * 60_000 !== spacing) {
  refuse(
    `${CONFORMANCE} section 3 states an interval of ${JSON.stringify(facts.interval)} and the ` +
      `fixture's bars are ${spacing / 60_000} minutes apart. A case whose instrument ` +
      'disagrees with its bars is a case about the disagreement.',
  );
}

/** One example run, harvested to files, or the reason it was not. */
function harvestOnce(example, identity) {
  const compiled = compile(example.name, example.text);
  const run = backtest(compiled.program, bars, settingsFor(CONTRACT), {
    sourceText: example.text,
    instrument: facts,
  });
  if (!run.ok) return { ok: false, diagnostic: run.diagnostic };
  const made = caseFilesFrom(run.record, { id: identity.id, description: identity.description });
  if (!made.ok) return { ok: false, reason: made.reason };
  const files = {
    ...made.files,
    'notes.md': notesFor(identity, {
      path: example.path,
      bars: run.record.bars.rows.length,
      orders: run.record.orders.length,
      trades: run.record.report.trades.length,
    }),
  };
  return { ok: true, files };
}

// -------------------------------------------------------------------- the run

const problems = [];
const unsupported = [];
const refused = [];
const harvested = [];
const written = [];
const unchanged = [];
/** What became of each example this run, by name, for the rule that finds orphans. */
const outcome = new Map();
let studies = 0;

for (const example of shippedExamples()) {
  const { name, path, text } = example;
  const compiled = compile(name, text);
  if (compiled.diagnostics.some((one) => one.severity === 'error')) {
    problems.push(`${path}: does not compile, so nothing can be harvested from it.`);
    continue;
  }
  if (!isStrategy(compiled.program)) {
    studies += 1;
    continue;
  }

  const reached = gapsReachedBy(name, text);
  if (reached.length > 0) {
    const through = reached.map((one) => `${one.gap} through ${one.name}`).join(', ');
    refused.push(`${path}: reaches gap ${through}`);
    outcome.set(name, `reaches gap ${through}`);
    continue;
  }

  // A strategy nobody has chosen a case id for is refused by name, as the
  // header promises. The alternative, a fallback identity built from the file
  // name, is not a case: the id is not under any area the matrix lists, it has
  // no reason for existing, and the notes writer fell over on the absence with
  // a stack trace where a sentence belonged.
  const identity = IDENTITIES.find((one) => one.example === name);
  if (identity === undefined) {
    refused.push(`${path}: no case identity chosen for it in scripts/lib/case-identities.mjs`);
    outcome.set(name, 'no case identity chosen');
    continue;
  }
  const first = harvestOnce(example, identity);
  if (!first.ok && first.diagnostic !== undefined) {
    const capability = missingCapability(first.diagnostic);
    if (capability !== null) {
      unsupported.push(`${path}: ${capability}`);
      outcome.set(name, `needs ${capability}, which this driver cannot supply`);
      continue;
    }
    problems.push(`${path}: the run could not start: ${first.diagnostic.code}.`);
    continue;
  }
  if (identity === undefined) {
    problems.push(
      `${path}: is a strategy this driver can run, and no case id is chosen for it. Add it to ` +
        `IDENTITIES in scripts/lib/case-identities.mjs naming the ${MATRIX} row it proves, or ` +
        'say why it is not a case.',
    );
    continue;
  }
  if (!first.ok) {
    problems.push(`${path}: cannot become a case: ${first.reason}.`);
    continue;
  }

  const rows = rowsByTest.get(identity.id) ?? [];
  if (rows.length !== 1) {
    problems.push(
      `${identity.id}: ${rows.length === 0 ? 'no row' : `${rows.length} rows`} of ${MATRIX} ` +
        `name${rows.length === 1 ? 's' : ''} it, and a case is one row. Rule 3 of that page ` +
        'fails the build on a case directory no row names.',
    );
    continue;
  }

  // The same script again, from its text, and the two compared before either is
  // written: a case that differs between two runs of its own engine is a case
  // no engine can pass.
  const second = harvestOnce(example, identity);
  const unstable = second.ok ? differences(first.files, second.files) : ['the second run failed'];
  if (unstable.length > 0) {
    problems.push(
      `${path}: two runs of the same script harvest to different bytes (${unstable.join('; ')}), ` +
        'so what it produces is not a case.',
    );
    continue;
  }

  const directory = caseDirectory(identity.id);
  const held = readCaseFiles(directory);
  if (held === null) {
    if (CHECK) {
      problems.push(
        `${directory}/ does not exist, and this engine harvests it from ${path}. Run ` +
          'node scripts/harvest-cases.mjs to write it, then commit it.',
      );
      continue;
    }
    writeCaseFiles(directory, first.files);
    written.push(identity.id);
  } else {
    const differing = differences(first.files, held);
    if (differing.length > 0) {
      problems.push(
        `${directory}/: what is on disk is not what this engine produces from ${path}: ` +
          `${differing.join('; ')}. conformance.md section 10: a case is never edited to make ` +
          'an engine pass, and it is not overwritten to make one either. Read the ' +
          'specification against the engine, and correct whichever is wrong with a reviewed ' +
          'explanation.',
      );
      outcome.set(name, 'disagrees with its directory');
      continue;
    }
    unchanged.push(identity.id);
  }
  outcome.set(name, 'harvested');
  harvested.push({ identity, row: rows[0], path });
}

// ---------------------------------------------- the matrix, held to the tree

for (const { identity, row, path } of harvested) {
  if (row.status === IMPLEMENTED) continue;
  problems.push(
    `${MATRIX}:${row.line}: "${row.feature}" is \`${row.status}\` and names ${identity.id}, ` +
      `which exists and which this engine reproduced from ${path} this run. Rule 5 of that ` +
      `page: the row is \`${IMPLEMENTED}\` now, and not before.`,
  );
}

// A directory this script wrote once and produced nothing for this run: the
// example was refused, cannot run here, or is gone. A disagreement was
// reported above and is not reported twice.
const vouched = new Set(harvested.map((one) => one.identity.id));
for (const identity of IDENTITIES) {
  if (vouched.has(identity.id) || !existsSync(caseDirectory(identity.id))) continue;
  const became = outcome.get(identity.example) ?? 'is not a shipped strategy this driver ran';
  if (became === 'disagrees with its directory') continue;
  problems.push(
    `${caseDirectory(identity.id)}/ exists and nothing harvested it this run: ` +
      `${identity.example} ${became}. A case nothing produces is one nothing stands behind, ` +
      'and conformance.md section 11 says a case is in practice never removed: settle what ' +
      'changed rather than deleting the directory.',
  );
}

const directories = caseDirectories();
for (const found of directories) {
  if (found.claimed !== found.id) {
    problems.push(
      `${found.directory}/case.json says its id is ${JSON.stringify(found.claimed)} and the ` +
        `directory is ${found.id}. conformance.md section 2: the two are the same string, so a ` +
        'moved directory is caught here rather than by a confused reader.',
    );
  }
  if (!rowsByTest.has(found.id)) {
    problems.push(
      `${found.directory}/ is a case directory no row of ${MATRIX} names. Rule 3 of that page: ` +
        'coverage that no feature claims is coverage that proves nothing.',
    );
  }
}

const implementedCases = [...rowsByTest.entries()]
  .filter(([test]) => !test.startsWith(UNIT))
  .filter(([, rows]) => rows.some((row) => row.status === IMPLEMENTED))
  .map(([test]) => test);
for (const test of implementedCases) {
  if (existsSync(caseDirectory(test))) continue;
  problems.push(
    `${MATRIX}: a row is \`${IMPLEMENTED}\` and names ${test}, and ${caseDirectory(test)}/ does ` +
      'not exist. Rule 5 of that page: an implemented row names a test that exists.',
  );
}

if (harvested.length === 0) {
  problems.push(nothingFound('shipped strategy example that this engine can harvest'));
}

// ----------------------------------------------------------------- the report

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(
    `\n${problems.length} problem${problems.length === 1 ? '' : 's'} with the harvested suite. ` +
      'A case the engine that wrote it no longer produces, or a row that claims a case nothing ' +
      'stands behind, is a suite that proves the second engine against nothing.',
  );
  process.exit(1);
}

const named = (list) => (list.length === 0 ? '' : `:\n${list.map((one) => `  ${one}`).join('\n')}`);
const others = directories.filter((found) => !vouched.has(found.id)).map((found) => found.id);
const unitRows = [...rowsByTest.keys()].filter((test) => test.startsWith(UNIT)).length;

console.log(
  `Harvest${CHECK ? ' check' : ''} passed: ${harvested.length} ` +
    `case${harvested.length === 1 ? '' : 's'} (${written.length} written, ` +
    `${unchanged.length} already there and identical) from the ` +
    `shipped strategies over ${BAR_COUNT} bars, under the gate's placeholder contract and the ` +
    `instrument facts ${CONFORMANCE} section 3 assumes of a case that states none. Each was ` +
    'harvested twice to the same bytes, compared with its directory byte for byte, and names ' +
    `a row of ${MATRIX} marked \`${IMPLEMENTED}\`; the gap rule was attacked with ${probed} ` +
    `probes first, and ${gapRows.length} gaps of ${STDLIB} section 20.11 were read. ` +
    `${studies} example${studies === 1 ? '' : 's'} are studies that place no orders.`,
);
if (unsupported.length > 0) {
  console.log(
    `\n${unsupported.length} shipped ` +
      `strateg${unsupported.length === 1 ? 'y needs' : 'ies need'} a capability this driver ` +
      `cannot supply and cannot be harvested here${named(unsupported)}`,
  );
}
if (refused.length > 0) {
  console.log(
    `\n${refused.length} shipped strateg${refused.length === 1 ? 'y reaches' : 'ies reach'} ` +
      `a gap and cannot be a case until the gap closes (conformance.md section 8)` +
      named(refused),
  );
}
console.log(
  `\nWhat this does not prove: that a second engine passes these cases, which is Phase 6; the ` +
    `${unitRows} \`${UNIT}\` rows, whose tests the unit runner proves; and ${others.length} case ` +
    `director${others.length === 1 ? 'y' : 'ies'} under ${CASES}/ that this script did not ` +
    `harvest${named(others)}`,
);
