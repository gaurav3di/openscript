/**
 * How much each order of a call sends, and which position it is sent against,
 * `stdlib.md` 17.1.
 *
 * **This is the half of a call that is arithmetic.** `place.ts` says what each
 * call means and dispatches to the two functions here; these two decide how many
 * orders the call becomes, how large each is, and which position reference each
 * one carries. They were one file with the dispatch until the second question
 * arrived: issue 0018 is about attachment rather than about quantity, and the
 * two answers are long enough written down that keeping them beside the
 * vocabulary of the calls made one file out of two subjects.
 *
 * The two entry points are `entering`, for a call that states a side and a size,
 * and `flattening`, for one that reduces what the leg holds. What they differ
 * about is not the split but the budget, and the difference is the whole of
 * `holdings.ts`: an entry sends the size the script wrote whatever the leg holds,
 * so the only question is where its units land; a close chooses its own number,
 * so it may only choose one that has settled.
 */
import { closableUnits } from './closable.js';
import type { Closing } from './closable.js';
import { divide, holdings, joining, opposing } from './holdings.js';
import type { Book, Holding } from './holdings.js';
import type { Identity, IntentBar, OrderIntent, OrderSide, OrderType } from './intent.js';
import type { Reduction } from './row.js';

/**
 * An order this run is about to send, before it is given an id.
 *
 * The intent's own shape less the four fields that are the same for every
 * order this run sends, so that the mapping below cannot state one of them
 * differently from one call to the next.
 */
export type Placement = Omit<OrderIntent, 'intentId' | 'instrument' | 'product' | 'bar'>;

/** One order a call sends, and what that order takes out of the leg. */
export interface MappedOrder {
  readonly placement: Placement;
  readonly reduces: Reduction | null;
}

/** An order that adds to a position, or whose size the engine cannot count. */
export function adding(placement: Placement): MappedOrder {
  return { placement, reduces: null };
}

/** The fields every placement states, so each case below states only its own. */
export const NOTHING = {
  side: null,
  qty: null,
  qtyType: 'units',
  type: null,
  limit: null,
  trigger: null,
  target: null,
  stop: null,
  profit: null,
  loss: null,
} as const;

/** What the mapping and the refusals read: the declaration, the leg and the ledger. */
export interface PlacingContext extends Closing, Book {
  readonly instrument: Identity;
  readonly product: string;
  /** The unit a quantity the script stated is counted in, `language.md` 13.3. */
  readonly qtyType: string;
  /** The size an order that names none takes, from the declaration. */
  readonly declaredQty: number;
  /** The instrument's tick size, absent where the host states none. */
  readonly tickSize: number | null;
  /** Entries allowed in one direction before one is refused, `language.md` 13.3. */
  readonly pyramiding: number;
  readonly bar: IntentBar;
  /** The average price of the open position, absent while flat. */
  avgPrice(): number | null;
  /** The reference an instruction that orders nothing is labelled with. */
  reference(): number;
  /** A fresh position, for the replacement half of a flip. */
  mint(): number;
}

/** What an entering order states, at one quantity and one position. */
interface Entry {
  readonly side: OrderSide;
  readonly limit: number | null;
  readonly trigger: number | null;
  readonly type: OrderType;
  readonly tag: string;
}

/** One order of an entry, at the quantity and the position it is given. */
function placing(entry: Entry, qty: number, qtyType: string, positionRef: number): Placement {
  return {
    ...NOTHING,
    kind: 'place',
    side: entry.side,
    qty,
    qtyType,
    type: entry.type,
    limit: entry.limit,
    trigger: entry.trigger,
    tag: entry.tag,
    positionRef,
  };
}

/**
 * The orders an entry sends, which is two where it crosses zero.
 *
 * **An instruction that would take a leg from long to short is sent as two
 * orders** (`stdlib.md` 17.1), one that closes the outgoing position and one
 * that opens the replacement, each carrying its own position reference. The
 * reason is not tidiness: a single order that crossed zero would leave a late
 * fill with no way to say which of the two positions it settled, and during a
 * flip a leg holds both at once. `sell(qty = abs(pos.size) + more)` is the
 * spelling the documentation teaches, and it is `order.reverse` with the
 * arithmetic written out.
 *
 * **The closing half is what is left to close, not what the leg holds.** An
 * order the destination has not answered has filled nothing, so a leg with a
 * close already going has nothing left for the outgoing half to take, whether
 * that close was sent on this bar or on one before it.
 *
 * **What it crosses is decided per position, not from the leg's net.** The net
 * is folded from settled fills, so on a silent destination it reads zero while
 * an entry is still going and an opposing entry is not seen as opposing
 * anything at all: `buy(qty = 6)` and then `sell(qty = 9)` a bar later put both
 * orders on reference 1, which opened six long and settled three short. The
 * question is about one position rather than about the leg, so it is asked of
 * one position (`holdings.ts`), and the answer is the same whether or not the
 * destination has answered yet.
 *
 * **An order that spans two positions is that many orders.** A leg holds more
 * than one position whenever an order that opposes it is outstanding, and each
 * of them is reduced by an order of its own, oldest first, for the same reason
 * the flip is two orders: a late fill has to be able to say which position it
 * settled.
 *
 * **The reference is minted in every unit; only the arithmetic waits.** The
 * split subtracts a position folded from filled quantities from a quantity the
 * script stated, and those are the same kind of number only in a declaration
 * counting in units: in lots, cash or an equity percent the engine cannot say
 * how much of the instruction closes and how much opens, and the lot size that
 * would tell it is the fact OS7005 is deferred on. Minting a reference needs
 * none of that arithmetic. So an order the engine cannot size against the leg
 * is still sent on a position of its own rather than on the outgoing one:
 * `buy(qty = 3)` then `sell(qty = 9)` under a declaration counting in lots took
 * reference 1 from seventy five units to minus one hundred and fifty, which is
 * the crossing 17.1 is unconditional about and the late fill with no owner the
 * split exists to prevent. What does not hold, and what has to exist before it
 * can, is written where a reader meets it: `stdlib.md` 17.1 and OS7005.
 */
export function entering(
  ctx: PlacingContext,
  entry: Entry,
  qty: number | null,
): readonly MappedOrder[] {
  // The declaration's own size where the call named none, `stdlib.md` 17.2.
  const wanted = qty ?? ctx.declaredQty;
  const book = holdings(ctx);
  // Nothing to cross: the leg holds no position this order opposes, so it opens
  // one or joins the one it is on the side of.
  if (opposing(book, entry.side).length === 0) {
    return [adding(placing(entry, wanted, ctx.qtyType, openingOn(ctx, book, entry.side)))];
  }

  if (ctx.qtyType !== 'units') {
    return [
      {
        // A position of its own, in every unit, because minting one needs no
        // lot size. On the outgoing reference this order was the crossing
        // 17.1 refuses outright: one order taking one position from one sign
        // to the other, with a late fill on the entry it replaced settling
        // against a book that had already gone the other way.
        placement: placing(entry, wanted, ctx.qtyType, ctx.mint()),
        // Unreadable in units, so it is taken to have reduced the whole of what
        // was left: see `closable.ts` on why that is the only safe reading.
        reduces: { part: null, units: closableUnits(ctx, null), counted: false },
      },
    ];
  }

  // What each position it opposes can absorb, oldest first. A position holding
  // six is sent six of the nine, whether those six have settled or are still
  // going, because six of this order is what brings that position back to zero.
  const split = divide(book, entry.side, wanted, (one) => one.units);
  const out: MappedOrder[] = split.shares.map((share) => ({
    placement: placing(entry, share.units, 'units', share.ref),
    reduces: { part: null, units: share.units, counted: true },
  }));
  if (split.left === 0) return out;
  // The replacement is a position of its own where the leg holds none on this
  // side, so that a fill on an outgoing order settles the position it
  // belonged to.
  out.push(adding(placing(entry, split.left, 'units', openingOn(ctx, book, entry.side))));
  return out;
}

/** The reference an order that opens or adds to a position carries. */
function openingOn(ctx: PlacingContext, book: readonly Holding[], side: OrderSide): number {
  return joining(book, side) ?? ctx.mint();
}

/** One order of a flattening call, at the quantity and position it is given. */
function reducing(
  side: OrderSide,
  qty: number,
  qtyType: string,
  tag: string,
  positionRef: number,
): Placement {
  return { ...NOTHING, kind: 'place', side, qty, qtyType, type: 'market', tag, positionRef };
}

/**
 * The orders a flattening call sends, which is one per position it reduces.
 *
 * A quantity the script stated is in the declaration's own unit and is passed
 * through as written. A quantity the engine worked out is in units, because a
 * filled quantity is what it was folded from.
 *
 * **It is divided across the positions holding it, oldest first.** A leg holds
 * more than one position whenever an order that opposes it is outstanding, and
 * this sized against the whole leg and attached the result to a single
 * reference with nothing asking whether that reference could absorb it: a leg
 * holding two positions was flattened by one order large enough to take the
 * first of them through zero and out the other side. Each position gets an
 * order of its own, bounded by what has settled on it and is not already
 * working against it, which is `closable.ts`'s rule read per position.
 *
 * **Only what has settled on a position**, never what is working into it. A
 * close chooses its own quantity, so a close counting an entry that has not
 * settled would send units that may never exist. That is the one place this
 * differs from an opposing entry, which is sent at the size the script wrote
 * whatever the leg holds, and whose only open question is where its units land.
 *
 * **A quantity the engine cannot read is one order.** It cannot be divided at
 * all, so it goes on the position it is closing, oldest first, and that
 * position is what it may take past zero: the one shape of 17.1 an engine does
 * not keep, named there and in OS7005 and waiting on the same lot size.
 *
 * `part` is what the order is counted against afterwards: the tag a close
 * named, or the leg as a whole. A stated quantity is counted only where the
 * declaration counts in units, for the reason `Reduction` gives.
 */
export function flattening(
  ctx: PlacingContext,
  units: number,
  side: OrderSide,
  qty: number | null,
  tag: string,
  part: string | null,
): readonly MappedOrder[] {
  // Nothing to flatten and no size named: an instruction about a position the
  // strategy does not hold, which is not an error and is not an order either.
  if (units <= 0 && qty === null) return [];
  const sending = qty ?? units;
  // A quantity the engine worked out is counted as itself. One the script
  // stated in a unit the engine cannot read is counted as the whole of what was
  // left, which is what keeps a close after it from sending the position again.
  const counted = qty === null || ctx.qtyType === 'units';
  const book = holdings(ctx);
  if (!counted) {
    const outgoing = opposing(book, side)[0];
    return [
      {
        placement: reducing(
          side,
          sending,
          ctx.qtyType,
          tag,
          outgoing === undefined ? ctx.reference() : outgoing.ref,
        ),
        reduces: { part, units, counted: false },
      },
    ];
  }
  // Anything left when every position it reduces is full is left unsent rather
  // than pushed onto one of them past its own size. A close states no quantity
  // of its own, so the next one measures what is left and sends it, which is
  // 17.2's idempotence and not a silence. By construction there is nothing
  // left: what a close may send is the leg's settled net less what is working
  // against it, and that is never more than the positions on that side hold.
  return divide(book, side, sending, (one) => one.settled).shares.map((share) => ({
    placement: reducing(side, share.units, 'units', tag, share.ref),
    reduces: { part, units: share.units, counted: true },
  }));
}
