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
import type { Diagnostic } from '../../diagnostics/index.js';
import type { Span } from '../../span/index.js';
import { callOf } from './call.js';
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
import { refusalInCall, refusalInOrder } from './refuse.js';
import type { SentOnBar } from './refuse.js';
import { foldFrame } from './row.js';
import type { FrameOutcome, LedgerRow } from './row.js';

/** What the declaration and the chart fix before bar 0. */
export interface LedgerOptions {
  readonly instrument: Identity;
  readonly product: string;
  readonly qtyType: string;
  readonly declaredQty: number;
  /** The instrument's tick size, absent where the host states none. */
  readonly tickSize: number | null;
  /** Entries allowed in one direction before one is refused. */
  readonly pyramiding: number;
}

/**
 * What one order call sent, or why it sent nothing.
 *
 * The two are exclusive, and that is the shape rather than an accident: a
 * refused call mints no id, appends no row and returns no intent, so there is
 * nothing for a host to send and nothing to take back afterwards.
 */
export interface PlacedCall {
  readonly intents: readonly OrderIntent[];
  /** Why the call was refused, `errors.md` OS7002 to OS7013 and OS7017. */
  readonly refusal: Diagnostic | undefined;
}

export class Ledger {
  private readonly byIntent = new Map<number, LedgerRow>();
  private readonly placed: LedgerRow[] = [];
  private readonly positions = new Positions();
  private waiting: OrderFrame[] = [];
  private next = 1;
  private readonly options: LedgerOptions;
  /** The bar `sent` describes, so the list empties when a new one begins. */
  private at = -1;
  /** The orders this bar has sent, which is what OS7013 is asked about. */
  private sent: SentOnBar[] = [];

  constructor(options: LedgerOptions) {
    this.options = options;
  }

  /**
   * Step 9 sent an order call. It becomes intents, and each becomes a row.
   *
   * A row is appended when the order is sent, at `placed`, which is the
   * engine's own status: an intent has left and nothing has come back, and a
   * host cannot report a state the destination has never described.
   *
   * **The whole call is read, mapped and refused before any of it is sent.**
   * Every order the call produces is held against `refuse.ts` first, and only
   * then does any of them take an id, so a refused call appends no row and
   * returns no intent: there is nothing for a host to send and nothing to take
   * back afterwards. A call that sends two orders sends both or neither.
   *
   * **The bar is the same promise one scope up**, and `discard` below is how
   * it is kept. A refusal anywhere on a bar hands none of the bar's orders to a
   * destination, so none of the bar's rows may survive it either, including the
   * rows of calls that had already been mapped when the refusal happened. That
   * is not the ledger rewriting a record backwards: nothing was handed over, so
   * there is no record of a hand-over to rewrite.
   */
  place(
    name: string,
    params: readonly string[],
    args: readonly unknown[],
    bar: IntentBar,
    at: Span,
  ): PlacedCall {
    if (bar.index !== this.at) {
      this.at = bar.index;
      this.sent = [];
    }

    const ctx = this.contextFor(bar);
    const call = callOf(name, params, args, at);
    const refused = refusalInCall(call, ctx);
    if (refused !== undefined) return { intents: [], refusal: refused };

    const placements = placementsFor(call, ctx);
    for (const placement of placements) {
      const bad = refusalInOrder(call, placement, ctx, this.sent);
      if (bad !== undefined) return { intents: [], refusal: bad };
    }

    const intents: OrderIntent[] = [];
    for (const placement of placements) {
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
        this.sent.push({ name: call.name, line: at.line, side });
      }
    }
    return { intents, refusal: undefined };
  }

  /**
   * The bar sent nothing after all: every row it appended is taken back.
   *
   * A refusal anywhere on a bar hands none of the bar's orders over, because
   * every call is mapped before any of them is routed (`orders.ts`). Until this
   * existed, the rows of the calls that had already been mapped stayed: a bar
   * that placed an order and then met a refusal left `orders()` reporting an
   * order at `placed` that no destination was ever handed, and a host
   * reconciling after a stopped run saw an order it never received. 17.7 says a
   * row is appended when the order is sent, and nothing had been sent.
   *
   * **Taken back rather than never written.** A row has to be there while the
   * rest of the bar is mapped: `cancel` asks whether a tag names a working
   * order, pyramiding counts the entries a position already holds, and a close
   * measures what one tag entered, all from rows this same bar may have
   * appended. Deferring the append would make an entry and a cancellation of it
   * on one bar into OS7009. So the bar writes its rows and a refused bar undoes
   * them, which is the same shape the moving bar already uses on the cells.
   *
   * The intent ids the bar minted are not reissued. An id is unique within a
   * run (`stdlib.md` 17.7), a frame that quoted one must never match a later
   * order, and a gap in the numbering is invisible to a host, so the cheap
   * invariant is the one worth keeping.
   *
   * **`from` is the row count the routing pass began at**, and it is held by
   * that pass rather than by a bar index kept here. A bar declared
   * `onUnconfirmed` applies its effects on every execution of itself, so one bar
   * can route more than once, and a mark taken when the bar index last changed
   * would take back rows whose orders a previous execution really did hand over.
   * The promise belongs to the pass that made it, so the mark does too.
   */
  discard(from: number): void {
    const dropped = this.placed.length - from;
    if (dropped <= 0) return;
    for (const row of this.placed.slice(from)) this.byIntent.delete(row.intentId);
    this.placed.length = from;
    // One row appended pushed exactly one entry here, in the same order, so the
    // orders OS7013 has seen this bar shrink by the same count.
    this.sent.length = Math.max(0, this.sent.length - dropped);
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
      tickSize: this.options.tickSize,
      pyramiding: this.options.pyramiding,
      bar,
      size: () => this.positions.size(),
      avgPrice: () => this.positions.avgPrice(),
      reference: () => this.positions.reference(),
      current: () => this.positions.current(),
      mint: () => this.positions.mint(),
      rows: () => this.placed,
    };
  }
}
