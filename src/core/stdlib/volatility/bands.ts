/**
 * The channel studies: `bollinger`, its two readings, `keltner` and `donchian`.
 *
 * Each returns an array holding this bar's outputs, in the order its entry in
 * `stdlib.md` documents. **The array itself is never absent and never changes
 * length**, per section 2.3: each element carries its own warmup and is absent
 * until it is reached. An array that grew as warmup completed would make an
 * index an out-of-range error at the left edge of a chart and nowhere else.
 */
import type { Bar, Series, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, result } from '../values/index.js';
import type { MaType } from '../averages/index.js';
import { maTail, smaTail } from '../averages/index.js';
import { highestTail, lowestTail } from '../series/index.js';

import { stdevTail } from './deviation.js';
import { atrTail } from './range.js';

/** `bollinger(src, len, mult)`: `[basis, upper, lower]`, all from bar `len - 1`. */
export function bollingerTail(len = 20, mult = 2): Tail<Value, Value[]> {
  const basis = smaTail(len);
  const spread = stdevTail(len);
  return {
    next(value: Value): Value[] {
      const middle = basis.next(value);
      const deviation = spread.next(value);
      if (!isPresent(middle) || !isPresent(deviation)) return [middle, NONE, NONE];
      return [
        middle,
        result(middle + mult * deviation),
        result(middle - mult * deviation),
      ];
    },
  };
}

/** `bollinger(src, len, mult)` over a whole series. */
export function bollinger(src: Series, len = 20, mult = 2): Value[][] {
  return fold(bollingerTail(len, mult), src);
}

/** `bbWidth(src, len, mult)`: band width over the basis, from bar `len - 1`. */
export function bbWidthTail(len = 20, mult = 2): Tail<Value, Value> {
  const bands = bollingerTail(len, mult);
  return {
    next(value: Value): Value {
      const [basis, upper, lower] = bands.next(value);
      if (!isPresent(basis) || !isPresent(upper) || !isPresent(lower)) return NONE;
      if (basis === 0) return NONE;
      return result((upper - lower) / basis);
    },
  };
}

/** `bbWidth(src, len, mult)` over a whole series. */
export function bbWidth(src: Series, len = 20, mult = 2): Value[] {
  return fold(bbWidthTail(len, mult), src);
}

/** `bbPercent(src, len, mult)`: where price sits between the bands, from bar `len - 1`. */
export function bbPercentTail(len = 20, mult = 2): Tail<Value, Value> {
  const bands = bollingerTail(len, mult);
  return {
    next(value: Value): Value {
      const [, upper, lower] = bands.next(value);
      if (!isPresent(value) || !isPresent(upper) || !isPresent(lower)) return NONE;
      const span = upper - lower;
      if (span === 0) return NONE;
      return result((value - lower) / span);
    },
  };
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
export function keltnerTail(
  len = 20,
  mult = 2,
  atrLen = 10,
  maType: MaType = 'ema',
): Tail<Bar, Value[]> {
  const basis = maTail(len, maType);
  const range = atrTail(atrLen);
  return {
    next(bar: Bar): Value[] {
      const middle = basis.next({ src: bar.close, volume: bar.volume });
      const width = range.next(bar);
      if (!isPresent(middle) || !isPresent(width)) return [middle, NONE, NONE];
      return [middle, result(middle + mult * width), result(middle - mult * width)];
    },
  };
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
export function donchianTail(len = 20): Tail<Bar, Value[]> {
  const top = highestTail(len);
  const bottom = lowestTail(len);
  return {
    next(bar: Bar): Value[] {
      const upper = top.next(bar.high);
      const lower = bottom.next(bar.low);
      if (!isPresent(upper) || !isPresent(lower)) return [upper, NONE, lower];
      return [upper, result((upper + lower) / 2), lower];
    },
  };
}

/** `donchian(len)` over a run of bars. */
export function donchian(bars: readonly Bar[], len = 20): Value[][] {
  return fold(donchianTail(len), bars);
}
