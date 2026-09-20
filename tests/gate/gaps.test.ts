/**
 * The gaps section's claim about the gate, derived rather than believed.
 *
 * `stdlib.md` section 20.11 lists what the arithmetic section cannot pin down,
 * and for each gap it names the calls that reach it and the gate studies that
 * make one. The second of those is a statement about two directories, and for a
 * while it was a sentence instead: none of the gaps, it said, is reached by the
 * studies the release gate compares bit for bit. Nothing measured it. Studies
 * were added, three of them reached three of the gaps, and the sentence went on
 * reading as a fact, which is the worst thing a specification can do to somebody
 * implementing from it.
 *
 * The distinction is worth stating, because it decides how much the sentence
 * matters. A gap no study reaches is a debt in the document: an implementer
 * meets it only if they use that call, and the document says plainly that it is
 * open. A gap the gate walks through is a hole in the gate itself. A second
 * engine can reproduce every one of the studies and still disagree on that one,
 * because the number being compared is arrived at by arithmetic no document
 * fixes, so the comparison proves this engine against itself. Which of the two a
 * gap is cannot be asserted once and left, because it changes every time a study
 * is added. So it is derived here, on every run.
 *
 * ## What counts as reaching a gap
 *
 * A call to one of the names in the row, and a string equal to one of them. The
 * string matters because an average selected by name through a type argument is
 * the same arithmetic as a call to it, and a check that read only the brackets
 * would miss it. Comments are masked before anything is read, because a name in
 * a comment reaches nothing: two of the gate's studies discuss a gap at length
 * in their header and neither one computes it.
 *
 * ## What this refuses
 *
 * - **A study that reaches a gap the table does not record**, which is the
 *   failure that reads as a pass: the gate goes on quoting its count, every
 *   comparison is green, and one of the columns is not backed by the document.
 * - **A gap recorded as reached that no study reaches**, which is the same rot
 *   running the other way: a study deleted or rewritten, and a warning left
 *   standing that sends the next reader looking for a hole that was filled.
 * - **A row for a call the document does not declare**, which is a typo that
 *   would otherwise make a gap quietly unreachable and the check quietly true.
 * - **A table or a script directory that read as empty**, because a check that
 *   compares two empty sets agrees with itself for ever.
 *
 * The colour gap is the one entry no call can reach, and the second test here is
 * what keeps it that way: the gate's colour assertions resolve a name through
 * the engine's own table on both sides, so a channel value never enters a
 * comparison. A test that wrote the channels out would turn the last gap in the
 * section into another hole, and would do it in a file nobody would think to
 * reread when the section was next checked.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { GATE_ROOT } from './support.js';

/** The document whose claim this derives. */
const SPEC = 'spec/stdlib.md';

/** The section the table lives in, found by its heading rather than by line. */
const HEADING = '### 20.11 ';

/** Both halves of the gate, because a gap reached by either is reached. */
const SCRIPTS = ['tests/gate/scripts/', 'tests/gate/studies/scripts/'] as const;

/** Where the comparisons live, for the colour check below. */
const SUITES = ['tests/gate/', 'tests/gate/studies/'] as const;

const SCRIPT = '.oscript';
const SOURCE = '.ts';

/** A name in a table cell, which is how this document writes one. */
const SPAN = /`([^`\n]+)`/g;

/** A called name, the dotted namespaces of section 8.2 included. */
const CALL = /([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\s*\(/g;

/** A numbered entry of the section, which every row must answer and vice versa. */
const ENTRY = /^(\d+)\. \*\*/gm;

/** A colour written out as channels: the thing the gate must never transcribe. */
const CHANNELS = /#[0-9a-fA-F]{6}\b|\brgba?\(\s*\d/;

/** One row of the table: a gap, what reaches it, and what the tree should hold. */
interface Row {
  readonly gap: number;
  readonly names: readonly string[];
  readonly studies: readonly string[];
}

/** One gate script, read as code and as the strings it holds. */
interface Script {
  readonly name: string;
  readonly calls: ReadonlySet<string>;
  readonly strings: ReadonlySet<string>;
}

function read(path: string): string {
  return readFileSync(new URL(path, GATE_ROOT), 'utf8');
}

function filesIn(directory: string, suffix: string): readonly string[] {
  return readdirSync(new URL(directory, GATE_ROOT), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => entry.name)
    .sort();
}

/** Every name written as a code span in one cell. */
function spans(cell: string): readonly string[] {
  const out: string[] = [];
  SPAN.lastIndex = 0;
  let found;
  while ((found = SPAN.exec(cell)) !== null) out.push(found[1] as string);
  return out;
}

/** The section, from its heading to the next one. */
function section(document: string): string {
  const at = document.indexOf(HEADING);
  assert.notEqual(
    at,
    -1,
    `${SPEC} holds no section headed "${HEADING.trim()}". The section was renumbered or ` +
      `renamed and this check was left behind, so nothing has derived its claim since.`,
  );
  const rest = document.slice(at + HEADING.length);
  const next = rest.search(/\n#{1,3} /);
  return next === -1 ? rest : rest.slice(0, next);
}

/** The table, one row per gap. */
function rowsOf(text: string): readonly Row[] {
  const out: Row[] = [];
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
function entriesOf(text: string): readonly number[] {
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
function scriptOf(name: string, text: string): Script {
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

/** Every script the gate holds, from both halves, by the name the gate calls it. */
function gateScripts(): readonly Script[] {
  const out: Script[] = [];
  for (const directory of SCRIPTS) {
    const files = filesIn(directory, SCRIPT);
    assert.notEqual(
      files.length,
      0,
      `${directory} holds no ${SCRIPT} file, so this check derived a claim about the gate from ` +
        `an empty directory and agreed with itself.`,
    );
    for (const file of files) {
      out.push(scriptOf(file.slice(0, -SCRIPT.length), read(directory + file)));
    }
  }
  return out;
}

/** The studies that reach one gap, which is the column the table has to match. */
function reaching(row: Row, scripts: readonly Script[]): readonly string[] {
  return scripts
    .filter((script) => row.names.some((name) => script.calls.has(name) || script.strings.has(name)))
    .map((script) => script.name)
    .sort();
}

test('section 20.11 records exactly the gaps the gate reaches', () => {
  const document = read(SPEC);
  const text = section(document);
  const rows = rowsOf(text);
  const entries = entriesOf(text);

  assert.notEqual(
    rows.length,
    0,
    `the section headed "${HEADING.trim()}" holds no table this check can read. Its shape is a ` +
      `gap number, the calls that reach it and the gate studies that make one, and without it ` +
      `the section is back to asserting what nothing measures.`,
  );
  assert.deepEqual(
    rows.map((row) => row.gap),
    entries,
    `the table and the entries below it do not name the same gaps. Every gap needs a row, ` +
      `because a gap with no row is one nothing derives, and a row with no gap describes ` +
      `something the section no longer says.`,
  );

  const undeclared = rows
    .flatMap((row) => row.names)
    .filter((name) => !document.includes(`| \`${name}(`));
  assert.deepEqual(
    undeclared,
    [],
    `the table names ${undeclared.join(', ')}, which ${SPEC} does not declare as a call. A name ` +
      `no script can write is a name no study can reach, so a typo here would make the gap ` +
      `unreachable and this check true for the wrong reason.`,
  );

  const scripts = gateScripts();
  const held = new Set(scripts.map((script) => script.name));
  const missing = rows.flatMap((row) => row.studies).filter((study) => !held.has(study));
  assert.deepEqual(
    missing,
    [],
    `the table records ${missing.join(', ')} as reaching a gap and the gate holds no such ` +
      `study. Either the study was renamed and the row was left behind, or the row is a typo ` +
      `and the gap it warns about is not the one being reached.`,
  );

  // One comparison over every row rather than one per row, so a run that has
  // gained a study and lost another reports both instead of stopping at the
  // first: the two are the same edit and a reader fixing one would be told
  // about the other on the next run and not before.
  assert.deepEqual(
    rows.map((row) => `gap ${row.gap}: ${reaching(row, scripts).join(', ') || 'none'}`),
    rows.map((row) => `gap ${row.gap}: ${row.studies.join(', ') || 'none'}`),
    `${SPEC} section 20.11 records one set of gate studies against its gaps and the scripts ` +
      `hold another. A study that reaches a gap is compared bit for bit through arithmetic the ` +
      `document does not fix, so the table has to say so and the entry has to say what it ` +
      `costs a second engine. Record it and write what it costs, or take the call out of the ` +
      `study and leave the gap reached by nothing.`,
  );
});

test('no comparison in the gate transcribes a colour channel', () => {
  const offenders: string[] = [];
  for (const directory of SUITES) {
    const files = filesIn(directory, SOURCE);
    assert.notEqual(
      files.length,
      0,
      `${directory} holds no ${SOURCE} file, so this check read nothing and passed.`,
    );
    for (const file of files) {
      if (file === 'gaps.test.ts') continue;
      if (CHANNELS.test(read(directory + file))) offenders.push(`${directory}${file}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `${offenders.join(', ')} writes a colour out as channels. The exact values of the named ` +
      `colours are the last gap of ${SPEC} section 20.11, and the gate stays clear of it only ` +
      `because both sides of a colour assertion resolve the name through the engine's own ` +
      `table. Transcribe one and the gate starts comparing a value the document does not give.`,
  );
});
