/**
 * A chart's bar as the engine reads one.
 *
 * One fact differs across the boundary and it is easy to get wrong in a way
 * nothing catches. A chart's bar time is in **seconds** and the engine's is in
 * **milliseconds**, so every time crosses through here and nowhere else; a study
 * comparing `time` against an anchor would be a thousand times out and would
 * still draw. Every other field is spelled on both sides as
 * `host-interface.md` 3.1 spells it, so nothing here renames anything.
 *
 * **Absence survives the crossing.** A bar with no volume arrives with the field
 * missing and leaves with it missing, because a script that sizes something by
 * volume has to be able to tell "no trades" from "nobody said", and a zero put
 * in here would answer the wrong one of those for ever.
 *
 * **Nothing here says where a session begins.** The session is a range of hours
 * in the instrument record (`host-interface.md` 4.3), the engine derives the
 * per-bar facts from it, and a chart's own host states those hours alongside
 * the exchange and the lot size. An option here that set the flags per bar would be
 * a second source for a fact the engine already derives, and the two would
 * disagree on the study every intraday chart draws.
 */
import type { BarState, HostBar } from '../../core/engine/index.js';
import type { ChartBar, ChartCalcContext } from './contract.js';

/** Milliseconds in a second, so the conversion is named rather than a literal. */
export const MS = 1000;

export function hostBar(bar: ChartBar): HostBar {
  return {
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    time: Number.isFinite(bar.time) ? bar.time * MS : null,
    ...(bar.volume === undefined ? {} : { volume: bar.volume }),
    ...(bar.oi === undefined ? {} : { oi: bar.oi }),
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
): BarState {
  const last = index === bars.length - 1;
  const isConfirmed = !last || ctx === undefined ? true : ctx.barState.isConfirmed;
  const isRealtime = last && ctx !== undefined ? ctx.barState.isRealtime : false;
  return { isConfirmed, isRealtime };
}
