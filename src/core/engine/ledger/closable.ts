/**
 * What is left for this bar to close, `stdlib.md` 17.1 and 17.2.
 *
 * **The orders one bar sends can never sum past the position they are
 * reducing.** A position is folded from settled fills and from nothing else
 * (17.8), which is right and is what makes this file necessary: an order this
 * bar has already sent has filled nothing, so the leg still reads what it held
 * when the bar began. Measured against that alone, the second close of a bar
 * sends the whole position a second time. Two bare closes on one bar took a leg
 * holding three long to three short, under one position reference, with no
 * quantity written anywhere and nothing said.
 *
 * So a reducing order is measured against what is left to reduce after the
 * orders this bar has already committed to, and the bar's own record of those
 * orders lives here beside the arithmetic that reads it. The ceiling OS7017
 * applies was always the right ceiling; the number it was applied to was what
 * the bar began with rather than what is left.
 *
 * **In units, because a position is.** A quantity the script stated is in the
 * declaration's own unit (`host-interface.md` 7.1), so it is a number this file
 * can read only where that unit is units. In lots, cash or an equity percent
 * the two are different kinds of number and the lot size that would join them
 * is the fact OS7005 is deferred on.
 *
 * **What is done with an order it cannot read is the only reading that cannot
 * cross zero: that the order took the whole of the part.** Counted as nothing,
 * `close(qty = 1)` in lots followed by a bare close on the same bar sent the
 * position a second time and the leg ended short, which is the defect this file
 * exists for wearing a different unit. Counted as everything, the second close
 * sends nothing, which leaves the strategy holding a position it may believe it
 * closed. That is the worse-of-two choice `stdlib.md` 17.1 already makes: an
 * order that crosses zero is the failure the sentence is unconditional about,
 * and a close that sends nothing is the idempotence the same section describes.
 *
 * So what is left carries whether it was counted or assumed. The mapping reads
 * the number, because sending nothing is safe either way. The refusal reads
 * both, because a refusal may only name a number it measured: an assumed zero
 * is not a fact about the leg and OS7017 is not raised on one.
 */
import type { OrderSide } from './intent.js';
import type { LedgerRow } from './row.js';

/**
 * What one order takes out of a position, in units.
 *
 * Absent on an order that adds to a position, and absent on one whose quantity
 * the engine cannot count in units, which are two different facts with the same
 * consequence here: neither subtracts anything from what is left to close.
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
 * An order this bar has already sent.
 *
 * Two rules read it and neither can be answered from one call alone. OS7013
 * asks whether the bar has already sent the opposite side, and `closableUnits`
 * asks what the bar has already committed to closing, which is the whole of why
 * a second close on one bar is not a second whole position.
 *
 * The record is the bar's rather than the execution's, so a bar declared
 * `onUnconfirmed` and executed again still sends one position's worth of
 * closes: the orders of its earlier executions really were handed over.
 */
export interface SentOnBar {
  readonly name: string;
  readonly line: number;
  readonly side: OrderSide;
  /** What it takes out of the position, absent where it takes nothing. */
  readonly reduces: Reduction | null;
}

/**
 * What the arithmetic below needs: the leg, its rows and the bar's own orders.
 *
 * Narrower than the context the mapping is given, so that this file states what
 * it reads rather than importing the whole of it.
 */
export interface Closing {
  /** The leg's net position in units, folded from settled fills. */
  size(): number;
  /** The rows this strategy placed, newest last. */
  rows(): readonly LedgerRow[];
  /** The orders this bar has already sent, oldest first. */
  sent(): readonly SentOnBar[];
}

/** The settled units held under one tag, signed the way a position is. */
function heldUnder(ctx: Closing, tag: string): number {
  let held = 0;
  for (const row of ctx.rows()) {
    if (row.tag !== tag) continue;
    held += row.side === 'buy' ? row.filledQty : -row.filledQty;
  }
  return held;
}

/** What one part of the leg can still close, and whether that was measured. */
export interface Closable {
  /** The units a close may still send against it. */
  readonly units: number;
  /** Whether every order counted against it stated a quantity in units. */
  readonly counted: boolean;
}

/**
 * The units this bar's orders have already committed to reducing.
 *
 * Every reduction comes out of the leg, and a reduction naming a tag comes out
 * of that tag as well, so the leg is asked with no tag and a part is asked with
 * its own.
 */
function committed(ctx: Closing, tag: string | null): Closable {
  let units = 0;
  let counted = true;
  for (const order of ctx.sent()) {
    const reduces = order.reduces;
    if (reduces === null) continue;
    if (tag !== null && reduces.part !== tag) continue;
    units += reduces.units;
    counted = counted && reduces.counted;
  }
  return { units, counted };
}

/**
 * What a `close` can still close, in units, whether or not it names a quantity.
 *
 * The whole leg where the call names no tag, and the part that tag entered
 * where it names one, bounded by what the leg holds so that closing a part can
 * never cross zero, and less what this bar has already committed to closing.
 * Zero while the leg is flat, zero for a tag whose rows have netted to nothing,
 * and zero once the bar's own orders have committed the whole of it.
 *
 * Both readers ask this one question. The quantity a script states is refused
 * against this number (OS7017) and the quantity the engine works out for itself
 * is this number. Two readings of what a part holds would be one fact in two
 * files, and the refusal would be about a quantity the mapping was not going to
 * send.
 */
export function closable(ctx: Closing, tag: string | null): Closable {
  const spent = committed(ctx, null);
  const leg = Math.max(0, Math.abs(ctx.size()) - spent.units);
  if (tag === null) return { units: leg, counted: spent.counted };
  const own = committed(ctx, tag);
  const part = Math.max(0, Math.abs(heldUnder(ctx, tag)) - own.units);
  return part <= leg
    ? { units: part, counted: own.counted }
    : { units: leg, counted: spent.counted };
}

/** What a close can still close, for the mapping, which sends a number. */
export function closableUnits(ctx: Closing, tag: string | null): number {
  return closable(ctx, tag).units;
}
