/**
 * Where a value sits inside a lookback's range: `stoch`, `stochRsi` and
 * `williamsR`.
 *
 * All three are the same test with different sources and different scales.
 * They are written once, as `position`, so the three cannot drift apart.
 */
import type { Bar, Series, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, result } from '../values/index.js';
import { smaTail } from '../averages/index.js';
import { highestTail, lowestTail } from '../series/index.js';

import { rsiTail } from './rsi.js';

/** Where `value` sits between `low` and `high`, as 0 to 100. Absent on a flat range. */
function position(value: Value, high: Value, low: Value): Value {
  if (!isPresent(value) || !isPresent(high) || !isPresent(low)) return NONE;
  const span = high - low;
  if (span === 0) return NONE;
  return result((100 * (value - low)) / span);
}

/** The raw range position of a series against its own lookback. */
function rawTail(len: number): Tail<Value, Value> {
  const top = highestTail(len);
  const bottom = lowestTail(len);
  return {
    next(value: Value): Value {
      return position(value, top.next(value), bottom.next(value));
    },
  };
}

/**
 * `stoch(len, smoothK, smoothD)`: `[k, d]`, element 0 from bar
 * `len + smoothK - 2` and element 1 from bar `len + smoothK + smoothD - 3`.
 *
 * The close against the lookback's outright high and low, which are the bars'
 * highs and lows and not the close's own extremes.
 */
export function stochTail(len = 14, smoothK = 1, smoothD = 3): Tail<Bar, Value[]> {
  const top = highestTail(len);
  const bottom = lowestTail(len);
  const smoothFast = smaTail(smoothK);
  const smoothSlow = smaTail(smoothD);
  return {
    next(bar: Bar): Value[] {
      const raw = position(bar.close, top.next(bar.high), bottom.next(bar.low));
      const k = smoothFast.next(raw);
      const d = smoothSlow.next(k);
      return [k, d];
    },
  };
}

/** `stoch(len, smoothK, smoothD)` over a run of bars. */
export function stoch(bars: readonly Bar[], len = 14, smoothK = 1, smoothD = 3): Value[][] {
  return fold(stochTail(len, smoothK, smoothD), bars);
}

/**
 * `stochRsi(src, rsiLen, stochLen, smoothK, smoothD)`: `[k, d]`, element 0 from
 * bar `rsiLen + stochLen + smoothK - 2`.
 *
 * The same position test applied to `rsi` rather than to price, so the lookback
 * is the range the strength reading itself covered.
 */
export function stochRsiTail(
  rsiLen = 14,
  stochLen = 14,
  smoothK = 3,
  smoothD = 3,
): Tail<Value, Value[]> {
  const strength = rsiTail(rsiLen);
  const raw = rawTail(stochLen);
  const smoothFast = smaTail(smoothK);
  const smoothSlow = smaTail(smoothD);
  return {
    next(value: Value): Value[] {
      const k = smoothFast.next(raw.next(strength.next(value)));
      const d = smoothSlow.next(k);
      return [k, d];
    },
  };
}

/** `stochRsi(src, rsiLen, stochLen, smoothK, smoothD)` over a whole series. */
export function stochRsi(
  src: Series,
  rsiLen = 14,
  stochLen = 14,
  smoothK = 3,
  smoothD = 3,
): Value[][] {
  return fold(stochRsiTail(rsiLen, stochLen, smoothK, smoothD), src);
}

/**
 * `williamsR(len)`: the same position scaled 0 to -100, from bar `len - 1`.
 *
 * Zero at the top of the range and -100 at the bottom, which is the sign
 * convention the reading has always carried.
 */
export function williamsRTail(len = 14): Tail<Bar, Value> {
  const top = highestTail(len);
  const bottom = lowestTail(len);
  return {
    next(bar: Bar): Value {
      const high = top.next(bar.high);
      const low = bottom.next(bar.low);
      if (!isPresent(bar.close) || !isPresent(high) || !isPresent(low)) return NONE;
      const span = high - low;
      if (span === 0) return NONE;
      return result((-100 * (high - bar.close)) / span);
    },
  };
}

/** `williamsR(len)` over a run of bars. */
export function williamsR(bars: readonly Bar[], len = 14): Value[] {
  return fold(williamsRTail(len), bars);
}
