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
 * arriving late can still say which of the two it settled.
 *
 * **A bracket is an instruction, not an order.** `exit` and `order.bracket`
 * attach a protective level to a tag. They send an intent so that a host has
 * something to act on, and they append no ledger row and move no position,
 * because nothing has been ordered until the level is reached.
 */
import type { Identity, IntentBar, OrderIntent, OrderSide, OrderType } from './intent.js';
import type { LedgerRow } from './row.js';

/**
 * An order this run is about to send, before it is given an id.
 *
 * The intent's own shape less the four fields that are the same for every
 * order this run sends, so that the mapping below cannot state one of them
 * differently from one call to the next.
 */
export type Placement = Omit<OrderIntent, 'intentId' | 'instrument' | 'product' | 'bar'>;

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

/** What the mapping below reads: the declaration, the leg and the ledger. */
export interface PlacingContext {
  readonly instrument: Identity;
  readonly product: string;
  /** The unit a quantity the script stated is counted in, `language.md` 13.3. */
  readonly qtyType: string;
  /** The size an order that names none takes, from the declaration. */
  readonly declaredQty: number;
  readonly bar: IntentBar;
  /** The leg's net position in units, folded from settled fills. */
  size(): number;
  /** The position an order placed now attaches to. */
  reference(): number;
  /** A fresh position, for the replacement half of a flip. */
  mint(): number;
  /** The rows this strategy placed, newest last. */
  rows(): readonly LedgerRow[];
}

/** A number the script stated, or nothing where it stated none. */
function stated(args: readonly unknown[], index: number): number | null {
  const value = args[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function word(args: readonly unknown[], index: number): string {
  const value = args[index];
  return typeof value === 'string' ? value : '';
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

const TYPES: readonly OrderType[] = ['market', 'limit', 'stop', 'stopLimit'];
const SIDES: readonly OrderSide[] = ['buy', 'sell'];

function isLive(row: LedgerRow): boolean {
  return row.status === 'placed' || row.status === 'working' || row.status === 'triggerPending';
}

/** The side that reduces a position, or nothing when there is none to reduce. */
function closingSide(size: number): OrderSide | undefined {
  if (size > 0) return 'sell';
  if (size < 0) return 'buy';
  return undefined;
}

function entering(
  ctx: PlacingContext,
  side: OrderSide,
  qty: number | null,
  limit: number | null,
  trigger: number | null,
  tag: string,
): readonly Placement[] {
  const size = qty ?? ctx.declaredQty;
  if (!(size > 0)) return [];
  return [
    {
      ...NOTHING,
      kind: 'place',
      side,
      qty: size,
      qtyType: ctx.qtyType,
      type: typeOf(limit, trigger),
      limit,
      trigger,
      tag,
      positionRef: ctx.reference(),
    },
  ];
}

/**
 * The units a flattening order sends.
 *
 * A quantity the script stated is in the declaration's own unit and is passed
 * through as written. A quantity the engine worked out is in units, because a
 * filled quantity is what it was folded from.
 */
function flattening(
  ctx: PlacingContext,
  units: number,
  side: OrderSide,
  qty: number | null,
  tag: string,
): readonly Placement[] {
  if (units <= 0 && qty === null) return [];
  const size = qty ?? units;
  if (!(size > 0)) return [];
  return [
    {
      ...NOTHING,
      kind: 'place',
      side,
      qty: size,
      qtyType: qty === null ? 'units' : ctx.qtyType,
      type: 'market',
      tag,
      positionRef: ctx.reference(),
    },
  ];
}

/** The settled units held under one tag, signed the way a position is. */
function heldUnder(ctx: PlacingContext, tag: string): number {
  let held = 0;
  for (const row of ctx.rows()) {
    if (row.tag !== tag) continue;
    held += row.side === 'buy' ? row.filledQty : -row.filledQty;
  }
  return held;
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
): readonly Placement[] {
  // A call that names no level at all removes one, which is a standing level of
  // `stdlib.md` 17.9 and is planned. There is nothing to send.
  if (target === null && stop === null && profit === null && loss === null) return [];
  return [
    {
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
    },
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
export function placementsFor(
  name: string,
  args: readonly unknown[],
  ctx: PlacingContext,
): readonly Placement[] {
  switch (name) {
    case 'buy':
      return entering(ctx, 'buy', stated(args, 0), stated(args, 1), stated(args, 2), word(args, 3));
    case 'sell':
      return entering(
        ctx,
        'sell',
        stated(args, 0),
        stated(args, 1),
        stated(args, 2),
        word(args, 3),
      );

    case 'order.place': {
      // A side that is not one of the two is not a direction, and a buy is not
      // the safe guess: the checker refuses a written value outside the set
      // with OS3008, and a computed one that reaches here sends nothing rather
      // than sending the opposite of what the script meant.
      const asked = word(args, 0);
      const side = SIDES.find((one) => one === asked);
      if (side === undefined) return [];
      const limit = stated(args, 3);
      const trigger = stated(args, 4);
      // A type outside the set falls back to the one the prices imply, which is
      // the correspondence `stdlib.md` 17.2 fixes between the two.
      const type = TYPES.find((one) => one === word(args, 2)) ?? typeOf(limit, trigger);
      const qty = stated(args, 1) ?? ctx.declaredQty;
      if (!(qty > 0)) return [];
      return [
        {
          ...NOTHING,
          kind: 'place',
          side,
          qty,
          qtyType: ctx.qtyType,
          type,
          limit,
          trigger,
          tag: word(args, 5),
          positionRef: ctx.reference(),
        },
      ];
    }

    case 'close': {
      const size = ctx.size();
      const side = closingSide(size);
      if (side === undefined) return [];
      const tag = typeof args[0] === 'string' ? (args[0] as string) : null;
      // A tag names the part of the position that tag entered, which is the
      // settled quantity of its own rows. Bounded by what the leg holds, so
      // that closing a part can never cross zero.
      const held =
        tag === null ? Math.abs(size) : Math.min(Math.abs(heldUnder(ctx, tag)), Math.abs(size));
      return flattening(ctx, held, side, stated(args, 1), tag ?? '');
    }

    case 'order.reverse': {
      const size = ctx.size();
      const side = closingSide(size);
      if (side === undefined) return [];
      const tag = word(args, 1);
      const qty = stated(args, 0);
      const out = flattening(ctx, Math.abs(size), side, null, tag);
      // The replacement is a position of its own, minted here, so that a fill
      // on the outgoing order settles the position it belonged to.
      const ref = ctx.mint();
      const opening: Placement = {
        ...NOTHING,
        kind: 'place',
        side,
        qty: qty ?? Math.abs(size),
        qtyType: qty === null ? 'units' : ctx.qtyType,
        type: 'market',
        tag,
        positionRef: ref,
      };
      return [...out, opening];
    }

    case 'exit':
      // tag, qty, limit, stop, profit, loss. An absolute price and a distance
      // for the same side cannot both be given, which the checker refuses at
      // the call with OS3010.
      return bracketing(
        ctx,
        word(args, 0),
        stated(args, 1),
        stated(args, 2),
        stated(args, 3),
        stated(args, 4),
        stated(args, 5),
      );

    case 'order.bracket':
      // tag, profit, loss: distances only, which is the whole of this spelling.
      return bracketing(
        ctx,
        word(args, 0),
        null,
        null,
        null,
        stated(args, 1),
        stated(args, 2),
      );

    case 'cancel':
      return [cancelling(word(args, 0))];

    case 'cancelAll': {
      const tags: string[] = [];
      for (const row of ctx.rows()) {
        if (isLive(row) && !tags.includes(row.tag)) tags.push(row.tag);
      }
      return tags.map((tag) => cancelling(tag));
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
