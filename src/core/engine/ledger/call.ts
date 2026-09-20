/**
 * One order call, read once into the fields `stdlib.md` 17.2 and 17.3 name.
 *
 * **The positions the arguments arrive in are read here and nowhere else.**
 * Which slot holds a quantity and which holds a trigger is a fact about the
 * library surface, and a fact read in two places is one that has to be corrected
 * in two places. The mapping to orders and the refusals both read this record,
 * so neither of them counts arguments.
 *
 * **An argument the script left out and an argument it wrote as absent arrive
 * here the same way**, because the compiled program carries no difference
 * between them: an optional argument with no value in the surface is emitted as
 * absence (`compiled-program.md` 4.10, and the recorded exceptions beside it).
 * So `absent` names only the arguments the surface states no default for at all,
 * where absence can only have come from the script. Everywhere else the
 * documented default is what absence means, and the mapping applies it.
 */
import type { Span } from '../../span/index.js';
import type { OrderSide, OrderType } from './intent.js';

/** The two sides, `stdlib.md` 17.2. */
const SIDES: readonly OrderSide[] = ['buy', 'sell'];

/** The four types, `stdlib.md` 17.2. */
const TYPES: readonly OrderType[] = ['market', 'limit', 'stop', 'stopLimit'];

/**
 * An order call, with every argument under the name its signature gives it.
 *
 * `trigger` is an order's stop price, which `buy` and `sell` spell `stop` and
 * `order.place` spells `trigger`. `stop` and `target` are a bracket's two
 * levels, which `exit` spells `stop` and `limit`. The two are separate fields
 * because they are separate things: one rests at a venue and one is a level the
 * strategy holds.
 */
export interface OrderCall {
  readonly name: string;
  /** Where the call is written, so a refusal points at it. */
  readonly at: Span;
  /** Required arguments the script gave nothing at all, in signature order. */
  readonly absent: readonly string[];
  readonly side: OrderSide | null;
  /** The quantity the script stated, absent where it stated none. */
  readonly qty: number | null;
  /** The type the script named, on the one call that takes one. */
  readonly type: OrderType | null;
  readonly limit: number | null;
  readonly trigger: number | null;
  /** A bracket's target, as a price. */
  readonly target: number | null;
  /** A bracket's stop, as a price. */
  readonly stop: number | null;
  /** A bracket's target and stop as distances from the entry. */
  readonly profit: number | null;
  readonly loss: number | null;
  /** The tag the call named, absent where it named none. */
  readonly tag: string | null;
}

/** The fields every call states, so each case below states only its own. */
const NOTHING = {
  absent: [] as readonly string[],
  side: null,
  qty: null,
  type: null,
  limit: null,
  trigger: null,
  target: null,
  stop: null,
  profit: null,
  loss: null,
  tag: null,
} as const;

/** A number the script stated, or nothing where it stated none. */
function number(args: readonly unknown[], index: number): number | null {
  const value = args[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(args: readonly unknown[], index: number): string | null {
  const value = args[index];
  return typeof value === 'string' ? value : null;
}

/**
 * Whether the script gave this argument nothing at all.
 *
 * Absence and nothing at the position are the same answer, because a program
 * that supplied fewer arguments than the signature declares would have been
 * refused at load (`compiled-program.md` 2.5) and cannot reach here.
 */
function missing(args: readonly unknown[], index: number): boolean {
  const value = args[index];
  return value === null || value === undefined;
}

/** A word that is one of a set, or nothing where it is not. */
function oneOf<Word extends string>(set: readonly Word[], word: string | null): Word | null {
  return set.find((one) => one === word) ?? null;
}

/** `buy` and `sell`, whose name is their side. */
function placing(side: OrderSide, args: readonly unknown[], at: Span): OrderCall {
  return {
    ...NOTHING,
    name: side,
    at,
    side,
    qty: number(args, 0),
    limit: number(args, 1),
    trigger: number(args, 2),
    tag: text(args, 3),
  };
}

/** Reads one call, whichever of the nine it is. */
export function callOf(name: string, args: readonly unknown[], at: Span): OrderCall {
  switch (name) {
    case 'buy':
      return placing('buy', args, at);

    case 'sell':
      return placing('sell', args, at);

    case 'close':
      // tag, qty. The tag defaults to absence rather than to the empty string,
      // because a call that names none flattens the whole leg and the empty
      // string is a tag an order can carry.
      return { ...NOTHING, name, at, qty: number(args, 1), tag: text(args, 0) };

    case 'exit':
      // tag, qty, limit, stop, profit, loss. An absolute price and a distance
      // for the same side cannot both be given, which the checker refuses at
      // the call with OS3010.
      return {
        ...NOTHING,
        name,
        at,
        qty: number(args, 1),
        target: number(args, 2),
        stop: number(args, 3),
        profit: number(args, 4),
        loss: number(args, 5),
        tag: text(args, 0),
      };

    case 'cancel':
      // The tag is required, so absence here is the script's own.
      return {
        ...NOTHING,
        name,
        at,
        absent: missing(args, 0) ? ['tag'] : [],
        tag: text(args, 0),
      };

    case 'order.place': {
      // side, qty, type, price, trigger, tag. The first two are required, so
      // absence in either is a value the script computed and not a default.
      const absent: string[] = [];
      if (missing(args, 0)) absent.push('side');
      if (missing(args, 1)) absent.push('qty');
      return {
        ...NOTHING,
        name,
        at,
        absent,
        side: oneOf(SIDES, text(args, 0)),
        qty: number(args, 1),
        type: oneOf(TYPES, text(args, 2)),
        limit: number(args, 3),
        trigger: number(args, 4),
        tag: text(args, 5),
      };
    }

    case 'order.reverse':
      return { ...NOTHING, name, at, qty: number(args, 0), tag: text(args, 1) };

    case 'order.bracket':
      // tag, profit, loss: distances only, which is the whole of this spelling.
      return { ...NOTHING, name, at, profit: number(args, 1), loss: number(args, 2), tag: text(args, 0) };

    default:
      return { ...NOTHING, name, at };
  }
}
