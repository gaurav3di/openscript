/**
 * A conformance case as a directory on disk, and what the suite gives a case
 * that states nothing about its instrument.
 *
 * `caseFilesFrom` returns text and writes nothing, because core does no I/O.
 * This is the other half: where a case lives, what is already there, whether
 * the two agree, and the one file the projection cannot write because a record
 * does not know why it was harvested, which is `notes.md`.
 *
 * ## What is compared, and how
 *
 * Bytes. A case is compared as text by every runner, `conformance.md` section
 * 3 fixes the line ending of `bars.csv` as LF, and a file that differs by a
 * carriage return is a file a runner reads differently. So nothing here
 * normalises what it reads back: the working tree is held to what the harvest
 * wrote, and a checkout that rewrote a case's line endings is a defective case
 * rather than noise to be forgiven.
 *
 * ## The instrument facts beside the contract
 *
 * `conformance.md` section 3 prints the instrument a runner assumes of a case
 * whose `instrument.json` is absent, chosen to be boring rather than realistic.
 * The harvest states those same facts beside the gate's contract, read out of
 * the page, so a harvested case runs under the suite's own defaults and the
 * page stays the one place they are written. The contract's own facts are
 * left out of what is read, because `backtest` takes the six the contract
 * does not hold and the compiler refuses the rest.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Where the suite lives, named from the repository root. */
export const CASES = 'cases';

/** The page whose section 3 states the suite's default instrument. */
export const CONFORMANCE = 'spec/conformance.md';

/** The heading the default block sits under, in section 3 of that page. */
const FACTS_HEADING = '### Instrument facts';

/** The first fenced JSON block after a point in a page. */
const JSON_FENCE = /```json\n([\s\S]*?)\n```/;

/**
 * The instrument facts section 3 assumes of a case that states none, less the
 * ones the contract holds, or null when the page no longer prints the block.
 *
 * Null rather than an empty record, because an empty record would state no
 * volume flag and a case cannot be made without one: the caller says what a
 * missing block costs. `contract` is the money layer's contract, whose keys
 * decide what is left out, so the partition of `host-interface.md` 4.1 into
 * the six the contract holds and the six beside it is read from the contract
 * rather than written here a second time.
 */
export function suiteDefaultFacts(page, contract) {
  const text = page.replace(/\r\n/g, '\n');
  const at = text.indexOf(FACTS_HEADING);
  if (at === -1) return null;
  const fence = JSON_FENCE.exec(text.slice(at + FACTS_HEADING.length));
  if (fence === null) return null;
  const block = JSON.parse(fence[1]);
  const facts = {};
  for (const [key, value] of Object.entries(block)) {
    if (!(key in contract)) facts[key] = value;
  }
  return facts;
}

/** The directory a case id names, relative to the repository root. */
export function caseDirectory(id) {
  return join(CASES, ...id.split('/')).split('\\').join('/');
}

/**
 * Every case directory under the suite, by id, with what its `case.json`
 * claims to be.
 *
 * A directory is a case when it holds a `case.json`, which section 2 requires
 * of every case. The claimed id travels back so a caller can hold it to the
 * directory: section 2 duplicates the id on purpose, so a directory moved
 * without its id being changed is caught.
 */
export function caseDirectories() {
  const out = [];
  walk(CASES, '', out);
  return out.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function walk(dir, id, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  if (entries.some((entry) => entry.isFile() && entry.name === 'case.json')) {
    let claimed = null;
    try {
      claimed = JSON.parse(readFileSync(join(dir, 'case.json'), 'utf8')).id ?? null;
    } catch {
      claimed = null;
    }
    out.push({ id, directory: dir.split('\\').join('/'), claimed });
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    walk(join(dir, entry.name), id === '' ? entry.name : `${id}/${entry.name}`, out);
  }
}

/**
 * What a case directory holds, file by file and byte for byte, or null when
 * there is no such directory.
 *
 * Every file, not only the ones section 2 names, because a file the table
 * does not name is not input and a runner reads no other file: one left in the
 * directory is either a case's file under the wrong name or a stray, and both
 * are reported rather than passed over.
 */
export function readCaseFiles(directory) {
  if (!existsSync(directory)) return null;
  const files = {};
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    files[entry.name] = readFileSync(join(directory, entry.name), 'utf8');
  }
  return files;
}

/** The files of one case, written where its id says, as the bytes given. */
export function writeCaseFiles(directory, files) {
  mkdirSync(directory, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(directory, name), text, 'utf8');
  }
}

/**
 * How two sets of case files differ: by name, in a stable order.
 *
 * Three ways, each named, because the fix is different for each. A file the
 * run produces and the directory lacks is a case a runner cannot run. A file
 * the directory holds and the run does not produce is one nothing here wrote.
 * A file both hold with different bytes is the disagreement the suite exists
 * to surface, and it is never settled by editing the file.
 */
export function differences(produced, held) {
  const names = [...new Set([...Object.keys(produced), ...Object.keys(held)])].sort();
  const out = [];
  for (const name of names) {
    if (!(name in held)) out.push(`${name} is missing from the directory`);
    else if (!(name in produced)) {
      out.push(`${name} is in the directory and this run did not produce it`);
    }
    else if (produced[name] !== held[name]) out.push(`${name} differs`);
  }
  return out;
}

/**
 * The one file a record cannot write.
 *
 * Section 2 gives `notes.md` one job: why the case exists and what it is
 * defending against. A record knows what a run produced and not why anybody
 * kept it, so that part comes from whoever chose the case id, and the rest is
 * what a reader of the directory would otherwise have to work out: where the
 * bars came from, which is section 3's rule for market data answered, what the
 * instrument is, and what to do when the case fails. Nothing here varies
 * between two harvests of one run, because the file is compared as bytes with
 * the rest.
 */
export function notesFor(identity, run) {
  const rows = run.orders === 1 ? '1 ledger row' : `${run.orders} ledger rows`;
  const trades = run.trades === 1 ? '1 trade' : `${run.trades} trades`;
  return [
    `# ${identity.id}`,
    '',
    ...wrap(
      `Harvested from \`${run.path}\` by \`scripts/harvest-cases.mjs\`, which is the only ` +
        'thing that writes here. `conformance.md` section 1 says a strategy case is harvested ' +
        'from a run rather than written by hand, and section 10 says a case is never edited to ' +
        'make an engine pass: the files beside this one are what a run produced, and a change ' +
        'to any of them is a change to what the run produced.',
    ),
    '',
    '## Why this case exists',
    '',
    ...wrap(identity.why),
    '',
    '## What it defends against',
    '',
    ...wrap(identity.defends),
    '',
    '## What the run produced',
    '',
    ...wrap(
      `${run.bars} bars, ${rows}, ${trades} and the summary of the run, all in ` +
        '`expected.json`, with the frames the destination answered in `frames.csv`.',
    ),
    '',
    '## Where the bars came from',
    '',
    ...wrap(
      'A fixed formula and not a market: a wave with a trend under it and a range around ' +
        'each close, hourly from one instant, which is the fixture the Phase 5 gate drives ' +
        'every shipped strategy over (`scripts/lib/strategy-drive.mjs`). Nobody holds rights ' +
        "over them, so section 3's rule for bars that come from a market has nothing to " +
        'record here.',
    ),
    '',
    '## The instrument',
    '',
    ...wrap(
      '`instrument.json` is the record the engine was handed, as section 2 requires. The ' +
        "contract in it is the gate's placeholder, priced in a currency nobody issues, and " +
        'the facts beside the contract are the defaults section 3 gives a case that states ' +
        'none, read from that page when the case was harvested rather than chosen here. They ' +
        'are boring on purpose, so this case is about the strategy and not about a session ' +
        'rule.',
    ),
    '',
    '## When it fails',
    '',
    ...wrap(
      'Section 10 has the procedure. Running the harvest again reproduces these bytes from ' +
        'this engine or refuses to overwrite them, and a refusal is a disagreement to settle ' +
        'by reading the specification against both engines, never by editing the case. ' +
        'Nothing here asserts a value that reaches a gap of `stdlib.md` section 20.11: the ' +
        'harvest refuses a script that does, by name.',
    ),
    '',
  ].join('\n');
}

/** Prose folded at a column a reader can follow, one paragraph in, lines out. */
function wrap(paragraph, width = 80) {
  const lines = [];
  let line = '';
  for (const word of paragraph.split(' ')) {
    if (line.length > 0 && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line.length === 0 ? word : `${line} ${word}`;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}
