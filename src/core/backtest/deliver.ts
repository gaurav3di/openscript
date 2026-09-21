/**
 * A case's rows and this engine's frames, and the destination between them.
 *
 * Both directions are here because they are one correspondence: a case names an
 * order by an ordinal and an engine knows it by an id, so `Delivery` reads an
 * ordinal into the id of the intent the run placed, and `framedAs` writes an id
 * back out as the ordinal a case file prints. Split between two files, the two
 * halves of it drift, and a suite whose rows say one thing and whose records
 * say another is one nobody can read.
 *
 * `conformance.md` section 3: `frames.csv` supplies order frames the way
 * `bars.csv` supplies bars, so a strategy case asserts the fold against input
 * the engine did not choose. `simulate.ts` is the other destination this module
 * has, the one that reads a bar and works out what a venue would have said.
 * This one works nothing out. It holds the rows a case supplied, hands over the
 * ones each boundary names, and the whole of its behaviour is the mapping
 * between a row and a frame.
 *
 * **An ordinal is what a case can name, and an id is not.** A row names the nth
 * intent the run placed, because no case can know the id an engine minted, so
 * the intents are counted here in the order the run handed them over and the
 * ordinal is read against that count. A row naming an ordinal the run never
 * placed is delivered all the same, carrying an id no run mints: step 1 of
 * `stdlib.md` 17.8 refuses a frame naming no row of the ledger, and that
 * refusal is the ledger's to make. A destination that dropped the row instead
 * would answer nothing at all where section 3 hands an engine a frame about an
 * order its ledger does not hold, and the case would pass by the frame never
 * having arrived.
 *
 * **What a row does not carry, this does not invent.** `host-interface.md` 7.2
 * lets a frame say which instrument and product the destination booked the
 * order under, and the file has no column for either, so neither is stated and
 * the row keeps what its placement put there. The instant is the one the file
 * does carry: a row states one or states `none`, and one that states none
 * leaves `updatedAt` where the placement put it, which is what the fold does
 * with a frame whose destination stated no instant.
 */
import type { OrderFrame, OrderIntent, RoutedEffect } from '../engine/index.js';
import type { RecordedFrame } from './record.js';

/** One frame, the boundary it was handed over at, and the row it came from. */
export interface Delivered {
  readonly frame: OrderFrame;
  readonly afterBar: number;
  /**
   * The row a case supplied, or null where the run's own destination answered
   * the frame and there is no row until the record is written.
   */
  readonly row: RecordedFrame | null;
}

/** Where a run's orders go, and what it is told between two of its bars. */
export interface Destination {
  /** Step 9: what the strategy decided, on the bar it decided it. */
  route(effect: RoutedEffect, barIndex: number): void;
  /** What this destination hands over at the boundary after `barIndex`. */
  answers(barIndex: number): readonly Delivered[];
  /** Every intent it was handed, in the order it was handed them. */
  readonly intents: readonly OrderIntent[];
}

/**
 * An id no run mints, which a row naming no intent of this run is delivered
 * under.
 *
 * Ids are counted from one by the ledger that mints them, so nothing below one
 * can name a row and the fold refuses the frame by the rule it refuses every
 * other unknown one by. The alternative was an id of a real row chosen by some
 * rule of this file's own, which would fold a case's frame into whichever order
 * happened to be near it.
 */
const NO_INTENT = -1;

/**
 * A destination holding one case's frames, ready at the boundaries they name.
 *
 * Built before the run rather than during it, because the rows are input: what
 * a boundary hands over was decided by whoever wrote the case and not by
 * anything this run does. The one thing it learns as the run goes is which
 * intent an ordinal names, which only the run can say.
 */
export class Delivery implements Destination {
  readonly intents: OrderIntent[] = [];
  /** The rows of each boundary, in file order, which section 3 fixes as the delivery order. */
  private readonly rows = new Map<number, RecordedFrame[]>();

  constructor(frames: readonly RecordedFrame[]) {
    for (const row of frames) {
      const at = this.rows.get(row.afterBar);
      if (at === undefined) this.rows.set(row.afterBar, [row]);
      else at.push(row);
    }
  }

  /** Nothing is decided by an order arriving here: it is counted, and that is all. */
  route(effect: RoutedEffect): void {
    for (const intent of effect.intents) this.intents.push(intent);
  }

  answers(barIndex: number): readonly Delivered[] {
    const due = this.rows.get(barIndex) ?? [];
    return due.map((row) => ({
      frame: frameOf(row, this.intents[row.intent - 1]),
      afterBar: barIndex,
      row,
    }));
  }
}

/** One row of a case, as the frame `host-interface.md` 7.2 describes. */
function frameOf(row: RecordedFrame, intent: OrderIntent | undefined): OrderFrame {
  return {
    intentId: intent?.intentId ?? NO_INTENT,
    status: row.status,
    filledQty: row.filledQty,
    avgFillPrice: row.avgFillPrice,
    orderRef: row.orderRef,
    text: row.text,
    time: row.time,
  };
}

/**
 * The ordinal of every intent, which is how a case names one.
 *
 * One, two, three in the order the run placed them, because no engine can know
 * the id another minted and a case that named one would only ever be readable
 * by the engine that wrote it.
 */
export function ordinalsOf(intents: readonly OrderIntent[]): ReadonlyMap<number, number> {
  const out = new Map<number, number>();
  for (const intent of intents) {
    if (!out.has(intent.intentId)) out.set(intent.intentId, out.size + 1);
  }
  return out;
}

/**
 * One delivered frame, in the columns a case file prints.
 *
 * The instant travels with it. `stdlib.md` 17.7 folds `updatedAt` from a
 * frame's `time`, so a driver that dropped the field here wrote a record whose
 * ledger no engine could fold from the record's own frames: it would have
 * nothing to move that field to and would leave it at `placedAt`.
 */
export function framedAs(
  frame: OrderFrame,
  afterBar: number,
  ordinals: ReadonlyMap<number, number>,
): RecordedFrame {
  return {
    afterBar,
    intent: ordinals.get(frame.intentId) ?? 0,
    status: frame.status,
    filledQty: frame.filledQty,
    avgFillPrice: frame.avgFillPrice ?? null,
    orderRef: frame.orderRef ?? null,
    text: frame.text ?? null,
    time: frame.time ?? null,
  };
}
