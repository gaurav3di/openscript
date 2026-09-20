/**
 * One order call becomes one or more intents, `stdlib.md` 17.2 and 17.3.
 *
 * **This file says what a call means; `sizing.ts` says how much it sends and
 * against which position.** The two were one file until the second question
 * arrived: how many orders a call becomes, how large each of them is and which
 * position reference each one carries is arithmetic over what the leg holds, and
 * it is long enough written down to crowd out the vocabulary of the calls. The
 * sentences below about the split are still this file's, because they are why
 * the calls mean what they mean.
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
import { closableUnits, closingFor, closingSide } from './closable.js';
import type { OrderIntent, OrderType } from './intent.js';
import { protecting } from './holdings.js';
import { isTerminal } from './row.js';
import { NOTHING, adding, entering, flattening } from './sizing.js';
import type { MappedOrder, Placement, PlacingContext } from './sizing.js';

export type { MappedOrder, Placement, PlacingContext } from './sizing.js';

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
      // The position the level protects, and zero where the leg holds none,
      // which is the value a cancellation already carries for the same reason:
      // neither is an order and neither has a position of its own. Minting one
      // here burned a reference on an instruction that moves nothing, so a
      // script whose first call is `exit()` opened on reference 2 and the
      // bracket named a reference no order ever carried
      // (`host-interface.md` 7.1).
      //
      // **Asked of the book, because what the leg holds is not what was minted
      // last.** The reference minted last is cleared when that one reference
      // returns to zero, so a leg still holding an older position reported none
      // and a bracket went out carrying `0`, which is the one value 7.1 tells a
      // host means there is nothing to look up (`holdings.ts`, `protecting`).
      positionRef: protecting(ctx) ?? 0,
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
      // **The side comes from the part the call names**, which is the leg only
      // where it names no tag. Taken from the leg's net, a close of a part
      // holding four short on a leg netting six long was a sell of four: the
      // part went to eight short, the other tag's long was cut to six, and a
      // call named close had opened position (`closable.ts`, `stdlib.md` 17.2).
      const closing = closingFor(ctx, call.tag);
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
