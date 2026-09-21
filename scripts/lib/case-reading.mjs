/**
 * Reading one case directory, and refusing what section 2 does not name.
 *
 * `conformance.md` section 2 prints the whole of a case directory as one
 * table, and ends: a runner reads no other file from it, and a file the table
 * does not name is not input. So this reads the directory's listing against
 * the names read out of that table (`conformance-page.mjs`), refuses a file
 * the table does not name rather than passing it over, and parses the files it
 * does name by the shapes sections 2 and 3 give them. Every refusal is a
 * reason in a sentence, because an adapter reports it as the `error` outcome
 * of section 9, whose row includes a malformed case.
 *
 * `notes.md` is named by the table and is not read: it is for a person.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** The names section 2 requires of every case. */
const CASE = 'case.json';
const SCRIPT = 'script.os';
const BARS = 'bars.csv';
const EXPECTED_JSON = 'expected.json';
const EXPECTED_CSV = 'expected.csv';
const INSTRUMENT = 'instrument.json';
const SETTINGS = 'settings.json';
const FRAMES = 'frames.csv';
const TICKS = 'ticks.csv';
const NOTES = 'notes.md';

/** Section 3's spelling of an absent field. */
const ABSENT = 'none';

const refused = (reason) => ({ ok: false, reason });

/**
 * The directory, read: parsed where a section gives a shape, text otherwise.
 *
 * `vocabulary` holds what the page fixes: `isCaseFile`, the matcher over
 * section 2's names, `channels`, the words `asserts` may hold, and
 * `barsHeader`, the header line of section 3.
 */
export function readCaseDirectory(directory, vocabulary) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return refused(`${directory} is not a directory this adapter can read`);
  }

  const names = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      return refused(`${entry.name} is not a file, and a case is one directory of files (section 2)`);
    }
    if (!vocabulary.isCaseFile(entry.name)) {
      return refused(
        `${entry.name} is a file section 2's table does not name, and a file the table does not ` +
          'name is not input',
      );
    }
    names.push(entry.name);
  }
  for (const required of [CASE, SCRIPT]) {
    if (!names.includes(required)) return refused(`${required} is missing, and section 2 requires it`);
  }

  const text = (name) => (names.includes(name) ? readFileSync(join(directory, name), 'utf8') : null);
  const parsed = (name) => {
    const held = text(name);
    if (held === null) return { ok: true, value: null };
    try {
      return { ok: true, value: JSON.parse(held) };
    } catch {
      return refused(`${name} is not JSON`);
    }
  };

  const declared = parsed(CASE);
  if (!declared.ok) return declared;
  const shape = caseShape(declared.value, vocabulary.channels);
  if (!shape.ok) return shape;

  const bars = names.includes(BARS) ? parseBars(text(BARS), vocabulary.barsHeader) : { ok: true, rows: null };
  if (!bars.ok) return refused(`${BARS}: ${bars.reason}`);

  const files = {};
  for (const name of [EXPECTED_JSON, INSTRUMENT, SETTINGS]) {
    const held = parsed(name);
    if (!held.ok) return held;
    files[name] = held.value;
  }

  const frames = names.includes(FRAMES) ? parseFrames(text(FRAMES)) : { ok: true, rows: null };
  if (!frames.ok) return refused(`${FRAMES}: ${frames.reason}`);

  return {
    ok: true,
    declared: declared.value,
    script: text(SCRIPT),
    bars: bars.rows,
    expected: files[EXPECTED_JSON],
    expectedCsv: text(EXPECTED_CSV),
    instrument: files[INSTRUMENT],
    settings: files[SETTINGS],
    frames: text(FRAMES),
    /** The same file, read: one object per frame, in file order. */
    frameRows: frames.rows,
    ticks: names.includes(TICKS),
    /** Secondary series present, by file name: served from a file, never a provider. */
    secondary: names.filter((name) => name !== BARS && /^bars\..+\.csv$/.test(name)),
    notes: names.includes(NOTES),
  };
}

/** The fields of `case.json` section 2 requires, held to their shapes. */
function caseShape(declared, channels) {
  if (declared === null || typeof declared !== 'object' || Array.isArray(declared)) {
    return refused(`${CASE} is not an object`);
  }
  for (const field of ['id', 'category', 'profile', 'description']) {
    if (typeof declared[field] !== 'string' || declared[field].trim() === '') {
      return refused(`${CASE} states no ${field}`);
    }
  }
  if (!Number.isInteger(declared.languageVersion)) {
    return refused(`${CASE} pins no languageVersion, and a case always pins one (section 2)`);
  }
  if (!Array.isArray(declared.asserts) || declared.asserts.length === 0) {
    return refused(`${CASE} asserts no channel`);
  }
  for (const channel of declared.asserts) {
    if (!channels.includes(channel)) {
      return refused(`${CASE} asserts ${JSON.stringify(channel)}, which section 2 does not list as a channel`);
    }
  }
  if ('now' in declared && !Number.isInteger(declared.now)) {
    return refused(`${CASE} states a now that is not an integer of UTC milliseconds`);
  }
  return { ok: true };
}

/**
 * `bars.csv` by section 3: the header, one row per bar, oldest first, no
 * quoting, no blank lines, LF endings, `none` for an absent field, and every
 * row exactly as wide as the header, so a typo in a column cannot drop an
 * input quietly.
 */
export function parseBars(text, header) {
  if (!text.endsWith('\n')) return refused('does not end with a line break');
  const lines = text.slice(0, -1).split('\n');
  if (lines[0] !== header) {
    return refused(`the header is ${JSON.stringify(lines[0])} and section 3 gives ${JSON.stringify(header)}`);
  }
  const columns = header.split(',');
  const rows = [];
  let previous = null;
  for (let at = 1; at < lines.length; at += 1) {
    const line = lines[at];
    if (line === '') return refused(`line ${at + 1} is blank`);
    const cells = line.split(',');
    if (cells.length !== columns.length) {
      return refused(`line ${at + 1} has ${cells.length} fields and the header has ${columns.length}`);
    }
    const row = {};
    for (let column = 0; column < columns.length; column += 1) {
      const cell = cells[column];
      const name = columns[column];
      if (name === 'time') {
        if (!/^[0-9]+$/.test(cell)) return refused(`line ${at + 1}: time ${JSON.stringify(cell)} is not an integer`);
        const time = Number(cell);
        if (previous !== null && time <= previous) return refused(`line ${at + 1}: time does not increase`);
        previous = time;
        row.time = time;
        continue;
      }
      if (cell === ABSENT) {
        row[name] = null;
        continue;
      }
      const value = cell === '' ? NaN : Number(cell);
      if (!Number.isFinite(value)) return refused(`line ${at + 1}: ${name} ${JSON.stringify(cell)} is not a number`);
      row[name] = value;
    }
    rows.push({ ...row, oi: null });
  }
  return { ok: true, rows };
}

/**
 * `frames.csv` by section 3: one row per frame, in file order, never sorted.
 *
 * The columns are read by position under the names the file's own header
 * states, because the list they are held to is the page's and this reader is
 * handed a directory rather than a page. What the page fixes is that the last
 * columns are the optional ones, dropped from the right, so a header is a
 * prefix of the full list: a file naming a later column while dropping an
 * earlier one is a file whose fields are in an order nothing reads, and the
 * comparison the adapter makes against the projection's own bytes is what
 * catches it.
 *
 * `time` is read the way `avgFillPrice` is, because both are absent as `none`,
 * and it is put on the frame rather than dropped: `stdlib.md` 17.7 folds a
 * row's `updatedAt` from it, so a reader that dropped it would hand an engine
 * frames that leave that field where the placement put it, whatever the case
 * says its destination did.
 */
export function parseFrames(text) {
  if (!text.endsWith('\n')) return refused('does not end with a line break');
  const lines = text.slice(0, -1).split('\n');
  const columns = lines[0].split(',');
  const rows = [];
  for (let at = 1; at < lines.length; at += 1) {
    const line = lines[at];
    if (line === '') return refused(`line ${at + 1} is blank`);
    const cells = line.split(',');
    if (cells.length !== columns.length) {
      return refused(`line ${at + 1} has ${cells.length} fields and the header has ${columns.length}`);
    }
    const row = {};
    for (let column = 0; column < columns.length; column += 1) {
      const cell = cells[column];
      const name = columns[column];
      if (name === 'afterBar' || name === 'intent' || name === 'filledQty') {
        const value = cell === '' ? NaN : Number(cell);
        if (!Number.isFinite(value)) return refused(`line ${at + 1}: ${name} ${JSON.stringify(cell)} is not a number`);
        row[name] = value;
        continue;
      }
      if (name === 'avgFillPrice' || name === 'time') {
        if (cell === ABSENT) {
          row[name] = null;
          continue;
        }
        const value = cell === '' ? NaN : Number(cell);
        if (!Number.isFinite(value)) return refused(`line ${at + 1}: ${name} ${JSON.stringify(cell)} is not a number`);
        row[name] = value;
        continue;
      }
      row[name] = cell;
    }
    // An omitted column is absent on every row, and absence is spelled the way
    // the file spells it: a frame that came from a file with no `time` column
    // is a frame whose destination stated no instant.
    rows.push({ orderRef: '', text: '', avgFillPrice: null, time: null, ...row });
  }
  return { ok: true, rows };
}
