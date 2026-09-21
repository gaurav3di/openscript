/**
 * Which bars a report is about, and which merely got it there.
 *
 * **Every bar supplied executes, and only some of them are reported.** That is
 * the whole of this file and it is the fact a driver written without it gets
 * wrong. A study of the last year needs the indicators warm before the year
 * starts, so bars before the window are handed to the engine exactly as the
 * reported ones are: they execute, their orders are real, and a position opened
 * on one of them is carried into the window rather than appearing from nowhere
 * at its first bar. What they are not is reported: no equity point, and no
 * calendar month of their own.
 *
 * **A window holding no bar at all is refused**, OS6020, rather than reported
 * as a flat curve. A flat curve is what a strategy that did nothing also
 * produces, and only this can tell the two apart.
 *
 * **Both bounds are inclusive and are compared against the times of the bars
 * supplied**, never against a calendar. A window that falls inside a gap in the
 * data is empty however wide it looks, which is the truthful answer: there are
 * no bars in it.
 *
 * The other fact a driver gets wrong is not a window at all and is written here
 * because this is where a driver looks: the bar count handed to the engine is
 * the total it will be given, not the number given so far. An engine told that
 * each bar is the only bar reports `bar.isLast` true on every one of them, and
 * a strategy that flattens on the last bar flattens on all of them.
 */
import type { BarMark } from '../accounting/index.js';
import { diagnosticFor } from '../diagnostics/index.js';
import type { Diagnostic } from '../diagnostics/index.js';
import type { DateRange } from './settings.js';
import type { RecordedBar } from './record.js';

/** Which of the bars supplied the report is about. */
export interface ReportWindow {
  /** The first reported bar, by index into the bars supplied. */
  readonly first: number;
  /** The last reported bar, inclusive. */
  readonly last: number;
  /** How many bars run before the first reported one. */
  readonly warmup: number;
  /** Every bar supplied, which is what the engine is told a run holds. */
  readonly total: number;
}

export type WindowResult =
  | { readonly ok: true; readonly covered: ReportWindow }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

/**
 * The window a range names over the bars supplied.
 *
 * A bar with no time is inside an unstated bound and outside a stated one,
 * because a bound is a comparison and there is nothing to compare it with. A
 * run over bars none of which carry a time is therefore reported whole when the
 * host named no range, which is what a host handing over a bare series means,
 * and refused the moment it names one, which is what a host asking for a window
 * it cannot be given deserves to be told.
 */
export function windowFor(bars: readonly RecordedBar[], range: DateRange): WindowResult {
  let first = -1;
  let last = -1;
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    if (bar === undefined || !inside(bar.time, range)) continue;
    if (first < 0) first = index;
    last = index;
  }

  if (first < 0) {
    return {
      ok: false,
      diagnostic: diagnosticFor('OS6020', NO_POSITION, {
        from: bound(range.from, bars[0]?.time ?? null, 'the first bar supplied'),
        to: bound(range.to, bars[bars.length - 1]?.time ?? null, 'the last bar supplied'),
        count: bars.length,
      }),
    };
  }

  return { ok: true, covered: { first, last, warmup: first, total: bars.length } };
}

/** Whether one bar's own time is inside the window, both bounds inclusive. */
export function inside(time: number | null, range: DateRange): boolean {
  if (range.from === null && range.to === null) return true;
  if (time === null) return false;
  if (range.from !== null && time < range.from) return false;
  if (range.to !== null && time > range.to) return false;
  return true;
}

/**
 * Whether a bar is reported, which is the question the marks are built from.
 *
 * Asked of an index rather than of a time, because the window is decided once
 * and a bar asked twice has to be answered the same way both times.
 */
export function inReport(index: number, covered: ReportWindow): boolean {
  return index >= covered.first && index <= covered.last;
}

/**
 * The bars as the report marks against them: the close, and whether it counts.
 *
 * One mark per bar supplied, warmup included, because the money layer sweeps
 * the warmup rather than being handed a shortened list: a trade opened before
 * the window is already in the fold at the window's first point, with its
 * charges paid and its position marked. A mark says which of the two it is and
 * the fold decides what to do about it.
 *
 * Built here rather than in the driver because a replay marks the same bars the
 * same way, and two places deciding what a warmup bar is would be two reports
 * of one run.
 */
export function marksFor(bars: readonly RecordedBar[], covered: ReportWindow): readonly BarMark[] {
  return bars.map((bar, index) => ({
    barIndex: index,
    time: bar.time,
    close: bar.close,
    inReport: inReport(index, covered),
  }));
}

/** What a refusal calls a bound the host left for the bars to decide. */
function bound(stated: number | null, fallback: number | null, word: string): number | string {
  if (stated !== null) return stated;
  return fallback === null ? word : fallback;
}

/**
 * Where a refusal about the window points.
 *
 * Nowhere in the script, for the same reason every other run setting points
 * nowhere: the window is the host's choice and the script did not make it.
 */
const NO_POSITION: Diagnostic['span'] = { offset: 0, length: 0, line: 0, column: 0 };
