/**
 * Error code check.
 *
 * spec/errors.md is the catalogue: one `### OSxxxx <heading>` per code, and
 * nothing else in the repository gets to invent one. A file that cites a code
 * the catalogue does not define sends a reader to search for a number that will
 * never appear on their screen, and it looks authoritative while doing it. That
 * is worse than saying nothing, so the build refuses it.
 *
 * ## Every file, not every Markdown file
 *
 * This walked `.md` and nothing else for most of its life, under a docstring
 * saying that nothing else in the repository gets to invent a code. Source
 * comments cite codes heavily: the ledger's refusal module alone cites eight in
 * its header, and changing one of them to a code the catalogue does not define
 * passed the whole of `npm test`. A code left behind by a renumbering reaches a
 * reader through a comment exactly as it does through a page, and the reader of
 * a comment is the person changing the code.
 *
 * So the tree is walked, on the terms `lib/files.mjs` sets out: everything the
 * project holds, whatever version control thinks of it, with `.git`,
 * `node_modules` and the built output left out, binaries skipped by extension
 * and anything enormous skipped by size. The catalogue itself is excluded
 * because it is the definition.
 *
 * ## A number outside every declared block is not a code
 *
 * `errors.json` declares which thousand blocks exist, and no entry is ever
 * numbered outside them. So OS0001 and OS0999 are not codes that have gone
 * missing: they are numbers the catalogue could never hold. Four checks in this
 * repository need exactly that, because each tests its own rules against a
 * fabricated entry on every run, and a fabricated entry taken from the real
 * catalogue would be disarmed the day the catalogue was corrected. Those
 * citations are counted and printed rather than passed over in silence, so the
 * practice stays visible. Anything inside a declared block has to resolve.
 *
 * The check stays deliberately narrow in the other direction. It does not judge
 * whether the right code was cited: a machine cannot read the sentence around a
 * code and know what the author meant. Existence is the part a machine can
 * prove, and it is the part that catches a code invented by hand or left behind
 * when the catalogue was renumbered.
 *
 * Run: node scripts/check-error-codes.mjs [--staged]
 * Exit code 1 on any hit, with the file, line and column of each one.
 */
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { projectFiles } from './lib/files.mjs';

const CATALOGUE = 'spec/errors.md';
const RANGES = 'spec/errors.json';
const CODE = /OS\d{4}/g;

/** Files whose bytes are not text, skipped by extension rather than sniffed. */
const BINARY = /\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|pdf|zip|gz|mp4|wasm)$/i;

/** Above this, a file is data rather than something anybody cites a code in. */
const TOO_BIG = 4_000_000;

/** Every code the catalogue defines, as `### OSxxxx <heading>`. */
function catalogue() {
  const text = readFileSync(CATALOGUE, 'utf8');
  const codes = new Map();
  for (const line of text.split('\n')) {
    const m = /^### (OS\d{4})\s+(.+?)\s*$/.exec(line);
    if (m) codes.set(m[1], m[2]);
  }
  return codes;
}

/** The thousand blocks the catalogue declares, such as OS1 and OS7. */
function declaredBlocks() {
  const ranges = JSON.parse(readFileSync(RANGES, 'utf8')).ranges ?? [];
  return new Set(ranges.map((one) => one.prefix));
}

/**
 * The files whose citations are checked: every file the project holds.
 *
 * The catalogue itself is excluded because it is the definition. Everything else
 * is included, source and tests and tooling as well as the documentation,
 * because a code cited in a comment is read by the person changing the code and
 * a dead one there is the same dead end it is on a page.
 *
 * The default walks the working tree rather than asking version control for its
 * file list. A check that lists nothing reports success, and a checker that can
 * be silenced by an untracked file is a checker that will be silent on the day it
 * was needed. Only `--staged`, which the commit hook uses, asks version control,
 * and it is answering a different question: what is about to be committed.
 */
function listFiles() {
  const readable = (f) => !BINARY.test(f);
  if (!process.argv.includes('--staged')) return projectFiles().filter(readable);
  return execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter(readable);
}

const known = catalogue();
const blocks = declaredBlocks();

if (known.size === 0) {
  console.error(`${CATALOGUE} defines no codes. Expected lines of the form "### OS1001 Unexpected character".`);
  process.exit(1);
}
if (blocks.size === 0) {
  console.error(
    `${RANGES} declares no ranges, so every citation would be read as being outside the ` +
      'catalogue and this check would prove nothing.',
  );
  process.exit(1);
}

/**
 * Both rules, given a case each must refuse and one each must accept, every run.
 *
 * A rule that can no longer match reports a clean tree, which is the failure
 * this repository has had five times, and widening this check to the whole tree
 * is exactly the kind of change that quietly stops one matching. The codes here
 * are fabricated rather than taken from the catalogue, so correcting the
 * catalogue cannot disarm it.
 */
function selfTest() {
  // Searched rather than written down, so that the day somebody numbers an
  // entry on top of it this rule keeps testing what it says instead of
  // reporting itself broken.
  const prefix = [...blocks][0];
  let free;
  for (let n = 999; n > 0 && free === undefined; n -= 1) {
    const candidate = `${prefix}${String(n).padStart(3, '0')}`;
    if (!known.has(candidate)) free = candidate;
  }
  if (free === undefined) {
    console.error(`Every number in the ${prefix} block is taken, so this check cannot test itself.`);
    process.exit(1);
  }
  const wrong = [[free, 'a code inside a declared block that the catalogue does not define']];
  const right = [[[...known.keys()][0], 'a code the catalogue defines']];
  const broken = [];
  for (const [code, what] of wrong) {
    if (verdictOf(code) !== 'missing') broken.push(`the rule accepted ${what}`);
  }
  for (const [code, what] of right) {
    if (verdictOf(code) !== 'known') broken.push(`the rule refused ${what}`);
  }
  if (verdictOf('OS0001') !== 'outside') broken.push('the rule read OS0001 as a code');
  if (broken.length === 0) return;
  console.error(
    'The rules in this file no longer do what they say:\n' +
      broken.map((one) => `  ${one}`).join('\n') +
      '\n\nA rule that cannot fail is a clean tree and an empty promise.',
  );
  process.exit(1);
}

/** What one citation is: a defined code, a number outside every block, or a hole. */
function verdictOf(code) {
  if (known.has(code)) return 'known';
  return blocks.has(code.slice(0, 3)) ? 'missing' : 'outside';
}

selfTest();

const files = listFiles().filter((f) => f !== CATALOGUE);

// A run that scanned nothing is a run that proved nothing, and reporting success
// for it would be the one failure this check could never report.
if (files.length === 0 && !process.argv.includes('--staged')) {
  console.error('No files were found to check. Run this from the repository root.');
  process.exit(1);
}

let hits = 0;
let cited = 0;
let read = 0;
const outside = new Map();

for (const file of files) {
  let text;
  try {
    if (statSync(file).size > TOO_BIG) continue;
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  read++;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(CODE)) {
      cited++;
      const verdict = verdictOf(m[0]);
      if (verdict === 'known') continue;
      if (verdict === 'outside') {
        outside.set(file, (outside.get(file) ?? 0) + 1);
        continue;
      }
      hits++;
      console.error(
        `${file}:${i + 1}:${m.index + 1}: ${m[0]} is not in ${CATALOGUE}. ` +
          `Cite the code whose catalogue heading matches what the sentence describes.`,
      );
    }
  }
}

if (hits > 0) {
  console.error(
    `\n${hits} citation${hits === 1 ? '' : 's'} of a code that does not exist. ` +
      `${CATALOGUE} is the single source of truth for error codes, and whatever ` +
      `disagrees with it is what is wrong.`,
  );
  process.exit(1);
}

const spread = [...outside.values()].reduce((total, one) => total + one, 0);

console.log(
  `Error code check passed: ${cited} citation${cited === 1 ? '' : 's'} across ` +
    `${read} file${read === 1 ? '' : 's'} of the whole tree, source and tests and tooling as ` +
    `well as documentation, and every one of them inside the ${blocks.size} blocks ` +
    `${RANGES} declares is among the ${known.size} codes in ${CATALOGUE}.`,
);

if (spread > 0) {
  console.log(
    `\n${spread} citation${spread === 1 ? '' : 's'} sit outside every declared block and are ` +
      `not codes at all, in ${outside.size} file${outside.size === 1 ? '' : 's'}: ` +
      `${[...outside.keys()].join(', ')}. Each is a check naming a number the catalogue could ` +
      'never hold, so that its own rules can be attacked without the catalogue disarming them. ' +
      'They are printed rather than passed over, because the same spelling would hide a typo.',
  );
}
