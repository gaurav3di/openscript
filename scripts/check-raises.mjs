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
 * ## Raised, and raised where the entry says it is raised
 *
 * "Somewhere under `src`" is one step short of the question. A code handed to a
 * call anywhere in the repository passes that test, including when the path the
 * specification names produces nothing at all: one call site raises it for one
 * case, the entry's own section describes another, and the second is a promise
 * nothing keeps while the first keeps the check green. That is not a variant of
 * the defect this file was written for. It is the same defect, one step over.
 *
 * So every entry names the part of the system its code comes from, in its
 * `stage`, and the sites are counted against that part rather than against the
 * tree. `STAGE_SOURCE` below is where each stage lives in this implementation.
 * It is a map of the layout, in the same spirit as the layer list in
 * `check-layering.mjs`, and it is not an exemption list: no entry can be named
 * in it, and nothing in it can excuse a code. All it decides is where the check
 * looks, and looking in the wrong place is the failure it exists to end.
 *
 * ## Every page that teaches, not the two that define
 *
 * The same one step over, in the documentation. A deferral declared in the
 * catalogue and repeated in the prose catalogue and the feature matrix is
 * invisible on the twelve other pages where a reader actually meets the code,
 * and those pages go on teaching the refusal in the present tense. The first run
 * of the widened rule found five deferred order codes taught as current
 * behaviour on eight pages, the first strategy guide among them, so a reader
 * following the guide most likely to be their first was told a refusal protected
 * them and it did not.
 *
 * The rule is narrow on purpose. A page may name a deferred code: a table of
 * every code in a range is a reasonable page to write. What it may not do is say
 * the code happens today, and the sentence that says so is the unit, because a
 * sentence is what a reader reads. `lib/pages.mjs` holds the reading of it.
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
import { matrixRows, prosePages } from './lib/catalogue.mjs';
import {
  CATALOGUE,
  DEFERRED_STATUS,
  MATRIX,
  PROSE,
  checkMatrix,
  checkPages,
  checkProse,
} from './lib/raise-documents.mjs';
import { raiseSites } from './lib/raise-sites.mjs';

/** The shipped source. Tests and fixtures are not evidence about the product. */
const SOURCE_ROOTS = ['src'];

/**
 * Where each stage of the catalogue lives in this implementation.
 *
 * The catalogue's `stage` is what a reader is told produced their diagnostic,
 * and it is therefore also the claim this check holds the source to. A stage
 * with no directory here would silently match nothing, so the run below refuses
 * a stage the catalogue declares and this map does not.
 *
 * `runtime` and `host` share the engine because it is one program: the engine is
 * what executes a bar and it is also what the host answers, and no line of it
 * belongs to only one of the two. `host` reaches two more directories, because
 * what a host states about a run is no longer only bars and frames: a run is
 * carried out under settings, a charge schedule among them, and the money layer
 * is where a schedule that cannot be carried out is refused. `check` is the
 * checker alone, and
 * not the emitter behind it: the emitter has refusals of its own and a code only
 * it can raise is a code the catalogue is describing to the wrong reader.
 */
const STAGE_SOURCE = {
  lex: ['src/core/lex'],
  parse: ['src/core/parse'],
  check: ['src/core/check'],
  runtime: ['src/core/engine'],
  host: ['src/core/engine', 'src/core/accounting', 'src/core/backtest'],
};

/** Shorter than this is a flag rather than a reason, whatever it says. */
const REASON_LENGTH = 40;

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

/** The prose catalogue's entries, each with the deferral paragraph it carries. */
function prose() {
  const entries = prosePages(readFileSync(PROSE, 'utf8'));
  if (entries.size === 0) fail(`${PROSE} defines no entries. Expected "### OSxxxx <heading>" lines.`);
  return entries;
}

/** The feature matrix's feature rows, which are its promises about behaviour. */
function matrix() {
  const rows = matrixRows(readFileSync(MATRIX, 'utf8'));
  if (rows.length === 0) fail(`${MATRIX} holds no feature rows. Run this from the repository root.`);
  return rows;
}

// ----------------------------------------------------------------- the rules

/** The sites that sit in the part of the source a stage names. */
function within(sites, stage) {
  const roots = STAGE_SOURCE[stage] ?? [];
  return sites.filter((site) => {
    const path = site.file.split('\\').join('/');
    return roots.some((root) => path === root || path.startsWith(`${root}/`));
  });
}

/** A list of sites as a report names them. */
function where(sites) {
  return sites.map((site) => `${site.file}:${site.line}`).join(', ');
}

/**
 * Rule 1. Every entry is raised at the stage it names, or says why it is not.
 *
 * Both directions, because a deferral that outlives the gap is the same defect
 * read the other way round: the catalogue would tell a reader the refusal does
 * not happen while it does, and they would write a script around a stop that
 * fires.
 */
function checkRaised(entries, byCode) {
  let raised = 0;
  let deferred = 0;
  let crossed = 0;

  for (const entry of entries) {
    const sites = byCode.get(entry.code) ?? [];
    const here = within(sites, entry.stage);
    const reason = entry.deferred;
    crossed += sites.length - here.length;

    if (reason === undefined || reason === null) {
      if (here.length === 0) {
        const elsewhere =
          sites.length === 0
            ? `No file under ${SOURCE_ROOTS.join(', ')} hands this code to a call at all`
            : `It is raised at ${where(sites)}, which is not the ${entry.stage} stage`;
        fail(
          `${CATALOGUE}: ${entry.code} "${entry.title}" is documented as current behaviour of the ` +
            `${entry.stage} stage and nothing there raises it. ${elsewhere}, so the path ` +
            `${entry.spec} describes produces nothing and every page that teaches it is describing ` +
            `something that does not happen. Raise it where ${entry.spec} says it is raised, or ` +
            `correct the entry: its stage, or a "deferred" field saying what has to exist first.`,
        );
      } else {
        raised++;
      }
      continue;
    }

    if (sites.length > 0) {
      fail(
        `${CATALOGUE}: ${entry.code} "${entry.title}" carries a deferral and ${where(sites)} raises it. ` +
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

  return { raised, deferred, crossed };
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
    fail(
      `${where(sites)}: raises ${code}, which ${CATALOGUE} does not define. A diagnostic with no ` +
        `catalogue entry reaches a reader as a number with nothing behind it. Add the entry, or ` +
        `raise the code whose entry describes what went wrong.`,
    );
  }
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

// A stage with nowhere to look matches nothing, and a rule that matches nothing
// passes everything filed under it. So the map is held to the catalogue rather
// than trusted to have kept up with it.
for (const stage of Object.keys(JSON.parse(readFileSync(CATALOGUE, 'utf8')).stages ?? {})) {
  if (STAGE_SOURCE[stage] === undefined) {
    console.error(
      `${CATALOGUE} declares the stage "${stage}" and STAGE_SOURCE in this check names no source ` +
        `for it, so every code of that stage would be measured against nothing and pass. Add the ` +
        `directory the stage lives in.`,
    );
    process.exit(1);
  }
}

// Every document in the tree, minus the prose catalogue, which is where a
// deferral is declared rather than a page that teaches from it.
const documents = filesMatching(/\.md$/).filter((file) => file !== PROSE);
if (documents.length === 0) {
  console.error(nothingFound('Markdown documents'));
  process.exit(1);
}

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

const { raised, deferred, crossed } = checkRaised(entries, byCode);
checkDocumented(entries, byCode);
for (const problem of checkProse(entries, pages)) fail(problem);
const { marked, problems: matrixProblems } = checkMatrix(entries, rows);
for (const problem of matrixProblems) fail(problem);
const { taught, notes, problems: pageProblems } = checkPages(entries, documents);
for (const problem of pageProblems) fail(problem);

if (process.argv.includes('--list')) {
  for (const entry of entries) {
    const sites = within(byCode.get(entry.code) ?? [], entry.stage);
    const state = entry.deferred != null ? 'deferred' : sites.length > 0 ? 'raised  ' : 'NEITHER ';
    const at = sites.length > 0 ? `${sites[0].file}:${sites[0].line}` : (entry.deferred ?? '');
    console.log(`${state} ${entry.code}  ${entry.stage.padEnd(7)} ${at}`);
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
  `Raise check passed: ${entries.length} catalogue codes, ${raised} raised at the stage their ` +
    `entry names, from ${read} source files (${literals} string literals read, ${crossed} sites ` +
    `raising a code at a second stage), ${deferred} deferred in ${CATALOGUE} with a reason and ` +
    `repeated in ${PROSE}, ${marked} feature matrix row${marked === 1 ? '' : 's'} marked ` +
    `\`${DEFERRED_STATUS}\`, ${taught} mention${taught === 1 ? '' : 's'} of a deferred code across ` +
    `${documents.length} documents, every one of them saying it is not raised yet, and ${notes} ` +
    `page notes saying so of a code the catalogue still defers. Nothing is documented as current ` +
    `behaviour with no way to happen.`,
);
