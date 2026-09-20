/**
 * Generates the one line the specification gives each library name, for the
 * editor's hover.
 *
 * A hover has to say what a call is for, and the sentence that says it already
 * exists: every entry in `stdlib.md` is a table row whose last column is one
 * line on what the call is for, and the array operations of `language.md` 14.1
 * are a table of the same shape. Retyping those sentences into a source file
 * would produce the defect this project keeps removing: two copies, one of them
 * edited, and a tooltip that describes a function the compiler no longer has.
 *
 * So nothing here is written. The tables are read, and the cell the reader of
 * the specification sees is the text the writer in the editor sees. A sentence
 * improved in `stdlib.md` is improved in the tooltip on the next build, and a
 * call whose row is deleted loses its tooltip rather than keeping a description
 * of something that is gone.
 *
 * The generated file is not kept in version control, for the reason the error
 * catalogue's is not: a checked-in copy is the second source of truth that the
 * generator exists to prevent.
 *
 * **What this does not do is decide what is missing.** The manifest is a built
 * artifact and this runs before the build, so a name the library holds and the
 * specification does not describe cannot be reported from here. That comparison
 * is in `tests/editor/hover.test.ts`, which has the built manifest in front of
 * it and fails when the two disagree in either direction.
 *
 * Run: node scripts/generate-library-prose.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'src', 'core', 'check');
const OUT = join(OUT_DIR, 'library-prose.generated.ts');

/**
 * The documents that describe a call, and the column each one describes it in.
 *
 * `stdlib.md` heads the column `For`, one line on what the call is for, and
 * `Warmup`, the first bar the call can honestly produce a value for.
 * `language.md` 14.1 heads the first `Does`, because it is describing an
 * operation on an array rather than a function of the library catalogue, and has
 * no warmup column because an array operation has no warmup. Both are the same
 * cell to a reader, so both are read.
 *
 * The warmup is carried because it is the promise a writer most needs at the
 * moment they are writing the call: `stdlib.md` 1 says a warmup is a promise
 * rather than a hint, and two engines that disagree about one bar of it fail the
 * conformance suite. A hover that shows it shows the specification's own cell.
 */
const DOCUMENTS = [
  { path: join('spec', 'stdlib.md'), summary: 'For', warmup: 'Warmup' },
  { path: join('spec', 'language.md'), summary: 'Does', warmup: 'Warmup' },
];

/** The call spellings in a table's first cell: `sum(arr)`, `avg(arr)`. */
const CALLS = /`([a-zA-Z_][A-Za-z0-9_.]*)\s*(?:\(|`)/g;

/**
 * A cell that points at one argument rather than naming a signature.
 *
 * `input(...)` in the contract map of section 18 is the shape: a row about
 * where a call lands rather than about the call. A row whose parameters merely
 * end in `...`, as `date.month(t, zone = ...)` does, is not one of those: the
 * ellipsis there stands for a default an earlier row already stated, and the
 * row is a full entry with a description in it. Reading the two as the same
 * thing cost forty-one names their description.
 */
const FRAGMENT = /\(\s*\.\.\.\s*\)/;

const problems = [];

/**
 * Every name a document describes, with the line it describes it in.
 *
 * A row may name more than one call, as `sum(arr)`, `avg(arr)` does, and every
 * one of them is described by that row's cell.
 *
 * **A name that appears twice keeps the first description.** Two things produce
 * a second row: a name with more than one signature, which `stdlib.md` 2.2
 * allows and gives a row each, and a later table mentioning a call it is not
 * about. So what comes out is one line per name and not one line per signature,
 * which is a limit of this map rather than of the specification, and
 * `docs/integrating/the-editor-half.md` states it where a host reads it.
 */
function describedIn(text, columns) {
  const found = new Map();
  let header = null;

  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('|')) {
      header = null;
      continue;
    }
    const cells = line.split('|').map((one) => one.trim());
    if (cells[1] === 'Call') {
      header = cells;
      continue;
    }
    if (header === null) continue;

    const where = header.indexOf(columns.summary);
    if (where < 0) continue;

    const call = cells[1] ?? '';
    const says = cells[where] ?? '';
    if (says.length === 0 || FRAGMENT.test(call)) continue;

    const warmupCell = header.indexOf(columns.warmup);
    const warmup = warmupCell < 0 ? '' : (cells[warmupCell] ?? '');

    CALLS.lastIndex = 0;
    let match;
    while ((match = CALLS.exec(call)) !== null) {
      if (found.has(match[1])) continue;
      // An absent warmup is left out rather than written as an empty string: a
      // table with no warmup column is a call that has none, and a field that is
      // there and empty reads as one whose warmup nobody filled in.
      found.set(match[1], warmup.length === 0 ? { summary: says } : { summary: says, warmup });
    }
  }

  return found;
}

const described = new Map();

for (const document of DOCUMENTS) {
  let text;
  try {
    text = readFileSync(join(ROOT, document.path), 'utf8');
  } catch {
    problems.push(`${document.path} could not be read, so nothing was taken from it.`);
    continue;
  }
  const found = describedIn(text, document);
  if (found.size === 0) {
    problems.push(
      `${document.path} described no call under a "${document.summary}" column, so either the ` +
        'tables changed shape or the column was renamed. A generator that finds nothing writes ' +
        'an empty map, and an empty map is a hover that says nothing about anything.',
    );
  }
  for (const [name, says] of found) if (!described.has(name)) described.set(name, says);
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

/** The names in code point order, so the file is the same bytes everywhere. */
const names = [...described.keys()].sort();

const rows = names
  .map((name) => `  ${JSON.stringify(name)}: ${JSON.stringify(described.get(name))},`)
  .join('\n');

const file = `/**
 * What the specification says each library name is for, read from its own
 * tables.
 *
 * Generated by scripts/generate-library-prose.mjs from the documents it names.
 * Do not edit: the next build overwrites it, and a sentence edited here would
 * be a second answer to a question spec/stdlib.md already answers.
 */
export interface LibraryProse {
  /** One line on what the call is for, from the last column of its own row. */
  readonly summary: string;
  /** The first bar it can produce a value for, where its table states one. */
  readonly warmup?: string;
}

export const LIBRARY_PROSE: Readonly<Record<string, LibraryProse>> = {
${rows}
};
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, file, 'utf8');

console.log(
  `Library prose generated: ${names.length} names described, read from ` +
    `${DOCUMENTS.map((one) => one.path).join(' and ')}.`,
);
