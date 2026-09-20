/**
 * The two shapes that cross the order boundary, `host-interface.md` 7.1 and
 * 7.2.
 *
 * **An intent is not an order.** The engine states what the strategy decided
 * and the destination makes the order, which is the whole reason the duty is
 * shaped as two messages rather than one call. An engine that named a
 * destination's own order id at the moment a script called `buy()` would be
 * handing the script an identifier for something that may never exist.
 *
 * **A frame is cumulative.** Every frame restates the whole life of one order
 * rather than what changed since the frame before it, which is what makes a
 * repeat, a pair that crossed in flight and a reconnecting session that resends
 * its last frames all harmless. The fold that depends on it is `row.ts`.
 *
 * Nothing here parses an identity. A resolved identity may be a string, a
 * number, a pair or a row in the host's own table (`host-interface.md` 9.1), so
 * the engine carries the one it was given and hands it back unchanged.
 */

/** The side of an order, `stdlib.md` 17.2. */
export type OrderSide = 'buy' | 'sell';

/** The type of an order, `stdlib.md` 17.2. */
export type OrderType = 'market' | 'limit' | 'stop' | 'stopLimit';

/** What an intent asks the destination to do, `host-interface.md` 7.1. */
export type IntentKind = 'place' | 'cancel' | 'bracket';

/**
 * The instrument an order names, as the chart's record states it.
 *
 * A pair, which is one of the spellings section 9.1 allows an identity to take.
 * It is carried and compared and never split, formatted or inferred from.
 */
export interface Identity {
  readonly symbol: string | null;
  readonly exchange: string | null;
}

/** The bar whose close decided an order, `host-interface.md` 7.1. */
export interface IntentBar {
  readonly index: number;
  readonly time: number | null;
}

/**
 * What the engine hands over, `host-interface.md` 7.1.
 *
 * `qty` carries the unit its `qtyType` names rather than a count of units the
 * engine worked out for itself. A lot is the venue's own fact and the host owns
 * symbology, so an engine that multiplied by a lot size the host never stated
 * would send a quantity nobody asked for, which is the substitution rule of
 * duty 2 read from the order side. A quantity the engine computed from the
 * ledger, as a flattening order's is, states units because that is what a
 * filled quantity is counted in.
 */
export interface OrderIntent {
  readonly intentId: number;
  readonly kind: IntentKind;
  readonly instrument: Identity;
  /** Stated by an order that places one, absent on a cancellation. */
  readonly side: OrderSide | null;
  readonly qty: number | null;
  /** The unit `qty` is counted in, `language.md` 13.3, passed untranslated. */
  readonly qtyType: string;
  readonly type: OrderType | null;
  readonly limit: number | null;
  readonly trigger: number | null;
  /** A bracket's target, as a price. */
  readonly target: number | null;
  /** A bracket's stop, as a price. */
  readonly stop: number | null;
  /**
   * A bracket's target and stop as distances from the entry, where the script
   * stated them that way.
   *
   * Carried as distances rather than resolved into prices, because the entry a
   * distance is measured from is the fill of the order this bracket's tag
   * names, and that fill reaches the destination before it reaches the engine.
   * The common shape is an entry and its bracket on one bar, where the entry
   * has not filled and there is no price to measure from yet.
   */
  readonly profit: number | null;
  readonly loss: number | null;
  readonly tag: string;
  /** The strategy's own product word, passed untranslated. */
  readonly product: string;
  readonly positionRef: number;
  readonly bar: IntentBar;
}

/**
 * What a host reports back about one order, `host-interface.md` 7.2.
 *
 * Every field but `intentId`, `status` and `filledQty` is one a destination may
 * not have said anything about yet, so the shape carries absence rather than a
 * substituted zero or an empty string.
 */
export interface OrderFrame {
  readonly intentId: number;
  readonly status: string;
  /** Cumulative filled quantity, from the beginning of this order's life. */
  readonly filledQty: number;
  readonly avgFillPrice?: number | null;
  readonly orderRef?: string | null;
  readonly sentInstrument?: Identity | null;
  readonly sentProduct?: string | null;
  readonly time?: number | null;
  readonly text?: string | null;
  readonly seq?: number | null;
}
