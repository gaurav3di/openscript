/**
 * A chart's bar as the engine reads one.
 *
 * Two facts differ across the boundary and both are easy to get wrong in a way
 * nothing catches. A chart's bar time is in **seconds** and the engine's is in
 * **milliseconds**, so every time crosses through here and nowhere else; a study
 * comparing `time` against an anchor would be a thousand times out and would
 * still draw. And open interest is `oi` on one side and `openInterest` on the
 * other, so it is renamed here rather than guessed at by a reader.
 *
 * **Absence survives the crossing.** A bar with no volume arrives with the field
 * missing and leaves with it missing, because a script that sizes something by
 * volume has to be able to tell "no trades" from "nobody said", and a zero put
 * in here would answer the wrong one of those for ever.
 *
 * **Sessions are the host's to state.** `session.isFirstBar` is what a study of
 * the opening range is built on, and a chart holds an interval and a timezone
 * but no exchange calendar, so nothing here can work out where a session begins
 * without inventing one. A host that knows its calendar supplies the two
 * predicates; a host that does not gets a study whose session never begins,
 * which is the honest answer rather than a guessed one.
 */
import type { BarState, HostBar } from '../../core/engine/index.js';
import type { ChartBar, ChartCalcContext } from './contract.js';

/** Where a trading session begins and ends, which only the host knows. */
export interface SessionCalendar {
  isStart?(bar: ChartBar, previous: ChartBar | undefined, timezone: string): boolean;
  isEnd?(bar: ChartBar, next: ChartBar | undefined, timezone: string): boolean;
}

/** Milliseconds in a second, so the conversion is named rather than a literal. */
const MS = 1000;

export function hostBar(bar: ChartBar): HostBar {
  return {
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    time: Number.isFinite(bar.time) ? bar.time * MS : null,
    ...(bar.volume === undefined ? {} : { volume: bar.volume }),
    ...(bar.oi === undefined ? {} : { openInterest: bar.oi }),
  };
}

/** A chart's wall clock reading, in the units the engine's `chart.now()` uses. */
export function hostNow(seconds: number): number {
  return seconds * MS;
}

/**
 * What the host states about one execution.
 *
 * Only the newest bar can be unconfirmed or driven by a live feed: every bar
 * before it is history, whatever the feed behind the chart is doing now. The
 * chart's own calculation context says which of those two the newest bar is,
 * and says nothing at all about the ones before it, which is the same split.
 */
export function stateFor(
  index: number,
  bars: readonly ChartBar[],
  ctx: ChartCalcContext | undefined,
  session: SessionCalendar | undefined,
  timezone: string,
): BarState {
  const last = index === bars.length - 1;
  const bar = bars[index];
  const isConfirmed = !last || ctx === undefined ? true : ctx.barState.isConfirmed;
  const isRealtime = last && ctx !== undefined ? ctx.barState.isRealtime : false;
  if (bar === undefined) return { isConfirmed, isRealtime };
  return {
    isConfirmed,
    isRealtime,
    isSessionStart: session?.isStart?.(bar, bars[index - 1], timezone) ?? false,
    isSessionEnd: session?.isEnd?.(bar, bars[index + 1], timezone) ?? false,
  };
}
