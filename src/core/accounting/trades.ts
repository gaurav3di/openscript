/**
 * What a trade is, which is the definition every statistic is counted over.
 *
 * **A trade is one position reference, from the fill that first takes it away
 * from zero to the fill that returns it to zero.** Nothing else is invented,
 * because the engine already mints a reference per position, no order crosses
 * zero, and every fill names the reference it settled however late it arrives.
 *
 * Everything awkward falls out of that rather than needing a rule of its own. A
 * pyramided entry is more entry fills on one trade. A partial close is an exit
 * fill that does not close the trade. A flip is two references and therefore
 * two trades, which is what a reversing order already sends. A reference still
 * holding something at the last bar is an open trade: it is in the list with
 * `isOpen` true, it is counted in equity, and it is counted in no win rate.
 *
 * The definition is written in the specification before it is written here,
 * because a rule decided in code is a rule two engines decide differently.
 *
 * ## What the fold reads, and what it refuses to work out for itself
 *
 * A fill carries the signed size of its reference either side of the
 * settlement, so the fold reads what the position book did rather than
 * recomputing it from quantities and sides. That is the whole of how a partial
 * close, a pyramided entry and a reversal tell themselves apart: the move from
 * one size to the other says how much of the fill closed what was held and how
 * much of it opened something, and nothing else has to be inferred.
 *
 * It also settles the one case the definition does not cover on its face. A
 * destination that fills more than the order asked takes a reference through
 * zero rather than to it, and the position book reads the remainder as a
 * position in the other direction opened at that fill's price. So the fold does
 * the same: the fill closes the trade that was held and opens a second one on
 * the same reference, at its own price and on its own bar. A trade that ran
 * from a size to the other side of zero would report a quantity nothing was
 * ever entered at.
 *
 * **Reducing a position does not move its average**, which is the position
 * book's rule read here rather than a second one: a reducing fill adds to the
 * exits and touches neither the entry quantity nor the entry cost. Every figure
 * measured from the entry, the entry price a reader compares against and the
 * excursion at each bar close, is measured from the price the units were
 * actually bought at.
 *
 * **A charge lands whole on one trade and is never split.** It was rounded once
 * for the fill that incurred it, and splitting it between the trade a crossing
 * fill closed and the trade it opened would round it again and put a residue
 * somewhere. So it is attributed to the trade the fill closed where it closed
 * one, and to the trade it opened otherwise, which makes the charges of the
 * trades add up to the charges of the fills exactly rather than nearly.
 *
 * **Gross profit is over the units that have left.** For a closed trade that is
 * every unit it entered, which is the formula the report is specified with. For
 * one still open it is what its exits have realised so far, which is a figure
 * that is true rather than a zero standing in for money the run has already
 * made.
 */
import type { BarMark, Contract, Money, RecordedFill } from './shapes.js';

/** One round trip on one position reference. */
export interface Trade {
  /** 1-based, in the order the trade opened. */
  readonly index: number;
  readonly positionRef: number;
  readonly side: 'long' | 'short';
  readonly openedOnBar: number;
  readonly openedAt: number | null;
  readonly closedOnBar: number | null;
  readonly closedAt: number | null;
  readonly barsHeld: number | null;
  /** Total units entered. */
  readonly units: number;
  /** Quantity weighted over the entry fills. */
  readonly entryPrice: number;
  /** Quantity weighted over the exit fills. */
  readonly exitPrice: number | null;
  readonly entries: number;
  readonly exits: number;
  readonly grossProfit: Money;
  readonly charges: Money;
  readonly netProfit: Money;
  /**
   * Excursion at bar closes while open. Favourable is zero or better, adverse
   * zero or worse, and both are zero for a trade no bar closed on.
   */
  readonly maxFavourable: Money;
  readonly maxAdverse: Money;
  readonly isOpen: boolean;
}

/**
 * The round trips a run's fills make up, in the order they opened.
 *
 * `charges[index]` is the money `fills[index]` was charged, rounded once by
 * whoever computed it, so the two travel as one thing and nothing here rounds
 * anything a second time. A caller with no cost model supplies no charges at
 * all and every trade's charges are zero.
 *
 * The fills are read in `seq` order whatever order they are handed in, because
 * `seq` is the order the engine folded them and a report that depended on the
 * order a caller happened to be holding them in would not be reproducible. The
 * marks are read in bar order for the same reason, and a bar is marked after
 * every fill up to it has been folded, because a fill happens during its bar
 * and the close comes after.
 */
export function tradesOf(
  fills: readonly RecordedFill[],
  charges: readonly Money[],
  marks: readonly BarMark[],
  contract: Contract,
): readonly Trade[] {
  const settled = inSeqOrder(fills, charges);
  const built: Building[] = [];
  const live: Building[] = [];

  let next = 0;
  for (const bar of inBarOrder(marks)) {
    while (next < settled.length) {
      const one = settled[next];
      if (one === undefined || one.fill.barIndex > bar.barIndex) break;
      fold(one, built, live);
      next += 1;
    }
    // A bar with no close is not a price anything can be marked at. It marks
    // nothing rather than marking zero, which would read as a total loss.
    if (bar.close !== null) markTo(live, bar.close, contract.pointValue);
  }
  for (; next < settled.length; next += 1) {
    const one = settled[next];
    if (one !== undefined) fold(one, built, live);
  }

  return built.map((trade) => finish(trade, contract));
}

/** A fill and what it cost, kept together so neither can be reordered alone. */
interface Settled {
  readonly fill: RecordedFill;
  readonly charge: Money;
}

/** A trade while it is still being folded: the totals a round trip is made of. */
interface Building {
  readonly index: number;
  readonly positionRef: number;
  readonly side: 'long' | 'short';
  readonly openedOnBar: number;
  readonly openedAt: number | null;
  closedOnBar: number | null;
  closedAt: number | null;
  entryUnits: number;
  entryCost: number;
  exitUnits: number;
  exitCost: number;
  entries: number;
  exits: number;
  charges: Money;
  /** Signed, and what the reference holds for this trade right now. */
  size: number;
  maxFavourable: Money;
  maxAdverse: Money;
}

function inSeqOrder(
  fills: readonly RecordedFill[],
  charges: readonly Money[],
): readonly Settled[] {
  const paired = fills.map((fill, index) => ({ fill, charge: charges[index] ?? 0 }));
  return paired.sort((a, b) => a.fill.seq - b.fill.seq);
}

function inBarOrder(marks: readonly BarMark[]): readonly BarMark[] {
  return marks.slice().sort((a, b) => a.barIndex - b.barIndex);
}

/**
 * How much of a move from one size to another closed what was held.
 *
 * Exported to the module and not through its door: `markers.ts` asks the same
 * question of the same fills, and the rule for what a move closed and what it
 * opened is one rule. Two folds may read a fill differently and produce a
 * marker for an entry the trade list calls an exit, so they read it here.
 *
 * A move to the other side of zero closed all of it, which is the case a
 * destination that overfilled produces and the one this has to get right.
 */
export function closedBy(before: number, after: number): number {
  if (before === 0) return 0;
  const same = Math.sign(after) === Math.sign(before);
  return same ? Math.max(0, Math.abs(before) - Math.abs(after)) : Math.abs(before);
}

/** And how much of it opened something, which is the rest of the same move. */
export function openedBy(before: number, after: number): number {
  if (after === 0) return 0;
  if (before === 0 || Math.sign(after) !== Math.sign(before)) return Math.abs(after);
  return Math.max(0, Math.abs(after) - Math.abs(before));
}

/** One fill against the trades its reference holds. */
function fold(one: Settled, built: Building[], live: Building[]): void {
  const fill = one.fill;
  const closing = closedBy(fill.refSizeBefore, fill.refSizeAfter);
  const opening = openedBy(fill.refSizeBefore, fill.refSizeAfter);
  const at = live.findIndex((trade) => trade.positionRef === fill.positionRef);
  const held = at < 0 ? null : (live[at] ?? null);
  let paid = false;

  if (held !== null && closing > 0) {
    held.exitUnits += closing;
    held.exitCost += closing * fill.price;
    held.exits += 1;
    held.charges += one.charge;
    paid = true;
    // What the reference left this trade holding: nothing at all when the fill
    // carried it through zero, since the other side of zero is the next trade.
    held.size = opening > 0 ? 0 : fill.refSizeAfter;
    if (held.size === 0) {
      held.closedOnBar = fill.barIndex;
      held.closedAt = fill.barTime;
      live.splice(at, 1);
    }
  }

  if (opening > 0) {
    // A fill that closed something opens a trade of its own rather than adding
    // to the one it just finished.
    const adding = closing > 0 ? null : held;
    if (adding === null) {
      const fresh = begin(fill, opening, built.length + 1);
      built.push(fresh);
      live.push(fresh);
      if (!paid) fresh.charges += one.charge;
    } else {
      adding.entryUnits += opening;
      adding.entryCost += opening * fill.price;
      adding.entries += 1;
      adding.size = fill.refSizeAfter;
      if (!paid) adding.charges += one.charge;
    }
    return;
  }

  // A fill that moved nothing still cost something, and it cost it on account
  // of the trade its reference is holding.
  if (!paid && held !== null) held.charges += one.charge;
}

function begin(fill: RecordedFill, units: number, index: number): Building {
  return {
    index,
    positionRef: fill.positionRef,
    side: fill.refSizeAfter > 0 ? 'long' : 'short',
    openedOnBar: fill.barIndex,
    openedAt: fill.barTime,
    closedOnBar: null,
    closedAt: null,
    entryUnits: units,
    entryCost: units * fill.price,
    exitUnits: 0,
    exitCost: 0,
    entries: 1,
    exits: 0,
    charges: 0,
    size: fill.refSizeAfter,
    maxFavourable: 0,
    maxAdverse: 0,
  };
}

/** Every open trade against one bar's close. */
function markTo(live: readonly Building[], close: number, pointValue: number): void {
  for (const trade of live) {
    const entry = averageOf(trade.entryCost, trade.entryUnits);
    const excursion = (close - entry) * trade.size * pointValue;
    if (excursion > trade.maxFavourable) trade.maxFavourable = excursion;
    if (excursion < trade.maxAdverse) trade.maxAdverse = excursion;
  }
}

function averageOf(cost: number, units: number): number {
  return units === 0 ? 0 : cost / units;
}

function finish(trade: Building, contract: Contract): Trade {
  const entryPrice = averageOf(trade.entryCost, trade.entryUnits);
  const exitPrice = trade.exitUnits === 0 ? null : trade.exitCost / trade.exitUnits;
  const way = trade.side === 'long' ? 1 : -1;
  const gross =
    exitPrice === null
      ? 0
      : (exitPrice - entryPrice) * trade.exitUnits * contract.pointValue * way;
  return {
    index: trade.index,
    positionRef: trade.positionRef,
    side: trade.side,
    openedOnBar: trade.openedOnBar,
    openedAt: trade.openedAt,
    closedOnBar: trade.closedOnBar,
    closedAt: trade.closedAt,
    barsHeld: trade.closedOnBar === null ? null : trade.closedOnBar - trade.openedOnBar,
    units: trade.entryUnits,
    entryPrice,
    exitPrice,
    entries: trade.entries,
    exits: trade.exits,
    grossProfit: gross,
    charges: trade.charges,
    netProfit: gross - trade.charges,
    maxFavourable: trade.maxFavourable,
    maxAdverse: trade.maxAdverse,
    isOpen: trade.closedOnBar === null,
  };
}
