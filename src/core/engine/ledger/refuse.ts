/**
 * What the order layer will not do, `errors.md` OS7002 to OS7013.
 *
 * **An order is the one place in the language where doing nothing quietly is
 * worse than stopping loudly** (`language.md` 6.8). Every refusal here replaced
 * one of two silences: a call that returned an empty list, so the script was
 * told nothing and nothing was sent, or a value the engine filled in for itself
 * and sent to a venue. The second is the worse of the two, because the order
 * that arrives is a number nobody wrote.
 *
 * **A refusal happens before anything is sent.** The ledger asks this file
 * about every order a call produces, and mints an id for none of them until all
 * of them have passed, so a refused call reaches no destination at all rather
 * than being sent and then reported. That is also why the bar stops: a runtime
 * error stops the bar and marks the script as errored (`errors.md` section 2),
 * and a strategy that carried on past an order it could not place would be
 * trading a position it does not believe it has.
 *
 * **What is not refused here.** A rule this file cannot evaluate truthfully is
 * not evaluated at all, because a refusal with a wrong number in it is worse
 * than the silence it replaced:
 *
 * - **A quantity that is not a whole number of lots, OS7005**, and **an order
 *   outside the instrument's session, OS7012**: both are facts the leg would
 *   have to be given and neither is one the ledger holds today.
 * - **The capital a strategy has left, OS7011.** Every money figure of
 *   `stdlib.md` 17.4 is planned, so there is no equity to compare against and a
 *   number invented for the message would be the wrong one.
 * - **OS7014 and OS7015 are the host's**, under `host-interface.md` 7.6. A
 *   destination's own refusal arrives as a frame and is folded onto the row's
 *   rejection text (17.8), where `order.rejection` reads it; raising it would
 *   stop a run the fold says continues.
 */
import { diagnosticFor } from '../../diagnostics/index.js';
import type { Diagnostic } from '../../diagnostics/index.js';
import type { OrderCall } from './call.js';
import type { Identity, OrderSide } from './intent.js';
import type { Placement, PlacingContext } from './place.js';
import { isTerminal } from './row.js';

/**
 * How a message names an instrument the host gave no symbol for.
 *
 * The same words the engine uses for the same gap elsewhere, because a reader
 * meeting both should not have to work out that they mean one thing.
 */
const UNNAMED_INSTRUMENT = "the chart's instrument";

/** An order this bar has already sent, for the one rule that spans two calls. */
export interface SentOnBar {
  readonly name: string;
  readonly line: number;
  readonly side: OrderSide;
}

/** The calls that take the declaration's size when they are given none. */
const SIZED_BY_DECLARATION: readonly string[] = ['buy', 'sell', 'order.place'];

function nameOf(instrument: Identity): string {
  return instrument.symbol ?? UNNAMED_INSTRUMENT;
}

/** An order call as a message names one: what was called, and where. */
function spell(name: string, line: number): string {
  return `${name}() on line ${line}`;
}

/**
 * The price argument a named type needs and was not given, `stdlib.md` 17.2.
 *
 * Only a call that names a type can disagree with its own prices. `buy` and
 * `sell` take no type and their prices imply one, so the two always agree.
 */
function priceMissing(call: OrderCall): string | undefined {
  const type = call.type;
  if ((type === 'limit' || type === 'stopLimit') && call.limit === null) return 'price';
  if ((type === 'stop' || type === 'stopLimit') && call.trigger === null) return 'trigger';
  return undefined;
}

/**
 * Whether a price falls on a tick.
 *
 * Compared as a count of ticks with a tolerance, because a price computed from
 * a tick size rarely divides by it exactly in binary: a level two ticks above
 * a close is the right price and the division that reads it back is not exact.
 * A tolerance relative to the count keeps that true at every magnitude, and it
 * is far tighter than half a tick, which is what would be needed to let a price
 * between two ticks through.
 */
function onTick(price: number, tick: number): boolean {
  const steps = price / tick;
  const nearest = Math.round(steps);
  return Math.abs(steps - nearest) <= 1e-9 * Math.max(1, Math.abs(steps));
}

/** Whether this order adds to a position rather than reducing one. */
function isEntry(ctx: PlacingContext, side: OrderSide): boolean {
  const size = ctx.size();
  if (size === 0) return true;
  return size > 0 === (side === 'buy');
}

/**
 * The entries already open in one direction, which is what pyramiding counts.
 *
 * The rows of the position an order placed now would join, on that order's own
 * side, that have actually filled something into it.
 *
 * **An order that has not filled is not an open entry**, and the count says so
 * because the code's own fix says so: OS7008 tells a reader to test `pos.size`,
 * and `pos.size` is folded from settled fills and from nothing else
 * (`stdlib.md` 17.1). A count that included an order still waiting at the venue
 * would refuse a script that had done exactly what the fix asked, which is the
 * one thing a fix may never do.
 */
function entriesOpen(ctx: PlacingContext, side: OrderSide): number {
  const position = ctx.current();
  if (position === null) return 0;
  let found = 0;
  for (const row of ctx.rows()) {
    if (row.positionRef !== position || row.side !== side) continue;
    if (row.filledQty === 0) continue;
    found += 1;
  }
  return found;
}

/**
 * What the call itself is wrong about, before anything is computed from it.
 *
 * Three refusals, all of them about what the script wrote rather than about the
 * leg or the instrument, so all three are the same on every bar and on every
 * host.
 */
export function refusalInCall(call: OrderCall, ctx: PlacingContext): Diagnostic | undefined {
  // OS7002. Every argument the script wrote that came out absent, named in
  // signature order, so a call with two is reported on the first one a reader
  // would fix. An argument the script did not write is not one of them: it
  // takes the default `stdlib.md` documents, and `call.ts` says how the two are
  // told apart.
  const absent = call.absent[0];
  if (absent !== undefined) {
    return diagnosticFor('OS7002', call.at, { name: call.name, argument: absent });
  }

  // OS7004. Direction is chosen by the function and not by the sign, so a
  // negative quantity is a calculation that went the wrong way.
  const stated = call.qty;
  if (stated !== null && !(stated > 0)) {
    return diagnosticFor('OS7004', call.at, { name: call.name, qty: stated });
  }
  // The declaration's own size, on a call that names none and would take it.
  if (stated === null && SIZED_BY_DECLARATION.includes(call.name) && !(ctx.declaredQty > 0)) {
    return diagnosticFor('OS7004', call.at, { name: call.name, qty: ctx.declaredQty });
  }

  // OS7007. Filling the price in from the bar's close would make the order a
  // market order wearing another name.
  const missing = priceMissing(call);
  if (missing !== undefined && call.type !== null) {
    return diagnosticFor('OS7007', call.at, { type: call.type, argument: missing });
  }

  return undefined;
}

/** A cancellation naming an order that is not there to cancel, OS7009. */
function unknownTag(
  call: OrderCall,
  placement: Placement,
  ctx: PlacingContext,
): Diagnostic | undefined {
  for (const row of ctx.rows()) {
    if (row.tag === placement.tag && !isTerminal(row.status)) return undefined;
  }
  return diagnosticFor('OS7009', call.at, { tag: placement.tag });
}

/**
 * A protective level on the wrong side of the entry, OS7010.
 *
 * Only against a position that is open, because the level is measured from the
 * position's average entry price and a leg that holds nothing has none. An
 * entry and its bracket on one bar is the common shape and is not this case:
 * the entry has not filled, so there is nothing yet for the level to be on the
 * wrong side of, which is why a bracket may also state its levels as distances.
 *
 * A level exactly at the entry is not refused. Moving every stop to its own
 * entry is a rule the language names (`stdlib.md` 17.11), so the price that
 * rule produces cannot be one the language will not take.
 */
function wrongSide(
  call: OrderCall,
  placement: Placement,
  ctx: PlacingContext,
): Diagnostic | undefined {
  const entry = ctx.avgPrice();
  const size = ctx.size();
  if (entry === null || size === 0) return undefined;
  const long = size > 0;
  const side = long ? 'long' : 'short';

  const stop = placement.stop;
  if (stop !== null && (long ? stop > entry : stop < entry)) {
    return diagnosticFor('OS7010', call.at, { side, entry, leg: 'stop', price: stop });
  }
  const target = placement.target;
  if (target !== null && (long ? target < entry : target > entry)) {
    return diagnosticFor('OS7010', call.at, { side, entry, leg: 'limit', price: target });
  }
  return undefined;
}

/** What one order is wrong about, given the instrument and the leg. */
function ordering(
  call: OrderCall,
  placement: Placement,
  ctx: PlacingContext,
  sent: readonly SentOnBar[],
): Diagnostic | undefined {
  const side = placement.side;
  if (side === null) return undefined;

  // OS7006. A price between two ticks cannot exist at the exchange, and
  // rounding it here would move the order off the level the script computed.
  const tick = ctx.tickSize;
  if (tick !== null && tick > 0) {
    for (const price of [placement.limit, placement.trigger]) {
      if (price === null || onTick(price, tick)) continue;
      return diagnosticFor('OS7006', call.at, { symbol: nameOf(ctx.instrument), tick, price });
    }
  }

  // OS7008. Refusing rather than silently adding keeps a backtest from building
  // a position the declaration forbade.
  if (isEntry(ctx, side)) {
    const found = entriesOpen(ctx, side);
    if (found >= ctx.pyramiding) {
      return diagnosticFor('OS7008', call.at, { max: ctx.pyramiding, found });
    }
  }

  // OS7013. Which of the two to honour has no defensible answer, so neither is
  // placed: this call sends nothing, and the bar stops before anything the bar
  // decided reaches the destination.
  const opposite = sent.find((one) => one.side !== side);
  if (opposite !== undefined) {
    return diagnosticFor('OS7013', call.at, {
      first: spell(opposite.name, opposite.line),
      second: spell(call.name, call.at.line),
      bar: ctx.bar.index,
    });
  }

  return undefined;
}

/**
 * What one order this call produced is wrong about.
 *
 * Asked of every order a call sends, before any of them is given an id, so a
 * call that sends two sends both or neither.
 */
export function refusalInOrder(
  call: OrderCall,
  placement: Placement,
  ctx: PlacingContext,
  sent: readonly SentOnBar[],
): Diagnostic | undefined {
  if (placement.kind === 'cancel') return unknownTag(call, placement, ctx);
  if (placement.kind === 'bracket') return wrongSide(call, placement, ctx);
  return ordering(call, placement, ctx, sent);
}
