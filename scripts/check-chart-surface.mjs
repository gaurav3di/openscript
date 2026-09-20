/**
 * Chart surface check: what a program declares is what the chart is handed.
 *
 * The chart adapter is a mapping, and the way a mapping fails is not a crash.
 * It is one row of the table quietly not being written: a study declares two
 * grids and one is drawn, an alert computes a message from the bar that fired
 * and the notification carries the title instead, a band asks for a colour per
 * bar and is drawn in somebody else's. Every one of those compiles, runs to the
 * last bar and reports nothing anywhere, which is the failure this project
 * exists to prevent.
 *
 * So the mapping is checked rather than promised. This compiles one study that
 * declares two of everything the language can declare, builds a descriptor from
 * it, runs it over a short fixture, and then asks two questions.
 *
 * 1. **Is every declared field accounted for?** Each field of each declaration
 *    in `outputs` must be listed in `spec/chart-narrowings.json`, either as one
 *    the adapter carries or as one it cannot, with the reason it cannot. A field
 *    in neither is the shape of every defect above: something the compiler
 *    emits, nothing reads, and nobody wrote down. A field listed there that the
 *    format no longer has is stale and fails too, because a record nobody
 *    maintains is a record nobody can trust.
 *
 * 2. **Does the descriptor carry as many of each as the program declares?** A
 *    smaller number is allowed only where the record states the limit and says
 *    why. One grid out of two is the real case, and it is the chart's own
 *    contract that has one hook rather than a decision made here.
 *
 * The end of it is a handful of direct readings: the plot columns, the grid's
 * cells, the markers, the levels and the alert message a run computed. Those
 * are there because a field recorded as carried is still only a claim until
 * something reads the value out of a descriptor that was actually run.
 *
 * Run: node scripts/check-chart-surface.mjs [--list]
 */
import { existsSync, readFileSync } from 'node:fs';
import { CHART_ADAPTER_MODULE as ADAPTER_MODULE, CORE_MODULE, EMITTER_MODULE, fromRoot } from './lib/built.mjs';

const RECORD_PATH = 'spec/chart-narrowings.json';

/** The three built files this reads, as the working directory sees them. */
const CORE = fromRoot(CORE_MODULE);
const EMITTER = fromRoot(EMITTER_MODULE);
const ADAPTER = fromRoot(ADAPTER_MODULE);

/** The study this checks against: two of everything a version 1 file can declare. */
const SOURCE = `version 1

study("Surface", overlay = true, precision = 2)

len = input(5, "Length")
fast = ema(close, len)
slow = ema(close, len * 2)

a = plot(fast, "Fast", aqua)
b = plot(slow, "Slow", orange)
plotCandles(open, high, low, close, "Bars", colorUp = lime, colorDown = red)
fill(a, b, colorUp = aqua, colorDown = orange, opacity = 0.5)

level(100, "Hundred", gray)
level(50, "Fifty", silver)

if close > open
    signal("UP", shape = "triangleUp", at = "below", color = lime)
if close < open
    signal("DOWN", shape = "triangleDown", at = "above", color = red)

first = table("First", 1, 2, position = "topLeft", bgColor = navy, borderWidth = 1)
second = table("Second", 1, 1, position = "bottomRight")
cell(first, 0, 0, "close", textColor = white)
cell(first, 0, 1, text(close, 2))
cell(second, 0, 0, text(open, 2))

if close > open
    alert("up at " + text(close, 2), id = "up", title = "Went up")
if close < open
    alert("down at " + text(close, 2), id = "down", title = "Went down", frequency = "once")

barColor(close > open ? lime : none)
background(close > open ? fade(aqua, 90) : none)
`;

/** The bars the fixture runs on: alternating, so both branches are taken. */
function bars(count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const open = 100 + i;
    const close = i % 2 === 0 ? open + 1 : open - 1;
    out.push({
      time: 1_748_736_000 + i * 60,
      open,
      close,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      volume: 100,
    });
  }
  return out;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(CORE) || !existsSync(ADAPTER)) {
  fail(
    `${ADAPTER} is not built, so this check would inspect nothing. Run \`npm run build\` first.\n` +
      'It runs the compiler and the adapter rather than reading their source, because what is ' +
      'being checked is what a host is handed.',
  );
}

const core = await import(CORE_MODULE);
const emitter = await import(EMITTER_MODULE);
const adapter = await import(ADAPTER_MODULE);

const record = JSON.parse(readFileSync(RECORD_PATH, 'utf8'));
const problems = [];

/** The fixture, compiled, with any refusal reported rather than worked around. */
function compiled() {
  const file = core.sourceFile('chart-surface.oscript', SOURCE);
  const bag = new core.DiagnosticBag();
  const tokens = core.lex(file, bag);
  const script = core.parseTokens(file, tokens, bag);
  const checked = core.check(file, script, bag);
  const result = emitter.emit(file, checked, bag, {});
  const refused = bag.ordered().filter(core.isError);
  if (result.program === undefined || refused.length > 0) {
    fail(
      'the fixture study did not compile, so nothing was checked: ' +
        refused.map((one) => `${one.code} ${one.message}`).join('; '),
    );
  }
  return result.program;
}

/**
 * Every field name one declaration carries, nested objects included.
 *
 * A nested object is walked one level and named `ohlc.colorUp`, because that is
 * where a candle plot's four colours and a grid's three style fields live, and a
 * record that stopped at `ohlc` would let four fields be dropped behind a name
 * that was accounted for.
 */
function fieldsOf(declaration, prefix = '') {
  const names = new Set();
  for (const [name, value] of Object.entries(declaration)) {
    names.add(`${prefix}${name}`);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // An input reference is a value, not a nested declaration: `{ input: key }`
      // is how a tunable field is written and its shape is not a field list.
      if ('input' in value) continue;
      for (const nested of fieldsOf(value, `${prefix}${name}.`)) names.add(nested);
    }
  }
  return names;
}

/** Every field name an output list carries, over all of its declarations. */
function fieldsIn(declared) {
  const names = new Set();
  const list = Array.isArray(declared) ? declared : declared === null ? [] : [declared];
  for (const one of list) for (const name of fieldsOf(one)) names.add(name);
  return names;
}

const program = compiled();

// 1. Every declared field is either carried or recorded as one that cannot be.
for (const [output, declared] of Object.entries(program.outputs)) {
  const entry = record.outputs?.[output];
  if (entry === undefined) {
    problems.push(
      `${RECORD_PATH} says nothing about outputs.${output}, which the compiled program carries. ` +
        'List its fields as carried, or record each one that is not with the reason it cannot be.',
    );
    continue;
  }
  const narrowed = new Map((entry.narrowed ?? []).map((one) => [one.field, one.why ?? '']));
  const carried = new Set(entry.carried ?? []);
  const present = fieldsIn(declared);

  for (const field of present) {
    const inCarried = carried.has(field);
    const inNarrowed = narrowed.has(field);
    if (inCarried && inNarrowed) {
      problems.push(
        `outputs.${output}.${field} is recorded as carried and as narrowed. It is one or the other.`,
      );
    } else if (!inCarried && !inNarrowed) {
      problems.push(
        `outputs.${output}.${field} is declared by the compiled program and ${RECORD_PATH} does ` +
          'not mention it. Carry it into the descriptor and list it, or record why the chart has ' +
          'nowhere to put it. A field nobody has decided about is one the adapter drops in silence.',
      );
    }
  }
  for (const field of carried) {
    if (!present.has(field)) {
      problems.push(
        `${RECORD_PATH} lists outputs.${output}.${field} as carried and the compiled program has ` +
          'no such field. Remove the stale entry.',
      );
    }
  }
  for (const [field, why] of narrowed) {
    if (!present.has(field)) {
      problems.push(
        `${RECORD_PATH} records outputs.${output}.${field} as narrowed and the compiled program ` +
          'has no such field. Remove the stale entry.',
      );
    }
    if (why.trim().length === 0) {
      problems.push(`outputs.${output}.${field} is recorded as narrowed with no reason given.`);
    }
  }
}

// 2. The descriptor carries as many of each declaration as the program does.
const descriptor = adapter.descriptorFor(program);
const data = bars(12);
const settings = {};
const store = {};
const ctx = {
  barState: { isNew: true, isConfirmed: true, isRealtime: false, lastIndex: data.length - 1 },
  timezone: 'Etc/UTC',
  now: () => 1_748_736_000 + data.length * 60,
};
const values = descriptor.calc(data, settings, store, ctx);
const surface = { bars: data, values, settings };

const limits = new Map((record.counts ?? []).map((one) => [one.output, one]));
const counted = {
  plots: descriptor.plots.length,
  fills: (descriptor.fills ?? []).length,
  levels: (descriptor.levels?.({ ...settings, bars: data, values }) ?? []).length,
  alerts: (descriptor.alerts ?? []).length,
  tables: descriptor.table === undefined || descriptor.table(surface) === null ? 0 : 1,
};

for (const [output, carried] of Object.entries(counted)) {
  const declared = program.outputs[output].length;
  const limit = limits.get(output);
  if (limit === undefined) {
    if (carried < declared) {
      problems.push(
        `the program declares ${declared} of outputs.${output} and the descriptor carries ` +
          `${carried}. Carry them all, or record the limit and its reason in ${RECORD_PATH}.`,
      );
    }
    continue;
  }
  if ((limit.why ?? '').trim().length === 0) {
    problems.push(`${RECORD_PATH} limits outputs.${output} with no reason given.`);
  }
  if (carried !== Math.min(declared, limit.carries)) {
    problems.push(
      `${RECORD_PATH} says the descriptor carries ${limit.carries} of outputs.${output} and it ` +
        `carried ${carried} of ${declared}. Correct the record, or the adapter.`,
    );
  }
}
for (const output of limits.keys()) {
  if (!(output in counted)) {
    problems.push(`${RECORD_PATH} limits outputs.${output}, which this check does not count.`);
  }
}

/**
 * 3. What was carried is read back out of a run.
 *
 * A record entry is a claim until a value comes out the other end, and each of
 * these is a claim that has been wrong: a plot with no column, a grid read per
 * bar, a marker on every bar, a level fixed before the data, an alert message
 * replaced by the title.
 */
function reading(what, got, wanted) {
  if (got !== wanted) problems.push(`${what}: the descriptor gave ${got}, and ${wanted} is right.`);
}

for (const plot of descriptor.plots) {
  if (values[plot.key] === undefined) {
    problems.push(`plot ${plot.key} has no column in the table the calculation returned.`);
  }
}

const grid = descriptor.table?.(surface);
reading('the grid the first declaration asks for', grid?.rows.length, 1);
reading('its declared column count', grid?.rows[0]?.length, 2);
reading('a cell the script wrote', grid?.rows[0]?.[0]?.text, 'close');

const texts = new Set((descriptor.markers?.(surface) ?? []).map((one) => one.text));
for (const wanted of ['UP', 'DOWN']) {
  if (!texts.has(wanted)) problems.push(`the marker "${wanted}" reached no bar of the fixture.`);
}

for (const spec of descriptor.alerts ?? []) {
  if (typeof spec.message !== 'function') {
    problems.push(
      `alert ${spec.id} carries no message. The declaration has a message channel, the chart's ` +
        'entry takes a function of the bar it fired on, and a title in its place is the study ' +
        "saying nothing about what happened.",
    );
    continue;
  }
  const fired = [];
  for (let index = 0; index < data.length; index += 1) {
    if (spec.when({ ...surface, index })) fired.push(index);
  }
  if (fired.length === 0) {
    problems.push(`alert ${spec.id} fired on no bar of the fixture, so its message was not read.`);
    continue;
  }
  const first = fired[0];
  const message = spec.message({ ...surface, index: first });
  if (message === spec.title || !message.includes('at ')) {
    problems.push(
      `alert ${spec.id} on bar ${first} gave "${message}", which is not the message the script ` +
        'computed on that bar.',
    );
  }
}

if (process.argv.includes('--list')) {
  for (const [output, entry] of Object.entries(record.outputs ?? {})) {
    for (const one of entry.narrowed ?? []) console.log(`${output}.${one.field}: ${one.why}`);
  }
  for (const one of record.counts ?? []) {
    console.log(`${one.output}: ${one.carries} of however many are declared. ${one.why}`);
  }
}

if (problems.length > 0) {
  fail(
    `Chart surface check failed with ${problems.length} problem` +
      `${problems.length === 1 ? '' : 's'}:\n- ${problems.join('\n- ')}`,
  );
}

const narrowings = Object.values(record.outputs ?? {}).reduce(
  (total, entry) => total + (entry.narrowed ?? []).length,
  0,
);
console.log(
  `Chart surface: every field of ${Object.keys(program.outputs).length} outputs is accounted for, ` +
    `${narrowings} of them recorded as narrowings, ${(record.counts ?? []).length} count limit ` +
    'recorded, and the descriptor read back what it was asked for.',
);
