/**
 * A run record, turned into the files a conformance case is made of.
 *
 * **The suite is harvested rather than written.** A case invented by hand tests
 * what somebody imagined a run does; a case taken from a run tests what a run
 * actually did. `conformance.md` section 2 says a case is one directory of named
 * files, and a record already holds every one of them: the script it ran, the
 * bars it ran over, the settings it ran with, and what came back. So this is a
 * projection and not a computation. Nothing here folds money, re-reads a report
 * or decides anything a run did not already decide.
 *
 * **Text out, and no I/O.** Core writes no files, so this returns the bytes and
 * the caller puts them where it likes. That also makes it testable without a
 * disk and usable from a browser, which is where most runs happen.
 *
 * **What it refuses, it refuses loudly.** A case with a missing file is worse
 * than no case: it fails on somebody else's engine and the blame lands on them.
 * So a record that cannot make a whole case does not make a partial one, and a
 * record that cannot make a faithful file does not guess at one: the script it
 * has no text for and the instrument fact its host never stated are both
 * refusals, never a hole and never a default.
 */
import { canonicalise } from '../emit/index.js';
import type { Instrument } from '../engine/index.js';
import type { RecordedBar, RecordedFrame, RunRecord } from './record.js';

/** The files of one case, keyed by the name `conformance.md` section 2 gives them. */
export type CaseFiles = Readonly<Record<string, string>>;

/** Why a record could not become a case. */
export interface CaseRefusal {
  readonly ok: false;
  readonly reason: string;
}

export interface CaseWritten {
  readonly ok: true;
  readonly files: CaseFiles;
}

export type CaseResult = CaseWritten | CaseRefusal;

/** What the caller has to say, because a record cannot know it. */
export interface CaseIdentity {
  /**
   * The directory path under the suite root, which is also the case id.
   *
   * The caller's because a record does not know where it will live, and
   * `case.json` repeats it on purpose so a directory that is moved without its
   * id being changed is caught by the suite rather than by a confused reader.
   */
  readonly id: string;
  /** One sentence. It is the failure message a runner prints. */
  readonly description: string;
  /** Section 7's categories. Defaults to the one a strategy run belongs to. */
  readonly category?: string;
}

/**
 * The channels a strategy run can be held to.
 *
 * Only what the record carries folded, and only what another engine could
 * produce independently. A case asserts the channels it names and no others, so
 * a change to drawing output cannot break a case about money.
 */
const STRATEGY_ASSERTS = ['diagnostics', 'orders', 'trades', 'performance'] as const;

/**
 * The files for one case, or the reason there are none.
 *
 * `now` is written only when the run pinned one. A case that names it when the
 * script never asked pins a clock the run did not depend on, and the next
 * reader has to work out whether it mattered.
 */
export function caseFilesFrom(record: RunRecord, identity: CaseIdentity): CaseResult {
  if (record.sourceText === null) {
    return {
      ok: false,
      reason:
        'the record carries no source text, so the case would have no script.os: ' +
        'record it with sourceText, or re-run the script to record one that has it',
    };
  }
  if (record.bars.form !== 'inline') {
    return {
      ok: false,
      reason:
        'the record points at its bars instead of holding them, and a case holds every ' +
        'byte of its own input: record it with form "inline"',
    };
  }
  if (identity.id.trim() === '') return { ok: false, reason: 'a case needs an id' };
  if (identity.description.trim() === '') {
    return { ok: false, reason: 'a case needs a one-sentence description, which is its failure message' };
  }
  const instrument = instrumentOf(record);
  if (!instrument.ok) return instrument;

  const files: Record<string, string> = {
    'case.json': json({
      id: identity.id,
      category: identity.category ?? 'strategy',
      profile: 'strategy',
      languageVersion: Number(record.languageVersion),
      description: identity.description,
      asserts: [...STRATEGY_ASSERTS],
      ...(record.settings.now === null ? {} : { now: record.settings.now }),
      tolerance: record.settings.tolerance,
    }),
    'script.os': endsWithNewline(record.sourceText),
    'bars.csv': barsCsv(record.bars.rows),
    // `conformance.md` section 4: performance is a list of one flat object
    // holding the summary statistics and nothing nested. The trades are their
    // own channel and are not repeated inside it, because a figure stated
    // twice in one case is a figure that can disagree with itself. The equity
    // curve, the monthly table and the markers are not written at all: the
    // first two are not conformance channels, being derived from fills and
    // closes the case already fixes, and a marker is a chart output the
    // `markers` channel owns, which a case about money does not assert.
    'expected.json': json({
      diagnostics: record.diagnostics,
      orders: record.orders,
      trades: record.report.trades,
      performance: [record.report.summary],
    }),
    // Section 2: the record of `host-interface.md` 4.1, which is what the
    // engine was handed and not the money layer's contract. The suite's
    // defaults for an absent file are boring on purpose and are not this run's
    // instrument, so the file is always written.
    'instrument.json': json(instrument.value),
  };

  // Without this the case is unpassable, on every engine including the one that
  // wrote it. `conformance.md` section 3 ends "a case with no `frames.csv` is
  // handed no frames at all", and what `expected.json` asserts through the
  // orders channel is what came of the frames: a status, a cumulative quantity,
  // an average fill price. An engine handed none of them folds nothing and
  // disagrees with every row, and the failure reads as a defect in that engine.
  //
  // Written only when the run had frames, because an empty file and an absent
  // one mean the same thing here and the absent one says it in fewer bytes.
  if (record.frames.length > 0) files['frames.csv'] = framesCsv(record.frames);

  // Written only when the run had inputs to write. An empty settings.json says
  // "these are the values" about nothing, and section 2 reads an absent one as
  // every input taking its declared default, which is what actually happened.
  if (Object.keys(record.settings.inputs).length > 0) {
    files['settings.json'] = json(record.settings.inputs);
  }

  return { ok: true, files };
}

/**
 * The instrument record a case can state faithfully, or why there is none.
 *
 * Two refusals, and both are the same refusal: the file `conformance.md`
 * section 2 names is the record of `host-interface.md` 4.1, and a record that
 * cannot produce that record cannot produce the file.
 *
 * A record written before version 3 carries none, because the facts beside
 * the contract were handed to the engine and written down nowhere. And 4.1
 * requires one fact of every host, `hasVolume`, which is the one the engine
 * does not refuse a run without: a run whose host never stated it ran with the
 * flag absent, so a file stating it would hand a second engine a different
 * study than the one the expected output came from, and a file omitting it is
 * not a 4.1 record. The other rules that page states about a record, a session
 * with no timezone to read it in, are refused at load, so a run that happened
 * cannot carry one.
 */
function instrumentOf(
  record: RunRecord,
): { readonly ok: true; readonly value: Instrument } | CaseRefusal {
  if (record.instrument === null) {
    return {
      ok: false,
      reason:
        'the record carries no instrument record, so the case would have no instrument.json: ' +
        'it was written before record version 3, and re-running the script records one',
    };
  }
  if (typeof record.instrument.hasVolume !== 'boolean') {
    return {
      ok: false,
      reason:
        'the run was handed no hasVolume, which host-interface.md 4.1 requires of every ' +
        'host, so instrument.json cannot be the record that page defines: run the script ' +
        'with the instrument facts stated',
    };
  }
  return { ok: true, value: record.instrument };
}

/**
 * Through the canonical writer, so a case's bytes are the record's bytes.
 *
 * There is one canonical writer in this repository and this is not a second
 * one: key order and number form are fixed for everybody, which is what lets a
 * case be compared as text at all.
 */
function json(value: unknown): string {
  return `${canonicalise(value)}\n`;
}

/** `conformance.md` section 3: header, one row per bar, oldest first, `none` for absent. */
function barsCsv(rows: readonly RecordedBar[]): string {
  const lines = ['time,open,high,low,close,volume'];
  for (const bar of rows) {
    lines.push(
      [bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume].map(cell).join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

/**
 * `conformance.md` section 3: the fields of a frame, in the order that page names.
 *
 * A projection and not a translation. The record already holds an intent as an
 * ordinal rather than as this engine's own id, for the reason the same section
 * gives: a case cannot know the id another engine minted and must not depend on
 * its spelling.
 */
function framesCsv(frames: readonly RecordedFrame[]): string {
  const lines = ['afterBar,intent,status,filledQty,avgFillPrice,orderRef,text'];
  for (const frame of frames) {
    lines.push(
      [
        String(frame.afterBar),
        String(frame.intent),
        frame.status,
        String(frame.filledQty),
        cell(frame.avgFillPrice),
        frame.orderRef ?? '',
        frame.text ?? '',
      ].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

/**
 * One cell.
 *
 * An absent field is `none` rather than empty, because an empty cell between two
 * commas is indistinguishable from a file somebody's editor trimmed, and a
 * language whose central idea is the absent value cannot be vague about it.
 */
function cell(value: number | null): string {
  return value === null ? 'none' : shortest(value);
}

/**
 * The shortest decimal that reads back as the same binary64.
 *
 * `String` already gives it for every finite double, which is the same rule the
 * canonical encoding uses. Stated here because a case is compared as text and a
 * number written two ways is a disagreement that is not one.
 */
function shortest(value: number): string {
  return Number.isFinite(value) ? String(value) : 'none';
}

/** A text file ends with a newline, so appending to it never joins two lines. */
function endsWithNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}
