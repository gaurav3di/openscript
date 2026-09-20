/**
 * What is left to reduce and which side reduces it, `stdlib.md` 17.1 and 17.2.
 *
 * **Both questions are about a part rather than about the leg**, and the leg is
 * the case of a part that no tag names. A leg can be long under one tag and
 * short under another, and then its net answers neither question for either of
 * them: `close(tag)` taking its side from the net sent an order that added to
 * the part it was told to flatten, and a count taken from the net did not see
 * the close already on its way to that part.
 *
 * **What is available to reduce is the settled position less everything already
 * working against it.** A position is folded from settled fills and from
 * nothing else (17.8), which is right and is what makes this file necessary: an
 * order the destination has not answered has filled nothing, so the leg still
 * reads what it held before that order left. Measured against that alone, every
 * reducing order sends the whole position again.
 *
 * **The scope is the run and the position, not the bar.** That correction is
 * the whole of this file's history and it was arrived at twice. The first
 * reading counted the orders of one call, and `close()` twice on one bar took a
 * leg holding three long to three short. The second counted the orders of one
 * bar, and the same two closes one bar apart did the same thing: the bar's own
 * record was emptied when the bar index changed, so bar three asked what the leg
 * held, was told three, and sent three. With a destination slower than the chart
 * the plainest exit a strategy can write,
 *
 *     if bar.index > 0 and pos.size > 0
 *         close()
 *
 * sent one close per bar for the length of the run, and a flat exit became a
 * short position that grew without limit. The script was not wrong: `pos.size`
 * is folded from settled fills and correctly still read three.
 *
 * So the record is not the call's and not the bar's. It is the ledger's, which
 * is the run's, and the ledger already holds it: a row carries a status and a
 * filled quantity, and an order the destination still has is exactly a row that
 * is neither terminal nor fully filled (`row.ts`, `workingUnits`). A bar-scoped
 * rule is the special case of this one where nothing has been answered yet, so
 * this subsumes it rather than sitting beside it, and the bar keeps no record of
 * its own.
 *
 * Four cases decide the shape, and each is a case a strategy meets:
 *
 * - **A partial fill.** Three sold with one filled leaves two working, not
 *   three and not none, because the one that filled has already moved the leg.
 * - **A rejection.** The row ends, the working quantity is released, and the
 *   script may close again. That is correct, and it is why a frame matters.
 * - **A destination that never answers.** The strategy cannot close again,
 *   which is right: it already has a close working, and a second one would sell
 *   a position it is already selling. `cancel` is the way out, and it works
 *   because the cancellation comes back as a frame that ends the row.
 * - **An entry working against the same leg.** An unsettled `buy` adds nothing
 *   to what a close may reduce. Nothing has settled, so there is nothing extra
 *   to close, and counting it would send a close for a position that may never
 *   exist.
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
import { isTerminal, workingUnits } from './row.js';
import type { LedgerRow } from './row.js';

/**
 * The side that reduces a position, or nothing when there is none to reduce.
 *
 * One fact with two readers. The mapping uses it to give a close its direction,
 * and the arithmetic below uses it to tell an order that is on its way out of
 * the position from one that is on its way in, which is the difference between
 * a reduction that is still working and an entry that holds nothing.
 */
export function closingSide(size: number): OrderSide | undefined {
  if (size > 0) return 'sell';
  if (size < 0) return 'buy';
  return undefined;
}

/**
 * What the arithmetic below needs: the leg and the rows of its own ledger.
 *
 * Narrower than the context the mapping is given, so that this file states what
 * it reads rather than importing the whole of it.
 */
export interface Closing {
  /** The leg's net position in units, folded from settled fills. */
  size(): number;
  /** The rows this strategy placed, newest last. */
  rows(): readonly LedgerRow[];
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

/**
 * What the part a call names holds, signed the way a position is.
 *
 * The leg where the call names no tag, and the settled quantity of that tag's
 * own rows where it names one. **One function because it is one question**, and
 * every number this file produces about a part is taken from it: how much is
 * there to close, which side reduces it, and how much of it an order the engine
 * cannot read is assumed to have taken.
 */
function holdingOf(ctx: Closing, tag: string | null): number {
  return tag === null ? ctx.size() : heldUnder(ctx, tag);
}

/**
 * The side that reduces the part a call names, or nothing where it holds none.
 *
 * **The direction of a close comes from the part it was told to flatten**, and
 * taking it from the leg is how a call named `close` opened a position: a leg
 * holding ten long under one tag and four short under another is a net six
 * long, so `close(tag)` on the short part was answered with a sell, which took
 * that part to eight short and cut the other one to six. `stdlib.md` 17.2 says
 * the call flattens the part of the position carrying one tag, and says of the
 * reading that takes the leg's net that it would let close open a position.
 *
 * A part whose own rows have netted to nothing has no side and the call sends
 * nothing, which is 17.2's idempotence and the same answer a flat leg gives a
 * bare close.
 */
export function closingFor(ctx: Closing, tag: string | null): OrderSide | undefined {
  return closingSide(holdingOf(ctx, tag));
}

/** What one part of the leg can still close, and whether that was measured. */
export interface Closable {
  /** The units a close may still send against it. */
  readonly units: number;
  /** Whether every order counted against it stated a quantity in units. */
  readonly counted: boolean;
}

/**
 * The units already working against the position, across the whole run.
 *
 * Every reduction comes out of the leg, and a reduction naming a tag comes out
 * of that tag as well, so the leg is asked with no tag and a part is asked with
 * its own.
 *
 * **Only an order on the side that reduces what the leg holds now**, and
 * **every** order on that side. A row records what it reduced at the moment it
 * was sent, and a leg that has changed sign since is being reduced from the
 * other side: an order still working on the old side is adding to the leg
 * rather than taking from it, and subtracting it would leave a close sending
 * less than there is to close. The same sentence read the other way is the
 * half that was missing. An order recorded as adding to a position, on a leg
 * that has since gone the other way, is a reduction now whatever it was then,
 * and leaving it out let a close be sized against a position an entry was
 * already coming to take off: `buy(qty = 5)` unanswered on a leg the sells
 * after it took short offered a close the whole twelve, five of which were
 * already on their way.
 *
 * **The side is the part's own**, which is the leg's where no tag names one. A
 * part can sit on the side its leg is not on, and then the orders that reduce
 * it are the ones the leg's net calls additions: measured from the leg, the
 * count for a short part under a long leg counted the sells that were adding to
 * it and missed the buys that were taking it off.
 *
 * `holdings.ts` makes the same reading per position reference, and the two
 * agree by construction: what a close may send across the leg is never more
 * than the positions on that side can give it.
 */
function committed(ctx: Closing, tag: string | null): Closable {
  const held = holdingOf(ctx, tag);
  const side = closingSide(held);
  if (side === undefined) return { units: 0, counted: true };
  let units = 0;
  let counted = true;
  for (const row of ctx.rows()) {
    if (row.side !== side || isTerminal(row.status)) continue;
    const reduces = row.reduces;
    if (reduces !== null) {
      if (tag !== null && reduces.part !== tag) continue;
      const working = workingUnits(row);
      if (working === 0) continue;
      units += working;
      counted = counted && reduces.counted;
      continue;
    }
    // An order that was an entry when it left. Its own tag is what names it,
    // because a reduction's `part` is the tag a close named and an entry named
    // no part of anything.
    if (tag !== null && row.tag !== tag) continue;
    if (row.units === null) {
      // A quantity in the declaration's own unit, working against this part and
      // unreadable as a number of units. Taken to cover the whole of what is
      // there, which is the reading `stdlib.md` 17.1 already makes for the
      // other order it cannot read: a close that sends nothing over an order
      // that crosses zero.
      units += Math.abs(held);
      counted = false;
      continue;
    }
    units += Math.max(0, row.units - row.filledQty);
  }
  return { units, counted };
}

/**
 * What a `close` can still close, in units, whether or not it names a quantity.
 *
 * The whole leg where the call names no tag, and the part that tag entered
 * where it names one, less what is already working against it. Zero while the
 * leg is flat, zero for a tag whose rows have netted to nothing, and zero once
 * the orders already sent have the whole of it going.
 *
 * **A part on the leg's own side is bounded by the leg**, so that closing a
 * part can never take the leg through zero: the part is what the call names,
 * and the leg is what the order comes out of.
 *
 * **A part on the other side is not**, and bounding it there was the second
 * half of taking a direction from the net. Closing a short part under a long
 * leg is a buy, which moves the leg away from zero rather than towards it, so
 * there is nothing for the leg's own number to bound: measured against it, a
 * part holding ten short on a leg netting two long was offered two, and on a
 * leg netting nothing at all it was offered nothing. What that order may
 * actually send is still bounded per position by what has settled there
 * (`holdings.ts`), so a part whose reference has already returned to zero sends
 * nothing rather than opening it again.
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
  const held = heldUnder(ctx, tag);
  const own = committed(ctx, tag);
  const part = Math.max(0, Math.abs(held) - own.units);
  if (Math.sign(held) !== Math.sign(ctx.size())) return { units: part, counted: own.counted };
  return part <= leg
    ? { units: part, counted: own.counted }
    : { units: leg, counted: spent.counted };
}

/** What a close can still close, for the mapping, which sends a number. */
export function closableUnits(ctx: Closing, tag: string | null): number {
  return closable(ctx, tag).units;
}
