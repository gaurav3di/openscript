/**
 * One conformance case, run on this engine: what it computed, and how that
 * compares with what the case expects.
 *
 * `conformance.md` section 9 gives an adapter two case-shaped invocations, and
 * this is the half of both that is about the engine rather than about the
 * command line. `caseAnswer` compiles `script.os`, runs the program over
 * `bars.csv` under `instrument.json` and `settings.json`, and hands back the
 * channels the case asserts in the encoding section 4 gives them, with no
 * comparison made: that is `--actual`. `caseResult` takes that answer and
 * compares it with `expected.json` under section 6, which is the plain
 * invocation. One comparison, in `compare.mjs`, is the whole of the second.
 *
 * ## The channels are the projection's, not a second list
 *
 * What this engine can be held to on a case is what `caseFilesFrom` writes
 * into a harvested case's `expected.json`, so the answer is read out of that
 * projection rather than out of a list typed here: the record of the run goes
 * through the same call the harvest uses, and the channels of the file it
 * would write are the channels this engine answers. A channel the case asserts
 * and that file does not hold is reported `unsupported`, by name.
 *
 * The one exception is `values`, which section 4 puts in `expected.csv` and a
 * record does not hold: a curve per plot is bytes every run would carry to serve
 * the few cases that ask. So a case asserting it is run with the rows kept
 * beside the record, and `case-values.mjs` projects them, to the second engine's
 * rules, which that adapter wrote first.
 *
 * ## The frames are the case's, and this engine folds them
 *
 * Section 3 says `frames.csv` supplies order frames the way `bars.csv` supplies
 * bars, so a case asserts the fold against input the engine did not choose. So
 * a case that holds the file is run through `backtestSupplied`, which delivers
 * those rows and answers none of its own, and a case that holds no file is run
 * through `backtest` against a simulated destination, because section 3 ends
 * that a case with no `frames.csv` is handed no frames at all.
 *
 * This once re-ran the case on that simulated destination whatever the file
 * said and held the frames its own run answered to `frames.csv` byte for byte,
 * reporting the case `unsupported` when the two differed. It could therefore
 * only ever answer a case whose frames this engine would have produced anyway:
 * a partial fill, a rejection, a cancellation, an expiry and a fill after a
 * terminal status are all shapes section 3 provides for and that reading
 * refused, so the suite could hold none of them and the agreement between two
 * engines was about the half of a destination's day that costs nobody
 * anything. Section 8 is the other half of the cost: an unsupported case inside
 * the claimed profile is not a passing run.
 *
 * **What it still cannot be handed is a frame no boundary of the run delivers.**
 * Section 3 puts a frame's delivery after the bar it names and its fold before
 * the next execution, so a row naming the last bar has no fold left and a row
 * naming no bar at all has no delivery: what becomes of either is not written
 * down anywhere, and the case is reported `unsupported` naming the row rather
 * than run with part of its own input passed over. The second engine says the
 * same of the first of the two.
 *
 * ## The settings a strategy case runs under are the case's, never a default
 *
 * Section 3's `backtest.json` carries the three facts the report was folded
 * under and the script never states: the digit count money is rounded to, the
 * charge schedule the host supplied and the report window. This engine once
 * took the digit count from the gate's fixture, no schedule and the whole
 * window, and passed every harvested case, because every harvested case had
 * been run under exactly those: a suite passed by coincidence. So the file is
 * read, whole, and every one of the three goes into the run's settings; a
 * strategy case without it is reported `error` by name, as the page promises,
 * and is not run under anything. A study folds no money, so a study case has
 * nothing for the file to state and runs without one.
 *
 * ## What else is said rather than guessed
 *
 * - Section 3's default instrument states no currency, and the money layer
 *   refuses to charge in none (OS6021), so a strategy case that states no
 *   `instrument.json` is answered with that refusal in its diagnostics.
 * - A compile warning is not in the diagnostics channel, because the record a
 *   harvested case is projected from holds what a run raised; a `warning`
 *   category case is therefore `unsupported`.
 * - `ticks.csv` and a secondary series are `unsupported`: a backtest replays
 *   no intrabar update and serves no series but its own.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suiteDefaultFacts } from './case-directory.mjs';
import { readCaseDirectory } from './case-reading.mjs';
import { compareChannels, toleranceFrom } from './compare.mjs';
import { readExpectedCsv, reported, valuesAnswer, valuesExpected } from './case-values.mjs';
import { CONTRACT, isStrategy, missingCapability } from './strategy-drive.mjs';

/** The name section 2 fixes for the source inside a case. */
const SCRIPT_NAME = 'script.os';

/** The files a projection writes that this reads back. */
const EXPECTED = 'expected.json';
const FRAMES = 'frames.csv';

/** Section 3: what a strategy run's report was folded under. */
const BACKTEST = 'backtest.json';

/** The three fields that file holds, and no other. */
const BACKTEST_FIELDS = ['digits', 'costs', 'range'];

/** Section 4's one columnar channel, written in `expected.csv` rather than `expected.json`. */
const VALUES = 'values';

/** The lines `print` wrote, which a record does not hold either. */
const LOG = 'log';

/** The category whose diagnostics this engine's record does not carry. */
const WARNING = 'warning';

/** The one contract field that is not an instrument fact: it is `backtest.json`'s. */
const DIGITS = 'digits';

/**
 * The count a study case runs under when it states none.
 *
 * A study places no order and folds no money, so no figure is rounded to the
 * count and the page requires the file of a strategy case only; the contract
 * still has to state one, and zero is the count that rounds nothing.
 */
const STUDY_DIGITS = 0;

/**
 * What this engine computed for one case, and what it could not.
 *
 * `engine` is `{ core, compile, page, vocabulary }`: the built package by its
 * door, the front end over it, the conformance page and the names read out
 * of it. Returns `{ id, error }` for a case that cannot be run at all, else
 * `{ id, declared, expected, channels, unsupported }`, where `unsupported`
 * names each feature the case needs and this engine lacks.
 */
export function caseAnswer(directory, engine) {
  const read = readCaseDirectory(directory, engine.vocabulary);
  if (!read.ok) return { id: null, error: read.reason };
  const { declared } = read;
  const id = declared.id;
  let expected = read.expected;
  const answer = (channels, unsupported) => ({ id, declared, expected, channels, unsupported });

  const unsupported = [];
  if (!engine.core.LANGUAGE_VERSIONS.includes(declared.languageVersion)) {
    unsupported.push(`language version ${String(declared.languageVersion)}`);
  }
  if (declared.category === WARNING) {
    unsupported.push(
      'a warning case: the diagnostics channel this engine records holds what a run raised, ' +
        'and a compile warning is not in it',
    );
  }
  if (read.ticks) unsupported.push('ticks.csv (section 3): this backtest replays no intrabar update');
  for (const name of read.secondary) {
    unsupported.push(`${name} (section 3): this backtest holds its own bars and serves no other series`);
  }
  const undelivered = undeliverable(read.frameRows, read.bars);
  if (undelivered !== null) unsupported.push(undelivered);
  if (unsupported.length > 0) return answer({}, unsupported);

  const compiled = engine.compile(SCRIPT_NAME, read.script);
  const errors = compiled.diagnostics.filter((one) => one.severity === 'error');
  if (errors.length > 0 || compiled.program === undefined) {
    return answer(withEmpty({ diagnostics: errors.map((one) => diagnosticRow(one)) }, declared.asserts), []);
  }
  if (read.bars === null) {
    const needing = declared.asserts.filter((channel) => channel !== 'diagnostics');
    if (needing.length > 0) {
      return { id, error: `the case asserts ${needing.join(', ')} and holds no bars.csv, which section 2 requires of an engine case` };
    }
    return answer({ diagnostics: [] }, []);
  }

  const instrument = read.instrument ?? suiteDefaultFacts(engine.page, {});
  if (instrument === null || typeof instrument !== 'object') {
    return { id, error: 'instrument.json is not an object, and section 3 no longer prints a default' };
  }
  if (typeof instrument.hasVolume !== 'boolean') {
    return { id, error: 'the instrument states no hasVolume, which host-interface.md 4.1 requires of every host' };
  }
  if (read.settings !== null && (typeof read.settings !== 'object' || Array.isArray(read.settings))) {
    return { id, error: 'settings.json is not an object of input values' };
  }
  const folded = backtestSettings(directory, isStrategy(compiled.program));
  if (!folded.ok) return { id, error: folded.reason };
  const { contract, facts } = partition(instrument, folded.value.digits);
  const settings = engine.core.settingsFor(contract, {
    inputs: read.settings ?? {},
    costs: folded.value.costs,
    range: folded.value.range,
    ...(declared.now === undefined ? {} : { now: declared.now }),
  });
  // Section 4 puts the values channel in expected.csv, one row per bar, so a
  // case asserting it is run with the rows kept and has that file read.
  const wantsValues = declared.asserts.includes(VALUES);
  const wantsLog = declared.asserts.includes(LOG);
  const driving = { sourceText: read.script, instrument: facts, rows: wantsValues, log: wantsLog };
  // Section 3: the file supplies the frames, and a case that holds none is
  // handed none. The second driver delivers what it is given and answers
  // nothing of its own, which is the whole difference between the two.
  const run =
    read.frameRows === null
      ? engine.core.backtest(compiled.program, read.bars, settings, driving)
      : engine.core.backtestSupplied(compiled.program, read.bars, settings, read.frameRows, driving);
  if (!run.ok) {
    const capability = missingCapability(run.diagnostic);
    if (capability !== null) {
      return answer({}, [`${capability}: a capability this engine's backtest host does not offer`]);
    }
    return answer(withEmpty({ diagnostics: [diagnosticRow(run.diagnostic)] }, declared.asserts), []);
  }

  const made = engine.core.caseFilesFrom(run.record, { id, description: declared.description });
  if (!made.ok) return { id, error: `this engine's record could not be projected to a case: ${made.reason}` };
  const produced = JSON.parse(made.files[EXPECTED]);

  const columns = columnProblem(read.frames, made.files[FRAMES] ?? null);
  if (columns !== null) return { id, error: columns };
  const channels = {};
  if (wantsValues) {
    const csv = read.expectedCsv === null ? null : readExpectedCsv(read.expectedCsv);
    if (csv === null) return { id, error: 'the case asserts values and holds no expected.csv, which section 4 says is where they are written' };
    if (!csv.ok) return { id, error: csv.reason };
    const projected = valuesAnswer(csv.columns, compiled.program, run.rows ?? []);
    unsupported.push(...projected.unsupported);
    channels[VALUES] = projected.values;
    const wanted = valuesExpected(csv, compiled.program);
    if (wanted.ok) expected = { ...(expected !== null && typeof expected === 'object' ? expected : {}), [VALUES]: wanted.values };
    else if (!wanted.ok && projected.unsupported.length === 0) return { id, error: wanted.reason };
  }
  if (wantsLog) {
    channels[LOG] = (run.log ?? []).map((line) => ({ barIndex: line.barIndex, time: line.time, value: reported(line.value) }));
  }
  for (const channel of declared.asserts) {
    if (channel === VALUES || channel === LOG) continue;
    if (channel in produced) channels[channel] = produced[channel];
    else unsupported.push(`the ${channel} channel: this engine's projection writes ${Object.keys(produced).join(', ')}`);
  }
  return answer(channels, unsupported);
}

/**
 * The plain invocation: the answer above, compared with the case's expected
 * file under section 6, to one of section 9's outcomes.
 */
export function caseResult(directory, engine) {
  const answer = caseAnswer(directory, engine);
  if (answer.error !== undefined) return { id: answer.id, outcome: 'error', reason: answer.error };
  if (answer.unsupported.length > 0) {
    return { id: answer.id, outcome: 'unsupported', feature: answer.unsupported.join('; ') };
  }
  const tolerance = toleranceFrom(answer.declared.tolerance, engine.caps);
  if (!tolerance.ok) return { id: answer.id, outcome: 'error', reason: `case.json: ${tolerance.reason}` };
  if (answer.expected === null || typeof answer.expected !== 'object') {
    return { id: answer.id, outcome: 'error', reason: 'expected.json is missing or is not an object' };
  }
  for (const channel of answer.declared.asserts) {
    if (!(channel in answer.expected)) {
      return { id: answer.id, outcome: 'error', reason: `expected.json holds no ${channel}, which case.json asserts` };
    }
  }
  return { id: answer.id, ...compareChannels(answer.declared.asserts, answer.channels, answer.expected, tolerance) };
}

/**
 * The frames of a case that no boundary of its run delivers, or nothing.
 *
 * Section 3 delivers a frame after the bar it names and folds it before the
 * next execution, so the last bar has no fold after it and a row naming no bar
 * of the run has nothing to be delivered at. Neither is written down anywhere,
 * so a case carrying one is named rather than run with part of its own input
 * passed over, which would be a pass over frames the engine never saw.
 */
function undeliverable(rows, bars) {
  if (rows === null) return null;
  const count = bars === null ? 0 : bars.length;
  const beyond = rows.filter((row) => row.afterBar < 0 || row.afterBar >= count - 1);
  if (beyond.length === 0) return null;
  const one = beyond[0];
  return (
    `${FRAMES} (section 3): ${String(beyond.length)} frame${beyond.length === 1 ? '' : 's'} ` +
    `delivered after bar ${String(one.afterBar)} of ${String(count)}, which is a boundary this ` +
    'run has no execution after'
  );
}

/**
 * The columns a case names, held to the ones this engine writes.
 *
 * Section 3 reads the fields by position and drops the optional ones from the
 * right, so a case's header is a prefix of the whole list and any other header
 * names its fields in an order nothing reads. The list is not written out here:
 * it is the header the projection writes, which is where this engine states the
 * columns once, and the byte comparison that used to catch a bad header caught
 * it as a difference in the frames rather than as the malformed case it is.
 */
function columnProblem(supplied, written) {
  if (supplied === null || written === null) return null;
  const named = headerOf(supplied);
  const whole = headerOf(written);
  if (named === whole || whole.startsWith(`${named},`)) return null;
  return `${FRAMES}: its columns are ${named}, and section 3 gives ${whole}, dropped from the right`;
}

/** The first line of a file, which is the header row of a case's own CSV. */
function headerOf(text) {
  const at = text.indexOf('\n');
  return at === -1 ? text : text.slice(0, at);
}

/** The asserted channels a run that did not happen has nothing for, as empty lists. */
function withEmpty(channels, asserts) {
  const out = { ...channels };
  for (const channel of asserts) if (!(channel in out)) out[channel] = [];
  return out;
}

/** A diagnostic in the columns the record projects one to, before any bar ran. */
function diagnosticRow(diagnostic) {
  return {
    code: diagnostic.code,
    line: diagnostic.span.line,
    column: diagnostic.span.column,
    severity: diagnostic.severity,
    barIndex: null,
  };
}

/**
 * `backtest.json`, read by section 3's shape, or why the case cannot run.
 *
 * Required of a strategy case, and the refusal says so in the page's words
 * rather than running the case under a count somebody assumed. A study case
 * that states none runs under the count that rounds nothing; one that states
 * the file is read like any other, because a file the table names is input.
 * The shape is held: a digit count that is not a whole number of zero or more,
 * a schedule that is neither `null` nor an object, a window bound that is
 * neither `null` nor an integer, and a field the page does not name are each
 * a malformed case, which section 9 files under `error`. Whether a stated
 * schedule can be evaluated is the run's own question (OS6021), answered in
 * the diagnostics channel like every other refusal a run makes.
 */
function backtestSettings(directory, strategy) {
  const path = join(directory, BACKTEST);
  const refused = (reason) => ({ ok: false, reason: `${BACKTEST}: ${reason}` });
  if (!existsSync(path)) {
    if (!strategy) return { ok: true, value: { digits: STUDY_DIGITS, costs: null, range: { from: null, to: null } } };
    return refused(
      'missing, and section 3 requires it of a strategy case; a digit count nobody stated is a ' +
        'figure two engines round differently, so the case is not run under a default',
    );
  }
  let held;
  try {
    held = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return refused('not JSON');
  }
  if (held === null || typeof held !== 'object' || Array.isArray(held)) return refused('not an object');
  for (const key of Object.keys(held)) {
    if (!BACKTEST_FIELDS.includes(key)) return refused(`states ${key}, which section 3 does not name`);
  }
  for (const key of BACKTEST_FIELDS) {
    if (!(key in held)) return refused(`states no ${key}, which section 3 requires`);
  }
  const { digits, costs, range } = held;
  if (!Number.isInteger(digits) || digits < 0) {
    return refused(`digits is ${JSON.stringify(digits)}, and section 3 gives a whole number of decimal places`);
  }
  if (costs !== null && (typeof costs !== 'object' || Array.isArray(costs))) {
    return refused('costs is neither null nor a charge schedule');
  }
  if (range === null || typeof range !== 'object' || Array.isArray(range)) return refused('range is not an object');
  for (const bound of ['from', 'to']) {
    if (range[bound] !== null && !Number.isInteger(range[bound])) {
      return refused(`range.${bound} is neither null nor an integer of UTC milliseconds`);
    }
  }
  return { ok: true, value: { digits, costs, range: { from: range.from, to: range.to } } };
}

/**
 * The instrument record split the way `backtest` takes it: the six facts the
 * money layer's contract holds, and the rest beside it.
 *
 * The partition is read from the fixture's contract rather than written here,
 * as `suiteDefaultFacts` reads it, so there is one statement of which facts
 * are the contract's. The digit count is `backtest.json`'s, handed in, because
 * `host-interface.md` 4.1 has no such fact and section 3 gives it that file;
 * the currency and the point value take what the contract's own shape says of
 * a host that states none.
 */
function partition(instrument, digits) {
  const contract = {};
  const facts = {};
  for (const key of Object.keys(CONTRACT)) {
    if (key === DIGITS) contract[key] = digits;
    else if (key === 'currency') contract[key] = instrument[key] ?? '';
    else if (key === 'pointValue') contract[key] = instrument[key] ?? 1;
    else contract[key] = instrument[key] ?? null;
  }
  for (const [key, value] of Object.entries(instrument)) {
    if (!(key in CONTRACT)) facts[key] = value;
  }
  return { contract, facts };
}
