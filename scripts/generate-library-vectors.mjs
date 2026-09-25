/**
 * The library's arithmetic as vectors, for an engine written in another
 * language.
 *
 * `compiled-program.md` 8.3 makes the result of every library function a
 * matter of bits: the accumulation order `stdlib.md` section 20 states, and no
 * other. The second engine has to reproduce that to the last bit, and the
 * fastest way for its author to know they have is a file per function holding
 * inputs and results as binary64 bit patterns, so that nothing about this
 * repository's number formatting sits between their arithmetic and ours.
 *
 * Each entry in the selected numerical manifest groups is driven here the
 * way the engine drives it: through the manifest's own binding, one bar at a
 * time, with a state region, a bar view built by the engine's own function,
 * and the arguments a call site would push. What comes back is written down as
 * bits. Nothing is typed in: the bars are the fixture `tests/stdlib/vectors.ts`
 * already holds, and the manifest decides what a function is called and how
 * many arguments it takes.
 *
 * ## What each function is given
 *
 * Several cases, because the language's central idea is absence and a vector
 * that never contains one proves nothing about it: the full fixture; the same
 * with holes in every series argument; a history shorter than any length; every
 * argument that is not a series absent; for a stateless function, a table of
 * edge values with absence among them; and, where the function was seen to read
 * it, a bar view with no volume, no session or no tick. Then every other value
 * the fixture holds for each constant argument, over the full fixture. Which
 * bar facts a function reads is recorded rather than guessed at: the bar view
 * is read through getters that remember what was asked.
 *
 * ## What is not reached, by name
 *
 * The colour, text, array, object, chart and date groups require values or
 * contexts this scalar driver cannot carry. They are named in
 * the index with the reason, never passed over, and a group the manifest gains
 * that this file does not list fails the run rather than joining them.
 *
 * ## The gaps
 *
 * A case whose call reaches a gap of `stdlib.md` 20.11 is still written, and
 * is marked, because a second engine is not held to it (`conformance.md`
 * section 8). Which calls reach which gap is the gate's own reading of the
 * table, loaded from the built test tree, the same one the harvest refuses a
 * script by: the case's call is spelled the way a script would write it and
 * read as one, so a type selected by name is caught the way a call is.
 *
 * Deterministic: no clock, no randomness, the functions in name order, and
 * every object's keys in construction order. Two machines write the same bytes,
 * which is what `check-library-vectors.mjs` holds the committed copy to.
 *
 * Run: node scripts/generate-library-vectors.mjs
 * Needs `npm run build` and `npm run build:test` first: it runs the manifest's
 * bindings and reads the fixture and the gate's reading of 20.11 from the
 * built trees.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAPS_MODULE, fromRoot } from './lib/built.mjs';
import { nothingFound } from './lib/files.mjs';

export const VECTORS_DIR = 'spec/vectors/library';
export const INDEX_FILE = 'index.json';

/** The page the index sends a reader to, and the page the gaps are read from. */
const GUIDE = 'docs/integrating/library-vectors.md';
const STDLIB = 'spec/stdlib.md';

const LIBRARY_MODULE = '../dist/core/engine/library/index.js';
const VALUES_MODULE = '../dist/core/engine/values/index.js';
const BARS_MODULE = '../dist/core/engine/bars.js';
const STDLIB_MODULE = '../dist/core/stdlib/index.js';
const FIXTURE_MODULE = '../dist-test/tests/stdlib/vectors.js';
const FIXTURE_SOURCE = 'tests/stdlib/vectors.ts';

/**
 * The manifest's groups. The eight without a reason are driven; the six with
 * one are named in the index as not reached, with that reason.
 */
const GROUPS = [
  { module: '../dist/core/engine/library/maths.js', entries: 'MATHS_ENTRIES' },
  { module: '../dist/core/engine/library/series.js', entries: 'SERIES_ENTRIES' },
  { module: '../dist/core/engine/library/averages.js', entries: 'AVERAGE_ENTRIES' },
  { module: '../dist/core/engine/library/studies.js', entries: 'STUDY_ENTRIES' },
  { module: '../dist/core/engine/library/trend.js', entries: 'TREND_ENTRIES' },
  { module: '../dist/core/engine/library/oscillators.js', entries: 'OSCILLATOR_ENTRIES' },
  { module: '../dist/core/engine/library/ranges.js', entries: 'RANGE_ENTRIES' },
  { module: '../dist/core/engine/library/volume.js', entries: 'VOLUME_ENTRIES' },
  {
    module: '../dist/core/engine/library/colours.js',
    entries: 'COLOUR_ENTRIES',
    why: 'a colour is four channels the conformance suite compares as a colour, and gap 4 of stdlib.md 20.11 leaves the named values to the suite',
  },
  {
    module: '../dist/core/engine/library/text.js',
    entries: 'TEXT_ENTRIES',
    why: 'text calls require string values; text formatting and numeric conversion have separate compiled conformance cases',
  },
  {
    module: '../dist/core/engine/library/arrays.js',
    entries: 'ARRAY_ENTRIES',
    why: 'array operations require heap references; the numeric reducers are checked through compiled array-reduction conformance cases',
  },
  {
    module: '../dist/core/engine/library/objects.js',
    entries: 'OBJECT_ENTRIES',
    why: 'drawing and grid operations require surface state; count reads and effects are checked through surface conformance cases',
  },
  {
    module: '../dist/core/engine/library/chart.js',
    entries: 'CHART_ENTRIES',
    why: 'a chart, request, order or position read reports a host or ledger fact rather than computing one',
  },
  {
    module: '../dist/core/engine/library/dates.js',
    entries: 'DATE_ENTRIES',
    why: 'the calendar is exact integer arithmetic over a zone table, which stdlib.md 20.10 says has no order to fix',
  },
];

// -------------------------------------------------------------- the fixture

/** Bars made absent in every series argument of the holes case. */
const HOLES = new Set([3, 4, 27, 55, 56, 57]);
/** Bars that open a session, for `vwap` and the anchored condition. */
const SESSION_STARTS = new Set([0, 20, 40, 60]);
/** How much history the short case has: fewer bars than any length below. */
const SHORT = 5;
/** The tick the host states, where a function asks. */
const TICK = 0.05;

/**
 * Edge values for a stateless function: zero, halves either side of even, the
 * value just below a half, the subnormal range, the largest finite value, the
 * two constants, and absence.
 *
 * No negative zero and nothing that is not finite: `language.md` 5.5 says the
 * language holds one zero and 5.1 that a number is always finite, so neither
 * is a value a script can hand a function, and a vector that probed with one
 * would carry as an output what the page says an engine never produces.
 * `check-library-vectors.mjs` refuses such an output wherever it came from.
 */
const PROBES = [
  0, 1, -1, 0.5, -0.5, 2.5, -2.5, 0.49999999999999994, 3, 7, -7, 0.1, 0.2, 0.3, 10,
  100.37, 2.675, 1e-310, 5e-324, 1e308, 1.7976931348623157e308, 3.141592653589793,
  2.718281828459045, null,
];
/** The second probe series is the first turned by this many places. */
const TURN = 7;

/** Which fixture series each series parameter is fed, by name. */
const SERIES = {
  src: 'close',
  a: 'close',
  b: 'open',
  x: 'close',
  y: 'open',
  price: 'close',
  cond: 'cond',
  resetWhen: 'reset',
};

/** The values every other parameter cycles through; the first is the base case. */
const CONSTANTS = {
  len: [20, 14, 9, 3],
  fast: [12, 5, 8],
  slow: [26, 13, 21],
  signal: [9, 4, 5],
  atrLen: [10, 14, 7],
  factor: [3, 2, 1.5],
  mult: [2, 1.5, 3],
  offset: [0.85, 0.5, 0],
  sigma: [6, 3, 10],
  sample: [false, true],
  p: [50, 90, 10, 100],
  left: [3, 5, 1],
  right: [3, 2, 1],
  n: [1, 5, 20],
  occurrence: [0, 1, null],
  start: [0.02, 0.01],
  step: [0.02, 0.03],
  max: [0.2, 0.3],
  decimals: [2, 0, 5],
  lo: [-1, 98],
  hi: [3, 102],
  fallback: [7, null],
  periodsPerYear: [252, 365],
  diLen: [14, 9],
  adxLen: [14, 5],
  rsiLen: [14, 9],
  stochLen: [14, 9],
  smoothK: [3, 1],
  smoothD: [3, 5],
  longLen: [25, 13],
  shortLen: [13, 7],
  len1: [7, 5],
  len2: [14, 10],
  len3: [28, 20],
  convLen: [9, 7],
  baseLen: [26, 22],
  spanLen: [52, 44],
};

/** Where one function's parameter needs other values than its name's. */
const OVERRIDES = {
  'rsi/len': [14, 20, 9, 3],
  'linreg/offset': [0, 2, 1],
  'roundToStep/step': [0.05, 5, 0, 0.1],
  'awesomeOsc/fast': [5, 12],
  'awesomeOsc/slow': [34, 26],
};

/** The parameters that select an average by name, fed every name the page lists. */
const TYPE_PARAMS = new Set(['type', 'maType']);

/** The `ma` row of `stdlib.md` section 4, whose last cell lists the names. */
const MA_ROW = /^\| `ma\(src, len, type[^\n]*$/m;

function refuse(message) {
  console.error(message);
  process.exit(1);
}

/** The average types, read out of the page rather than carried here. */
function typesFromPage(page) {
  const row = page.match(MA_ROW);
  if (row === null) {
    refuse(`${STDLIB} no longer holds the \`ma(src, len, type\` row this reads the average types from.`);
  }
  const types = [...row[0].matchAll(/"([a-z]+)"/g)].map((one) => one[1]);
  if (types.length === 0) refuse(`${STDLIB}: the \`ma\` row names no quoted type.`);
  return types;
}

// ------------------------------------------------------------- the encoding

const VIEW = new DataView(new ArrayBuffer(8));

/** A binary64 as sixteen hex digits, sign bit first. */
function hexOf(number) {
  VIEW.setFloat64(0, number);
  return (
    VIEW.getUint32(0).toString(16).padStart(8, '0') + VIEW.getUint32(4).toString(16).padStart(8, '0')
  );
}

function encode(value) {
  return typeof value === 'number' ? hexOf(value) : value;
}

/** What one column holds, or a refusal when it holds two kinds at once. */
function kindOf(values, what) {
  const kinds = new Set(values.filter((one) => one !== null).map((one) => typeof one));
  if (kinds.size > 1) refuse(`${what} mixes ${[...kinds].join(' and ')} in one column.`);
  const kind = [...kinds][0];
  return kind === undefined ? 'none' : kind === 'boolean' ? 'bool' : kind;
}

function column(values, what) {
  return { kind: kindOf(values, what), values: values.map(encode) };
}

/** The first bar with a value, or -1 when none has one: the warmup index. */
function warmupOf(values) {
  return values.findIndex((one) => one !== null);
}

/** JSON with every array of scalars on one line, so a column reads as a row. */
function render(object) {
  return `${JSON.stringify(object, null, 2).replace(/\[[^[\]{}]*\]/g, (list) =>
    `[${list.slice(1, -1).trim().split(/,\s*/).filter((one) => one !== '').join(', ')}]`,
  )}\n`;
}

// ---------------------------------------------------------------- the driver

/** How a case is spelled as a call, which is what the gap reading reads. */
function spell(value) {
  if (value === null) return 'none';
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

/**
 * One case: the function driven over one world of bars and arguments, with
 * everything it read written down beside what it produced.
 */
function runCase(entry, id, world, built, reads) {
  const { Heap, isRef, factsFor, barViewOf, newState } = built;
  const heap = new Heap();
  const state = newState();
  const bars = world.bars;
  const n = bars.length;
  const sources = [];
  const guard = new Proxy(
    {},
    {
      get: (_target, method) => (_span, ...detail) =>
        refuse(`${entry.name}/${entry.arity} ${id}: the guard's ${String(method)} was raised with ${detail.map(String).join(', ')}`),
    },
  );
  const facts = { tickSize: world.tick };
  const host = new Proxy(
    {},
    {
      get: (_target, method) => () => {
        reads.host.add(method);
        return facts[method] ?? null;
      },
    },
  );
  const position = new Proxy({}, { get: (_target, method) => () => (reads.position.add(method), null) });

  const outputs = [];
  for (let i = 0; i < n; i += 1) {
    const bar = bars[i];
    const supplied = { ...bar, volume: world.volume ? bar.volume : null };
    const session = { isFirstBar: world.session ? SESSION_STARTS.has(i) : null, isLastBar: null };
    const source = barViewOf(supplied, factsFor(i, n, {}, true, 1, session), i === 0 ? null : bars[i - 1].close);
    sources.push(source);
    const view = {};
    for (const key of Object.keys(source)) {
      Object.defineProperty(view, key, { enumerable: true, get: () => (reads.bar.add(key), source[key]) });
    }
    const args = world.args.map((values) => values[i]);
    const ctx = { heap, span: {}, bar: view, host, position, state, guard, nameOf: () => 'value' };
    const value = entry.call(ctx, args);
    const row = isRef(value) ? heap.get(value.id).items : [value];
    if (i === 0) for (const _each of row) outputs.push([]);
    if (row.length !== outputs.length) {
      refuse(`${entry.name}/${entry.arity} ${id}: bar ${i} returned ${row.length} values and bar 0 returned ${outputs.length}.`);
    }
    row.forEach((one, j) => outputs[j].push(one));
  }

  const call = `${entry.name}(${entry.params.map((param, at) => world.spelling[at] ?? param).join(', ')})`;
  const script = built.gaps.readScript(id, call);
  const gaps = built.gapRows.filter((row) => built.gaps.namesReached(row, script).length > 0).map((row) => row.gap);

  const out = { id, call, gaps, bars: n };
  const barFacts = [...reads.bar].filter((key) => key !== 'index').sort();
  if (barFacts.length > 0) {
    out.bar = {};
    for (const key of barFacts) out.bar[key] = column(sources.map((one) => one[key]), `${id} bar.${key}`);
  }
  if (reads.host.size > 0) {
    out.host = {};
    for (const key of [...reads.host].sort()) out.host[key] = encode(facts[key] ?? null);
  }
  out.args = entry.params.map((name, at) => ({ name, ...column(world.args[at], `${id} ${name}`) }));
  out.outputs = outputs.map((values, j) => ({ ...column(values, `${id} output ${j}`), warmup: warmupOf(values) }));
  return out;
}

/** The series a world feeds each series parameter, holed or not. */
function seriesOf(bars, holed) {
  const hole = (values) => (holed ? values.map((one, i) => (HOLES.has(i) ? null : one)) : values);
  return {
    close: hole(bars.map((bar) => bar.close)),
    open: hole(bars.map((bar) => bar.open)),
    cond: hole(bars.map((bar) => bar.close > bar.open)),
    reset: hole(bars.map((_bar, i) => SESSION_STARTS.has(i))),
  };
}

/** Every case one entry gets, in the order they are written. */
function casesFor(entry, fixture, built, types) {
  const what = `${entry.name}/${entry.arity}`;
  const variants = entry.params.map((param) => {
    if (param in SERIES) return null;
    const found = OVERRIDES[`${entry.name}/${param}`] ?? (TYPE_PARAMS.has(param) ? types : CONSTANTS[param]);
    if (found === undefined) refuse(`${what}: no fixture value for its parameter \`${param}\`. Add one to CONSTANTS or SERIES.`);
    return found;
  });
  const hasSeries = variants.some((one) => one === null);
  const constants = variants.filter((one) => one !== null);
  const width = constants.reduce((most, list) => Math.max(most, list.length), 1);

  const world = (bars, options) => {
    const { holed = false, probes = false, absent = false, k = 0, volume = true, session = true, tick = TICK } = options;
    const series = seriesOf(bars, holed);
    const spelling = [];
    const args = entry.params.map((param, at) => {
      const list = variants[at];
      if (list === null) {
        if (!probes) return series[SERIES[param]];
        return SERIES[param] === 'open' ? [...PROBES.slice(TURN), ...PROBES.slice(0, TURN)] : PROBES;
      }
      const value = absent ? null : list[k % list.length];
      spelling[at] = spell(value);
      return new Array(bars.length).fill(value);
    });
    return { bars, args, spelling, volume, session, tick };
  };

  const worlds = [['full-0', world(fixture, {})]];
  if (hasSeries) worlds.push(['holes-0', world(fixture, { holed: true })]);
  worlds.push(['short-0', world(fixture.slice(0, SHORT), {})]);
  if (constants.length > 0) worlds.push(['absent-args-0', world(fixture, { absent: true })]);
  if (hasSeries && !entry.state) worlds.push(['probes-0', world(fixture.slice(0, PROBES.length), { probes: true })]);

  const cases = [];
  const reads = { bar: new Set(), host: new Set(), position: new Set() };
  for (const [id, one] of worlds) cases.push(runCase(entry, id, one, built, reads));
  if (reads.bar.has('volume')) cases.push(runCase(entry, 'no-volume-0', world(fixture, { volume: false }), built, reads));
  if (reads.bar.has('isSessionFirst')) cases.push(runCase(entry, 'no-session-0', world(fixture, { session: false }), built, reads));
  if (reads.host.has('tickSize')) cases.push(runCase(entry, 'no-tick-0', world(fixture, { tick: null }), built, reads));
  for (let k = 1; k < width; k += 1) cases.push(runCase(entry, `full-${k}`, world(fixture, { k }), built, reads));
  if (reads.position.size > 0) refuse(`${what} reads the position (${[...reads.position].join(', ')}), which no vector can carry.`);
  return cases;
}

// ------------------------------------------------------------------- the run

/**
 * Every file the directory should hold, as text, keyed by path: one per
 * arithmetic function and the index. Nothing is written here.
 */
export async function generateLibraryVectors() {
  const library = await import(LIBRARY_MODULE);
  const values = await import(VALUES_MODULE);
  const bars = await import(BARS_MODULE);
  const stdlib = await import(STDLIB_MODULE);
  const fixture = (await import(FIXTURE_MODULE)).BARS;
  const gaps = await import(GAPS_MODULE);

  const page = readFileSync(STDLIB, 'utf8');
  const section = gaps.gapsSection(page);
  if (section === null) refuse(`${STDLIB} holds no section headed "${gaps.GAPS_HEADING.trim()}", so no case could be marked as reaching a gap.`);
  const gapRows = gaps.gapRows(section);
  if (gapRows.length === 0) refuse(`${STDLIB} section 20.11 holds no table the gate's reading can read.`);
  const types = typesFromPage(page);
  if (!Array.isArray(fixture) || fixture.length <= SHORT) refuse(nothingFound(`bar in ${FIXTURE_SOURCE} beyond the ${SHORT} the short case takes`));

  const built = {
    Heap: values.Heap,
    isRef: values.isRef,
    factsFor: bars.factsFor,
    barViewOf: bars.barViewOf,
    newState: stdlib.newState,
    gaps,
    gapRows,
  };

  const reached = [];
  const notReached = [];
  const named = new Set();
  for (const group of GROUPS) {
    const entries = (await import(group.module))[group.entries];
    if (!Array.isArray(entries) || entries.length === 0) refuse(`${fromRoot(group.module)} exports no ${group.entries}.`);
    for (const entry of entries) named.add(`${entry.name}/${entry.arity}`);
    if (group.why === undefined) reached.push(...entries);
    else notReached.push({ why: group.why, functions: entries.map((one) => `${one.name}/${one.arity}`) });
  }
  const unlisted = library.manifestEntries().filter((one) => !named.has(`${one.name}/${one.arity}`));
  if (unlisted.length > 0) {
    refuse(
      `The manifest holds ${unlisted.map((one) => `${one.name}/${one.arity}`).join(', ')}, which no group in ` +
        'this file lists. Add its group as reached or as not reached with the reason; nothing is passed over.',
    );
  }
  if (reached.length === 0) refuse(nothingFound('arithmetic entry in the library manifest'));

  reached.sort((p, q) => (p.name < q.name ? -1 : p.name > q.name ? 1 : p.arity - q.arity));
  const files = new Map();
  const functions = [];
  let cases = 0;
  for (const entry of reached) {
    const file = `${entry.name}-${entry.arity}.json`;
    const held = casesFor(entry, fixture, built, types);
    cases += held.length;
    const reaching = [...new Set(held.flatMap((one) => one.gaps))].sort((p, q) => p - q);
    files.set(`${VECTORS_DIR}/${file}`, render({ name: entry.name, arity: entry.arity, state: entry.state, params: entry.params, cases: held }));
    functions.push({ name: entry.name, arity: entry.arity, state: entry.state, file, cases: held.length, gaps: reaching });
  }
  files.set(`${VECTORS_DIR}/${INDEX_FILE}`, render({ see: GUIDE, fixture: FIXTURE_SOURCE, bars: fixture.length, functions, notReached }));
  return { files, functions, notReached, cases, bars: fixture.length, gapRows: gapRows.length };
}

const RUN_DIRECTLY = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (RUN_DIRECTLY) {
  const made = await generateLibraryVectors();
  mkdirSync(VECTORS_DIR, { recursive: true });
  for (const [path, text] of made.files) writeFileSync(path, text, 'utf8');
  const marked = made.functions.filter((one) => one.gaps.length > 0);
  const skipped = made.notReached.reduce((sum, group) => sum + group.functions.length, 0);
  console.log(
    `Library vectors written: ${made.functions.length} functions, ${made.cases} cases over the ` +
      `${made.bars} bars of ${FIXTURE_SOURCE}, into ${VECTORS_DIR}/. ${marked.length} functions have a case ` +
      `that reaches a gap of ${STDLIB} 20.11 and are marked in the index: ${marked.map((one) => one.name).join(', ')}. ` +
      `${skipped} manifest entries in ${made.notReached.length} groups need other drivers and are named in the ` +
      'index as not reached, each with the reason.',
  );
}
