/**
 * The strategy's own order and fill ledger, `stdlib.md` 17.7.
 *
 * **Each strategy owns one.** It is the strategy's record of what it has
 * actually done, it is what every position figure in the language is folded
 * from, and it is per strategy rather than per account because an account
 * position is shared with every other strategy and every manual trade in the
 * same contract.
 *
 * **Nothing is read from a host's position row.** The engine is neither handed
 * one nor asks for one. What it reads back is what it sent and what the
 * destination said became of it, which is the only record whose owner is this
 * strategy.
 *
 * **Frames fold at a bar boundary**, never during an execution. A frame that
 * arrived while bar four hundred was still moving is folded before bar four
 * hundred and one begins, so every position fact is constant for the length of
 * one execution and a re-execution of a moving bar sees exactly what the first
 * execution saw (`host-interface.md` 7.4).
 */
import type {
  Identity,
  IntentBar,
  OrderFrame,
  OrderIntent,
  OrderSide,
  OrderType,
} from './intent.js';
import { intentFor, placementsFor } from './place.js';
import type { PlacingContext } from './place.js';
import { Positions } from './positions.js';
import { foldFrame } from './row.js';
import type { FrameOutcome, LedgerRow } from './row.js';

/** What the declaration and the chart fix before bar 0. */
export interface LedgerOptions {
  readonly instrument: Identity;
  readonly product: string;
  readonly qtyType: string;
  readonly declaredQty: number;
}

export class Ledger {
  private readonly byIntent = new Map<number, LedgerRow>();
  private readonly placed: LedgerRow[] = [];
  private readonly positions = new Positions();
  private waiting: OrderFrame[] = [];
  private next = 1;
  private readonly options: LedgerOptions;

  constructor(options: LedgerOptions) {
    this.options = options;
  }

  /**
   * Step 9 sent an order call. It becomes intents, and each becomes a row.
   *
   * A row is appended when the order is sent, at `placed`, which is the
   * engine's own status: an intent has left and nothing has come back, and a
   * host cannot report a state the destination has never described.
   */
  place(name: string, args: readonly unknown[], bar: IntentBar): readonly OrderIntent[] {
    const ctx = this.contextFor(bar);
    const intents: OrderIntent[] = [];
    for (const placement of placementsFor(name, args, ctx)) {
      const intentId = this.next;
      this.next += 1;
      const intent = intentFor(placement, intentId, ctx);
      intents.push(intent);
      // Only an order that places one appends a row: a cancellation and a
      // bracket carry an id a host can quote and nothing has been ordered by
      // either. What a cancellation does to an order, and what a bracket's
      // level does when it is reached, both arrive as frames about orders.
      const { side, qty, type } = intent;
      if (intent.kind === 'place' && side !== null && qty !== null && type !== null) {
        this.append(intent, { side, qty, type }, bar);
      }
    }
    return intents;
  }

  /** A frame from the destination, held until the next bar boundary. */
  deliver(frame: OrderFrame): void {
    this.waiting.push(frame);
  }

  /**
   * Folds every frame that has arrived, in the order it arrived in.
   *
   * A host does not have to put its frames in order before it sends them. A
   * repeat, a pair that crossed in flight and one that arrives after the order
   * ended are ordinary traffic, and the fold is what says what each of them
   * does.
   */
  settle(): readonly FrameOutcome[] {
    if (this.waiting.length === 0) return [];
    const frames = this.waiting;
    this.waiting = [];
    const outcomes: FrameOutcome[] = [];
    for (const frame of frames) {
      const row = this.byIntent.get(frame.intentId);
      if (row === undefined) {
        // Step 1. It is not an order this strategy placed. Refused and
        // recorded, and nothing is folded.
        outcomes.push({
          intentId: frame.intentId,
          refused: 'unknownIntent',
          changed: false,
          delta: 0,
          price: null,
          afterTerminal: false,
        });
        continue;
      }
      const outcome = foldFrame(row, frame);
      // Step 6, and the reason the row carries a position reference: the fill
      // settles the position that order belongs to and not whichever position
      // the leg holds now.
      if (outcome.delta > 0 && outcome.price !== null) {
        const units = row.side === 'buy' ? outcome.delta : -outcome.delta;
        this.positions.settle(row.positionRef, units, outcome.price);
      }
      outcomes.push(outcome);
    }
    return outcomes;
  }

  /** The leg's net position in units, `0` while flat. */
  size(): number {
    return this.positions.size();
  }

  /** The average price of the open position, absent while flat. */
  avgPrice(): number | null {
    return this.positions.avgPrice();
  }

  /** Every row, oldest first, for a host that reports what the run did. */
  rows(): readonly LedgerRow[] {
    return this.placed;
  }

  private append(
    intent: OrderIntent,
    order: { readonly side: OrderSide; readonly qty: number; readonly type: OrderType },
    bar: IntentBar,
  ): void {
    const row: LedgerRow = {
      intentId: intent.intentId,
      orderRef: '',
      tag: intent.tag,
      // The only leg has no name of its own: a name comes from a leg
      // declaration, and those are planned (`stdlib.md` 17.6).
      leg: '',
      positionRef: intent.positionRef,
      instrument: intent.instrument,
      product: intent.product,
      side: order.side,
      qty: order.qty,
      type: order.type,
      price: intent.limit,
      trigger: intent.trigger,
      status: 'placed',
      filledQty: 0,
      avgFillPrice: null,
      rejection: '',
      placedAt: bar.time,
      updatedAt: bar.time,
    };
    this.placed.push(row);
    this.byIntent.set(row.intentId, row);
  }

  private contextFor(bar: IntentBar): PlacingContext {
    return {
      instrument: this.options.instrument,
      product: this.options.product,
      qtyType: this.options.qtyType,
      declaredQty: this.options.declaredQty,
      bar,
      size: () => this.positions.size(),
      reference: () => this.positions.reference(),
      mint: () => this.positions.mint(),
      rows: () => this.placed,
    };
  }
}
