/**
 * One order call becomes one or more intents, `stdlib.md` 17.2 and 17.3.
 *
 * **Every order states its own side and its own quantity outright.** Nothing
 * here computes a delta against an account position, for the reason 17.1 gives:
 * an account position is held per contract, so a second strategy, a manual
 * trade or this same script started twice all land in that one row, and an
 * order sized against it is sized against somebody else's trade.
 *
 * What a flattening order does compute against is the strategy's **own**
 * position, folded from its own settled fills, which is a different number with
 * a different owner.
 *
 * **No order crosses zero.** An instruction that would take a leg from long to
 * short is two orders, one closing the outgoing position and one opening the
 * replacement, each carrying its own position reference, so that a fill
 * arriving late can still say which of the two it settled. That is the split
 * `entering` makes, and `order.reverse` is the same pair written as one call.
 *
 * **A reducing order is sized against what is available to reduce**, which is
 * the settled position less everything already working against it. A position
 * is folded from settled fills and from nothing else (`stdlib.md` 17.8), so an
 * order the destination has not answered has filled nothing and has moved no
 * position figure: measured against the leg alone, a second close sends the
 * whole of it again, on the same bar and on every bar after it, and the leg
 * ends short with no quantity written anywhere. `closableUnits` answers it and
 * the ledger's own rows are where it is read from.
 *
 * **A bracket is an instruction, not an order.** `exit` and `order.bracket` set
 * the leg's own protective level, which is what `stdlib.md` 17.2 means when it
 * says a leg carries at most one stop and at most one target at a time. The tag
 * they take defaults to the empty string and rides along as a label, for the
 * destination and the report. It is not a reference to an order that has to
 * exist, so a bracket naming a tag nothing was ever placed with is an ordinary
 * call and is not refused: the level it sets belongs to the leg either way, and
 * `refuse.ts` measures it from the leg's own average entry price. They send an
 * intent so that a host has something to act on, and they append no ledger row
 * and move no position, because nothing has been ordered until the level is
 * reached.
 *
 * **A tag on a call that flattens is the other kind.** `close`'s tag defaults to
 * absence rather than to the empty string, and it names the part of the position
 * that tag entered, which is a reference to rows this ledger holds. A tag no
 * order in the file can place is OS7016, at the call, before any bar runs.
 *
 * **Nothing here refuses anything.** This file says what a call means; `refuse.ts`
 * says what the language will not do, and the ledger asks it first. The two were
 * one file once, and what that produced was a call whose quantity did not make
 * sense returning an empty list: no order, no refusal, and a script that had
 * been told nothing.
 */
import type { OrderCall } from './call.js';
import { closableUnits, closingSide } from './closable.js';
import type { Closing } from './closable.js';
import type { Identity, IntentBar, OrderIntent, OrderSide, OrderType } from './intent.js';
import { isTerminal } from './row.js';
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
function adding(placement: Placement): MappedOrder {
  return { placement, reduces: null };
}

/** The fields every placement states, so each case below states only its own. */
const NOTHING = {
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
export interface PlacingContext extends Closing {
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
  /** The position an order placed now attaches to. */
  reference(): number;
  /** The position an order placed now would attach to, without minting one. */
  current(): number | null;
  /** A fresh position, for the replacement half of a flip. */
  mint(): number;
}

/**
 * The type the prices imply.
 *
 * Stated on the intent rather than left to the host, so a destination never has
 * to infer it: with neither price a market order, with a limit alone a limit
 * order, with a trigger alone a stop order, and with both a stop limit order
 * (`stdlib.md` 17.2).
 */
function typeOf(limit: number | null, trigger: number | null): OrderType {
  if (limit !== null && trigger !== null) return 'stopLimit';
  if (limit !== null) return 'limit';
  if (trigger !== null) return 'stop';
  return 'market';
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
function entering(
  ctx: PlacingContext,
  entry: Entry,
  qty: number | null,
): readonly MappedOrder[] {
  // The declaration's own size where the call named none, `stdlib.md` 17.2.
  const wanted = qty ?? ctx.declaredQty;
  const size = ctx.size();
  // Nothing to cross: the leg is flat, or this order is on the side it holds.
  if (size === 0 || size > 0 === (entry.side === 'buy')) {
    return [adding(placing(entry, wanted, ctx.qtyType, ctx.reference()))];
  }

  const left = closableUnits(ctx, null);
  if (left === 0) return [adding(placing(entry, wanted, ctx.qtyType, ctx.mint()))];
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
        reduces: { part: null, units: left, counted: false },
      },
    ];
  }

  const closing = Math.min(wanted, left);
  const opening = wanted - closing;
  const reference = ctx.reference();
  const out: MappedOrder = {
    placement: placing(entry, closing, 'units', reference),
    reduces: { part: null, units: closing, counted: true },
  };
  if (opening === 0) return [out];
  // The replacement is a position of its own, minted here, so that a fill on
  // the outgoing order settles the position it belonged to.
  return [out, adding(placing(entry, opening, ctx.qtyType, ctx.mint()))];
}

/**
 * The units a flattening order sends.
 *
 * A quantity the script stated is in the declaration's own unit and is passed
 * through as written. A quantity the engine worked out is in units, because a
 * filled quantity is what it was folded from.
 *
 * `part` is what the order is counted against afterwards: the tag a close
 * named, or the leg as a whole. A stated quantity is counted only where the
 * declaration counts in units, for the reason `Reduction` gives.
 */
function flattening(
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
  return [
    {
      placement: {
        ...NOTHING,
        kind: 'place',
        side,
        qty: sending,
        qtyType: qty === null ? 'units' : ctx.qtyType,
        type: 'market',
        tag,
        positionRef: ctx.reference(),
      },
      reduces: { part, units: counted ? sending : units, counted },
    },
  ];
}

/**
 * A cancellation names the tag it cancels and nothing else.
 *
 * No side, no quantity and no price: it is not an order, and what becomes of
 * the order it names arrives as a frame about that order.
 */
function cancelling(tag: string): Placement {
  return { ...NOTHING, kind: 'cancel', tag, positionRef: 0 };
}

/** A protective level attached to a tag, `stdlib.md` 17.2 and 17.3. */
function bracketing(
  ctx: PlacingContext,
  tag: string,
  qty: number | null,
  target: number | null,
  stop: number | null,
  profit: number | null,
  loss: number | null,
): readonly MappedOrder[] {
  // A call that names no level at all removes one, which is a standing level of
  // `stdlib.md` 17.9 and is planned. There is nothing to send.
  if (target === null && stop === null && profit === null && loss === null) return [];
  // Nothing has been ordered by a bracket, so it takes nothing out of the
  // position: the level it sets belongs to the leg until it is reached.
  return [
    adding({
      ...NOTHING,
      kind: 'bracket',
      qty,
      qtyType: qty === null ? 'units' : ctx.qtyType,
      target,
      stop,
      profit,
      loss,
      tag,
      positionRef: ctx.reference(),
    }),
  ];
}

/**
 * The orders one call sends, in the order it sends them.
 *
 * A call that has nothing to send sends nothing: flattening a leg that holds
 * nothing and reversing a position that does not exist are both instructions
 * about a position the strategy does not hold, and inventing a side for either
 * would be the engine deciding a direction the script never stated.
 */
export function ordersFor(call: OrderCall, ctx: PlacingContext): readonly MappedOrder[] {
  const side = call.side;

  switch (call.name) {
    case 'buy':
    case 'sell':
      if (side === null) return [];
      return entering(
        ctx,
        {
          side,
          limit: call.limit,
          trigger: call.trigger,
          type: typeOf(call.limit, call.trigger),
          tag: call.tag ?? '',
        },
        call.qty,
      );

    case 'order.place': {
      // A side that is not one of the two is not a direction, and a buy is not
      // the safe guess: the checker refuses a written value outside the set
      // with OS3008, and a computed one that reaches here sends nothing rather
      // than sending the opposite of what the script meant. A side the script
      // stated as absent never reaches here at all: that is OS7002.
      if (side === null) return [];
      return entering(
        ctx,
        {
          side,
          limit: call.limit,
          trigger: call.trigger,
          // A type outside the set falls back to the one the prices imply,
          // which is the correspondence `stdlib.md` 17.2 fixes between the two.
          type: call.type ?? typeOf(call.limit, call.trigger),
          tag: call.tag ?? '',
        },
        call.qty,
      );
    }

    case 'close': {
      const closing = closingSide(ctx.size());
      if (closing === undefined) return [];
      // A tag names the part of the position that tag entered, which is the
      // settled quantity of its own rows, less what is already working against
      // it. A quantity the script stated has already been held against this
      // same number by `refuse.ts`, so nothing reaching here crosses zero.
      return flattening(
        ctx,
        closableUnits(ctx, call.tag),
        closing,
        call.qty,
        call.tag ?? '',
        call.tag,
      );
    }

    case 'order.reverse': {
      const size = ctx.size();
      const closing = closingSide(size);
      if (closing === undefined) return [];
      const tag = call.tag ?? '';
      // What is left to close rather than the whole leg, so that a reverse
      // after a close on the same bar does not send the position twice.
      const out = flattening(ctx, closableUnits(ctx, null), closing, null, tag, null);
      // The replacement is a position of its own, minted here, so that a fill
      // on the outgoing order settles the position it belonged to.
      const ref = ctx.mint();
      const opening: Placement = {
        ...NOTHING,
        kind: 'place',
        side: closing,
        qty: call.qty ?? Math.abs(size),
        qtyType: call.qty === null ? 'units' : ctx.qtyType,
        type: 'market',
        tag,
        positionRef: ref,
      };
      return [...out, adding(opening)];
    }

    case 'exit':
      return bracketing(
        ctx,
        call.tag ?? '',
        call.qty,
        call.target,
        call.stop,
        call.profit,
        call.loss,
      );

    case 'order.bracket':
      return bracketing(ctx, call.tag ?? '', null, null, null, call.profit, call.loss);

    case 'cancel':
      return [adding(cancelling(call.tag ?? ''))];

    case 'cancelAll': {
      const tags: string[] = [];
      for (const row of ctx.rows()) {
        if (!isTerminal(row.status) && !tags.includes(row.tag)) tags.push(row.tag);
      }
      return tags.map((tag) => adding(cancelling(tag)));
    }

    default:
      return [];
  }
}

/** The intent one placement becomes, `host-interface.md` 7.1. */
export function intentFor(
  placement: Placement,
  intentId: number,
  ctx: PlacingContext,
): OrderIntent {
  return {
    ...placement,
    intentId,
    instrument: ctx.instrument,
    product: ctx.product,
    bar: ctx.bar,
  };
}
