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
 */
import type { Identity, OrderFrame, OrderSide, OrderType } from './intent.js';

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
