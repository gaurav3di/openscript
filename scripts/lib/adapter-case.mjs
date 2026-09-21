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
 * ## What else is said rather than guessed
 *
 * - A rounding digit count for money is a fact of a run (`accounting`'s
 *   contract) that no file section 2 names carries. The fixture's is used,
 *   because every harvested case ran under it, and the page owes a place for
 *   it before a second engine can know it.
 * - Section 3's default instrument states no currency, and the money layer
 *   refuses to charge in none (OS6021), so a strategy case that states no
 *   `instrument.json` is answered with that refusal in its diagnostics.
 * - A compile warning is not in the diagnostics channel, because the record a
 *   harvested case is projected from holds what a run raised; a `warning`
 *   category case is therefore `unsupported`.
 * - `ticks.csv` and a secondary series are `unsupported`: a backtest replays
 *   no intrabar update and serves no series but its own.
 */
import { suiteDefaultFacts } from './case-directory.mjs';
import { readCaseDirectory } from './case-reading.mjs';
import { compareChannels, toleranceFrom } from './compare.mjs';
import { CONTRACT, missingCapability } from './strategy-drive.mjs';

/** The name section 2 fixes for the source inside a case. */
const SCRIPT_NAME = 'script.os';

/** The files a projection writes that this reads back. */
const EXPECTED = 'expected.json';
const FRAMES = 'frames.csv';

/** The category whose diagnostics this engine's record does not carry. */
const WARNING = 'warning';

/** The one contract field that is not an instrument fact. */
const DIGITS = 'digits';

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
  const { contract, facts } = partition(instrument);
  const settings = engine.core.settingsFor(contract, {
    inputs: read.settings ?? {},
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
 * The instrument record split the way `backtest` takes it: the six facts the
 * money layer's contract holds, and the rest beside it.
 *
 * The partition is read from the fixture's contract rather than written here,
 * as `suiteDefaultFacts` reads it, so there is one statement of which facts
 * are the contract's. The digit count is the fixture's for the reason at the
 * top of this file; the currency and the point value take what the contract's
 * own shape says of a host that states none.
 */
function partition(instrument) {
  const contract = {};
  const facts = {};
  for (const key of Object.keys(CONTRACT)) {
    if (key === DIGITS) contract[key] = CONTRACT[key];
    else if (key === 'currency') contract[key] = instrument[key] ?? '';
    else if (key === 'pointValue') contract[key] = instrument[key] ?? 1;
    else contract[key] = instrument[key] ?? null;
  }
  for (const [key, value] of Object.entries(instrument)) {
    if (!(key in CONTRACT)) facts[key] = value;
  }
  return { contract, facts };
}
