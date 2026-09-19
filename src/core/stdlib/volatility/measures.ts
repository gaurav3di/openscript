/**
 * `chop` and `hv`, the two readings that say how the lookback behaved rather than
 * how wide it was.
 */
import type { Bar, Series, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, result } from '../values/index.js';
import { highestTail, lowestTail, sumTail } from '../series/index.js';

import { gapTrueRangeTail } from './range.js';
import { stdevTail } from './deviation.js';

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
 * note in `range.ts`.
 */
export function chopTail(len = 14): Tail<Bar, Value> {
  const range = gapTrueRangeTail();
  const travel = sumTail(len);
  const top = highestTail(len);
  const bottom = lowestTail(len);
  const scale = Math.log10(len);
  return {
    next(bar: Bar): Value {
      const distance = travel.next(range.next(bar));
      const upper = top.next(bar.high);
      const lower = bottom.next(bar.low);
      if (!isPresent(distance) || !isPresent(upper) || !isPresent(lower)) return NONE;
      const span = upper - lower;
      if (!(span > 0) || !(distance > 0) || scale === 0) return NONE;
      return result((100 * Math.log10(distance / span)) / scale);
    },
  };
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
export function hvTail(len = 20, periodsPerYear = 252): Tail<Value, Value> {
  const spread = stdevTail(len);
  const annualise = Math.sqrt(periodsPerYear);
  let previous: Value = NONE;
  let seenABar = false;
  return {
    next(value: Value): Value {
      let logReturn: Value = NONE;
      if (seenABar && isPresent(value) && isPresent(previous) && value > 0 && previous > 0) {
        logReturn = result(Math.log(value / previous));
      }
      seenABar = true;
      previous = value;
      const deviation = spread.next(logReturn);
      if (!isPresent(deviation) || !(periodsPerYear > 0)) return NONE;
      return result(deviation * annualise);
    },
  };
}

/** `hv(src, len, periodsPerYear)` over a whole series. */
export function hv(src: Series, len = 20, periodsPerYear = 252): Value[] {
  return fold(hvTail(len, periodsPerYear), src);
}
