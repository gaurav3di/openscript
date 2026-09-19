/**
 * `supertrend(factor, atrLen)`: `[line, direction]`, both from bar `atrLen`.
 *
 * A trailing band built from average true range, which ratchets in the
 * direction of the trend and never gives ground: the upper band may only fall
 * while price stays below it, the lower band may only rise while price stays
 * above it, and the line flips to the other band when price closes through the
 * one it was following.
 *
 * **The first value is at bar `atrLen`, one bar after `atr` has one.** The band
 * carry-forward and the flip test both read the previous bar's close and the
 * previous bar's bands, and on the bar average true range first exists there is
 * no previous bar of either. That bar seeds the state and reports nothing,
 * which is what `stdlib.md` section 4 declares. An implementation that reported
 * it would be reporting a direction chosen by its own seeding rule rather than
 * by the data.
 *
 * `direction` is -1 long and 1 short, the sign of the side the band is
 * protecting against, and it is a number rather than a bool so that
 * `direction != direction[1]` reads as the flip test.
 */
import type { Bar, Tail, Value } from '../values/index.js';
import { NONE, fold, hl2, isPresent, result } from '../values/index.js';
import { atrTail } from '../volatility/index.js';

/** `supertrend(factor, atrLen)`. */
export function supertrendTail(factor = 3, atrLen = 10): Tail<Bar, Value[]> {
  const range = atrTail(atrLen);
  let seeded = false;
  let previousUpper = 0;
  let previousLower = 0;
  let previousClose = 0;
  let followingUpper = true;

  return {
    next(bar: Bar): Value[] {
      const width = range.next(bar);
      const midpoint = hl2(bar);
      if (!isPresent(width) || !isPresent(midpoint) || !isPresent(bar.close)) {
        return [NONE, NONE];
      }

      const rawUpper = midpoint + factor * width;
      const rawLower = midpoint - factor * width;

      // The band holds where it is unless price broke it or it moved inward.
      const upper = !seeded
        ? rawUpper
        : rawUpper < previousUpper || previousClose > previousUpper
          ? rawUpper
          : previousUpper;
      const lower = !seeded
        ? rawLower
        : rawLower > previousLower || previousClose < previousLower
          ? rawLower
          : previousLower;

      let line: number;
      if (!seeded || followingUpper) {
        if (bar.close <= upper) {
          line = upper;
          followingUpper = true;
        } else {
          line = lower;
          followingUpper = false;
        }
      } else if (bar.close >= lower) {
        line = lower;
        followingUpper = false;
      } else {
        line = upper;
        followingUpper = true;
      }

      const first = !seeded;
      seeded = true;
      previousUpper = upper;
      previousLower = lower;
      previousClose = bar.close;

      if (first) return [NONE, NONE];
      return [result(line), followingUpper ? 1 : -1];
    },
  };
}

/** `supertrend(factor, atrLen)` over a run of bars. */
export function supertrend(bars: readonly Bar[], factor = 3, atrLen = 10): Value[][] {
  return fold(supertrendTail(factor, atrLen), bars);
}
