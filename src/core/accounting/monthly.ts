/**
 * The month by month table, bucketed in UTC from bar times.
 *
 * **UTC, and it says so on the type.** A calendar month in the instrument's own
 * timezone would need the session machinery and the instrument's calendar, and
 * a table that silently buckets a trade into the wrong month is worse than one
 * that states the basis it used. No timezone library, and no pretence of the
 * instrument's calendar.
 */
import type { EquityPoint } from './equity.js';
import type { Money } from './shapes.js';
import type { Trade } from './trades.js';

/** One calendar month of the run, in UTC. */
export interface MonthlyReturn {
  readonly year: number;
  /** 1 to 12, UTC. */
  readonly month: number;
  readonly netProfit: Money;
  /** Against the equity at the month's first bar. */
  readonly returnPercent: number;
  readonly trades: number;
}

/**
 * The months a run passed through, in the order it passed through them.
 *
 * **A month holds the change in equity across the closes inside it.** The first
 * point of the curve has nothing before it to be compared with, so it opens the
 * table rather than contributing to it, and every later point contributes what
 * it moved from the point before. The consequence is an identity rather than a
 * claim: the months add up to the equity at the last point less the equity at
 * the first, and nothing that happened during the warmup is attributed to a
 * month it did not happen in.
 *
 * `returnPercent` is that change over the equity at the month's first bar,
 * which is the basis this table states and the reason the figure is a fraction
 * rather than a fraction times a hundred: `drawdownPercent` beside it is
 * `drawdown / peak`, and one report with two conventions is a report a reader
 * has to check every figure of.
 *
 * `trades` counts the trades that closed inside the month, by the time they
 * closed. An open trade is in no month, because the month it will be counted in
 * is not decided yet.
 *
 * **A point with no time is in no month.** A bucket is a calendar fact and a
 * bar with no time states no calendar, so such a point carries its change into
 * the month in force rather than opening one, and where none is in force it is
 * outside the table altogether. That is the honest reading: bucketing it by the
 * month that happened to come before would put money in a month on the strength
 * of nothing.
 */
export function monthlyOver(
  equity: readonly EquityPoint[],
  trades: readonly Trade[],
): readonly MonthlyReturn[] {
  const buckets: Bucket[] = [];
  let previous: EquityPoint | undefined;
  let current: Bucket | undefined;

  for (const point of equity) {
    const at = monthOf(point.time);
    if (at !== null && (current === undefined || current.year !== at.year || current.month !== at.month)) {
      current = { year: at.year, month: at.month, netProfit: 0, basis: point.equity, trades: 0 };
      buckets.push(current);
    }
    if (previous !== undefined && current !== undefined) {
      current.netProfit += point.equity - previous.equity;
    }
    previous = point;
  }

  for (const trade of trades) {
    const at = monthOf(trade.closedAt);
    if (at === null) continue;
    const bucket = buckets.find((one) => one.year === at.year && one.month === at.month);
    if (bucket !== undefined) bucket.trades += 1;
  }

  return buckets.map((one) => ({
    year: one.year,
    month: one.month,
    netProfit: one.netProfit,
    returnPercent: one.basis > 0 ? one.netProfit / one.basis : 0,
    trades: one.trades,
  }));
}

/** One month while it is being filled. */
interface Bucket {
  readonly year: number;
  readonly month: number;
  netProfit: Money;
  /** The equity at the month's first bar, which the return is measured against. */
  readonly basis: Money;
  trades: number;
}

/**
 * The calendar month an instant falls in, in UTC and in no other zone.
 *
 * Decomposed rather than formatted, so no locale, no zone table and no library
 * is involved: the same instant produces the same month on every machine this
 * ever runs on.
 */
function monthOf(time: number | null): { readonly year: number; readonly month: number } | null {
  if (time === null || !Number.isFinite(time)) return null;
  const at = new Date(time);
  return { year: at.getUTCFullYear(), month: at.getUTCMonth() + 1 };
}
