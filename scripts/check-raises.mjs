/**
 * Raise check: a documented refusal is a refusal something can raise.
 *
 * `scripts/check-error-codes.mjs` proves that every code a page cites exists in
 * the catalogue. This proves the other direction, which is the one that was
 * missing: that every code the catalogue documents as current behaviour can
 * actually happen.
 *
 * The two are not the same guarantee and the difference is not academic. A whole
 * thousand block of this catalogue was written, given messages and fixes and
 * worked examples, cited across five documents in the present tense, recorded in
 * the feature matrix, and raised by no line of code anywhere. Every citation of
 * it resolved. Every page that taught it looked right. The only thing wrong with
 * it was that none of it happened, and nothing in the repository was asking that
 * question.
 *
 * `spec/errors.md` section 5 already asked for this check in words: "An entry
 * here that no code path can emit also fails the build, naming the code." A
 * promise in a document is worth the attention of whoever reads it next, and
 * nobody read that one for long enough that the first run of this check found 26
 * codes taught as current behaviour with nothing anywhere able to raise them.
 *
 * ## The three states, which are not the same
 *
 * A code is in exactly one of these, and the whole design is about keeping the
 * third from existing.
 *
 * **Raised.** Some file under `src` hands the code to a call. The documentation
 * describes something that happens.
 *
 * **Deferred.** The catalogue entry carries a `deferred` field saying, in a
 * sentence, that nothing raises this yet and what has to exist before anything
 * does. The documentation describes something the implementation has not reached
 * and says so where the reader of the catalogue will see it.
 *
 * **Neither**, which is the defect. The catalogue teaches a refusal as current
 * behaviour and no code path can produce it. A reader writes a script relying on
 * being stopped, and is not stopped.
 *
 * ## Why the deferral lives in the catalogue and not in this file
 *
 * The obvious shape for this check is a list of codes it is allowed to skip.
 * That shape is how this class of defect comes back, and this repository has
 * already watched a test grow a skip for exactly the case it existed to catch.
 * A list here is read by nobody: it is invisible to the person reading the
 * catalogue entry, invisible to the documentation that teaches the code, and it
 * grows by one line each time somebody is in a hurry.
 *
 * So the deferral is a field on the entry. It is in the file the catalogue is
 * generated from, it is repeated in the prose catalogue where a reader meets the
 * code, and it is carried into the feature matrix as a status of its own. Adding
 * one is an edit to the specification that a reviewer sees. And it expires by
 * itself: the moment something raises the code, this check fails until the
 * deferral is removed, so a deferral cannot outlive the gap it describes.
 *
 * Run: node scripts/check-raises.mjs [--list]
 * Exit code 1 on any hit.
 */
import { readFileSync } from 'node:fs';
import { filesMatching, nothingFound } from './lib/files.mjs';
import { raiseSites } from './lib/raise-sites.mjs';

const CATALOGUE = 'spec/errors.json';
const PROSE = 'spec/errors.md';
const MATRIX = 'spec/feature-matrix.md';

/** The shipped source. Tests and fixtures are not evidence about the product. */
const SOURCE_ROOTS = ['src'];

/** The status a feature matrix row carries when the catalogue defers its code. */
const DEFERRED_STATUS = 'deferred';

/** Shorter than this is a flag rather than a reason, whatever it says. */
const REASON_LENGTH = 40;

const CODE = /OS\d{4}/g;

const problems = [];
const fail = (message) => problems.push(message);

// ---------------------------------------------------------------- the sources

/** The catalogue, which is the only place a deferral is declared. */
function catalogue() {
  const parsed = JSON.parse(readFileSync(CATALOGUE, 'utf8'));
  const entries = parsed.entries ?? [];
  if (entries.length === 0) {
    fail(`${CATALOGUE} holds no entries. Run this from the repository root.`);
  }
  return entries;
}

/**
 * The prose catalogue's entries, each with the deferral paragraph it carries.
 *
 * The prose catalogue is what a person reads when they look a code up, so a
 * deferral that is only in the machine copy is a deferral the reader never sees,
 * and the page goes on teaching a refusal that does not happen.
 */
function prose() {
  const text = readFileSync(PROSE, 'utf8');
  const lines = text.split('\n');
  const entries = new Map();
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const heading = /^### (OS\d{4})\s+(.+?)\s*$/.exec(lines[i]);
    if (heading) {
      current = { code: heading[1], line: i + 1, deferred: null, deferredLine: 0 };
      entries.set(heading[1], current);
      continue;
    }
    const deferral = /^\*\*Deferred\.\*\*\s+(.+?)\s*$/.exec(lines[i]);
    if (deferral && current !== null) {
      current.deferred = deferral[1];
      current.deferredLine = i + 1;
    }
  }

  if (entries.size === 0) fail(`${PROSE} defines no entries. Expected "### OSxxxx <heading>" lines.`);
  return entries;
}

/**
 * The feature matrix's feature rows.
 *
 * A feature row is five cells with a backticked status in the third, which is
 * the matrix's own definition of one. The first two cells are the promise: what
 * the feature is called and what it does. The fourth cites the sections that
 * define it. A code named in the promise is a claim about behaviour; a code
 * cited in the fourth is a reference, which is why only the first two are read
 * here. A row can point at a refusal it deliberately does not raise.
 */
function matrix() {
  const text = readFileSync(MATRIX, 'utf8');
  const lines = text.split('\n');
  const rows = [];
  let section = '';

  for (let i = 0; i < lines.length; i++) {
    const heading = /^#{2,3}\s+(\d+\..*)$/.exec(lines[i]);
    if (heading) section = heading[1];
    if (!lines[i].startsWith('|')) continue;

    const cells = lines[i].split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 5) continue;
    const status = /^`([a-z]+)`$/.exec(cells[2]);
    if (status === null) continue;

    rows.push({
      line: i + 1,
      section,
      feature: cells[0],
      status: status[1],
      promised: named(`${cells[0]} ${cells[1]}`),
    });
  }

  if (rows.length === 0) fail(`${MATRIX} holds no feature rows. Run this from the repository root.`);
  return rows;
}

/** Every catalogue code a piece of text names, without duplicates. */
function named(text) {
  return [...new Set([...text.matchAll(CODE)].map((match) => match[0]))];
}

// ----------------------------------------------------------------- the rules

/**
 * Rule 1. Every entry is raised, or says in the catalogue why it is not.
 *
 * Both directions, because a deferral that outlives the gap is the same defect
 * read the other way round: the catalogue would tell a reader the refusal does
 * not happen while it does, and they would write a script around a stop that
 * fires.
 */
function checkRaised(entries, byCode) {
  let raised = 0;
  let deferred = 0;

  for (const entry of entries) {
    const sites = byCode.get(entry.code) ?? [];
    const reason = entry.deferred;

    if (reason === undefined || reason === null) {
      if (sites.length === 0) {
        fail(
          `${CATALOGUE}: ${entry.code} "${entry.title}" is documented as current behaviour and ` +
            `nothing raises it. No file under ${SOURCE_ROOTS.join(', ')} hands this code to a call, ` +
            `so no program can produce it, and every page that teaches it is describing something ` +
            `that does not happen. Either raise it where ${entry.spec} says it is raised, or give ` +
            `the entry a "deferred" field saying what has to exist first.`,
        );
      } else {
        raised++;
      }
      continue;
    }

    if (sites.length > 0) {
      const where = sites.map((site) => `${site.file}:${site.line}`).join(', ');
      fail(
        `${CATALOGUE}: ${entry.code} "${entry.title}" carries a deferral and ${where} raises it. ` +
          `A deferral says the refusal does not happen yet; this one is out of date, and the ` +
          `catalogue is now telling a reader that a stop they will hit cannot occur. Remove the ` +
          `"deferred" field.`,
      );
      continue;
    }

    if (typeof reason !== 'string' || reason.trim().length < REASON_LENGTH || !reason.trim().endsWith('.')) {
      fail(
        `${CATALOGUE}: ${entry.code}'s deferral is not a reason. It has to be a sentence of at ` +
          `least ${REASON_LENGTH} characters ending in a full stop, saying what happens instead ` +
          `today and what has to exist before the code is raised. A deferral nobody can act on is ` +
          `the exemption list this field exists to avoid, moved into the specification.`,
      );
      continue;
    }

    deferred++;
  }

  return { raised, deferred };
}

/**
 * Rule 2. Nothing raises a code the catalogue does not hold.
 *
 * The generated types make this hard to do by accident, because the code
 * argument is typed to the catalogue. It is checked anyway: the generated types
 * are one build away from being stale, and this costs one comparison.
 */
function checkDocumented(entries, byCode) {
  const known = new Set(entries.map((entry) => entry.code));
  for (const [code, sites] of byCode) {
    if (known.has(code)) continue;
    const where = sites.map((site) => `${site.file}:${site.line}`).join(', ');
    fail(
      `${where}: raises ${code}, which ${CATALOGUE} does not define. A diagnostic with no ` +
        `catalogue entry reaches a reader as a number with nothing behind it. Add the entry, or ` +
        `raise the code whose entry describes what went wrong.`,
    );
  }
}

/**
 * Rule 3. The prose catalogue says the same thing as the machine one.
 *
 * The two files state the same facts and are edited by hand, so the deferral is
 * a fact in two places. That is a duplication this project would normally refuse
 * outright, and it is allowed here only because this check compares them on
 * every run: the copy that drifts fails the build rather than misleading a
 * reader, which is the same bargain the rest of the repository makes.
 */
function checkProse(entries, pages) {
  for (const entry of entries) {
    const page = pages.get(entry.code);
    if (page === undefined) {
      fail(
        `${PROSE}: has no entry for ${entry.code}, which ${CATALOGUE} defines. Every code a ` +
          `reader can be shown has a page they can look it up on.`,
      );
      continue;
    }

    const reason = entry.deferred ?? null;
    if (reason === null && page.deferred !== null) {
      fail(
        `${PROSE}:${page.deferredLine}: ${entry.code} is marked deferred here and is not deferred ` +
          `in ${CATALOGUE}. The machine catalogue is what the check reads, so this paragraph ` +
          `warns a reader off a refusal that the build believes happens. Remove it, or defer the ` +
          `entry in ${CATALOGUE} as well.`,
      );
      continue;
    }
    if (reason !== null && page.deferred === null) {
      fail(
        `${PROSE}:${page.line}: ${entry.code} is deferred in ${CATALOGUE} and this page does not ` +
          `say so. This is the page somebody reads when they look the code up, and as it stands ` +
          `it teaches a refusal that nothing raises. Add "**Deferred.** " with the same sentence, ` +
          `under the entry's first line.`,
      );
      continue;
    }
    if (reason !== null && page.deferred !== reason) {
      fail(
        `${PROSE}:${page.deferredLine}: ${entry.code}'s deferral does not match ${CATALOGUE}. ` +
          `Two sentences that disagree are two readers with different expectations. ` +
          `The catalogue says: ${reason}`,
      );
    }
  }
}

/**
 * Rule 4. The feature matrix carries the deferral too.
 *
 * The matrix is the document somebody consults to decide what they can rely on,
 * and its `specified` means a section defines the behaviour, which is true of a
 * refusal nothing raises. True and misleading: 645 of its 680 rows said
 * `specified` the day this was written, so the word had become the matrix's way
 * of saying "this is how it works". A
 * row promising a refusal that no code path can produce has to say so in the
 * status column, where a reader is already looking.
 */
function checkMatrix(entries, rows) {
  const deferred = new Set(entries.filter((entry) => entry.deferred != null).map((entry) => entry.code));
  let marked = 0;

  for (const row of rows) {
    const promised = row.promised.filter((code) => deferred.has(code));

    if (promised.length > 0 && row.status !== DEFERRED_STATUS) {
      fail(
        `${MATRIX}:${row.line}: section ${row.section}, "${row.feature}" is \`${row.status}\` and ` +
          `promises ${promised.join(', ')}, which ${CATALOGUE} defers. A reader takes this row as ` +
          `a refusal they can rely on. Mark the row \`${DEFERRED_STATUS}\`.`,
      );
      continue;
    }

    if (promised.length === 0 && row.status === DEFERRED_STATUS) {
      fail(
        `${MATRIX}:${row.line}: section ${row.section}, "${row.feature}" is ` +
          `\`${DEFERRED_STATUS}\` and names no code that ${CATALOGUE} defers. Either the deferral ` +
          `ended, in which case the row moves on, or the row names the wrong code.`,
      );
      continue;
    }

    if (promised.length > 0) marked++;
  }

  return marked;
}

// ------------------------------------------------------------------- the run

const entries = catalogue();
const pages = prose();
const rows = matrix();

const files = filesMatching(/\.ts$/, SOURCE_ROOTS);
if (files.length === 0) {
  console.error(nothingFound(`TypeScript files under ${SOURCE_ROOTS.join(', ')}`));
  process.exit(1);
}

const { byCode, read, literals } = raiseSites(files);

// A scan that breaks makes codes look unraised, not raised, so most ways of
// blinding this check already fail it loudly, once per code. The one shape that
// would not is a scan that found nothing at all in a file list it did read,
// because then the first rule would report all 145 and somebody would read that
// as one broken scan rather than 145 findings. It is caught here instead, and
// said in one sentence.
if (byCode.size === 0) {
  console.error(
    `No raise site was found in any of ${read} files, which cannot be true of a compiler that ` +
      `reports diagnostics. Something in the scan is broken, and a check that inspects nothing ` +
      `reports success for everything.`,
  );
  process.exit(1);
}

const { raised, deferred } = checkRaised(entries, byCode);
checkDocumented(entries, byCode);
checkProse(entries, pages);
const marked = checkMatrix(entries, rows);

if (process.argv.includes('--list')) {
  for (const entry of entries) {
    const sites = byCode.get(entry.code) ?? [];
    const state = entry.deferred != null ? 'deferred' : sites.length > 0 ? 'raised  ' : 'NEITHER ';
    const where = sites.length > 0 ? `${sites[0].file}:${sites[0].line}` : (entry.deferred ?? '');
    console.log(`${state} ${entry.code}  ${where}`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(
    `\n${problems.length} problem${problems.length === 1 ? '' : 's'}. A code documented as ` +
      `current behaviour that no code path raises is a promise nothing keeps, and it reads as ` +
      `authoritative to everyone who meets it.`,
  );
  process.exit(1);
}

console.log(
  `Raise check passed: ${entries.length} catalogue codes, ${raised} raised from ${read} source ` +
    `files (${literals} string literals read), ${deferred} deferred in ${CATALOGUE} with a reason ` +
    `and repeated in ${PROSE}, ${marked} feature matrix row${marked === 1 ? '' : 's'} marked ` +
    `\`${DEFERRED_STATUS}\`. Nothing is documented as current behaviour with no way to happen.`,
);
