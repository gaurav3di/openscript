/**
 * The fixture folded into coarser bars, and a coarse reading sampled back onto
 * the chart's bars.
 *
 * A read of a coarser timeframe is two halves: an expression evaluated over a
 * different set of bars, and a rule deciding which of those bars each chart bar
 * is allowed to see. This file is both halves written from `stdlib.md` section
 * 15 rather than from the engine, because the whole point of the gate is to
 * compare two independent readings of the same rule.
 *
 * **The bucket.** Source bars are grouped by the bucket their open instant
 * falls in, which for an intraday timeframe is the instant divided by the
 * period. A bucket's open is its first bar's, its close its last bar's, its
 * high and low the extremes across it and its volume the total.
 *
 * **The boundary, which is the whole of the off-by-one.** A confirmed read
 * takes the last bucket that **closed**, and a bucket closes when a bar of the
 * next one arrives. So the first bar of a coarse bucket is where the chart
 * steps to the previous bucket's value, and it holds it across every bar inside
 * that bucket, the last one included: at that bar's open, the bucket it is
 * inside had not closed.
 */
import { blank } from './arithmetic.js';
import type { RefSeries } from './arithmetic.js';
import { CLOSE, HIGH, LOW, OPEN, TIME, VOLUME } from './harness.js';

/** One coarse bar of the fold, and where it sits among the chart's bars. */
export interface CoarseBar {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  /** The chart bar this coarse bar opened on. */
  readonly from: number;
  /** The chart bar it closed on, which is the last one inside it. */
  readonly to: number;
}

const MINUTE = 60_000;

/** The fixture folded into buckets of `minutes`, in order. */
export function coarseBars(minutes: number): CoarseBar[] {
  const period = minutes * MINUTE;
  const out: CoarseBar[] = [];
  let key: number | undefined;
  for (let bar = 0; bar < TIME.length; bar += 1) {
    const found = Math.floor((TIME[bar] as number) / period);
    const open = OPEN[bar] as number;
    const high = HIGH[bar] as number;
    const low = LOW[bar] as number;
    const close = CLOSE[bar] as number;
    const volume = VOLUME[bar] as number;
    const last = out[out.length - 1];
    if (key === found && last !== undefined) {
      out[out.length - 1] = {
        open: last.open,
        high: Math.max(last.high, high),
        low: Math.min(last.low, low),
        close,
        volume: last.volume + volume,
        from: last.from,
        to: bar,
      };
      continue;
    }
    key = found;
    out.push({ open, high, low, close, volume, from: bar, to: bar });
  }
  return out;
}

/**
 * Which coarse bar each chart bar may see under a confirmed read: the one
 * before the bucket the chart bar is inside, and nothing while none has closed.
 */
export function confirmedIndex(minutes: number): number[] {
  const buckets = coarseBars(minutes);
  const out = new Array<number>(TIME.length).fill(-1);
  for (let ordinal = 0; ordinal < buckets.length; ordinal += 1) {
    const bucket = buckets[ordinal] as CoarseBar;
    for (let bar = bucket.from; bar <= bucket.to; bar += 1) out[bar] = ordinal - 1;
  }
  return out;
}

/** A column computed over the coarse bars, sampled onto the chart's bars. */
export function foldConfirmed(minutes: number, coarse: RefSeries): RefSeries {
  const index = confirmedIndex(minutes);
  const out = blank(TIME.length);
  for (let bar = 0; bar < TIME.length; bar += 1) {
    const at = index[bar] as number;
    if (at < 0) continue;
    const value = coarse[at];
    if (value !== undefined && Number.isFinite(value)) out[bar] = value;
  }
  return out;
}

/** The four price columns of the fold, for a study that draws a coarse bar. */
export function coarseColumn(
  minutes: number,
  field: 'open' | 'high' | 'low' | 'close' | 'volume',
): RefSeries {
  return coarseBars(minutes).map((bar) => bar[field]);
}
