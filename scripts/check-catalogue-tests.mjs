/**
 * Catalogue pointer check: the test an entry names exists and names the code,
 * and the page a reader opens says what the file the compiler is generated from
 * says.
 *
 * Every entry in `spec/errors.json` carries a `test` field, and `spec/errors.md`
 * prints it: "Test `tests/errors/OS7009`". For the whole life of this
 * repository that directory has not existed, in any commit. A hundred and
 * forty-five pointers, every one of them dead, printed beside the sentence
 * "Every entry here has a test that produces it", and nothing anywhere read the
 * field. A reader who wanted to see the proof was sent to a path that is not
 * there, which is worse than saying nothing: it says the proof exists.
 *
 * ## What the field says now
 *
 * A file under `tests/` that names the code, or `null`. Nothing else. `null` is
 * not an absence and it is not a shrug: it is the statement that no test in this
 * repository names this code, and it is printed in the catalogue where a reader
 * meets the code rather than hidden as a missing field. Twenty-four codes carry
 * it, and seven of those are not deferred: they are taught as current behaviour,
 * raised by a call site the raise check can see, and exercised by nothing. That
 * list is worth more than a full column of pointers would have been, and it is
 * exactly what inventing one row each would have hidden.
 *
 * Both directions are checked, so neither state can rot:
 *
 *   - A path that does not exist, or that exists and does not name the code,
 *     fails. That is the dead pointer this check was written for.
 *   - A `null` on a code that some test does name fails, naming the file. So the
 *     null expires by itself the day somebody writes the test, in the same way a
 *     deferral expires the day something raises the code.
 *
 * The pointer is not proof that the test asserts the code, and this check does
 * not claim it is. It is proof that the file exists and that the code is written
 * in it, which is what a reader chasing the pointer needs and is the whole of
 * what a machine can settle by reading. The repository's own rule that a test
 * asserts a code and a span is what makes naming the code mean something.
 *
 * ## And the second copy
 *
 * `errors.md` part 8 is described as rendered from `errors.json`, and it is
 * edited by hand. Two copies of one fact drift, always, and this pair drifted
 * for a hundred and forty-six entries at once: the pointer sentence, and the
 * worked example itself. `check-examples-compile.mjs` puts the catalogue's
 * examples through the compiler; if the page printed a different example, that
 * proof would be about a block no reader ever sees. So the page's blocks and its
 * pointer sentence are compared with the file, character for character.
 *
 * And then every other string on the page, which for a long while was compared
 * by nothing at all. Changing one word of OS7017's message in `errors.md`, from
 * "was given" to "was handed", passed the whole of `npm test`: `errors.md` is
 * the authority a reader is sent to and `errors.json` is what the compiler
 * emits, and the two were free to say different things. `lib/catalogue-page.mjs`
 * holds that comparison, along with the two tables outside part 8 that are also
 * copies of the file, and says in its own first paragraph which parts of the
 * page it does not reach.
 *
 * Run: node scripts/check-catalogue-tests.mjs [--list]
 * Exit code 1 on any hit.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { filesMatching, nothingFound } from './lib/files.mjs';
import {
  entryProblems,
  pageSelfTest,
  rangeProblems,
  refinementProblems,
  sectionsOf,
} from './lib/catalogue-page.mjs';

const CATALOGUE = 'spec/errors.json';
const PROSE = 'spec/errors.md';
const TESTS = 'tests';

/** The sentence the page prints when no test names the code. */
const NO_TEST = 'No test in this repository names this code.';

const CODE = /OS\d{4}/g;

const problems = [];
const fail = (message) => problems.push(message);

// ---------------------------------------------------------------- the sources

/** Every file under `tests`, and every catalogue code each one names. */
function codesInTests() {
  const files = filesMatching(/./, [TESTS]);
  if (files.length === 0) {
    console.error(nothingFound(`files under ${TESTS}/`));
    process.exit(1);
  }
  const named = new Map();
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(CODE)) {
      if (!named.has(match[0])) named.set(match[0], []);
      const holds = named.get(match[0]);
      if (!holds.includes(file)) holds.push(file);
    }
  }
  return { files, named };
}

/** The two fenced blocks a section prints, in the order it prints them. */
function blocksIn(section) {
  const found = section.match(/Before:\n\n```\n([\s\S]*?)\n```\n\nAfter:\n\n```\n([\s\S]*?)\n```/);
  return found === null ? undefined : { before: found[1], after: found[2] };
}

// ------------------------------------------------------------------ the rules

/** Rule 1. The pointer resolves, or says in writing that there is nothing to point at. */
function checkPointer(entry, named) {
  const where = entry.test;

  if (where === null) {
    const holds = named.get(entry.code) ?? [];
    if (holds.length === 0) return 'none';
    fail(
      `${CATALOGUE}: ${entry.code}'s "test" is null, and ${holds.join(', ')} ` +
        `${holds.length === 1 ? 'names' : 'name'} the code. Null is the statement that nothing ` +
        'tests this, and something now does. Point the entry at the test, so a reader chasing the ' +
        'proof is sent to it.',
    );
    return 'stale';
  }

  if (typeof where !== 'string' || where.trim() === '') {
    fail(
      `${CATALOGUE}: ${entry.code}'s "test" is neither a path nor null. It is a file under ` +
        `${TESTS}/ that names the code, or null saying that no test does. There is no third state, ` +
        'because a reader is either sent somewhere or told there is nowhere to go.',
    );
    return 'broken';
  }

  if (!where.startsWith(`${TESTS}/`)) {
    fail(
      `${CATALOGUE}: ${entry.code}'s "test" is ${where}, which is not under ${TESTS}/. The field ` +
        'is the test a reader can open and run.',
    );
    return 'broken';
  }

  if (!existsSync(where) || !statSync(where).isFile()) {
    fail(
      `${CATALOGUE}: ${entry.code}'s "test" is ${where} and there is no such file. This is the ` +
        'defect this check exists for: a pointer that reads as proof and resolves to nothing. ' +
        'Point it at the test that names the code, or set it to null and say so in the open.',
    );
    return 'broken';
  }

  if (!readFileSync(where, 'utf8').includes(entry.code)) {
    fail(
      `${CATALOGUE}: ${entry.code}'s "test" is ${where} and ${entry.code} is not written anywhere ` +
        'in it. A test that never names the code cannot be the test that produces it, and a reader ' +
        'who opens the file finds no sign of what they came for.',
    );
    return 'broken';
  }

  return 'named';
}

/** Rule 2. The page a reader opens prints what the catalogue holds. */
function checkPage(entry, pages) {
  const page = pages.get(entry.code);
  if (page === undefined) {
    fail(
      `${PROSE}: nothing defines ${entry.code}, which ${CATALOGUE} holds. Part 8 is the page a ` +
        'reader opens when they look a code up.',
    );
    return;
  }

  const sentence = entry.test === null ? NO_TEST : `Test \`${entry.test}\`.`;
  if (!page.text.includes(sentence)) {
    fail(
      `${PROSE}:${page.line}: ${entry.code}'s section does not print "${sentence}", which is what ` +
        `${CATALOGUE} says about its test. Part 8 is a copy of that file, and a copy that ` +
        'disagrees sends the reader somewhere the catalogue does not.',
    );
  }

  const blocks = blocksIn(page.text);
  if (blocks === undefined) {
    fail(`${PROSE}:${page.line}: ${entry.code}'s section prints no before and after blocks.`);
    return;
  }
  for (const which of ['before', 'after']) {
    if (blocks[which] === entry.example[which]) continue;
    fail(
      `${PROSE}:${page.line}: ${entry.code}'s ${which} block is not the one in ${CATALOGUE}. The ` +
        'compiler check puts the catalogue\'s blocks through the compiler, so a page printing a ' +
        'different one is a page whose example nothing has checked.\n' +
        `    page:      ${JSON.stringify(blocks[which])}\n` +
        `    catalogue: ${JSON.stringify(entry.example[which])}`,
    );
  }
}

// -------------------------------------------------------------- the self test

/**
 * Both rules, given a case each must refuse, every run.
 *
 * A check whose rule can no longer match reports a clean tree, which is the
 * failure this repository has had four times. The cases are fabricated here
 * rather than taken from the catalogue, so that correcting the catalogue cannot
 * silently disarm the check.
 */
function selfTest() {
  const held = problems.length;
  const named = new Map([['OS0001', ['tests/somewhere.test.ts']]]);

  checkPointer({ code: 'OS0002', test: 'tests/no-such-file.test.ts' }, named);
  checkPointer({ code: 'OS0001', test: null }, named);
  checkPointer({ code: 'OS0003', test: CATALOGUE }, named);
  const refusals = problems.length - held;
  problems.length = held;

  const clean = checkPointer({ code: 'OS0004', test: null }, named);
  if (refusals === 3 && clean === 'none' && problems.length === held) return;

  console.error(
    `The pointer rule no longer does what it says: ${refusals} of 3 bad pointers were refused, ` +
      `and a code nothing names came back "${clean}". A rule that cannot fail is a clean ` +
      'catalogue and an empty promise, which is the pair this check was written to separate.',
  );
  process.exit(1);
}

// ------------------------------------------------------------------- the run

selfTest();

const pageRules = pageSelfTest();
if (pageRules.length > 0) {
  console.error(
    'The page rules in lib/catalogue-page.mjs no longer do what they say:\n' +
      pageRules.map((one) => `  ${one}`).join('\n') +
      '\n\nA rule that cannot match is a clean catalogue and an empty promise.',
  );
  process.exit(1);
}

const catalogue = JSON.parse(readFileSync(CATALOGUE, 'utf8'));
const entries = catalogue.entries ?? [];
if (entries.length === 0) {
  console.error(`${CATALOGUE} holds no entries. Run this from the repository root.`);
  process.exit(1);
}

const { files, named } = codesInTests();
const proseText = readFileSync(PROSE, 'utf8');
const pages = sectionsOf(proseText);
if (pages.size === 0) {
  console.error(`${PROSE} defines no entries. Expected "### OSxxxx <heading>" lines.`);
  process.exit(1);
}

const pointed = [];
const untested = [];
for (const entry of entries) {
  if (!('test' in entry)) {
    fail(
      `${CATALOGUE}: ${entry.code} has no "test" field at all. Every entry either names the test ` +
        'that produces it or says in writing that nothing does.',
    );
    continue;
  }
  const state = checkPointer(entry, named);
  if (state === 'named') pointed.push(entry.code);
  if (state === 'none') untested.push(entry);
  checkPage(entry, pages);
  for (const problem of entryProblems(entry, pages, catalogue.stageLabels ?? {}, {
    prose: PROSE,
    catalogue: CATALOGUE,
  })) {
    fail(problem);
  }
}

for (const problem of [
  ...rangeProblems(catalogue, proseText, { prose: PROSE, file: CATALOGUE }),
  ...refinementProblems(catalogue, proseText, { prose: PROSE, file: CATALOGUE }),
]) {
  fail(problem);
}

if (process.argv.includes('--list')) {
  for (const entry of entries) console.log(`${entry.code}  ${entry.test ?? '(none)'}`);
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(
    `\n${problems.length} problem${problems.length === 1 ? '' : 's'}. A pointer that resolves to ` +
      'nothing is read as proof that something was checked, and a page that disagrees with the ' +
      'file the compiler is generated from shows one sentence to a reader and another to a user.',
  );
  process.exit(1);
}

const deferred = untested.filter((entry) => entry.deferred != null);
const current = untested.filter((entry) => entry.deferred == null);

console.log(
  `Catalogue pointer check passed: ${pointed.length} of ${entries.length} codes name a file ` +
    `under ${TESTS}/ that exists and writes the code, read from ${files.length} files, and ` +
    `${PROSE} prints the same pointer and the same two example blocks for every entry.`,
);

if (untested.length > 0) {
  console.log(
    `\n${untested.length} codes have no test anywhere in ${TESTS}/, and their entries say so ` +
      `rather than pointing somewhere:\n` +
      `  ${deferred.length} deferred, which nothing raises yet: ` +
      `${deferred.map((one) => one.code).join(', ')}\n` +
      `  ${current.length} documented as current behaviour: ` +
      `${current.map((one) => one.code).join(', ')}\n` +
      'The second line is the one that matters. Each of those is a refusal a reader is told ' +
      'happens, raised by a call site the raise check can see, and exercised by nothing.',
  );
}
