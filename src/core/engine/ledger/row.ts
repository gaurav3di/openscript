/**
 * One row of the strategy's order and fill ledger, and the fold of one frame
 * into it, `stdlib.md` 17.7 and 17.8.
 *
 * **A row is appended when the order is sent and is never rewritten by
 * guesswork.** Every change to it comes from a frame the destination sent, so
 * the sequence that produced a position can be replayed rather than inferred.
 *
 * **The fold is where double counting happens**, which is why it is written
 * once, here, and why every step of it is the numbered step `stdlib.md` 17.8
 * gives. Frames repeat, cross in flight and arrive after the order they are
 * about has ended, and an engine that added each frame's quantity to a running
 * total would report a position the strategy never held. Taking the greatest
 * cumulative quantity instead makes a repeat cost nothing and makes a terminal
 * frame that overtook a partial one carry the whole remainder in one piece.
 *
 * **A row also carries what its order takes out of the position**, because that
 * is the only record of it that outlives the bar the order was sent on. A
 * position moves when a fill settles, so an order that has been sent and not
 * answered has moved nothing and is invisible to every position figure; the row
 * is where it is visible. `closable.ts` reads the reduction back, and what makes
 * the reading work is that a row already says whether the order is still going:
 * an order neither terminal nor fully filled is one the destination still has.
 */
import type { Identity, OrderFrame, OrderSide, OrderType } from './intent.js';

/**
 * What one order takes out of a position, in units.
 *
 * Absent on an order that adds to a position, and absent on one whose quantity
 * the engine cannot count in units, which are two different facts with the same
 * consequence: neither subtracts anything from what is left to close.
 */
export interface Reduction {
  /** The tag the close named, or absent where it reduces the leg as a whole. */
  readonly part: string | null;
  /** The units it takes out of that part. */
  readonly units: number;
  /**
   * Whether `units` is the order's own quantity or the most it could have been.
   * False on an order whose quantity the engine cannot read in units, where
   * `units` is the whole of what was left to close at the moment it was sent.
   */
  readonly counted: boolean;
}

/**
 * The words a row's status may take, `stdlib.md` 17.7.
 *
 * `placed` is the engine's own and no host may send it: it means an intent has
 * left and nothing has come back, and a destination cannot report a state it
 * has never described.
 */
export type OrderStatus =
  | 'placed'
  | 'working'
  | 'triggerPending'
  | 'filled'
  | 'cancelled'
  | 'rejected'
  | 'expired';

const STATUSES: readonly OrderStatus[] = [
  'placed',
  'working',
  'triggerPending',
  'filled',
  'cancelled',
  'rejected',
  'expired',
];

/**
 * Which words end an order.
 *
 * A terminal row still takes a fill, under 17.8, so this decides what the
 * status may become and nothing about what the quantity may do.
 */
const TERMINAL: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'filled',
  'cancelled',
  'rejected',
  'expired',
]);

/**
 * How far along its life a status sits.
 *
 * Two words share the middle rank because an order that is live and one that is
 * waiting for its trigger are the same distance from the end, and either may
 * follow the other without going backwards.
 */
function rankOf(status: OrderStatus): number {
  if (status === 'placed') return 0;
  return TERMINAL.has(status) ? 2 : 1;
}

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL.has(status);
}

/** The word a host sent, or nothing when it is not one of the seven. */
export function statusFrom(word: string): OrderStatus | undefined {
  return STATUSES.find((one) => one === word);
}

/** A row of the ledger, `stdlib.md` 17.7. */
export interface LedgerRow {
  readonly intentId: number;
  /** The destination's own reference, recorded, shown, and never parsed. */
  orderRef: string;
  readonly tag: string;
  readonly leg: string;
  readonly positionRef: number;
  /** The contract actually sent, which the host may restate in a frame. */
  instrument: Identity;
  /** The product actually sent, after the host's own translation. */
  product: string;
  readonly side: OrderSide;
  readonly qty: number;
  readonly type: OrderType;
  readonly price: number | null;
  readonly trigger: number | null;
  status: OrderStatus;
  filledQty: number;
  avgFillPrice: number | null;
  rejection: string;
  readonly placedAt: number | null;
  updatedAt: number | null;
  /**
   * What this order takes out of the position, absent where it takes nothing.
   *
   * Fixed when the order was sent and never rewritten, because it is a record
   * of what the engine measured at that moment and not a running total. What
   * moves is `filledQty` beside it, and the two together say how much of the
   * reduction the destination still has.
   */
  readonly reduces: Reduction | null;
  /**
   * This order's own quantity in units, absent where the engine cannot read it.
   *
   * A quantity the script stated is in the declaration's own unit
   * (`host-interface.md` 7.1) and a quantity the engine worked out is in units,
   * and the two are told apart per order rather than per run: a reverse under a
   * declaration counting in lots opens its replacement at a size the engine
   * worked out, in units, on the same bar as orders that are not.
   *
   * `reduces` says what an order takes out of a position and this says what it
   * puts into one, which is the half `holdings.ts` needs to see a position
   * being opened before any of it has settled.
   */
  readonly units: number | null;
}

/**
 * The units this row still has working against the position it reduces.
 *
 * **An order that has been sent and not answered is the whole of what this
 * file exists to make visible.** A position is folded from settled fills and
 * from nothing else (17.8), so such an order has moved no position figure: the
 * leg still reads what it held before it was sent, and a second reducing order
 * measured against the leg alone sends the position a second time.
 *
 * Three facts decide the number, and each of them is a case a strategy meets:
 *
 * - **A partial fill.** Three sold with one filled leaves two working, because
 *   the one that filled has already moved the leg and only the other two are
 *   still to come.
 * - **An order that has ended.** A rejection, a cancellation and an expiry all
 *   put the row at a terminal status, and nothing more is coming from any of
 *   them, so the remainder is released and the strategy may close again. That
 *   is the script's way out of a destination that refused its close.
 * - **An order that adds**, which reduces nothing and holds nothing: an entry
 *   that has not settled is not a position, and counting it would let a close
 *   be sent for units that may never exist.
 */
export function workingUnits(row: LedgerRow): number {
  const reduces = row.reduces;
  if (reduces === null || isTerminal(row.status)) return 0;
  return Math.max(0, reduces.units - row.filledQty);
}

/** Why a frame was refused, `stdlib.md` 17.14. */
export type FrameRefusal = 'unknownIntent' | 'fillWithNoPrice';

/**
 * What one frame did.
 *
 * A refused frame changes nothing and is recorded, because a frame naming an
 * order this strategy never placed is a fact about the host rather than about
 * the strategy, and one reporting a fill with no price cannot be marked against
 * anything.
 */
export interface FrameOutcome {
  readonly intentId: number;
  readonly refused: FrameRefusal | undefined;
  readonly changed: boolean;
  /** Units this frame added, which is what settles against a position. */
  readonly delta: number;
  readonly price: number | null;
  /** Whether the delta arrived after the row had already ended, 17.11. */
  readonly afterTerminal: boolean;
}

function refuse(frame: OrderFrame, why: FrameRefusal): FrameOutcome {
  return {
    intentId: frame.intentId,
    refused: why,
    changed: false,
    delta: 0,
    price: null,
    afterTerminal: false,
  };
}

/**
 * Folds one frame into one row, `stdlib.md` 17.8 steps 2 to 5 and 7.
 *
 * Step 1 is the ledger's, because locating a row is a question about the whole
 * ledger rather than about any one row, and step 6 is the position book's: this
 * function says how many units settled and at what price, and where they settle
 * is `positions.ts`.
 */
export function foldFrame(row: LedgerRow, frame: OrderFrame): FrameOutcome {
  // A word outside the vocabulary leaves the status alone and the rest of the
  // frame folds anyway. Mapping a destination's own words onto the vocabulary
  // is the host's job under 17.7, and an engine that guessed at one would
  // decide an order was dead on a word it had never seen. Refusing the whole
  // frame instead would throw away the cumulative quantity it carries, which is
  // real whatever the word beside it says, and losing a real fill is silent in
  // exactly the way decision 24 describes.
  const status = statusFrom(frame.status);

  const wasTerminal = isTerminal(row.status);

  // Step 2. The cumulative quantity never decreases, so a frame reporting less
  // than the row already holds contributes nothing.
  const filled = Math.max(row.filledQty, frame.filledQty);
  const delta = filled - row.filledQty;

  // Step 3. The destination computed its average over the cumulative quantity,
  // so the row takes that average whole. The engine never averages two averages
  // of its own.
  const price = frame.avgFillPrice ?? null;
  if (delta > 0 && price === null) return refuse(frame, 'fillWithNoPrice');

  // Step 4, which a frame arriving at a terminal row does not run: the status
  // records how the order ended and the quantity records what traded, and the
  // two are both true.
  const moved =
    status !== undefined &&
    status !== 'placed' &&
    !wasTerminal &&
    rankOf(status) >= rankOf(row.status) &&
    status !== row.status;

  const text = frame.text ?? '';
  const newText = text !== '' && text !== row.rejection;

  // Step 5.
  const changed = moved || delta > 0 || newText;

  // Step 7. A repeated frame and one overtaken by a later frame both end here,
  // having changed nothing: no fill, no event, no report row.
  if (!changed) {
    return {
      intentId: frame.intentId,
      refused: undefined,
      changed: false,
      delta: 0,
      price: null,
      afterTerminal: false,
    };
  }

  if (moved && status !== undefined) row.status = status;
  if (delta > 0) {
    row.filledQty = filled;
    row.avgFillPrice = price;
  }
  if (newText) row.rejection = text;
  if (typeof frame.orderRef === 'string') row.orderRef = frame.orderRef;
  if (frame.sentInstrument !== undefined && frame.sentInstrument !== null) {
    row.instrument = frame.sentInstrument;
  }
  if (typeof frame.sentProduct === 'string') row.product = frame.sentProduct;
  if (typeof frame.time === 'number') row.updatedAt = frame.time;

  return {
    intentId: frame.intentId,
    refused: undefined,
    changed: true,
    delta,
    price: delta > 0 ? price : null,
    afterTerminal: wasTerminal && delta > 0,
  };
}
