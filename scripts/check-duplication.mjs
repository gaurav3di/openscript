/**
 * Duplication check: an enumerated value set may be written out in one place.
 *
 * Four rounds of reconciliation each fixed every contradiction they were given
 * and produced new ones, because the specification kept restating itself. The
 * fix is not to synchronise copies, it is to have one copy. The test: if a fact
 * changed, would you have to edit two files to keep the specification true?
 *
 * Enumerated sets are the worst shape this takes. The accepted values of an
 * argument, spelled out in a library document, a compiled-format document, a
 * reference page and a tutorial, read as authoritative in all four, and drift
 * the moment anyone edits one of them. A reader has no way to tell which is
 * current. Prose duplication at least announces itself by reading oddly; a list
 * of quoted words looks correct right up until it is wrong.
 *
 * So this check finds every place a set of quoted values is enumerated, groups
 * the occurrences by the set itself, and refuses a set that appears in more
 * than one file.
 *
 * Using a value is not enumerating a set: `type = "limit"` in an example is one
 * literal, and this only looks at runs of MIN_MEMBERS or more in a single line,
 * which is what a set written out looks like. The same holds for a script's own
 * option list, `options = ["topLeft", "topRight", ...]`, which is a study's
 * choice of what to offer and stays true if the language adds a fifth corner,
 * so code is not read: a fenced block in a page, and a script file. Nor is
 * `spec/decisions.md`, which says of itself that it is the minutes and not a
 * source of truth: a set quoted there is the record of an edit made elsewhere,
 * and rewriting the minutes to cite the page would erase what was decided. Two lists that overlap without
 * being equal are two different sets and are reported separately, which is the
 * right answer, because a subset copy that has silently lost a member is the
 * defect this exists to catch.
 *
 * Run: node scripts/check-duplication.mjs [--list]
 */
import { existsSync, readFileSync } from 'node:fs';
import { filesMatching } from './lib/files.mjs';

/** Below this, a run of quoted words is a sentence rather than a value set. */
const MIN_MEMBERS = 3;

/** Where a set may legitimately appear more than once, each with its reason. */
const ALLOW_PATH = 'spec/value-set-exceptions.json';

const SOURCES = ['spec', 'docs', 'examples'];

/**
 * A quoted value, in either spelling the documents use: "word" in prose and
 * code, `word` in tables. Restricted to identifier-shaped contents so that a
 * quoted sentence is not mistaken for a member of a set.
 */
const MEMBER = /`?"([A-Za-z][A-Za-z0-9_.-]{0,40})"`?|`([A-Za-z][A-Za-z0-9_.-]{0,40})`/g;

/**
 * Between two members of a set, and nothing else.
 *
 * Backticks are tolerated because the documents quote a value three ways,
 * sometimes in the same sentence: "value" in prose, `value` in a table, and
 * `"value"` where a table cell holds a string literal. A separator that refused
 * a stray backtick broke the run at the first mixed pair and the check silently
 * found nothing, which is how this was missed on the first attempt.
 */
const SEPARATOR = /^[\s,`]*(?:or|and|\||,|\/)?[\s,`]*$/;

/** The minutes, which quote what they decided rather than state it. */
const MINUTES = 'spec/decisions.md';

function files() {
  return filesMatching(/\.md$/i, SOURCES).filter((file) => file !== MINUTES);
}

/** Every line that is prose, with fenced code blanked so its line numbers hold. */
function proseLines(text) {
  let fenced = false;
  return text.split('\n').map((line) => {
    if (line.trimStart().startsWith('```')) {
      fenced = !fenced;
      return '';
    }
    return fenced ? '' : line;
  });
}

/** Every run of MIN_MEMBERS or more quoted values in one line. */
function setsIn(line) {
  const found = [];
  MEMBER.lastIndex = 0;
  let m;
  let run = [];
  let end = -1;
  while ((m = MEMBER.exec(line)) !== null) {
    const value = m[1] ?? m[2];
    const between = end < 0 ? null : line.slice(end, m.index);
    if (between !== null && SEPARATOR.test(between)) run.push(value);
    else {
      if (run.length >= MIN_MEMBERS) found.push(run);
      run = [value];
    }
    end = m.index + m[0].length;
  }
  if (run.length >= MIN_MEMBERS) found.push(run);
  return found;
}

/** The set itself, order and repetition removed, as a comparable key. */
function keyOf(members) {
  return Array.from(new Set(members)).sort().join('|');
}

const allowed = existsSync(ALLOW_PATH)
  ? JSON.parse(readFileSync(ALLOW_PATH, 'utf8'))
  : { exceptions: [] };
const allowedKeys = new Map((allowed.exceptions ?? []).map((e) => [e.set, e.reason]));

/** key -> { members, sites: [{file, line}] } */
const sets = new Map();

for (const file of files()) {
  const lines = proseLines(readFileSync(file, 'utf8'));
  for (let i = 0; i < lines.length; i++) {
    for (const members of setsIn(lines[i])) {
      const key = keyOf(members);
      if (key.split('|').length < MIN_MEMBERS) continue;
      let entry = sets.get(key);
      if (!entry) {
        entry = { members: key.split('|'), sites: [] };
        sets.set(key, entry);
      }
      if (!entry.sites.some((s) => s.file === file)) entry.sites.push({ file, line: i + 1 });
    }
  }
}

const duplicated = Array.from(sets.entries())
  .filter(([, v]) => v.sites.length > 1)
  .sort((a, b) => b[1].sites.length - a[1].sites.length);

if (process.argv.includes('--list')) {
  for (const [key, v] of duplicated) {
    console.log(`\n${v.sites.length} files: ${v.members.join(', ')}`);
    for (const s of v.sites) console.log(`    ${s.file}:${s.line}`);
  }
  console.log(`\n${duplicated.length} sets appear in more than one file.`);
  process.exit(0);
}

let hits = 0;
for (const [key, v] of duplicated) {
  if (allowedKeys.has(key)) continue;
  hits++;
  console.error(
    `A value set is written out in ${v.sites.length} files: ${v.members.join(', ')}\n` +
      v.sites.map((s) => `    ${s.file}:${s.line}`).join('\n') +
      `\n    Give it one home and cite that home from the others, or record it in ` +
      `${ALLOW_PATH} with the reason it is legitimately repeated.`,
  );
}

// The other direction: a recorded duplication that is no longer written twice is
// a row that has been earned out, and the list only shrinks.
for (const [key, reason] of allowedKeys) {
  const entry = sets.get(key);
  if (entry !== undefined && entry.sites.length > 1) continue;
  hits++;
  console.error(
    `${ALLOW_PATH} records ${key.split('|').join(', ')} as written out in more than one file, ` +
      `and it is not any more (${reason.slice(0, 60)}). Delete the row.`,
  );
}

if (hits > 0) {
  console.error(
    `\n${hits} value set${hits === 1 ? '' : 's'} stated in more than one place. Each one is a fact ` +
      `you would have to edit two files to change, and every copy reads as authoritative.`,
  );
  process.exit(1);
}

console.log(
  `Duplication check passed: every enumerated value set of ${MIN_MEMBERS} or more values ` +
    `is written out in exactly one file (${allowedKeys.size} recorded exceptions).`,
);
