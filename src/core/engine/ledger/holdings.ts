/**
 * What a leg holds, one entry per position reference, including what is still
 * working, `stdlib.md` 17.1 and 17.7.
 *
 * **This file answers which position an order is sent against.** Three rounds
 * corrected how much a reducing order may send, against the call, against the
 * bar and then against the run. None of them asked which position reference an
 * order carries, and the mapping was still deciding it from `ctx.size()`, which
 * is the leg's net folded from settled fills. That number cannot answer the
 * question, and the plainest script there is shows why:
 *
 *     if bar.index == 0
 *         buy(qty = 6)
 *     if bar.index == 1
 *         sell(qty = 9)
 *
 * With the destination silent the leg's settled net is zero on bar one, so the
 * sell was not seen as opposing anything and went on the reference the buy was
 * already on. Both filled, and reference 1 opened six long and settled three
 * short: one reference holding both signs, which is the one failure 17.1 names,
 * because a fill arriving late can no longer say which position it settled.
 *
 * **So a reference is measured by what is on it, settled and working
 * together.** An order the destination has not answered has moved no position
 * figure, and the ledger's rows are where it is visible (`row.ts`). A reference
 * with six units of buy still to come is a long position whether or not any of
 * it has settled, and an opposing order has to take those six off it before it
 * opens anything new: otherwise nothing can ever bring that reference back to
 * zero, which is 17.7's sentence about how a position ends.
 *
 * **Two numbers, because two questions are asked and they are not the same
 * question.**
 *
 * - `units` is what an opposing order may take, and it counts what is working.
 *   The order is being sent either way, at the size the script wrote; the only
 *   thing being decided is which reference each unit lands on, and the answer
 *   that lets every reference return to zero is the one that puts the units
 *   where the quantity they cancel is.
 * - `settled` is what a close may send, and it counts only what has settled,
 *   less what is already working against it. A close chooses its own quantity,
 *   so a close counting a working entry would sell units that may never exist.
 *   That is `closable.ts`'s rule, and this is the same rule read per reference
 *   instead of per leg.
 *
 * **What this costs, stated rather than discovered.** An entry that opposes an
 * unanswered entry is sent against it, so if the first order is rejected and
 * the second fills, that reference settles on the side it did not open on. No
 * engine avoids that without holding an order back until the destination
 * answers, which is an engine that stops trading when a destination is slow.
 * What 17.1 asks for is kept either way: every order names exactly one
 * position, so every fill, however late, says which position it settled.
 */
import type { OrderSide } from './intent.js';
import { isTerminal } from './row.js';
import type { LedgerRow } from './row.js';

/** One position reference a leg holds, and what may still be done to it. */
export interface Holding {
  readonly ref: number;
  /** The side it is on: `buy` for a long position, `sell` for a short one. */
  readonly side: OrderSide;
  /**
   * The units an opposing order may take from it, settled and working
   * together, or absent where the engine cannot read one of its quantities.
   *
   * Absent is not zero. It means the reference holds something on `side` whose
   * size is stated in the declaration's own unit, which is the fact OS7005 is
   * deferred on, so an opposing order cannot be divided against it.
   */
  readonly units: number | null;
  /** The settled units nothing is working against, which is what a close sends. */
  readonly settled: number;
}

/** What this file reads: the rows of the ledger and the position book. */
export interface Book {
  /** The rows this strategy placed, newest last. */
  rows(): readonly LedgerRow[];
  /** The settled size of one position reference, signed the way a position is. */
  sizeOf(ref: number): number;
}

/** One reference under construction, before it is decided what it holds. */
interface Tally {
  /** Settled, signed, from the position book, which is the fold's owner. */
  readonly settled: number;
  /** Working units, signed, over the orders whose quantity is readable. */
  working: number;
  /**
   * Working units on the side that reduces what has settled here, unsigned.
   *
   * **Which side that is depends on what settled, not on what an order was
   * when it left.** A row records what it reduced at the moment it was sent,
   * and a position that has moved since is being reduced from the other side:
   * an order recorded as adding is a reduction now, and a reduction recorded
   * then is adding now. Counting by the record instead of by the direction
   * offered a close seven units against a reference holding two short, which
   * took that reference's own book to five long. `closable.ts` makes the same
   * correction one scope out, on the leg.
   */
  against: number;
  /** The side of a working order whose quantity is not readable, or none. */
  unreadable: OrderSide | null;
  /** Whether a quantity it cannot read is working against what settled here. */
  blocked: boolean;
}

function sideOf(signed: number): OrderSide {
  return signed > 0 ? 'buy' : 'sell';
}

/**
 * Every position reference this leg holds, oldest first.
 *
 * Oldest first is the order the references were minted in, which is the order
 * the rows first name them in, and it is the order a reducing order takes them
 * in: the position opened first is the position closed first.
 *
 * A reference with nothing left on it is not here. It has no room for an
 * opposing order and nothing for a close to send, and it is either already back
 * at zero or has its whole quantity spoken for by orders that are still going.
 */
export function holdings(ctx: Book): readonly Holding[] {
  const tallies = new Map<number, Tally>();
  const minted: number[] = [];

  for (const row of ctx.rows()) {
    let tally = tallies.get(row.positionRef);
    if (tally === undefined) {
      tally = {
        settled: ctx.sizeOf(row.positionRef),
        working: 0,
        against: 0,
        unreadable: null,
        blocked: false,
      };
      tallies.set(row.positionRef, tally);
      minted.push(row.positionRef);
    }
    // An order that has ended has nothing more coming from it, whatever it
    // filled: the fill is already in the settled figure above, and the rest is
    // released. That is how a strategy whose order was rejected gets its room
    // back.
    if (isTerminal(row.status)) continue;
    const sign = row.side === 'buy' ? 1 : -1;
    // **Every row is read the same way, by the order's own quantity in units**,
    // because this sum is compared against what has settled on this reference
    // and both halves have to fall together when a fill arrives.
    //
    // A reduction used to be read by what it claimed of the leg when it was
    // sent (`row.ts`, `Reduction`), which is a number about the leg rather than
    // about the order: a second stated close claims nothing, because the first
    // already spoke for the whole leg, and it still fills and still takes what
    // it filled off what has settled here. The settled half fell, the claimed
    // half did not, the sum went negative, the reference read as the side it is
    // not on, and an entry opposing it was handed it as an order that adds. It
    // then opened long and settled short with every order answered in full.
    const remaining = row.units === null ? null : Math.max(0, row.units - row.filledQty);
    const reduces = Math.sign(tally.settled) === -sign;
    if (remaining === null) {
      tally.unreadable = row.side;
      // Nothing is sent against a position an order the engine cannot read is
      // working against. Between a close that sends nothing and an order that
      // crosses zero, `stdlib.md` 17.1 has already chosen.
      if (reduces) tally.blocked = true;
      continue;
    }
    tally.working += sign * remaining;
    if (reduces) tally.against += remaining;
  }

  const held: Holding[] = [];
  for (const ref of minted) {
    const tally = tallies.get(ref) as Tally;
    const outstanding = tally.settled + tally.working;
    if (outstanding === 0 && tally.unreadable === null) continue;
    const side = outstanding === 0 ? (tally.unreadable as OrderSide) : sideOf(outstanding);
    // A reference holding a quantity the engine cannot read holds an unknown
    // number of units, and understating it is the safe half of that: an
    // opposing order divided against too small a number opens the remainder on
    // a reference of its own, which crosses nothing.
    const units = outstanding === 0 ? null : Math.abs(outstanding);
    // **What a close may send is what settled here and is not already coming
    // off**, and only where what settled is on this side. A reference whose
    // working orders run past its settled quantity reads as the other side,
    // because that is what it will hold, and nothing of that side has settled
    // yet: a reference two long with nine of sell working offered a close seven
    // units to send against it, which took its own book to five long.
    const facing = side === 'buy' ? 1 : -1;
    const settled =
      tally.blocked || Math.sign(tally.settled) !== facing
        ? 0
        : Math.max(0, Math.abs(tally.settled) - tally.against);
    held.push({ ref, side, units, settled });
  }
  return held;
}

/**
 * The references an order of this side reduces, oldest first.
 *
 * A reference is reduced by the side it is not on, which is the same test a
 * close makes on the leg as a whole and is why `closingSide` and this agree.
 */
export function opposing(book: readonly Holding[], side: OrderSide): readonly Holding[] {
  return book.filter((one) => one.side !== side);
}

/**
 * The position an order the engine cannot size is sent against, `stdlib.md`
 * 17.1, or none where the leg names no position at all.
 *
 * **A close is never minted a position of its own.** It is named for reducing,
 * so it goes on the position it is closing, and where the engine cannot read
 * the quantity it states, that position is the one the order may take past
 * zero: the one shape of 17.1 an engine does not keep, waiting on the lot size
 * OS7005 is deferred on.
 *
 * **What has settled comes first, and the book's own list second.** A reference
 * whose settled quantity is entirely spoken for by orders that are still going
 * is not in the book above, because it has nothing left for an engine-sized
 * close to send. An order the engine cannot size is not choosing a quantity, so
 * that exclusion does not apply to it: the position it is closing is still that
 * one. Taking the book's answer alone sent a close on a reference an entry was
 * opening on the other side, which is an order named close adding to a
 * position: with the leg's whole long inside a close the destination still had,
 * `close(qty = 1)` in cash was handed the reference a short entry had just
 * opened, and was a sell on it.
 *
 * A reference with nothing settled either way is the second answer rather than
 * the first, because a position being opened is a position under 17.1 and an
 * order that reduces the leg has to name one of them.
 */
export function outgoingFor(
  ctx: Book,
  book: readonly Holding[],
  side: OrderSide,
): number | null {
  const facing = side === 'buy' ? -1 : 1;
  const seen = new Set<number>();
  for (const row of ctx.rows()) {
    if (seen.has(row.positionRef)) continue;
    seen.add(row.positionRef);
    if (Math.sign(ctx.sizeOf(row.positionRef)) === facing) return row.positionRef;
  }
  return opposing(book, side)[0]?.ref ?? null;
}

/**
 * The reference an order that adds to a position joins, or none to mint one.
 *
 * The newest open reference on that side, so that two entries sent on two bars
 * before either fills belong to one position rather than to two, which is what
 * `stdlib.md` 17.7 means by a reference being kept while a position is being
 * opened.
 *
 * **A reference whose whole quantity is already going is not open to join.** A
 * leg long ten with a close of ten working is on its way out: an entry joining
 * it would settle into a position that reaches zero and ends, and 17.7's
 * sentence would then have to happen twice for one reference. The entry takes a
 * reference of its own, and if the close is rejected the leg simply holds two
 * positions on one side, each of which a close can still send.
 */
export function joining(book: readonly Holding[], side: OrderSide): number | null {
  for (let index = book.length - 1; index >= 0; index -= 1) {
    const one = book[index] as Holding;
    if (one.side === side) return one.ref;
  }
  return null;
}

/** One order of a call: the units it sends and the reference it sends them on. */
export interface Share {
  readonly ref: number;
  readonly units: number;
}

/**
 * How a quantity is divided across the references it reduces, oldest first.
 *
 * **A reducing order that spans two positions is two orders**, for the reason
 * 17.1 already gives for a flip: one order against two positions would leave a
 * late fill with no way to say which of them it settled. A leg holds more than
 * one position whenever an order that opposes it is outstanding, and before
 * this the whole of a leg's closable quantity was attached to a single
 * reference with nothing asking whether that reference could absorb it.
 *
 * `room` is which of the two numbers a holding offers is the ceiling here: what
 * an opposing order may take, or what has settled. The caller chooses, because
 * the caller knows whether the quantity is the script's or the engine's.
 *
 * What is left over when every reference is full is the caller's to open or to
 * drop. Nothing is ever sent past a reference's own ceiling.
 */
export function divide(
  book: readonly Holding[],
  side: OrderSide,
  units: number,
  room: (one: Holding) => number | null,
): { readonly shares: readonly Share[]; readonly left: number } {
  const shares: Share[] = [];
  let left = units;
  for (const one of opposing(book, side)) {
    if (left <= 0) break;
    const ceiling = room(one);
    if (ceiling === null || ceiling <= 0) continue;
    const take = Math.min(left, ceiling);
    shares.push({ ref: one.ref, units: take });
    left -= take;
  }
  return { shares, left };
}
