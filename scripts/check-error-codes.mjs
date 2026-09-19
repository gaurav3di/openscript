/**
 * Error code check.
 *
 * spec/errors.md is the catalogue: one `### OSxxxx <heading>` per code, and
 * nothing else in the repository gets to invent one. A documentation page that
 * cites a code the catalogue does not define sends a reader to search for a
 * number that will never appear on their screen, and the page looks authoritative
 * while doing it. That is worse than saying nothing, so the build refuses it.
 *
 * The check is deliberately narrow. It verifies that every OSxxxx a page cites
 * exists, and it does not try to judge whether the right code was cited: a
 * machine cannot read the sentence around a code and know what the author meant.
 * Existence is the part a machine can prove, and it is the part that catches a
 * code invented by hand or left behind when the catalogue was renumbered.
 *
 * Run: node scripts/check-error-codes.mjs [--staged]
 * Exit code 1 on any hit, with the file, line and column of each one.
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

const CATALOGUE = 'spec/errors.md';
const CODE = /OS\d{4}/g;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);

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

/** Every Markdown file in the tree, walked rather than listed by version control. */
function walk(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = dir === '.' ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path, found);
    } else if (entry.isFile() && path.endsWith('.md')) {
      found.push(path);
    }
  }
  return found;
}

/**
 * The files whose citations are checked: the documentation a trader reads.
 *
 * The catalogue itself is excluded because it is the definition. Everything else
 * is included, README.md and the specification's other pages among them, because
 * a reader chasing a code from any of them expects the same guarantee.
 *
 * The default walks the working tree rather than asking version control for its
 * file list. A check that lists nothing reports success, and a checker that can
 * be silenced by an untracked file is a checker that will be silent on the day it
 * was needed. Only `--staged`, which the commit hook uses, asks version control,
 * and it is answering a different question: what is about to be committed.
 */
function listFiles() {
  if (!process.argv.includes('--staged')) return walk('.');
  return execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => f.endsWith('.md'));
}

const known = catalogue();

if (known.size === 0) {
  console.error(`${CATALOGUE} defines no codes. Expected lines of the form "### OS1001 Unexpected character".`);
  process.exit(1);
}

const files = listFiles().filter((f) => f !== CATALOGUE);

// A run that scanned nothing is a run that proved nothing, and reporting success
// for it would be the one failure this check could never report.
if (files.length === 0 && !process.argv.includes('--staged')) {
  console.error('No Markdown files were found to check. Run this from the repository root.');
  process.exit(1);
}

let hits = 0;
let cited = 0;

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(CODE)) {
      cited++;
      if (known.has(m[0])) continue;
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
      `${CATALOGUE} is the single source of truth for error codes, and a page that ` +
      `disagrees with it is the page that is wrong.`,
  );
  process.exit(1);
}

console.log(
  `Error code check passed: ${cited} citation${cited === 1 ? '' : 's'} across ` +
    `${files.length} file${files.length === 1 ? '' : 's'}, every one of them among ` +
    `the ${known.size} codes in ${CATALOGUE}.`,
);
