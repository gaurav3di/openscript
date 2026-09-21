/**
 * The atoms the money is folded from: a fill, a contract and a bar's close.
 *
 * **Everything in this module is portable data.** No class, no function, no
 * object reference, no absent field, no map and no date: a shape here is what
 * `JSON.parse` gives back, so a report can be computed here, stored by a
 * platform, sent to another process and recomputed there without this
 * implementation being present. That is not a convenience. A run record is the
 * conformance case a second engine is handed, and a case that can only be read
 * by the engine that wrote it proves nothing about either.
 *
 * **A fill is the only thing money is folded from.** Not a position, not a
 * ledger row, not a running total the engine happened to be holding: the fills
 * the engine settled, in the order it settled them, each naming the position
 * reference it moved and the size of that reference either side of the
 * settlement. Every figure in a report is a function of that list and of the
 * bars it is marked against, which is what makes a report reproducible from a
 * record with no engine in the room.
 */

/**
 * Money, in the contract's own currency.
 *
 * A number rather than a type of its own, because a type of its own would be a
 * class and a class does not survive `JSON.parse`. The rounding is stated once,
 * on the contract, and applied once per fill total.
 */
export type Money = number;

/**
 * The instrument facts a run was carried out under, as the host stated them.
 *
 * A snapshot rather than a reference. An instrument's lot size and tick size
 * change, and a report recomputed months later under today's facts would be a
 * different study wearing the same name, so the facts travel with the run.
 */
export interface Contract {
  readonly symbol: string | null;
  readonly exchange: string | null;
  readonly currency: string;
  readonly tickSize: number | null;
  readonly lotSize: number | null;
  /** Money per 1.0 of price per unit; 1 when the host states none. */
  readonly pointValue: number;
  /** Money rounding digits, half to even, once per fill total. */
  readonly digits: number;
}

/** One settled fill. Every money figure is folded from these and nothing else. */
export interface RecordedFill {
  readonly seq: number;
  readonly intentId: number;
  readonly orderRef: string;
  readonly tag: string;
  readonly positionRef: number;
  readonly side: 'buy' | 'sell';
  /** Positive, this fill's own quantity. */
  readonly units: number;
  readonly price: number;
  readonly barIndex: number;
  readonly barTime: number | null;
  readonly refSizeBefore: number;
  readonly refSizeAfter: number;
}

/** One bar as the report marks against it. Close only: 17.4 marks to the close. */
export interface BarMark {
  readonly barIndex: number;
  readonly time: number | null;
  readonly close: number | null;
  /** False for a warmup bar. */
  readonly inReport: boolean;
}
