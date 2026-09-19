/**
 * `adx(diLen, adxLen)` and `aroon(len)`: how strong the trend is, and which
 * side owns it.
 */
import type { Bar, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, makeLookback, result } from '../values/index.js';
import { rmaTail } from '../averages/index.js';
import { highestBarsTail, lowestBarsTail } from '../series/index.js';
import { gapTrueRangeTail } from '../volatility/index.js';

/**
 * `adx(diLen, adxLen)`: `[adx, plusDI, minusDI]`, elements 1 and 2 from bar
 * `diLen` and element 0 from bar `diLen + adxLen - 1`.
 *
 * Directional movement is the part of this bar's range that lies outside the
 * previous bar's, on whichever side is larger. It needs the bar before it, so
 * the smoothing's lookback is bars 1 to `diLen` and the first reading is at bar
 * `diLen`. The true range in the denominator uses the gap-aware form for the
 * same reason, so all three smoothed quantities cover the same bars: seeding
 * one of them a bar earlier than the other two would bias every reading after
 * it while still looking entirely plausible.
 */
export function adxTail(diLen = 14, adxLen = 14): Tail<Bar, Value[]> {
  const range = gapTrueRangeTail();
  const smoothRange = rmaTail(diLen);
  const smoothUp = rmaTail(diLen);
  const smoothDown = rmaTail(diLen);
  const smoothIndex = rmaTail(adxLen);
  let previous: Bar | null = null;

  return {
    next(bar: Bar): Value[] {
      const before = previous;
      previous = bar;

      let upMove: Value = NONE;
      let downMove: Value = NONE;
      if (
        before !== null &&
        isPresent(bar.high) &&
        isPresent(bar.low) &&
        isPresent(before.high) &&
        isPresent(before.low)
      ) {
        const up = bar.high - before.high;
        const down = before.low - bar.low;
        upMove = up > down && up > 0 ? result(up) : 0;
        downMove = down > up && down > 0 ? result(down) : 0;
      }

      const trueRange = smoothRange.next(range.next(bar));
      const rise = smoothUp.next(upMove);
      const fall = smoothDown.next(downMove);

      let plus: Value = NONE;
      let minus: Value = NONE;
      if (isPresent(trueRange) && trueRange !== 0) {
        if (isPresent(rise)) plus = result((rise / trueRange) * 100);
        if (isPresent(fall)) minus = result((fall / trueRange) * 100);
      }

      let spread: Value = NONE;
      if (isPresent(plus) && isPresent(minus)) {
        const total = plus + minus;
        spread = total > 0 ? result((Math.abs(plus - minus) / total) * 100) : 0;
      }

      return [smoothIndex.next(spread), plus, minus];
    },
  };
}

/** `adx(diLen, adxLen)` over a run of bars. */
export function adx(bars: readonly Bar[], diLen = 14, adxLen = 14): Value[][] {
  return fold(adxTail(diLen, adxLen), bars);
}

/**
 * `aroon(len)`: `[up, down]`, both from bar `len`.
 *
 * How recently the lookback's high and low were set, as a percentage: 100 when it
 * was this bar, 0 when it was `len` bars ago. The lookback is `len + 1` bars
 * wide, because a reading of 0 has to be reachable and an extreme `len` bars
 * back has to still be inside the lookback for that. That extra bar is where the
 * declared warmup of bar `len` rather than bar `len - 1` comes from.
 */
export function aroonTail(len = 14): Tail<Bar, Value[]> {
  const sinceHigh = highestBarsTail(len + 1);
  const sinceLow = lowestBarsTail(len + 1);
  return {
    next(bar: Bar): Value[] {
      const highAge = sinceHigh.next(bar.high);
      const lowAge = sinceLow.next(bar.low);
      const up = isPresent(highAge) ? result((100 * (len - highAge)) / len) : NONE;
      const down = isPresent(lowAge) ? result((100 * (len - lowAge)) / len) : NONE;
      return [up, down];
    },
  };
}

/** `aroon(len)` over a run of bars. */
export function aroon(bars: readonly Bar[], len = 14): Value[][] {
  return fold(aroonTail(len), bars);
}

/**
 * `ichimoku(convLen, baseLen, spanLen)`: `[conversion, base, spanA, spanB,
 * lagging]`, at bars `convLen - 1`, `baseLen - 1`, `baseLen - 1`,
 * `spanLen - 1` and `baseLen - 1`.
 *
 * Each of the first four lines is the midpoint of a lookback's outright high and
 * low, over a different length. **The spans are returned undisplaced, at the
 * bar they are computed on**, per `stdlib.md` section 4: a study draws them
 * forward with the plot's `offset` argument, because a series that has already
 * been shifted cannot be compared with anything else in the script without
 * shifting it back.
 *
 * The lagging line is this bar's close, and it is drawn backward by the same
 * plot argument. It is absent until bar `baseLen - 1`, which is the warmup the
 * specification declares for it, and which is the first bar there is enough
 * history for the displacement to land on.
 */
export function ichimokuTail(
  convLen = 9,
  baseLen = 26,
  spanLen = 52,
): Tail<Bar, Value[]> {
  const conversion = midpointTail(convLen);
  const base = midpointTail(baseLen);
  const far = midpointTail(spanLen);
  const closes = makeLookback(baseLen);
  return {
    next(bar: Bar): Value[] {
      const near = conversion.next(bar);
      const middle = base.next(bar);
      const leading =
        isPresent(near) && isPresent(middle) ? result((near + middle) / 2) : NONE;
      const behind = far.next(bar);
      closes.push(bar.close);
      const lagging = closes.filled() ? closes.at(0) : NONE;
      return [near, middle, leading, behind, lagging];
    },
  };
}

/** `ichimoku(convLen, baseLen, spanLen)` over a run of bars. */
export function ichimoku(
  bars: readonly Bar[],
  convLen = 9,
  baseLen = 26,
  spanLen = 52,
): Value[][] {
  return fold(ichimokuTail(convLen, baseLen, spanLen), bars);
}

/** The midpoint of a lookback's outright high and low. */
function midpointTail(len: number): Tail<Bar, Value> {
  const highs = makeLookback(len);
  const lows = makeLookback(len);
  return {
    next(bar: Bar): Value {
      highs.push(bar.high);
      lows.push(bar.low);
      if (!highs.complete() || !lows.complete()) return NONE;
      let top = highs.at(len - 1) as number;
      let bottom = lows.at(len - 1) as number;
      for (let back = len - 2; back >= 0; back -= 1) {
        const high = highs.at(back) as number;
        const low = lows.at(back) as number;
        if (high > top) top = high;
        if (low < bottom) bottom = low;
      }
      return result((top + bottom) / 2);
    },
  };
}
