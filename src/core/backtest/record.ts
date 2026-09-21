/**
 * The run record: a whole run as a plain JSON document.
 *
 * **The record is the conformance case.** That is the one decision this module
 * exists to hold, and everything in it follows from it: no object reference, no
 * function, no dependence on this implementation's internals, and nothing that
 * only this engine can read. A record carries the script revision, the compiled
 * program, the bars, the settings the host chose, the frames the destination
 * answered in delivery order, the fills the engine folded in fold order, the
 * ledger the run ended with, the diagnostics and the report.
 *
 * **The bars are inline or referenced, and both carry the same hash.** Inline is
 * the conformance form, because a case has to hold every byte of its own input.
 * Referenced is the operational form, because the smallest deployment has a one
 * megabyte request body and nothing that grows with history may travel in one.
 * A replay whose bars do not hash to the record's hash is OS6022 rather than a
 * silently different study.
 *
 * **The frames name an intent by ordinal and never by an engine's own id**,
 * because a case cannot know what id another engine minted. The same reason the
 * ledger rows here are flat words rather than this engine's own types.
 *
 * The record is written through the existing canonical encoding, so there is one
 * canonical writer in the repository and key order and number form are fixed for
 * everybody.
 */
import type { RecordedFill, Report } from '../accounting/index.js';
import type { Diagnostic } from '../diagnostics/index.js';
import { canonicalise, programHash, sha256 } from '../emit/index.js';
import type { CompiledProgram, SourceStamp } from '../emit/index.js';
import type { LedgerRow } from '../engine/index.js';
import { VERSION } from '../version/index.js';
import type { BacktestSettings } from './settings.js';

/** One bar as a record holds it. */
export interface RecordedBar {
  readonly time: number | null;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly close: number | null;
  readonly volume: number | null;
  readonly oi: number | null;
}

/**
 * The bars, held or pointed at.
 *
 * Both forms carry the same hash, computed the same way over the canonical
 * tuple of each bar, so a referenced record can be turned into an inline one by
 * whoever holds the bars and the result is the same case.
 */
export type BarsInRecord =
  | {
      readonly form: 'inline';
      readonly hash: string;
      readonly count: number;
      readonly rows: readonly RecordedBar[];
    }
  | {
      readonly form: 'referenced';
      readonly hash: string;
      readonly count: number;
      readonly firstTime: number | null;
      readonly lastTime: number | null;
    };

/** The columns of `conformance.md`'s frames.csv, in its order and with its names. */
export interface RecordedFrame {
  readonly afterBar: number;
  /** An ordinal, 1-based, never an engine's own id. */
  readonly intent: number;
  readonly status: string;
  readonly filledQty: number;
  readonly avgFillPrice: number | null;
  readonly orderRef: string | null;
  readonly text: string | null;
}

/** A ledger row of `stdlib.md` 17.7, flattened: the `orders` channel of expected.json. */
export interface RecordedOrder {
  readonly intent: number;
  readonly orderRef: string;
  readonly tag: string;
  readonly leg: string;
  readonly positionRef: number;
  readonly symbol: string | null;
  readonly exchange: string | null;
  readonly product: string;
  readonly side: string;
  readonly qty: number | null;
  readonly qtyType: string;
  readonly type: string | null;
  readonly price: number | null;
  readonly trigger: number | null;
  readonly status: string;
  readonly filledQty: number;
  readonly avgFillPrice: number | null;
  readonly rejection: string | null;
  readonly placedAt: number | null;
  readonly updatedAt: number | null;
  readonly units: number | null;
}

/** A diagnostic as a record holds it: the code, the span and the bar. */
export interface RecordedDiagnostic {
  readonly code: string;
  readonly line: number;
  readonly column: number;
  readonly severity: string;
  readonly barIndex: number | null;
}

/** One run, whole, and readable by an engine that is not this one. */
export interface RunRecord {
  readonly recordVersion: number;
  readonly engine: { readonly name: string; readonly version: string };
  readonly languageVersion: string;
  /** Already plain data. */
  readonly program: CompiledProgram;
  readonly programHash: string;
  /** Hash, lines, file: the script revision. */
  readonly source: SourceStamp;
  readonly settings: BacktestSettings;
  readonly bars: BarsInRecord;
  /** What the destination answered, in delivery order. */
  readonly frames: readonly RecordedFrame[];
  /** What the engine folded, in fold order. */
  readonly fills: readonly RecordedFill[];
  /** The ledger at the end, oldest first. */
  readonly orders: readonly RecordedOrder[];
  readonly diagnostics: readonly RecordedDiagnostic[];
  readonly report: Report;
}

/**
 * The revision of this document's own shape.
 *
 * A reader is handed a record and has to know what it is looking at before it
 * reads a field, so the number is first in the document and is written by this
 * file alone. It moves when a channel is added or a meaning changes, never when
 * a figure in a report does.
 */
export const RECORD_VERSION = 1;

/** What this engine calls itself in a record it wrote. */
const ENGINE_NAME = 'openscript';

/** The parts a run hands over, each already in the shape the record holds. */
export interface RecordParts {
  readonly program: CompiledProgram;
  readonly settings: BacktestSettings;
  readonly bars: readonly RecordedBar[];
  /**
   * Whether the bars travel in the record or are pointed at.
   *
   * Inline is the conformance form, because a case holds every byte of its own
   * input. Referenced is the operational form, because nothing that grows with
   * history may travel in a request body. Both carry the same hash over the
   * same canonical tuples, so one becomes the other without becoming a
   * different case.
   */
  readonly form: 'inline' | 'referenced';
  readonly frames: readonly RecordedFrame[];
  readonly fills: readonly RecordedFill[];
  readonly orders: readonly RecordedOrder[];
  readonly diagnostics: readonly RecordedDiagnostic[];
  readonly report: Report;
}

/**
 * One run, as the document another engine is handed.
 *
 * Nothing is computed here. Every channel arrives folded, because what a record
 * says has to be what the run did rather than what a second fold of the same
 * inputs came to: a record that recomputed its own report would agree with
 * itself whatever the engine had actually done.
 */
export function recordOf(parts: RecordParts): RunRecord {
  return {
    recordVersion: RECORD_VERSION,
    engine: { name: ENGINE_NAME, version: VERSION },
    languageVersion: String(parts.program.openscript.language),
    program: parts.program,
    programHash: programHash(parts.program),
    source: parts.program.source,
    settings: parts.settings,
    bars: barsIn(parts.bars, parts.form),
    frames: parts.frames,
    fills: parts.fills,
    orders: parts.orders,
    diagnostics: parts.diagnostics,
    report: parts.report,
  };
}

/**
 * The bars, held or pointed at, and the same hash either way.
 *
 * The referenced form keeps the first and last times so that a reader can say
 * which bars are wanted without holding them, and the count so that a set of
 * the wrong length is known to be wrong before it is hashed.
 */
export function barsIn(bars: readonly RecordedBar[], form: 'inline' | 'referenced'): BarsInRecord {
  const hash = barsHash(bars);
  if (form === 'inline') {
    return { form: 'inline', hash, count: bars.length, rows: bars };
  }
  return {
    form: 'referenced',
    hash,
    count: bars.length,
    firstTime: bars[0]?.time ?? null,
    lastTime: bars[bars.length - 1]?.time ?? null,
  };
}

/**
 * The hash a record names its bars by.
 *
 * Over the canonical tuple of each bar, in the order they were supplied, and
 * through the canonical encoding the compiled program is hashed with, so there
 * is one canonical writer in the repository rather than two that agree until
 * one of them is changed. A tuple rather than an object, because the field
 * order is then the specification's and not a sort's.
 */
export function barsHash(bars: readonly RecordedBar[]): string {
  const tuples = bars.map((bar) => [
    bar.time,
    bar.open,
    bar.high,
    bar.low,
    bar.close,
    bar.volume,
    bar.oi,
  ]);
  return 'sha256:' + sha256(canonicalise(tuples));
}

/**
 * The record as the bytes another engine reads.
 *
 * Through the canonical encoding, so key order is fixed, every number is in the
 * shortest decimal form that reads back as itself, and two runs of the same
 * record produce the same bytes on every machine. That is what makes the
 * reproducibility test a byte comparison rather than a tour of the fields.
 */
export function recordToJson(record: RunRecord): string {
  return canonicalise(record);
}

/**
 * The run, without who produced it.
 *
 * **`engine` is provenance, and provenance is not part of the run.** The claim
 * a rerun makes is that the run is a function of the record, and that claim has
 * to survive the engine it runs on being upgraded: a record stored under
 * `0.3.0` and rerun under `0.4.0` produces the same trades, the same fills and
 * the same money, and a document carrying the version stamp inside the bytes
 * being compared says it does not.
 *
 * It was compared as whole bytes until the first version bump would have broken
 * it, which is a test that passes for exactly as long as nothing changes and
 * then fails for the one reason that is not a defect. So the stamp stays in the
 * record, because knowing which engine wrote a run is worth keeping, and the
 * comparison is made over everything else.
 */
export function runBytes(record: RunRecord): string {
  const { engine: _engine, ...run } = record;
  return canonicalise(run);
}

/**
 * A record read back from those bytes.
 *
 * A parse and not a validation: what comes back is the document as it was
 * written, and a document this engine did not write is the caller's to trust or
 * not. The one thing asserted is the revision, because reading a later
 * revision's fields under this one's rules is how a record silently becomes a
 * different run.
 */
export function recordFromJson(text: string): RunRecord | null {
  const parsed: unknown = JSON.parse(text);
  if (parsed === null || typeof parsed !== 'object') return null;
  const record = parsed as RunRecord;
  return record.recordVersion === RECORD_VERSION ? record : null;
}

/**
 * One ledger row, flattened into the words a case file prints.
 *
 * The engine's own types do not cross: a second engine has its own, and a
 * channel written in this one's would be a case only this one could read. The
 * intent is an ordinal for the same reason, because no engine can know what id
 * another minted.
 *
 * `qtyType` comes from the intent rather than from the row, because the unit a
 * quantity is counted in is per order and not per leg: an order the engine
 * sized itself is in units whatever the declaration counts in, and a row that
 * printed the declaration's unit for it would state a quantity in a unit it was
 * never measured in.
 */
export function orderIn(row: LedgerRow, intent: number, qtyType: string): RecordedOrder {
  return {
    intent,
    orderRef: row.orderRef,
    tag: row.tag,
    leg: row.leg,
    positionRef: row.positionRef,
    symbol: row.instrument.symbol,
    exchange: row.instrument.exchange,
    product: row.product,
    side: row.side,
    qty: row.qty,
    qtyType,
    type: row.type,
    price: row.price,
    trigger: row.trigger,
    status: row.status,
    filledQty: row.filledQty,
    avgFillPrice: row.avgFillPrice,
    rejection: row.rejection === '' ? null : row.rejection,
    placedAt: row.placedAt,
    updatedAt: row.updatedAt,
    units: row.units,
  };
}

/** One diagnostic, as a record holds it: the code, the span and the bar. */
export function diagnosticIn(
  diagnostic: Diagnostic,
  barIndex: number | null,
): RecordedDiagnostic {
  return {
    code: diagnostic.code,
    line: diagnostic.span.line,
    column: diagnostic.span.column,
    severity: diagnostic.severity,
    barIndex,
  };
}
