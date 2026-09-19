/**
 * The readings taken from the whole bar rather than from one price: `cci`,
 * `ultimateOsc` and `awesomeOsc`.
 */
import type { Bar, Tail, Value } from '../values/index.js';
import { NONE, fold, hl2, hlc3, isPresent, result } from '../values/index.js';
import { smaTail } from '../averages/index.js';
import { sumTail } from '../series/index.js';
import { meanDeviationTail } from '../volatility/index.js';

/**
 * `cci(len)`: how far the typical price sits from its mean in mean-deviation
 * units, from bar `len - 1`.
 *
 * The divisor is the **mean absolute deviation**, not the standard deviation.
 * The 0.015 constant is calibrated against that quantity, and substituting a
 * standard deviation changes every reading while still producing a plausible
 * looking line.
 */
export function cciTail(len = 20): Tail<Bar, Value> {
  const average = smaTail(len);
  const spread = meanDeviationTail(len);
  return {
    next(bar: Bar): Value {
      const typical = hlc3(bar);
      const mean = average.next(typical);
      const deviation = spread.next(typical);
      if (!isPresent(typical) || !isPresent(mean) || !isPresent(deviation)) return NONE;
      if (deviation === 0) return NONE;
      return result((typical - mean) / (0.015 * deviation));
    },
  };
}

/** `cci(len)` over a run of bars. */
export function cci(bars: readonly Bar[], len = 20): Value[] {
  return fold(cciTail(len), bars);
}

/**
 * `ultimateOsc(len1, len2, len3)`: buying pressure blended over three windows,
 * from bar `max(len1, len2, len3)`.
 *
 * Buying pressure is the close above the lower of this bar's low and the
 * previous close, over the range between the higher of this bar's high and that
 * close and the same lower bound. Both need the previous close, so the sums
 * start at bar 1 and the first reading is at bar `max`, not `max - 1`.
 *
 * The weights are 4, 2 and 1 over 7, shortest window heaviest, which is what
 * stops any single length dominating the reading.
 */
export function ultimateOscTail(len1 = 7, len2 = 14, len3 = 28): Tail<Bar, Value> {
  const pressureSums = [sumTail(len1), sumTail(len2), sumTail(len3)];
  const rangeSums = [sumTail(len1), sumTail(len2), sumTail(len3)];
  let previousClose: Value = NONE;
  let seenABar = false;
  return {
    next(bar: Bar): Value {
      let pressure: Value = NONE;
      let range: Value = NONE;
      if (
        seenABar &&
        isPresent(previousClose) &&
        isPresent(bar.high) &&
        isPresent(bar.low) &&
        isPresent(bar.close)
      ) {
        const floorOf = Math.min(bar.low, previousClose);
        const ceilingOf = Math.max(bar.high, previousClose);
        pressure = result(bar.close - floorOf);
        range = result(ceilingOf - floorOf);
      }
      seenABar = true;
      previousClose = bar.close;

      const averages: Value[] = [];
      for (let index = 0; index < 3; index += 1) {
        const top = (pressureSums[index] as Tail<Value, Value>).next(pressure);
        const bottom = (rangeSums[index] as Tail<Value, Value>).next(range);
        averages.push(
          isPresent(top) && isPresent(bottom) && bottom !== 0 ? result(top / bottom) : NONE,
        );
      }
      const [fast, middle, slow] = averages;
      if (!isPresent(fast) || !isPresent(middle) || !isPresent(slow)) return NONE;
      return result((100 * (4 * fast + 2 * middle + slow)) / 7);
    },
  };
}

/** `ultimateOsc(len1, len2, len3)` over a run of bars. */
export function ultimateOsc(
  bars: readonly Bar[],
  len1 = 7,
  len2 = 14,
  len3 = 28,
): Value[] {
  return fold(ultimateOscTail(len1, len2, len3), bars);
}

/** `awesomeOsc(fast, slow)`: the difference of two simple means of `hl2`, from bar `slow - 1`. */
export function awesomeOscTail(fast = 5, slow = 34): Tail<Bar, Value> {
  const quick = smaTail(fast);
  const patient = smaTail(slow);
  return {
    next(bar: Bar): Value {
      const midpoint = hl2(bar);
      const near = quick.next(midpoint);
      const far = patient.next(midpoint);
      if (!isPresent(near) || !isPresent(far)) return NONE;
      return result(near - far);
    },
  };
}

/** `awesomeOsc(fast, slow)` over a run of bars. */
export function awesomeOsc(bars: readonly Bar[], fast = 5, slow = 34): Value[] {
  return fold(awesomeOscTail(fast, slow), bars);
}
