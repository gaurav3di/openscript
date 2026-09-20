/**
 * The ledger: what this strategy sent, and what became of it.
 *
 * One module because it is one fact with three faces. An intent leaves, a row
 * records it, a frame folds into that row, and the position every `pos` call
 * reads is the sum of the fills those frames settled. Splitting them would put
 * the fold in one place and the field names it folds into in another, which is
 * how a cumulative quantity becomes a double counted one.
 *
 * The door carries the shapes that cross a boundary and the one class that
 * holds state. The fold, the position book, the mapping from a call to an
 * order and the refusals stay behind it: they are one algorithm with one
 * caller.
 */
export type {
  Identity,
  IntentBar,
  IntentKind,
  OrderFrame,
  OrderIntent,
  OrderSide,
  OrderType,
} from './intent.js';

export { Ledger } from './ledger.js';
export type { LedgerOptions, PlacedCall } from './ledger.js';

export type { FrameOutcome, FrameRefusal, LedgerRow, OrderStatus } from './row.js';
