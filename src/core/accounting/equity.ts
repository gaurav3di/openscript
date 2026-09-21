/**
 * The equity curve: one point per bar in the report window.
 *
 * **Marked to the close and to nothing else.** An intrabar extreme is a price
 * the strategy could not have acted on, so it is not a profit it had, and a
 * curve drawn through the extremes flatters every run that ever held a losing
 * position. Where a bar's close is absent the previous mark carries and the
 * point says so, rather than a zero a reader would compare against.
 *
 * **Drawdown is stated on equity including open profit**, and the basis is
 * carried on every point rather than left to the reader: `drawdown` is the
 * distance below the running peak, zero or negative, and `drawdownPercent` is
 * that distance against the peak. A report whose drawdown basis is not written
 * down is a report whose worst figure means a different thing to each reader.
 *
 * ## What the curve is folded from, and when each figure lands
 *
 * A trade list and a list of bar closes, and nothing else. A trade carries its
 * own gross, its own charges and the two bars it lived between, so the fold is
 * a sweep: bars in the order they arrived, trades in the order they opened.
 *
 * - **A trade's charges land on the bar it opened.** The trade list does not
 *   carry the timing of the individual fills underneath it, so the cost has to
 *   land somewhere, and the open is the one place that is never later than the
 *   truth: an entry charge is paid the moment the trade is taken on, and an
 *   exit charge cannot be paid before it. The alternative, landing the whole
 *   cost at the close, shows a run carrying a position for two hundred bars as
 *   having paid nothing for it, and leaves a trade that never closed paying
 *   nothing at all.
 * - **A trade's gross lands on the bar it closed**, because that is the bar it
 *   stopped being an opinion and became a number. While it is open it is in
 *   `openProfit` instead, marked to the close, and the two never overlap.
 *
 * So the last point of a full run carries every charge the run paid, open
 * trades included, and every gross it realised, which is an identity the
 * summary is asserted against rather than assumed to share.
 *
 * ## What a trade list cannot say, said here rather than discovered later
 *
 * A trade holds one entry price weighted over its entry fills and one exit
 * price weighted over its exit fills, so a trade whose size changed while it
 * was open is not visible in it: the size a trade held between its open and its
 * close is the size it ended up entering, at the average price it ended up
 * entering at. Both directions are wrong and they are wrong differently.
 *
 * - **A partial close** is marked at the full size from the bar the reduction
 *   settled on, so the open profit of the part already closed is counted twice
 *   over, once here and once in the realised total.
 * - **A scale-in is the worse of the two**, because it is wrong from the
 *   beginning rather than from the middle. A trade that buys a hundred at ten
 *   and another hundred at twenty is marked, from the bar it first opened, as
 *   two hundred units bought at fifteen. On the bars before the second entry it
 *   is therefore marked five points under water on units it did not hold, and
 *   the curve reports a drawdown the account never had. The summary's
 *   `maxDrawdown` and `maxDrawdownPercent` are folded from this curve, so a
 *   pyramiding strategy is reported as having risked more than it did.
 *
 * Neither reaches the realised total, which is folded from the fills: what is
 * affected is `openProfit`, `exposure`, `equity` and every drawdown figure
 * taken off the curve, on the bars a trade's size was not what it ended as.
 *
 * A curve folded from the fills rather than from the trades would have neither,
 * and that is what fixes it: it needs each entry, exit and charge to land on
 * the bar it settled on, which is a different fold from this one rather than a
 * correction to it. It is written here because a limitation nobody wrote down
 * is a limitation somebody finds inside a report they had already believed.
 *
 * ## Two preconditions, both of them the caller's
 *
 * The trades arrive in the order they opened, which is the order `Trade.index`
 * states, and the bars arrive in the order they were loaded. Both are swept
 * with a pointer rather than searched, because a report over fifty thousand
 * bars that rescans its trade list on every one of them is a report nobody
 * waits for.
 *
 * ## And a percentage here is a fraction of its basis
 *
 * `drawdownPercent` is `drawdown / runningPeak`, which is a fraction: a
 * hundredth of a percent down is written `-0.0001` and not `-0.01`. One
 * convention for every figure in this module that divides, because two figures
 * spelled the same way in two units is a number a reader gets wrong once and
 * never trusts again. The multiplication by a hundred belongs to whatever
 * prints it.
 */
import type { BarMark, Contract, Money } from './shapes.js';
import type { Trade } from './trades.js';

/** One report bar's standing, folded from the fills settled up to it. */
export interface EquityPoint {
  readonly barIndex: number;
  readonly time: number | null;
  /** Cumulative gross of closed trades. */
  readonly realised: Money;
  /** Cumulative. */
  readonly charges: Money;
  /** Marked to this bar's close. */
  readonly openProfit: Money;
  /** capital + realised - charges. */
  readonly cash: Money;
  /** cash + openProfit. */
  readonly equity: Money;
  /** The open position's magnitude at this close. */
  readonly exposure: Money;
  /** equity - runningPeak, zero or negative. */
  readonly drawdown: Money;
  /** `drawdown / runningPeak`, a fraction and not a figure times a hundred. */
  readonly drawdownPercent: number;
}

/**
 * Whether this trade was still held at the close of this bar.
 *
 * The boundaries are the whole of the rule and both are decisions. A trade is
 * held from the close of the bar it opened on, because an entry that settled
 * during a bar is a position that bar ended holding. It is not held at the
 * close of the bar it closed on, because that bar ended flat. So a trade
 * opened and closed inside one bar is held at no close at all, which is what a
 * run that was flat at every mark should report.
 *
 * Every figure in this module that asks which trades are open asks it here, so
 * the curve, the exposure and the count of bars in the market cannot come to
 * three different answers about one bar.
 */
export function openOnBar(trade: Trade, barIndex: number): boolean {
  if (barIndex < trade.openedOnBar) return false;
  return trade.closedOnBar === null || barIndex < trade.closedOnBar;
}

/**
 * A ratio against a basis that may not be there to divide by.
 *
 * Capital of zero and a peak of zero are both reachable, and both turn an
 * honest division into a value JSON cannot carry: a report whose worst figure
 * comes back `null` from a round trip is worse than one that says zero. A basis
 * that is not positive has no ratio to state, so the figure beside it, which is
 * money and is always true, is the one a reader is left with.
 */
export function ratioOf(value: number, basis: number): number {
  return basis > 0 ? value / basis : 0;
}

/**
 * The curve, one point per report bar, in the order the bars arrived.
 *
 * Warmup bars are swept and not reported: their orders were real, so a trade
 * opened during the warmup is already in the fold at the first point, with its
 * charges already paid and its position already marked. A curve that began its
 * fold at the first report bar would lose both, and would lose them silently.
 *
 * The running peak starts at the capital rather than at the first point, so a
 * run that is down from its first bar is in drawdown at its first bar. Starting
 * it at the first point would report every run as having begun at its high.
 */
export function equityOver(
  trades: readonly Trade[],
  marks: readonly BarMark[],
  contract: Contract,
  capital: Money,
): readonly EquityPoint[] {
  const points: EquityPoint[] = [];
  let held: Trade[] = [];
  let next = 0;
  let realised = 0;
  let charges = 0;
  let peak = capital;
  let mark: number | null = null;

  for (const bar of marks) {
    // Opened by this bar, charges and all. The pointer is why the trades have
    // to arrive in the order they opened.
    while (next < trades.length) {
      const opening = trades[next];
      if (opening === undefined || opening.openedOnBar > bar.barIndex) break;
      charges += opening.charges;
      held.push(opening);
      next += 1;
    }

    // Closed by this bar, gross and all. A trade that opened and closed inside
    // one bar is taken on and given up here in that order, so its cost and its
    // gross are both in this point and its position is in none.
    let closedHere = false;
    for (const trade of held) {
      if (closedBy(trade, bar.barIndex)) {
        realised += trade.grossProfit;
        closedHere = true;
      }
    }
    if (closedHere) held = held.filter((trade) => !closedBy(trade, bar.barIndex));

    // A close the host did not have leaves the previous mark standing. It is
    // carried across the warmup boundary too, so the first report bar of a run
    // whose close is absent is marked at the last price there was.
    if (bar.close !== null) mark = bar.close;
    if (!bar.inReport) continue;

    let openProfit = 0;
    let exposure = 0;
    for (const trade of held) {
      // Before the first close there has ever been, a trade is marked at its
      // own entry: no profit, and the position still visible in the exposure.
      const at = mark ?? trade.entryPrice;
      const direction = trade.side === 'long' ? 1 : -1;
      openProfit += direction * (at - trade.entryPrice) * trade.units * contract.pointValue;
      exposure += Math.abs(trade.units * at * contract.pointValue);
    }

    const cash = capital + realised - charges;
    const equity = cash + openProfit;
    if (equity > peak) peak = equity;
    const drawdown = equity - peak;
    points.push({
      barIndex: bar.barIndex,
      time: bar.time,
      realised,
      charges,
      openProfit,
      cash,
      equity,
      exposure,
      drawdown,
      drawdownPercent: ratioOf(drawdown, peak),
    });
  }

  return points;
}

/**
 * How many of these bars ended with something held.
 *
 * Swept rather than searched: a sorted list of the bars trades opened on, a
 * sorted list of the bars they closed on, and the running difference between
 * how many of each have gone by. That is the boundary rule `openOnBar` states,
 * arrived at from the other side, and the two are asserted to agree over a
 * generated corpus rather than trusted to. A count that disagrees with the
 * curve beside it about which bars were in the market is exactly the kind of
 * defect a reader finds by adding two of the printed figures up.
 */
export function barsInMarketOver(
  trades: readonly Trade[],
  equity: readonly EquityPoint[],
): number {
  const opens = trades.map((trade) => trade.openedOnBar).sort(ascending);
  const closes = trades
    .filter((trade) => trade.closedOnBar !== null)
    .map((trade) => trade.closedOnBar ?? 0)
    .sort(ascending);

  let opened = 0;
  let closed = 0;
  let live = 0;
  let bars = 0;
  for (const point of equity) {
    while (opened < opens.length && (opens[opened] ?? 0) <= point.barIndex) {
      live += 1;
      opened += 1;
    }
    while (closed < closes.length && (closes[closed] ?? 0) <= point.barIndex) {
      live -= 1;
      closed += 1;
    }
    if (live > 0) bars += 1;
  }
  return bars;
}

/** Whether this bar is the bar the trade closed on, or one after it. */
function closedBy(trade: Trade, barIndex: number): boolean {
  return trade.closedOnBar !== null && trade.closedOnBar <= barIndex;
}

/** Smallest first, said once, because a sort without a comparison sorts text. */
function ascending(left: number, right: number): number {
  return left - right;
}
