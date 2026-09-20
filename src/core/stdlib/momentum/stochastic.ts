/**
 * Where a value sits inside a lookback's range: `stoch`, `stochRsi` and
 * `williamsR`.
 *
 * All three are the same test with different sources and different scales.
 * They are written once, as `position`, so the three cannot drift apart.
 */
import type { Bar, Series, StateRecord, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, result, tailOf } from '../values/index.js';
import { smaStep } from '../averages/index.js';
import { extremeStep } from '../series/index.js';

import { rsiStep } from './rsi.js';

/** Where `value` sits between `low` and `high`, as 0 to 100. Absent on a flat range. */
function position(value: Value, high: Value, low: Value): Value {
  if (!isPresent(value) || !isPresent(high) || !isPresent(low)) return NONE;
  const span = high - low;
  if (span === 0) return NONE;
  return result((100 * (value - low)) / span);
}

/** The largest value in the last `len` bars, as the three studies here read it. */
function topStep(state: StateRecord, key: string, value: Value, len: number | null): Value {
  return extremeStep(state, key, value, len, true, false);
}

/** The smallest value in the last `len` bars. */
function bottomStep(state: StateRecord, key: string, value: Value, len: number | null): Value {
  return extremeStep(state, key, value, len, false, false);
}

/** The raw range position of a series against its own lookback. */
function rawStep(state: StateRecord, key: string, value: Value, len: number | null): Value {
  const high = topStep(state, `${key}t`, value, len);
  const low = bottomStep(state, `${key}b`, value, len);
  return position(value, high, low);
}

/**
 * `stoch(len, smoothK, smoothD)`: `[k, d]`, element 0 from bar
 * `len + smoothK - 2` and element 1 from bar `len + smoothK + smoothD - 3`.
 *
 * The close against the lookback's outright high and low, which are the bars'
 * highs and lows and not the close's own extremes.
 */
export function stochStep(
  state: StateRecord,
  key: string,
  bar: Bar,
  len: number | null,
  smoothK: number | null,
  smoothD: number | null,
): Value[] {
  const high = topStep(state, `${key}t`, bar.high, len);
  const low = bottomStep(state, `${key}b`, bar.low, len);
  const raw = position(bar.close, high, low);
  const k = smaStep(state, `${key}k`, raw, smoothK);
  const d = smaStep(state, `${key}d`, k, smoothD);
  return [k, d];
}

/** `stoch(len, smoothK, smoothD)` as a tail. */
export function stochTail(len = 14, smoothK = 1, smoothD = 3): Tail<Bar, Value[]> {
  return tailOf((state, bar: Bar) => stochStep(state, '', bar, len, smoothK, smoothD));
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
export function stochRsiStep(
  state: StateRecord,
  key: string,
  value: Value,
  rsiLen: number | null,
  stochLen: number | null,
  smoothK: number | null,
  smoothD: number | null,
): Value[] {
  const strength = rsiStep(state, `${key}r`, value, rsiLen);
  const raw = rawStep(state, `${key}p`, strength, stochLen);
  const k = smaStep(state, `${key}k`, raw, smoothK);
  const d = smaStep(state, `${key}d`, k, smoothD);
  return [k, d];
}

/** `stochRsi(src, rsiLen, stochLen, smoothK, smoothD)` as a tail. */
export function stochRsiTail(
  rsiLen = 14,
  stochLen = 14,
  smoothK = 3,
  smoothD = 3,
): Tail<Value, Value[]> {
  return tailOf((state, value: Value) =>
    stochRsiStep(state, '', value, rsiLen, stochLen, smoothK, smoothD),
  );
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
export function williamsRStep(
  state: StateRecord,
  key: string,
  bar: Bar,
  len: number | null,
): Value {
  const high = topStep(state, `${key}t`, bar.high, len);
  const low = bottomStep(state, `${key}b`, bar.low, len);
  if (!isPresent(bar.close) || !isPresent(high) || !isPresent(low)) return NONE;
  const span = high - low;
  if (span === 0) return NONE;
  return result((-100 * (high - bar.close)) / span);
}

/** `williamsR(len)` as a tail. */
export function williamsRTail(len = 14): Tail<Bar, Value> {
  return tailOf((state, bar: Bar) => williamsRStep(state, '', bar, len));
}

/** `williamsR(len)` over a run of bars. */
export function williamsR(bars: readonly Bar[], len = 14): Value[] {
  return fold(williamsRTail(len), bars);
}
