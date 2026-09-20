/**
 * Limits check: a budget the specification states and the source implements
 * must be the same number.
 *
 * This exists because of a defect that every other check here waved through.
 * The specification says an array holds a million elements by default, five
 * documentation pages repeat it, and the engine refused at a hundred thousand.
 * A script pushing two hundred thousand elements stopped on this engine and ran
 * on a conforming one, which is the cross-engine disagreement the compiled
 * program format exists to prevent, and it survived a review because nothing
 * compared the two.
 *
 * The duplication check is the near miss worth understanding. It compares
 * enumerated value sets, which are quoted words, so a numeric constant that
 * disagrees between a document and the source walks straight past it. A number
 * is the easiest fact in the repository to copy and the hardest to notice
 * copied.
 *
 * So this check reads the number out of the specification and compares it with
 * every other place it is written: the rest of the specification, the
 * documentation, and the constant in the source that implements it. It states
 * no number of its own. A check that carried the value would be one more copy
 * to keep in step, and it would pass the day the specification changed.
 *
 * **Only a limit the specification actually states belongs in the table.** Most
 * of the engine's ceilings are the host's: the specification says a string has
 * a ceiling and does not say what it is, and a host is free to choose. Those are
 * listed separately below, where the check confirms the constant still exists
 * and compares nothing. That separation is the point. A check that fired on
 * every number in the repository would be turned off within a week.
 *
 * Run: node scripts/check-limits.mjs [--list]
 */
import { readFileSync } from 'node:fs';
import { filesMatching, nothingFound } from './lib/files.mjs';

/** Where a limit may be stated: the specification and the documentation. */
const DOCUMENTS = ['spec', 'docs'];

/**
 * Every limit the specification fixes with a number.
 *
 * `authority` is the sentence that decides the value. `stated` are the
 * phrasings that write the number anywhere under `spec/` or `docs/`, each of
 * which must still match something, so a page that is reworded fails here
 * instead of quietly dropping out of the comparison. `implemented` are the
 * constants in the source that carry it.
 *
 * Adding a limit means adding a row. The test for whether a row belongs: would
 * two conforming engines disagree about a script if they chose different
 * numbers? If yes it is the language's and it goes here. If no it is the
 * host's and it goes in the list below.
 */
const LIMITS = [
  {
    name: 'the per-bar loop budget',
    authority: {
      file: 'spec/language.md',
      pattern: /The default budget is ([\d,_]+) iterations/,
    },
    stated: [
      /The default budget is ([\d,_]+) iterations/,
      /The default is ([\d,_]+) iterations/,
      /budget of ([\d,_]+) iterations/,
      /budget: ([\d,_]+) iterations/,
      /([\d,_]+) iterations per bar by default/,
      /default ([\d,_]+), exceeding it is OS5001/,
      /\| Loop iterations per bar \| ([\d,_]+) \|/,
      /"loops": ([\d,_]+)/,
    ],
    implemented: [
      {
        file: 'src/core/emit/defaults.ts',
        pattern: /export const LOOP_BUDGET = ([\d_]+)/,
      },
    ],
  },
  {
    name: 'the array element ceiling',
    authority: {
      file: 'spec/language.md',
      pattern: /Arrays are limited to ([\d,_]+) elements/,
    },
    stated: [
      /Arrays are limited to ([\d,_]+) elements/,
      /An array holds at most ([\d,_]+) elements/,
      /\| OS5002 \| More than ([\d,_]+) elements/,
      /\| Array elements \| ([\d,_]+) \|/,
      /\| Element limit \| ([\d,_]+) by default/,
    ],
    implemented: [
      {
        file: 'src/core/engine/budget.ts',
        pattern: /arrayElements: ([\d_]+)/,
      },
    ],
  },
];

/**
 * The ceilings the specification leaves to the host, and the constant each one
 * lives in.
 *
 * Nothing is compared for these, because there is nothing to compare them
 * against: a host that sets one accepts that a program refused here may run
 * elsewhere, and the catalogue message carries the number so a reader is never
 * guessing. They are listed so that the table is the whole map of the engine's
 * ceilings rather than half of it, and so that a number which later becomes the
 * language's has an obvious place to move to.
 */
const HOSTS_OWN = [
  {
    name: 'the string code point ceiling, OS5008',
    file: 'src/core/engine/budget.ts',
    pattern: /stringLength: ([\d_]+)/,
    why: 'errors.md OS5008 states the ceiling and carries it in the message; no document fixes it',
  },
  {
    name: 'the drawing object ceiling, OS5010',
    file: 'src/core/engine/budget.ts',
    pattern: /drawingObjects: ([\d_]+)/,
    why: 'stdlib.md 14.4 fixes that the ceiling is reported and that nothing is dropped to make room, and deliberately fixes no number; errors.md OS5010 carries it in the message',
  },
  {
    name: 'the call frame ceiling, OS5005',
    file: 'src/core/engine/budget.ts',
    pattern: /frames: ([\d_]+)/,
    why: 'compiled-program.md 3.3 requires a maximum frame depth and does not name one',
  },
  {
    name: 'the source nesting ceiling, OS5005',
    file: 'src/core/parse/cursor.ts',
    pattern: /const MAX_NESTING = ([\d_]+)/,
    why: 'language.md 19 bounds nesting without a number; the parser picks one that fits its stack',
  },
  {
    name: 'the steps between two clock readings',
    file: 'src/core/engine/budget.ts',
    pattern: /clockEvery: ([\d_]+)/,
    why: 'a wall clock measures the machine rather than the program, so it is outside the language',
  },
];

const problems = [];

/** A written number as a value: separators are spelling, not meaning. */
function valueOf(written) {
  return Number(written.replace(/[,_]/g, ''));
}

/**
 * A file's paragraphs, each with the line it starts on.
 *
 * A statement is matched against a paragraph rather than a line because the
 * documents wrap. Four of the pages that state the loop budget put the number
 * at the end of one line and the word "iterations" at the start of the next,
 * and a line-by-line check would have seen none of them.
 */
function paragraphsOf(text) {
  const lines = text.split('\n');
  const out = [];
  let start = 0;
  let held = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') {
      if (held.length > 0) out.push({ start, lines: held });
      held = [];
      continue;
    }
    if (held.length === 0) start = i + 1;
    held.push(lines[i]);
  }
  if (held.length > 0) out.push({ start, lines: held });
  return out;
}

/** The paragraph as one line, which is how a wrapped sentence reads. */
function flatten(paragraph) {
  return paragraph.lines
    .map((line) => line.trim())
    .join(' ')
    .replace(/\s+/g, ' ');
}

/** The line inside a paragraph that holds the written number. */
function lineOf(paragraph, written) {
  for (let i = 0; i < paragraph.lines.length; i++) {
    if (paragraph.lines[i].includes(written)) return paragraph.start + i;
  }
  return paragraph.start;
}

function read(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** Every match of one pattern in one file, as sites with a line and a value. */
function sitesIn(file, text, pattern) {
  const all = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  const found = [];
  for (const paragraph of paragraphsOf(text)) {
    const flat = flatten(paragraph);
    all.lastIndex = 0;
    let m;
    while ((m = all.exec(flat)) !== null) {
      found.push({ file, line: lineOf(paragraph, m[1]), written: m[1], value: valueOf(m[1]) });
    }
  }
  return found;
}

const documents = filesMatching(/\.md$/i, DOCUMENTS);
const loaded = new Map();
for (const file of documents) {
  const text = read(file);
  if (text !== undefined) loaded.set(file, text);
}

if (documents.length === 0) {
  console.error(
    `Limits check: ${nothingFound('document under spec/ or docs/')}. The comparison needs the ` +
      `specification to read the numbers out of, so this is a failure rather than a pass.`,
  );
  process.exit(1);
}

const results = [];

for (const limit of LIMITS) {
  // The specification decides the value. Nothing else in this file may.
  const authorityText = loaded.get(limit.authority.file);
  if (authorityText === undefined) {
    problems.push(
      `${limit.name}: ${limit.authority.file} is where the specification states it, and that file ` +
        `was not found. Point the table at the document that states it now.`,
    );
    continue;
  }
  const authoritySites = sitesIn(limit.authority.file, authorityText, limit.authority.pattern);
  if (authoritySites.length === 0) {
    problems.push(
      `${limit.name}: ${limit.authority.file} no longer states it in the form this check reads ` +
        `(${limit.authority.pattern}). Either the sentence was reworded, in which case update the ` +
        `table, or the specification stopped stating the limit, in which case the source constant ` +
        `has nothing to agree with.`,
    );
    continue;
  }
  const disagreeing = authoritySites.filter((s) => s.value !== authoritySites[0].value);
  if (disagreeing.length > 0) {
    problems.push(
      `${limit.name}: ${limit.authority.file} states two different values for it, ` +
        `${authoritySites[0].written} at line ${authoritySites[0].line} and ` +
        `${disagreeing[0].written} at line ${disagreeing[0].line}. The specification has to agree ` +
        `with itself before anything can be compared against it.`,
    );
    continue;
  }
  const value = authoritySites[0].value;

  // Every other statement of it, anywhere in the specification or the docs.
  const statements = [];
  for (const pattern of limit.stated) {
    const sites = [];
    for (const [file, text] of loaded) sites.push(...sitesIn(file, text, pattern));
    if (sites.length === 0) {
      problems.push(
        `${limit.name}: no document matches ${pattern} any more. A stale row is a check that ` +
          `inspects nothing, so remove the pattern if the wording went, or correct it if it moved.`,
      );
      continue;
    }
    statements.push(...sites);
  }

  // And every constant that implements it.
  const implementations = [];
  for (const site of limit.implemented) {
    const text = read(site.file);
    if (text === undefined) {
      problems.push(
        `${limit.name}: ${site.file} implements it and was not found. Point the table at the file ` +
          `that implements it now.`,
      );
      continue;
    }
    const sites = sitesIn(site.file, text, site.pattern);
    if (sites.length === 0) {
      problems.push(
        `${limit.name}: ${site.file} no longer holds a constant matching ${site.pattern}. A ` +
          `renamed constant leaves the limit implemented by nothing this check can see.`,
      );
      continue;
    }
    implementations.push(...sites);
  }

  for (const site of statements) {
    if (site.value === value) continue;
    problems.push(
      `${limit.name}: ${limit.authority.file}:${authoritySites[0].line} states ` +
        `${authoritySites[0].written} and ${site.file}:${site.line} states ${site.written}. ` +
        `The specification wins: correct the other one.`,
    );
  }
  for (const site of implementations) {
    if (site.value === value) continue;
    problems.push(
      `${limit.name}: ${limit.authority.file}:${authoritySites[0].line} states ` +
        `${authoritySites[0].written} and ${site.file}:${site.line} implements ${site.written}. ` +
        `A script inside the documented limit is refused by this engine and runs on a conforming ` +
        `one, which is the disagreement the compiled program format exists to prevent. Set the ` +
        `constant to the documented number.`,
    );
  }

  results.push({
    name: limit.name,
    written: authoritySites[0].written,
    where: `${limit.authority.file}:${authoritySites[0].line}`,
    statements: statements.length,
    implementations: implementations.length,
  });
}

const hosts = [];

for (const entry of HOSTS_OWN) {
  const text = read(entry.file);
  const sites = text === undefined ? [] : sitesIn(entry.file, text, entry.pattern);
  if (sites.length === 0) {
    problems.push(
      `${entry.name}: this check's table says ${entry.file} carries it and nothing there matches ` +
        `${entry.pattern}. Update the table, or move the row up to the compared list if the ` +
        `specification has since fixed the number.`,
    );
    continue;
  }
  hosts.push({ name: entry.name, written: sites[0].written, where: `${entry.file}:${sites[0].line}` });
}

if (process.argv.includes('--list')) {
  console.log('Stated by the specification and compared:');
  for (const r of results) {
    console.log(`    ${r.name}: ${r.written} (${r.where}), ${r.statements} statements, ${r.implementations} implementations`);
  }
  console.log('\nThe host\'s own, present but not compared:');
  for (const h of hosts) console.log(`    ${h.name}: ${h.written} (${h.where})`);
  for (const p of problems) console.log(`\n${p}`);
  console.log(`\n${problems.length} limit problems.`);
  process.exit(0);
}

if (problems.length > 0) {
  for (const p of problems) console.error(p);
  console.error(
    `\n${problems.length} limit problem${problems.length === 1 ? '' : 's'}. A number that ` +
      `disagrees between a document and the engine is not a typo: it is two engines disagreeing ` +
      `about what a script does.`,
  );
  process.exit(1);
}

const statements = results.reduce((n, r) => n + r.statements, 0);
const implementations = results.reduce((n, r) => n + r.implementations, 0);

console.log(
  `Limits check passed: ${results.length} limits the specification fixes, ${statements} statements ` +
    `of them across spec and docs and ${implementations} constants implementing them, all agreeing ` +
    `(${hosts.length} further ceilings are the host's and are not compared).`,
);
