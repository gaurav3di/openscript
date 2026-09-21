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
 * ## The frames, and the one thing this engine cannot be handed
 *
 * Section 3 says `frames.csv` supplies order frames the way `bars.csv`
 * supplies bars, so a case asserts the fold against input the engine did not
 * choose. This engine's backtest answers its own frames from a simulated
 * destination and takes none from a file. So the frames its destination
 * answered are projected through the same call and held to `frames.csv` byte
 * for byte: when they are the same frames, the fold was over the case's input
 * and the answer stands; when they are not, the engine was not handed the
 * case's frames, and the case is reported `unsupported` with that said, rather
 * than as a pass over frames of the engine's own choosing or as a failure of a
 * fold that never saw the file. A case with no `frames.csv` whose run answered
 * frames is the same shortfall the other way round.
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
  const answer = (channels, unsupported) => ({
    id,
    declared,
    expected: read.expected,
    channels,
    unsupported,
  });

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
  const run = engine.core.backtest(compiled.program, read.bars, settings, {
    sourceText: read.script,
    instrument: facts,
  });
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

  const answered = made.files[FRAMES] ?? null;
  if (answered !== read.frames) {
    unsupported.push(
      'frames.csv (section 3): this engine folds only the frames its own destination answers, ' +
        `and they are not the case's (${read.frames === null ? 'the case supplies none' : answered === null ? 'the run answered none' : 'they differ'})`,
    );
  }
  const channels = {};
  for (const channel of declared.asserts) {
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
