/**
 * The Phase 5 gate, executed rather than promised.
 *
 * `ROADMAP.md` says a phase is finished when its gate holds, and Phase 5's gate
 * is two sentences: **a backtest is reproducible from its stored script
 * revision months later, and two runs can be compared well enough to tell a
 * real improvement from noise.** Every other claim this repository makes is
 * enforced by a script in this directory. That one was enforced by unit tests
 * over a probe strategy, which is a weaker thing than it sounds: a probe is
 * written by whoever wrote the engine, on the same afternoon, and it exercises
 * the paths they were thinking about.
 *
 * So this runs the gate over the **shipped strategy examples**, which are the
 * programs a stranger reads first and the ones nobody wrote to make a test
 * pass. If a real script cannot be stored and reproduced, the gate does not
 * hold, whatever the probe says.
 *
 * ## What "months later" is made to mean here
 *
 * Not "call rerun on the object we are still holding". A record is written to
 * JSON text, **every other reference to the run is dropped**, and the record is
 * parsed back from that text alone. Everything below happens on the parsed
 * copy. That is the claim a trader is actually making when they save a run: the
 * file is enough, and the process that produced it is gone.
 *
 * Four things are checked of every example, and each is a way the claim fails:
 *
 * 1. **The document survives its own round trip.** Written, parsed, written
 *    again, and the two texts compared as bytes. A record that loses a field in
 *    JSON is a record that replays to something else on the machine that reads
 *    it back.
 * 2. **The report is a function of the fills.** `replay` folds the money again
 *    from the parsed record's own fills with no bar executed, and has to give
 *    the report the record carries. Anything else means the report was reading
 *    state the engine happened to be holding, which nobody else has.
 * 3. **The run is a function of the record.** `rerun` executes the parsed
 *    record's program over its bars under its settings, and the two documents
 *    are compared as bytes. A tolerance exists for a second implementation and
 *    is never this engine's excuse: a rerun here is bit-identical or it is a
 *    defect.
 * 4. **Revised bars are refused.** History is revised, and a replay over bars
 *    that do not hash to the record's has to refuse rather than report the
 *    original figures over different data. This is the direction that fails
 *    silently: reporting is exactly what a broken check would still do.
 *
 * And two about the comparison, which is the gate's second sentence:
 *
 * 5. **A run compared with itself moves nothing.** Every delta zero, no
 *    difference named. A comparison that cannot report "nothing changed" cannot
 *    report a change either.
 * 6. **An incomparable pair is refused a separation.** Two runs over different
 *    bars are two studies, and a separation between them is a number with
 *    nothing behind it. The check hands the comparison a pair it must refuse,
 *    with standard errors that would otherwise produce a figure, so that a
 *    withheld null is distinguishable from a null that arrived by accident.
 *
 * Run: node scripts/check-reproducible.mjs
 * Needs `npm run build` first: it runs the compiler and the engine, not a
 * reading of their source.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CORE_MODULE, EMITTER_MODULE, fromRoot } from './lib/built.mjs';
import { frontEndWith } from './lib/example-run.mjs';

const CORE = fromRoot(CORE_MODULE);
const EXAMPLES = 'examples';

const core = await import(CORE_MODULE);
const emitter = await import(EMITTER_MODULE);
// The same front end the example check compiles through, rather than a second
// spelling of the pipeline that would drift from it.
const compile = frontEndWith(core, emitter);
const { backtest, canonicalise, compareRuns, recordFromJson, recordToJson, replay, rerun, runBytes, settingsFor } =
  core;

/**
 * A placeholder instrument, priced in a currency nobody issues.
 *
 * The examples name no symbol and the gate is about the fold, not about a
 * market. What matters is that every machine uses these same facts.
 */
const CONTRACT = {
  symbol: 'AAA',
  exchange: 'XX',
  currency: 'CUR',
  tickSize: 0.05,
  lotSize: 1,
  pointValue: 1,
  digits: 2,
};

const HOUR = 3_600_000;
const START = 1_748_736_000_000;

/**
 * Bars from a fixed formula, not from a market.
 *
 * A wave with a trend under it and a range around each close: enough shape for
 * a crossing strategy to take trades on both sides, and identical on every
 * machine that runs this, which is the only property the gate needs of them.
 * No random number generator anywhere, because a gate that runs over different
 * bars each time is a gate that fails for a different reason each time.
 */
function bars(count) {
  const out = [];
  for (let index = 0; index < count; index += 1) {
    const close = 100 + index * 0.05 + Math.sin(index / 7) * 6 + Math.sin(index / 23) * 11;
    out.push({
      time: START + index * HOUR,
      open: round(close - 0.3),
      high: round(close + 1.1),
      low: round(close - 1.2),
      close: round(close),
      volume: 1000 + (index % 17) * 25,
      oi: null,
    });
  }
  return out;
}

/** Two digits, so the input is a price and not a float nobody can read back. */
function round(value) {
  return Math.round(value * 100) / 100;
}

const BARS = bars(400);
/** The same history with one close revised, which is what a feed does. */
const REVISED = BARS.map((bar, index) => (index === 137 ? { ...bar, close: bar.close + 9 } : bar));

const problems = [];
/**
 * A strategy this driver cannot carry, named rather than passed over.
 *
 * `conformance.md` section 8 has the rule and this follows it: a case an
 * implementation does not support is reported with the feature named, is not a
 * pass, is not a failure, and is counted and printed separately. A driver that
 * quietly skipped what it could not run would report a green gate whose number
 * fell every time somebody added a strategy it could not carry, and nobody
 * would see the number fall.
 */
const unsupported = [];
let checked = 0;
let skipped = 0;

const files = readdirSync(EXAMPLES)
  .filter((name) => name.endsWith('.oscript'))
  .sort();

for (const name of files) {
  const path = join(EXAMPLES, name);
  const text = readFileSync(path, 'utf8');
  const compiled = compile(name, text);
  if (compiled.diagnostics.some((one) => one.severity === 'error')) {
    problems.push(`${path}: does not compile, so the gate cannot be run over it`);
    continue;
  }
  // A study places no orders, so it has no run to reproduce. Counted and named
  // rather than passed over: a suite that silently skipped every file would
  // report a green gate over nothing at all.
  if (compiled.program.meta?.kind !== 'strategy') {
    skipped += 1;
    continue;
  }

  const first = backtest(compiled.program, BARS, settingsFor(CONTRACT));
  if (!first.ok) {
    // OS6006 is the program asking for a capability this engine does not offer,
    // which is a fact about the driver's host and not about reproducibility. A
    // strategy that reads another instrument needs a provider a backtest over
    // one series of bars does not have.
    if (first.diagnostic.code === 'OS6006') {
      unsupported.push(`${path}: ${String(first.diagnostic.values?.tag ?? first.diagnostic.code)}`);
      continue;
    }
    problems.push(`${path}: the run could not start: ${first.diagnostic.code}`);
    continue;
  }

  // Months later. The text is all that is kept; the record the run produced is
  // not read again below.
  const stored = recordToJson(first.record);
  const record = recordFromJson(stored);
  if (record === null) {
    problems.push(
      `${path}: the stored document does not parse back, so the run is not reproducible ` +
        'from the file alone',
    );
    continue;
  }
  checked += 1;

  if (recordToJson(record) !== stored) {
    problems.push(`${path}: the document does not survive its own round trip`);
  }

  const replayed = replay(record);
  if (!replayed.ok) {
    problems.push(`${path}: the stored run cannot be reported again: ${replayed.diagnostic.code}`);
    // Through the repository's one canonical writer, not JSON.stringify.
    // A record parsed back from text carries its keys in the text's order and a
    // freshly folded report carries them in construction order, so comparing
    // the two as JSON compares key order and fails on two identical reports.
  } else if (canonicalise(replayed.report) !== canonicalise(record.report)) {
    problems.push(
      `${path}: replaying the record gives a different report, so the report is not a ` +
        'function of the fills the record carries',
    );
  }

  const again = rerun(record);
  if (!again.ok) {
    problems.push(`${path}: the stored run cannot be run again: ${again.diagnostic.code}`);
    // Over the run and not over the version stamp beside it: a record stored
    // under one release and rerun under the next is the same run, and a whole
    // byte comparison would call the upgrade a defect.
  } else if (runBytes(again.record) !== runBytes(record)) {
    problems.push(`${path}: running the record again produces a different run`);
  }

  const wrong = replay(record, REVISED);
  if (wrong.ok) {
    problems.push(
      `${path}: replaying over revised bars reported figures instead of refusing, so a ` +
        'record can be reported over data it was not made from',
    );
  }

  const withItself = compareRuns(record, record);
  if (!withItself.comparable || withItself.differences.length > 0) {
    problems.push(`${path}: a run does not compare as identical with itself`);
  } else if (withItself.deltas.some((one) => one.delta !== 0)) {
    problems.push(`${path}: comparing a run with itself reports a figure that moved`);
  }

  // A pair that must be refused, with the noise a real answer would need, so a
  // withheld separation is distinguishable from one that was null anyway.
  const noisy = (value, error) => ({
    ...record,
    report: {
      ...record.report,
      summary: { ...record.report.summary, expectancy: value, expectancyStandardError: error },
    },
  });
  const other = backtest(compiled.program, REVISED, settingsFor(CONTRACT));
  if (other.ok) {
    const across = compareRuns(noisy(4, 3), {
      ...other.record,
      report: {
        ...other.record.report,
        summary: {
          ...other.record.report.summary,
          expectancy: 12,
          expectancyStandardError: 4,
        },
      },
    });
    if (across.comparable) {
      problems.push(`${path}: two runs over different bars compared as comparable`);
    }
    if (across.separation !== null) {
      problems.push(
        `${path}: an incomparable pair was given a separation of ${String(across.separation)}, ` +
          'which is a figure with nothing behind it',
      );
    }
  }
}

if (checked === 0) {
  problems.push(
    `No strategy example under ${EXAMPLES}/ was reproduced, so this check proved nothing. ` +
      'A gate that runs over an empty list passes for ever.',
  );
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(
    `\n${problems.length} failure${problems.length === 1 ? '' : 's'} of the Phase 5 gate. ` +
      'A backtest that cannot be reproduced from its own document, or a comparison that ' +
      'reports a result where there is none, is a figure somebody will trade on.',
  );
  process.exit(1);
}

if (unsupported.length > 0) {
  console.log(
    `${unsupported.length} shipped strateg${unsupported.length === 1 ? 'y needs' : 'ies need'} ` +
      'a capability this driver cannot supply, so the gate was not run over ' +
      `${unsupported.length === 1 ? 'it' : 'them'}:`,
  );
  for (const one of unsupported) console.log(`  ${one}`);
}

console.log(
  `Phase 5 gate passed over ${checked} shipped strateg${checked === 1 ? 'y' : 'ies'} ` +
    `and ${BARS.length} bars, ${skipped} example${skipped === 1 ? '' : 's'} being studies ` +
    'that place no orders. Each run was written to JSON, parsed back from that text alone, ' +
    'and then: reported again from its own fills to the same report, executed again to the ' +
    'same bytes, refused a replay over revised bars, compared with itself to no movement, ' +
    'and refused a separation against a run over other bars. What this does not prove is ' +
    `the part that needs somebody else's engine, which is Phase 6: these runs agree with ` +
    `this engine, and ${CORE} is the only engine here.`,
);
