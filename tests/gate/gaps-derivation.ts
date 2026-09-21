/**
 * The one reading of `stdlib.md` section 20.11: which calls reach which gap,
 * and which scripts make one.
 *
 * Two things read that table and have to agree about it. The gate's test holds
 * the table to the tree, failing when the studies that reach a gap are not the
 * ones the row records. The harvest refuses a shipped strategy a case cannot
 * be made from, because `conformance.md` section 8 admits no case whose value
 * reaches an open gap. A second reading of the table in the harvest would be
 * the drift the test exists to stop, one directory over: a call the test
 * counts as reaching a gap and the harvest does not is a case admitted under
 * arithmetic no document fixes. So the reading is here once, and the script
 * loads this file from the built test tree the way it loads the suite's host.
 *
 * Nothing here reads a file or asserts anything. Text in, structure out, and
 * the two callers decide what a mismatch costs.
 *
 * ## What counts as reaching a gap
 *
 * A call to one of the names in the row, and a string equal to one of them. The
 * string matters because an average selected by name through a type argument is
 * the same arithmetic as a call to it, and a check that read only the brackets
 * would miss it. Comments are masked before anything is read, because a name in
 * a comment reaches nothing: two of the gate's studies discuss a gap at length
 * in their header and neither one computes it.
 */

/** The section the table lives in, found by its heading rather than by line. */
export const GAPS_HEADING = '### 20.11 ';

/** A name in a table cell, which is how this document writes one. */
const SPAN = /`([^`\n]+)`/g;

/** A called name, the dotted namespaces of section 8.2 included. */
const CALL = /([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\s*\(/g;

/** A numbered entry of the section, which every row must answer and vice versa. */
const ENTRY = /^(\d+)\. \*\*/gm;

/** One row of the table: a gap, what reaches it, and what the tree should hold. */
export interface GapRow {
  readonly gap: number;
  readonly names: readonly string[];
  readonly studies: readonly string[];
}

/** One script, read as code and as the strings it holds. */
export interface ReadScript {
  readonly name: string;
  readonly calls: ReadonlySet<string>;
  readonly strings: ReadonlySet<string>;
}

/** Every name written as a code span in one cell. */
function spans(cell: string): readonly string[] {
  const out: string[] = [];
  SPAN.lastIndex = 0;
  let found;
  while ((found = SPAN.exec(cell)) !== null) out.push(found[1] as string);
  return out;
}

/**
 * The section, from its heading to the next one, or null when the page no
 * longer holds it.
 *
 * Null rather than an empty string, because an empty section reads as a table
 * with no rows and a caller comparing against no rows agrees with itself. The
 * caller says what a renamed section costs.
 */
export function gapsSection(document: string): string | null {
  const at = document.indexOf(GAPS_HEADING);
  if (at === -1) return null;
  const rest = document.slice(at + GAPS_HEADING.length);
  const next = rest.search(/\n#{1,3} /);
  return next === -1 ? rest : rest.slice(0, next);
}

/** The table, one row per gap. */
export function gapRows(text: string): readonly GapRow[] {
  const out: GapRow[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 3) continue;
    const gap = Number(cells[0]);
    if (!Number.isInteger(gap)) continue;
    const studies = cells[2] as string;
    out.push({
      gap,
      names: spans(cells[1] as string),
      studies: /^none$/i.test(studies) ? [] : [...spans(studies)].sort(),
    });
  }
  return out;
}

/** The numbered entries the table has to answer. */
export function gapEntries(text: string): readonly number[] {
  const out: number[] = [];
  ENTRY.lastIndex = 0;
  let found;
  while ((found = ENTRY.exec(text)) !== null) out.push(Number(found[1]));
  return out;
}

/**
 * One script, with its comments gone.
 *
 * Strings are collected rather than discarded, because selecting an average by
 * name reaches that average's arithmetic and a name in brackets is not the only
 * way to write a call.
 */
export function readScript(name: string, text: string): ReadScript {
  const calls = new Set<string>();
  const strings = new Set<string>();
  let code = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let value = '';
      i += 1;
      while (i < text.length && text[i] !== ch && text[i] !== '\n') {
        if (text[i] === '\\') {
          value += text[i + 1] ?? '';
          i += 2;
          continue;
        }
        value += text[i];
        i += 1;
      }
      if (text[i] === ch) i += 1;
      strings.add(value);
      code += ' ';
      continue;
    }
    code += ch;
    i += 1;
  }
  CALL.lastIndex = 0;
  let found;
  while ((found = CALL.exec(code)) !== null) calls.add(found[1] as string);
  return { name, calls, strings };
}

/** The names in one row that one script calls or names as a string. */
export function namesReached(row: GapRow, script: ReadScript): readonly string[] {
  return row.names.filter((name) => script.calls.has(name) || script.strings.has(name));
}

/** The studies that reach one gap, which is the column the table has to match. */
export function reaching(row: GapRow, scripts: readonly ReadScript[]): readonly string[] {
  return scripts
    .filter((script) => namesReached(row, script).length > 0)
    .map((script) => script.name)
    .sort();
}
