/**
 * Matrix check: the feature matrix is bound to the tests and the pages it
 * cites on every run, rather than trusted to be.
 *
 * `spec/feature-matrix.md` opens with "The rule continuous integration
 * enforces": six things true of every feature row and four that fail the
 * build. That preamble was written before anything read it. The one reader the
 * file had, `lib/raise-documents.mjs`, asks it a single question, whether a
 * `deferred` row and the catalogue agree, so a citation to a section that had
 * been renumbered, an identifier under no listed area and two rows claiming
 * one test each resolved to nothing and failed nothing. The preamble's own
 * words for the first: it is the failure the file was rebuilt to remove, and
 * the reason the checker resolves every citation on every run rather than
 * trusting the text. This is that checker.
 *
 * ## What is read out of the page rather than typed here
 *
 * The status words, from the table under "Status values"; the five column
 * names and the two heading shapes, from the preamble's own sentences; the
 * areas, from the "Areas:" sentence under "Test identifiers", read the way
 * `tests/backtest/case.test.ts` reads it. A sentence this check cannot find is
 * a refusal, not a pass with an empty list: an empty list of statuses accepts
 * no row and an empty list of areas refuses every identifier. The rows come
 * from `lib/catalogue.mjs`, so the rows counted here are the rows the deferral
 * rule and the harvest read. That reader returns no Section cell, so the one
 * cell is taken from the same line by the same split, and a table line under a
 * numbered section the reader dropped is reported under rule 1 rather than
 * lost, because a row with four cells or a Status that is not one backticked
 * word is exactly the row a reader cannot return.
 *
 * ## Existence, not passing
 *
 * Rule 5 says an `implemented` row names a test that exists and passed in this
 * run. This check proves existence and says so. A `unit:` identifier exists
 * when a file under `tests/` writes it, in the way a catalogue entry's test has
 * only to write the code: proof that a reader chasing the row is sent
 * somewhere, not proof of what they find. Any other identifier exists when
 * `cases/<identifier>/` is a case directory, one holding the `case.json` that
 * `conformance.md` section 2 requires. Passing is the unit runner's job and
 * the suite's, which run beside this in `npm test`.
 *
 * ## The direction of the binding
 *
 * The paragraph "One thing conformance.md says too broadly" settles which way
 * the case-to-row binding runs. A case directory no row names fails the build,
 * unconditionally. A row naming a case that is not written fails only when the
 * row says `implemented`: the Test cell of a `specified` or `planned` row
 * reserves an identifier, and reserving is not claiming. Such rows are counted
 * and printed and are not failures, because a check that failed every planned
 * row would make the matrix a record of the suite rather than a plan for it.
 *
 * ## What it does not reach, and says
 *
 * Rule 6, that a `deferred` row and the catalogue agree, is
 * `check-raises.mjs`'s and is not enforced twice. Whether a `planned` row's
 * citation names the feature without defining it is a reading of prose and
 * stays attention. A directory under `cases/` with no `case.json` is not a case
 * and is counted rather than resolved. Every rule is attacked before a row is
 * read: each is handed a row it must refuse and one it must accept, over a
 * document and a tree that exist only in the probe, so correcting the matrix or
 * harvesting a case cannot silently disarm a rule.
 *
 * Run: node scripts/check-matrix.mjs
 * Exit code 1 on any hit, or when no feature row was read.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CASES, caseDirectories, caseDirectory } from './lib/case-directory.mjs';
import { matrixRows } from './lib/catalogue.mjs';
import { filesMatching, nothingFound } from './lib/files.mjs';
import { CODE } from './lib/pages.mjs';
import { MATRIX } from './lib/raise-documents.mjs';

/** Where a cited document lives, and where a unit test is looked for. */
const SPEC = 'spec';
const TESTS = 'tests';

/** The statuses the rules single out, and the Section cell that cites nothing. */
const IMPLEMENTED = 'implemented';
const PLANNED = 'planned';
const NONE = '`none`';

/** The prefix that makes an identifier a unit test rather than a case. */
const UNIT = 'unit:';

/** A section locator is digits separated by dots; a code locator is a catalogue code. */
const SECTION_LOCATOR = /^\d+(?:\.\d+)*$/;
const CODE_LOCATOR = new RegExp(`^${CODE.source}$`);

/** The name half of an identifier, and the whole: `<area>/<name>`, prefixed or not. */
const NAME_CHARS = '[a-z0-9-]';
const NAME = new RegExp(`^${NAME_CHARS}+$`);
const IDENTIFIER = new RegExp(`^(${UNIT})?([^/]+)/(.+)$`);

/** A numbered section heading, as the reader in `lib/catalogue.mjs` takes one. */
const NUMBERED = /^#{2,3}\s+(\d+\..*)$/;

/** The dashes row a Markdown table puts under its header. */
const DASHES = /^\|[\s:|-]+\|$/;

/** The sentences and the table the preamble states its inputs in. */
const STATUS_TABLE = '## Status values';
const COLUMNS = /five cells, in order: ([^.]+)\./;
const SECTION_SHAPE = /a section number matches the regular expression `([^`]+)`/;
const CODE_SHAPE = /an error code matches `([^`]+)`/;
const AREAS = /Areas: ((?:`[a-z]+`,? ?)+)\./;

/** What has to be escaped to put a locator into a shape as itself. */
const ESCAPE = /[.*+?^${}()|[\]\\]/g;

const problems = [];
const fail = (message) => problems.push(message);

function refuse(message) {
  console.error(message);
  process.exit(1);
}

function cellsOf(line) {
  return line.split('|').slice(1, -1).map((cell) => cell.trim());
}

function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

/** One problem, named the way the preamble asks: the section, the feature and the rule. */
function at(row, rule, text) {
  return `${MATRIX}:${row.line}: section ${row.section}, "${row.feature}", rule ${rule}: ${text}.`;
}

// ---------------------------------------------------------------- the sources

/**
 * What the preamble states, read out of it. Every input is a sentence or a
 * table of the page, so a page that no longer prints one is refused by name,
 * and a shape that is not a regular expression is a sentence to correct rather
 * than a stack trace.
 */
function preambleOf(page, lines) {
  const flat = page.replace(/\s+/g, ' ');
  const table = lines.indexOf(STATUS_TABLE);
  const statuses = [];
  for (let i = table + 1; table !== -1 && i < lines.length && !lines[i].startsWith('## '); i++) {
    const word = /^`([a-z]+)`$/.exec(cellsOf(lines[i])[0] ?? '');
    if (word !== null) statuses.push(word[1]);
  }
  const found = { columns: COLUMNS.exec(flat), section: SECTION_SHAPE.exec(flat), code: CODE_SHAPE.exec(flat), areas: AREAS.exec(flat) };
  const missing = [
    statuses.length === 0 ? `a "${STATUS_TABLE}" table with a backticked word in its first column` : null,
    found.columns === null ? 'the sentence "five cells, in order: ..."' : null,
    found.section === null ? 'the sentence "a section number matches the regular expression `...`"' : null,
    found.code === null ? 'the sentence "an error code matches `...`"' : null,
    found.areas === null ? 'the sentence "Areas: `...`."' : null,
  ].filter((one) => one !== null);
  if (missing.length > 0) {
    refuse(
      `${MATRIX} no longer prints what this check reads its rules from:\n${missing.map((one) => `  ${one}`).join('\n')}\n` +
        'The page is the one place each is stated, so this refuses rather than running on an empty list.',
    );
  }
  const shapes = { section: found.section[1], code: found.code[1] };
  try {
    new RegExp(shapes.section.replace('<locator>', '1'));
    new RegExp(shapes.code.replace('<code>', 'OS0000'));
  } catch (error) {
    refuse(`${MATRIX}: a heading shape the preamble prints is not a regular expression: ${error.message}`);
  }
  return {
    statuses: new Set(statuses),
    columns: found.columns[1].split(', '),
    shapes,
    areas: new Set([...found.areas[1].matchAll(/`([a-z]+)`/g)].map((one) => one[1])),
  };
}

/** Every Markdown document under spec/, by name, as the heading lines it holds. */
function documentsIn() {
  const documents = new Map();
  for (const name of readdirSync(SPEC)) {
    if (!name.endsWith('.md')) continue;
    const text = readFileSync(join(SPEC, name), 'utf8').replace(/\r\n/g, '\n');
    documents.set(name, text.split('\n').filter((line) => line.startsWith('#')));
  }
  return documents;
}

/** The text of every file under tests/, which is where a unit identifier is written. */
function testTexts() {
  const files = filesMatching(/./, [TESTS]);
  if (files.length === 0) refuse(nothingFound(`files under ${TESTS}/`));
  return files.map((file) => readFileSync(file, 'utf8'));
}

/** Every table line under a numbered section, tracked the way the reader tracks it. */
function tableLines(lines) {
  const out = [];
  let section = null;
  for (let i = 0; i < lines.length; i++) {
    const heading = NUMBERED.exec(lines[i]);
    if (heading !== null) section = heading[1];
    if (section !== null && lines[i].startsWith('|')) out.push({ line: i + 1, section, text: lines[i] });
  }
  return out;
}

// ------------------------------------------------------------------ the rules

/**
 * The citations a Section cell makes, or null when the cell is not the shape
 * rule 2 gives: `none`, or citations separated by a comma and a space, each a
 * document in backticks followed by at most one locator after one space.
 */
function citationsIn(cell) {
  if (cell === NONE) return [];
  const out = [];
  for (const piece of cell.split(', ')) {
    const found = /^`([^`\s]+)`(?: (\S+))?$/.exec(piece);
    if (found === null) return null;
    const locator = found[2] ?? null;
    if (locator !== null && !SECTION_LOCATOR.test(locator) && !CODE_LOCATOR.test(locator)) return null;
    out.push({ document: found[1], locator });
  }
  return out;
}

/** Why one citation does not resolve, or null when it does. Build failure 2. */
function unresolved(world, citation) {
  const headings = world.documents.get(citation.document);
  if (headings === undefined) {
    return `cites \`${citation.document}\`, and there is no such Markdown document under ${SPEC}/. A citation to a document that does not exist is a build failure, not a promise`;
  }
  if (citation.locator === null) return null;
  const shape = CODE_LOCATOR.test(citation.locator)
    ? world.shapes.code.replace('<code>', citation.locator)
    : world.shapes.section.replace('<locator>', citation.locator.replace(ESCAPE, '\\$&'));
  const pattern = new RegExp(shape);
  if (headings.some((heading) => pattern.test(heading))) return null;
  return (
    `cites \`${citation.document}\` ${citation.locator}, and no heading of ${SPEC}/${citation.document} matches ${shape}. ` +
    'This is the failure the page was rebuilt to remove: a locator that reads as proof and resolves to nothing. ' +
    'Cite the heading that defines the feature'
  );
}

/** Rule 1. Status is a word the page's own table lists. */
function checkStatus(row, world) {
  if (world.statuses.has(row.status)) return [];
  const listed = [...world.statuses].map((one) => `\`${one}\``).join(', ');
  return [at(row, 1, `Status \`${row.status}\` is not one the "Status values" table lists (${listed})`)];
}

/** Rule 2. The Section cell is citations, and every one resolves. */
function checkCitations(row, world) {
  const citations = citationsIn(row.sectionCell);
  if (citations === null) {
    return [
      at(row, 2, `Section "${row.sectionCell}" is neither ${NONE} nor citations separated by a comma and a space, each a document in backticks followed by at most one locator, a section number or an error code`),
    ];
  }
  return citations.map((one) => unresolved(world, one)).filter((why) => why !== null).map((why) => at(row, 2, why));
}

/** Rule 3. A row that is not planned cites something. */
function checkCited(row) {
  if (row.status === PLANNED || row.sectionCell !== NONE) return [];
  return [
    at(row, 3, `is \`${row.status}\` and cites no section. Only a \`${PLANNED}\` row may say ${NONE}: every other status claims that a section defines the behaviour, so name it`),
  ];
}

/** Rule 4, the shape half. One identifier, under a listed area, named in the listed characters. */
function checkIdentifier(row, world) {
  if (row.test === null) return [at(row, 4, 'the Test cell is not exactly one identifier in backticks')];
  const found = IDENTIFIER.exec(row.test);
  if (found === null) return [at(row, 4, `\`${row.test}\` is not of the form <area>/<name> or ${UNIT}<area>/<name>`)];
  if (!world.areas.has(found[2])) {
    return [
      at(row, 4, `\`${row.test}\` is under the area \`${found[2]}\`, which the "Areas:" sentence under "Test identifiers" does not list. Add the area there, or file the test under one it lists`),
    ];
  }
  if (!NAME.test(found[3])) return [at(row, 4, `\`${row.test}\`'s name is not lowercase letters, digits and hyphens`)];
  return [];
}

/** Rule 4, the uniqueness half, over every row at once. Build failure 4. */
function checkUnique(rows) {
  const seen = new Map();
  const out = [];
  for (const row of rows) {
    if (row.test === null) continue;
    const first = seen.get(row.test);
    if (first === undefined) {
      seen.set(row.test, row);
      continue;
    }
    out.push(
      at(row, 4, `names \`${row.test}\`, which line ${first.line} (section ${first.section}, "${first.feature}") already names. One test proves one row, so one of the two needs an identifier of its own`),
    );
  }
  return out;
}

/** Rule 5, the half a reader can settle. An implemented row names a test that exists. */
function checkExists(row, world) {
  if (row.status !== IMPLEMENTED || row.test === null) return [];
  if (row.test.startsWith(UNIT)) {
    const written = new RegExp(`${row.test.replace(ESCAPE, '\\$&')}(?!${NAME_CHARS})`);
    if (world.unitTexts.some((text) => written.test(text))) return [];
    return [
      at(row, 5, `is \`${IMPLEMENTED}\` and no file under ${TESTS}/ writes \`${row.test}\`. A unit test exists here when a test file writes the identifier, so write it in the test that proves the row, or take the row back to the status the tree supports`),
    ];
  }
  if (world.cases.has(row.test)) return [];
  return [
    at(row, 5, `is \`${IMPLEMENTED}\` and ${caseDirectory(row.test)}/ is not a case directory: there is no case.json there, which conformance.md section 2 requires of every case. Harvest the case, or take the row back to the status the tree supports`),
  ];
}

/** Build failure 3. Every case directory is named by a row. */
function checkClaimed(rows, world) {
  const named = new Set(rows.map((row) => row.test));
  return [...world.cases]
    .filter((id) => !named.has(id))
    .map((id) => `${caseDirectory(id)}/ is a case directory no row of ${MATRIX} names. Coverage that no feature claims is coverage that proves nothing: add the row it proves, under the identifier the directory path spells.`);
}

// -------------------------------------------------------------- the self test

/**
 * Every rule, attacked before any row is read: each is handed a row it must
 * refuse and one it must accept, over a document and a tree that exist only
 * here, so a correction to the matrix or a case harvested tomorrow cannot
 * disarm a rule without this noticing. The heading shapes are the page's own,
 * because they are how a citation is resolved and a shape that stopped telling
 * `1.2` from `1.3` is what this has to catch. The pair that matters most is
 * the last: a `planned` or `specified` row naming an unwritten case is
 * accepted, which is the direction the preamble settles.
 */
function selfTest(shapes) {
  const world = {
    statuses: new Set(['specified', IMPLEMENTED, PLANNED]),
    areas: new Set(['lex']),
    shapes,
    documents: new Map([['probe.md', ['## 1. One', '### 1.2 Two', '### OS0001 Probe']]]),
    unitTexts: ['assert.ok(program, "unit:lex/written proves the row");'],
    cases: new Set(['lex/written']),
  };
  const row = (over) => ({ line: 0, section: '0. Probe', feature: 'probe', status: 'specified', sectionCell: '`probe.md` 1.2', test: 'lex/written', ...over });
  const probes = [
    [checkStatus, 1, row({}), 0],
    [checkStatus, 1, row({ status: 'done' }), 1],
    [checkCitations, 2, row({ sectionCell: NONE }), 0],
    [checkCitations, 2, row({ sectionCell: '`probe.md`' }), 0],
    [checkCitations, 2, row({ sectionCell: '`probe.md` 1, `probe.md` OS0001' }), 0],
    [checkCitations, 2, row({ sectionCell: '`absent.md` 1' }), 1],
    [checkCitations, 2, row({ sectionCell: '`probe.md` 1.3' }), 1],
    [checkCitations, 2, row({ sectionCell: '`probe.md` OS0002' }), 1],
    [checkCitations, 2, row({ sectionCell: 'probe.md 1.2' }), 1],
    [checkCitations, 2, row({ sectionCell: '`probe.md` 1.2 and 1.3' }), 1],
    [checkCited, 3, row({ status: PLANNED, sectionCell: NONE }), 0],
    [checkCited, 3, row({ sectionCell: NONE }), 1],
    [checkIdentifier, 4, row({ test: 'unit:lex/a-1' }), 0],
    [checkIdentifier, 4, row({ test: null }), 1],
    [checkIdentifier, 4, row({ test: 'ta/a' }), 1],
    [checkIdentifier, 4, row({ test: 'lex/A_1' }), 1],
    [checkIdentifier, 4, row({ test: 'lex' }), 1],
    [checkUnique, 4, [row({ line: 1 }), row({ line: 2, test: 'lex/other' })], 0],
    [checkUnique, 4, [row({ line: 1 }), row({ line: 2 })], 1],
    [checkExists, 5, row({ status: IMPLEMENTED, test: 'unit:lex/written' }), 0],
    [checkExists, 5, row({ status: IMPLEMENTED, test: 'unit:lex/unwritten' }), 1],
    [checkExists, 5, row({ status: IMPLEMENTED }), 0],
    [checkExists, 5, row({ status: IMPLEMENTED, test: 'lex/unwritten' }), 1],
    [checkClaimed, 'build failure 3', [row({})], 0],
    [checkClaimed, 'build failure 3', [row({ test: 'lex/other' })], 1],
    [checkExists, 5, row({ status: PLANNED, test: 'lex/unwritten' }), 0],
    [checkExists, 5, row({ test: 'lex/unwritten' }), 0],
  ];
  const broken = [];
  for (const [rule, number, input, wrong] of probes) {
    const found = rule(input, world).length;
    if (found === wrong) continue;
    const shown = Array.isArray(input) ? input.map((one) => one.test) : { status: input.status, section: input.sectionCell, test: input.test };
    broken.push(`  rule ${number}: ${JSON.stringify(shown)} (${found} reported, ${wrong} expected)`);
  }
  if (broken.length === 0) return probes.length;
  refuse(
    `The rules in this file no longer do what they say:\n${broken.join('\n')}\n\n` +
      'A rule that cannot refuse is indistinguishable from a clean matrix, and a rule that refuses ' +
      'every planned row makes the matrix a record of the suite rather than a plan for it.',
  );
  return 0;
}

// -------------------------------------------------------------------- the run

const page = readFileSync(MATRIX, 'utf8').replace(/\r\n/g, '\n');
const lines = page.split('\n');
const preamble = preambleOf(page, lines);
const probed = selfTest(preamble.shapes);

const world = { ...preamble, documents: documentsIn(), unitTexts: testTexts(), cases: new Set(caseDirectories().map((one) => one.id)) };

const accepted = new Map(matrixRows(page).map((row) => [row.line, row]));
const rows = [];
const sections = new Set();
for (const entry of tableLines(lines)) {
  if (DASHES.test(entry.text)) continue;
  const cells = cellsOf(entry.text);
  if (DASHES.test(lines[entry.line] ?? '')) {
    if (cells.join('|') !== world.columns.join('|')) {
      fail(`${MATRIX}:${entry.line}: section ${entry.section}: this table's header is not the five columns the preamble names, in order: ${world.columns.join(', ')}.`);
    }
    continue;
  }
  const row = accepted.get(entry.line);
  if (row === undefined) {
    const why = cells.length === 5 ? `Status "${cells[2]}" is not one word in backticks` : `${cells.length} cells, and a feature row has five`;
    fail(at({ line: entry.line, section: entry.section, feature: cells[0] ?? '' }, 1, why));
    continue;
  }
  sections.add(entry.section);
  rows.push({ ...row, sectionCell: cells[3] });
}
if (rows.length === 0) refuse(nothingFound(`feature row under a numbered section of ${MATRIX}`));

let citations = 0;
const cited = new Set();
for (const row of rows) {
  for (const citation of citationsIn(row.sectionCell) ?? []) {
    citations += 1;
    cited.add(citation.document);
  }
  for (const problem of [...checkStatus(row, world), ...checkCitations(row, world), ...checkCited(row), ...checkIdentifier(row, world), ...checkExists(row, world)]) {
    fail(problem);
  }
}
for (const problem of [...checkUnique(rows), ...checkClaimed(rows, world)]) fail(problem);

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(
    `\n${plural(problems.length, 'problem')} in ${MATRIX}. A row that cites a heading that is not there, or names a test ` +
      'that is not, reads as proof to everyone who consults it, and this matrix is the page a reader consults to decide ' +
      'what they can rely on.',
  );
  process.exit(1);
}

// ----------------------------------------------------------------- the report

const perStatus = [...world.statuses].map((status) => `${rows.filter((row) => row.status === status).length} ${status}`);
const implemented = rows.filter((row) => row.status === IMPLEMENTED);
const percent = ((100 * implemented.length) / rows.length).toFixed(1);
const unitRows = implemented.filter((row) => row.test.startsWith(UNIT)).length;

const unwritten = (row) => row.status !== IMPLEMENTED && !row.test.startsWith(UNIT) && !world.cases.has(row.test);
const reserved = rows.filter(unwritten).length;
const written = rows.filter((row) => row.status !== IMPLEMENTED && world.cases.has(row.test)).map((row) => row.test);
const caseDirs = new Set(caseDirectories().map((one) => one.directory));
const strays = [...new Set(filesMatching(/./, [CASES]).map((file) => file.slice(0, file.lastIndexOf('/'))))].filter((dir) => !caseDirs.has(dir));
const listed = (ids) => (ids.length === 0 ? '' : `: ${ids.join(', ')}`);

console.log(
  `Matrix check passed: ${rows.length} feature rows under ${sections.size} numbered sections of ${MATRIX}: ` +
    `${perStatus.join(', ')}. Implemented ratio ${implemented.length} of ${rows.length} (${percent}%). Every row has ` +
    `the five cells and a status the page lists; ${citations} citations resolve to a heading in ${cited.size} of the ` +
    `${world.documents.size} documents under ${SPEC}/; every identifier is well formed under one of ${world.areas.size} ` +
    `listed areas and no two rows share one; each implemented row names a test that exists (${unitRows} written in ` +
    `${TESTS}/, ${plural(implemented.length - unitRows, 'case directory', 'case directories')}); and each of ` +
    `${plural(world.cases.size, 'case directory', 'case directories')} under ${CASES}/ is named by a row. The rules ` +
    `were attacked with ${probed} probes first.`,
);
console.log(
  `\nWhat this does not prove: that a named test passes, which the unit runner and the suite prove; rule 6, the ` +
    `deferral binding, which check-raises.mjs enforces; and whether a \`${PLANNED}\` row's citation names the feature ` +
    `without defining it, which is a reading of prose. ${plural(reserved, 'row')} not yet implemented reserve${reserved === 1 ? 's' : ''} a case ` +
    `identifier whose directory is not written, which rule 5 does not fail; ${plural(written.length, 'such row')} ` +
    `name${written.length === 1 ? 's' : ''} a case that is written${listed(written)}; and ` +
    `${plural(strays.length, 'directory', 'directories')} under ${CASES}/ hold${strays.length === 1 ? 's' : ''} files ` +
    `and no case.json, so ${strays.length === 1 ? 'it is not a case' : 'they are not cases'}` +
    `${listed(strays)}.`,
);
