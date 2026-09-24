/**
 * The `values` channel of `conformance.md` section 4, for this engine's adapter.
 *
 * `expected.csv` is one row per bar and one column per asserted plot, and the
 * answer is one flat object per bar holding the asserted columns and nothing
 * else. A column names a plot by its title or by its key, and a plot names a
 * channel (`compiled-program.md` section 11), so the projection is a lookup
 * rather than a list of what may be asserted.
 *
 * **Every rule here is the second engine's, on purpose.** Its adapter answered
 * this channel first, in `engine/openscript/adapter/running.py` and
 * `spellings.py`, and two adapters that read one file two ways would disagree
 * about a case neither engine got wrong. So: a title is looked up before a key
 * and the first plot to claim a name keeps it; a column no plot claims is a
 * feature this run cannot answer rather than an absent value, because absence
 * is something a case can assert; a bar that failed has no row; a cell of
 * `expected.csv` is read as the channel's own type, from the compiled program's
 * channel table rather than from the shape of the text, and an empty field reads
 * as absence like `none`; and a colour is compared as its eight digit spelling,
 * the alpha made a byte by rounding halves away from zero.
 */

/** Section 4's spelling of absence in a cell. */
const ABSENT = 'none';

/** The spelling a number cell is held to, which admits no infinity and no NaN. */
const DECIMAL = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;

const COLOUR = /^#[0-9a-f]{8}$/;

const HEX = '0123456789abcdef';

/** `expected.csv`, split by the usual quoting rules: a field may be quoted, and `""` is a quote. */
export function readExpectedCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (quoted) {
      if (char === '"' && text[at + 1] === '"') {
        field += '"';
        at += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const header = rows[0];
  if (header === undefined || header[0] !== 'bar') {
    return { ok: false, reason: 'expected.csv: the first column is the zero-based bar index, named bar' };
  }
  for (let at = 1; at < rows.length; at += 1) {
    const one = rows[at];
    if (one.length !== header.length) {
      return { ok: false, reason: `expected.csv line ${at + 1} holds ${one.length} fields and the header names ${header.length}` };
    }
    if (one[0] !== String(at - 1)) {
      return { ok: false, reason: `expected.csv line ${at + 1} says it is bar ${one[0]} and it is at row ${at - 1}` };
    }
  }
  return { ok: true, columns: header.slice(1), rows: rows.slice(1).map((one) => one.slice(1)) };
}

/** Every plot's title and key, against its channel, the first plot to claim a name keeping it. */
function plotChannels(program) {
  const found = new Map();
  for (const plot of program.outputs.plots) {
    for (const name of [plot.title, plot.key]) {
      if (typeof name === 'string' && !found.has(name)) found.set(name, plot.channel);
    }
  }
  return found;
}

/** A value of an answered channel in the JSON shape section 4 gives it. */
function reported(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return value;
  if (value !== null && typeof value === 'object' && value.tag === 'color') return colourText(value);
  return null;
}

function hexByte(channel) {
  const value = Math.min(255, Math.max(0, Math.trunc(channel)));
  return HEX[value >> 4] + HEX[value & 15];
}

/** A colour in the one spelling a case file writes, the alpha a byte rounded halves away from zero. */
function colourText(colour) {
  const alpha = Math.floor(colour.a * 255 + 0.5);
  return `#${hexByte(colour.r)}${hexByte(colour.g)}${hexByte(colour.b)}${hexByte(alpha)}`;
}

/**
 * The answer: one object per bar that ran, holding the asserted columns.
 *
 * Returns `{ values, unsupported }`, where `unsupported` names each column no
 * plot of this program claims.
 */
export function valuesAnswer(columns, program, rows) {
  const channels = plotChannels(program);
  const unsupported = [];
  const resolved = [];
  for (const name of columns) {
    if (!channels.has(name)) {
      unsupported.push(`the column ${name}: this program declares no plot with that title or key`);
      continue;
    }
    resolved.push([name, channels.get(name)]);
  }
  const values = rows.map((row) => Object.fromEntries(resolved.map(([name, channel]) => [name, reported(row[channel] ?? null)])));
  return { values, unsupported };
}

function cell(text, type, where) {
  if (text === '' || text === ABSENT) return { ok: true, value: null };
  if (type === 'number') {
    const value = Number(text);
    if (!DECIMAL.test(text) || !Number.isFinite(value)) return { ok: false, reason: `${where}: ${JSON.stringify(text)} is not a decimal number` };
    return { ok: true, value };
  }
  if (type === 'bool') {
    if (text === 'true' || text === 'false') return { ok: true, value: text === 'true' };
    return { ok: false, reason: `${where}: ${JSON.stringify(text)} is neither true nor false` };
  }
  if (type === 'color') {
    if (!COLOUR.test(text)) return { ok: false, reason: `${where}: ${JSON.stringify(text)} is not a colour written #rrggbbaa` };
    return { ok: true, value: text };
  }
  if (type === 'string') return { ok: true, value: text };
  return { ok: false, reason: `${where}: ${JSON.stringify(type)} is not a channel type this adapter reads` };
}

/** What the case expects of the channel, each cell read as its channel's own type. */
export function valuesExpected(read, program) {
  const channels = plotChannels(program);
  const values = [];
  for (let at = 0; at < read.rows.length; at += 1) {
    const held = {};
    for (let column = 0; column < read.columns.length; column += 1) {
      const name = read.columns[column];
      const channel = channels.get(name);
      if (channel === undefined) return { ok: false, reason: `expected.csv names the column ${name} and this program has no plot for it` };
      const one = cell(read.rows[at][column], program.channels[channel].type, `expected.csv line ${at + 2}, ${name}`);
      if (!one.ok) return one;
      held[name] = one.value;
    }
    values.push(held);
  }
  return { ok: true, values };
}
