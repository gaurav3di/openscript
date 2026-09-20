/**
 * The channel studies: `bollinger`, its two readings, `keltner` and `donchian`.
 *
 * Each returns an array holding this bar's outputs, in the order its entry in
 * `stdlib.md` documents. **The array itself is never absent and never changes
 * length**, per section 2.3: each element carries its own warmup and is absent
 * until it is reached. An array that grew as warmup completed would make an
 * index an out-of-range error at the left edge of a chart and nowhere else.
 */
import type { Bar, Series, StateRecord, Tail, Value } from '../values/index.js';
import { NONE, at, fold, isPresent, result, tailOf } from '../values/index.js';
import type { MaType } from '../averages/index.js';
import { maStep, smaStep } from '../averages/index.js';
import { extremeStep } from '../series/index.js';

import { stdevStep } from './deviation.js';
import type { Gap } from './range.js';
import { atrStep, gapOf } from './range.js';

/** `bollinger(src, len, mult)`: `[basis, upper, lower]`, all from bar `len - 1`. */
export function bollingerStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
  mult: number | null,
): Value[] {
  const middle = smaStep(state, `${key}q`, value, len);
  const deviation = stdevStep(state, `${key}d`, value, len, false);
  if (!isPresent(middle) || !isPresent(deviation) || mult === null) return [middle, NONE, NONE];
  return [middle, result(middle + mult * deviation), result(middle - mult * deviation)];
}

/** `bollinger(src, len, mult)` as a tail. */
export function bollingerTail(len = 20, mult = 2): Tail<Value, Value[]> {
  return tailOf((state, value: Value) => bollingerStep(state, '', value, len, mult));
}

/** `bollinger(src, len, mult)` over a whole series. */
export function bollinger(src: Series, len = 20, mult = 2): Value[][] {
  return fold(bollingerTail(len, mult), src);
}

/** `bbWidth(src, len, mult)`: band width over the basis, from bar `len - 1`. */
export function bbWidthStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
  mult: number | null,
): Value {
  const trio = bollingerStep(state, key, value, len, mult);
  const basis = at(trio, 0);
  const upper = at(trio, 1);
  const lower = at(trio, 2);
  if (!isPresent(basis) || !isPresent(upper) || !isPresent(lower)) return NONE;
  if (basis === 0) return NONE;
  return result((upper - lower) / basis);
}

/** `bbWidth(src, len, mult)` as a tail. */
export function bbWidthTail(len = 20, mult = 2): Tail<Value, Value> {
  return tailOf((state, value: Value) => bbWidthStep(state, '', value, len, mult));
}

/** `bbWidth(src, len, mult)` over a whole series. */
export function bbWidth(src: Series, len = 20, mult = 2): Value[] {
  return fold(bbWidthTail(len, mult), src);
}

/** `bbPercent(src, len, mult)`: where price sits between the bands, from bar `len - 1`. */
export function bbPercentStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
  mult: number | null,
): Value {
  const trio = bollingerStep(state, key, value, len, mult);
  const upper = at(trio, 1);
  const lower = at(trio, 2);
  if (!isPresent(value) || !isPresent(upper) || !isPresent(lower)) return NONE;
  const span = upper - lower;
  if (span === 0) return NONE;
  return result((value - lower) / span);
}

/** `bbPercent(src, len, mult)` as a tail. */
export function bbPercentTail(len = 20, mult = 2): Tail<Value, Value> {
  return tailOf((state, value: Value) => bbPercentStep(state, '', value, len, mult));
}

/** `bbPercent(src, len, mult)` over a whole series. */
export function bbPercent(src: Series, len = 20, mult = 2): Value[] {
  return fold(bbPercentTail(len, mult), src);
}

/**
 * `keltner(len, mult, atrLen, maType)`: `[basis, upper, lower]`, all from bar
 * `max(len, atrLen) - 1`.
 *
 * The same picture as `bollinger` built from average true range instead of
 * deviation, so the rails widen on how far the instrument travels rather than
 * on how dispersed its closes were.
 */
export function keltnerStep(
  state: StateRecord,
  key: string,
  gap: Gap,
  close: Value,
  volume: Value,
  len: number | null,
  mult: number | null,
  atrLen: number | null,
  maType: MaType | null,
): Value[] {
  const middle = maStep(state, `${key}m`, { src: close, volume }, len, maType);
  const width = atrStep(state, `${key}r`, gap, atrLen);
  if (!isPresent(middle) || !isPresent(width) || mult === null) return [middle, NONE, NONE];
  return [middle, result(middle + mult * width), result(middle - mult * width)];
}

/** `keltner(len, mult, atrLen, maType)` as a tail. */
export function keltnerTail(
  len = 20,
  mult = 2,
  atrLen = 10,
  maType: MaType = 'ema',
): Tail<Bar, Value[]> {
  return tailOf((state, bar: Bar) =>
    keltnerStep(
      state,
      '',
      gapOf(state, 'g', bar),
      bar.close,
      bar.volume,
      len,
      mult,
      atrLen,
      maType,
    ),
  );
}

/** `keltner(len, mult, atrLen, maType)` over a run of bars. */
export function keltner(
  bars: readonly Bar[],
  len = 20,
  mult = 2,
  atrLen = 10,
  maType: MaType = 'ema',
): Value[][] {
  return fold(keltnerTail(len, mult, atrLen, maType), bars);
}

/** `donchian(len)`: `[upper, basis, lower]`, all from bar `len - 1`. */
export function donchianStep(
  state: StateRecord,
  key: string,
  high: Value,
  low: Value,
  len: number | null,
): Value[] {
  const upper = extremeStep(state, `${key}h`, high, len, true, false);
  const lower = extremeStep(state, `${key}l`, low, len, false, false);
  if (!isPresent(upper) || !isPresent(lower)) return [upper, NONE, lower];
  return [upper, result((upper + lower) / 2), lower];
}

/** `donchian(len)` as a tail. */
export function donchianTail(len = 20): Tail<Bar, Value[]> {
  return tailOf((state, bar: Bar) => donchianStep(state, '', bar.high, bar.low, len));
}

/** `donchian(len)` over a run of bars. */
export function donchian(bars: readonly Bar[], len = 20): Value[][] {
  return fold(donchianTail(len), bars);
}
