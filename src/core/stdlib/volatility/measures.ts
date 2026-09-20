/**
 * `chop` and `hv`, the two readings that say how the lookback behaved rather than
 * how wide it was.
 *
 * Both are written as a step over a state region and both tails are that step
 * over a region of their own, so a live chart and a fold over a run of bars
 * cannot disagree.
 */
import type { Bar, Series, StateRecord, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, result, tailOf } from '../values/index.js';
import { extremeStep, historyStep, sumStep } from '../series/index.js';

import type { Gap } from './range.js';
import { gapOf, trueRangeOf } from './range.js';
import { stdevStep } from './deviation.js';

/**
 * `chop(len)`: a 0 to 100 reading of whether the lookback trended or chopped,
 * from bar `len`.
 *
 * The distance price actually travelled over the lookback, against the outright
 * range it covered. A market that went straight there travels its range and
 * reads low; one that went back and forth travels several times its range and
 * reads high.
 *
 * The travel is a sum of `len` true ranges, and a true range needs the bar
 * before it, which is why the first reading is at bar `len` and not at bar
 * `len - 1`: the gap-aware form of true range is the one used here, per the
 * note in `range.ts`. The previous close arrives with the gap rather than being
 * remembered here, for the reason the same note gives.
 */
export function chopStep(
  state: StateRecord,
  key: string,
  gap: Gap,
  len: number | null,
): Value {
  const distance = sumStep(state, `${key}s`, trueRangeOf(gap, false), len);
  const upper = extremeStep(state, `${key}h`, gap.high, len, true, false);
  const lower = extremeStep(state, `${key}l`, gap.low, len, false, false);
  if (len === null) return NONE;
  if (!isPresent(distance) || !isPresent(upper) || !isPresent(lower)) return NONE;
  const span = upper - lower;
  const scale = Math.log10(len);
  if (!(span > 0) || !(distance > 0) || scale === 0) return NONE;
  return result((100 * Math.log10(distance / span)) / scale);
}

/** `chop(len)` as a tail. */
export function chopTail(len = 14): Tail<Bar, Value> {
  return tailOf((state, bar: Bar) => chopStep(state, '', gapOf(state, 'g', bar), len));
}

/** `chop(len)` over a run of bars. */
export function chop(bars: readonly Bar[], len = 14): Value[] {
  return fold(chopTail(len), bars);
}

/**
 * `hv(src, len, periodsPerYear)`: the annualised standard deviation of log
 * returns, from bar `len`.
 *
 * A log return needs the previous bar, so the deviation's lookback starts at bar
 * 1 and its first value is at bar `len`, one later than a lookback over levels.
 *
 * The result is a proportion, not a percentage: `stdlib.md` section 6 says
 * "annualised standard deviation of log returns" and nothing about scaling it
 * by a hundred, so nothing here does. A study that wants a percentage axis
 * multiplies at the plot, where a reader can see it happen.
 */
export function hvStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
  periodsPerYear: number | null,
): Value {
  const previous = historyStep(state, `${key}h`, value, 1);
  let logReturn: Value = NONE;
  if (isPresent(value) && isPresent(previous) && value > 0 && previous > 0) {
    logReturn = result(Math.log(value / previous));
  }
  const deviation = stdevStep(state, `${key}q`, logReturn, len, false);
  if (!isPresent(deviation) || periodsPerYear === null || !(periodsPerYear > 0)) return NONE;
  return result(deviation * Math.sqrt(periodsPerYear));
}

/** `hv(src, len, periodsPerYear)` as a tail. */
export function hvTail(len = 20, periodsPerYear = 252): Tail<Value, Value> {
  return tailOf((state, value: Value) => hvStep(state, '', value, len, periodsPerYear));
}

/** `hv(src, len, periodsPerYear)` over a whole series. */
export function hv(src: Series, len = 20, periodsPerYear = 252): Value[] {
  return fold(hvTail(len, periodsPerYear), src);
}
