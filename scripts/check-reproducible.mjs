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
import { CORE_MODULE, EMITTER_MODULE, fromRoot } from './lib/built.mjs';
import { frontEndWith } from './lib/example-run.mjs';
import {
  BAR_COUNT,
  CONTRACT,
  EXAMPLES,
  formulaBars,
  isStrategy,
  missingCapability,
  shippedExamples,
} from './lib/strategy-drive.mjs';

const CORE = fromRoot(CORE_MODULE);

const core = await import(CORE_MODULE);
const emitter = await import(EMITTER_MODULE);
// The same front end the example check compiles through, rather than a second
// spelling of the pipeline that would drift from it.
const compile = frontEndWith(core, emitter);
const { backtest, canonicalise, compareRuns, recordFromJson, recordToJson, replay, rerun, runBytes, settingsFor } =
  core;

// The contract and the bars are the fixture the harvest writes cases from, so
// what this gate reproduces is what the suite holds: `lib/strategy-drive.mjs`
// says why they are one fixture and not two.
const BARS = formulaBars(BAR_COUNT);
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

for (const { name, path, text } of shippedExamples()) {
  const compiled = compile(name, text);
  if (compiled.diagnostics.some((one) => one.severity === 'error')) {
    problems.push(`${path}: does not compile, so the gate cannot be run over it`);
    continue;
  }
  // A study places no orders, so it has no run to reproduce. Counted and named
  // rather than passed over: a suite that silently skipped every file would
  // report a green gate over nothing at all.
  if (!isStrategy(compiled.program)) {
    skipped += 1;
    continue;
  }

  const first = backtest(compiled.program, BARS, settingsFor(CONTRACT));
  if (!first.ok) {
    // A capability this driver's host does not offer is a fact about the host
    // and not about reproducibility, and is named rather than passed over.
    const capability = missingCapability(first.diagnostic);
    if (capability !== null) {
      unsupported.push(`${path}: ${capability}`);
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
