/**
 * `psar(start, step, max)`: `[sar, direction]`, both from bar 1.
 *
 * A stop that accelerates toward price. It sits below price in an uptrend and
 * above it in a downtrend, moves a fraction of the way to the extreme reached
 * so far on every bar, and that fraction grows each time a new extreme is set,
 * up to a ceiling. When price reaches the stop the trend flips and the stop
 * restarts at the extreme the old trend had reached.
 *
 * Seeded from bar 0's range, per `stdlib.md` section 4: the direction at bar 1
 * is taken from whether that bar closed above bar 0, and the stop starts at bar
 * 0's low in an uptrend or its high in a downtrend.
 *
 * `direction` is -1 long and 1 short, the same convention `supertrend` uses.
 *
 * **What this does not include**, said plainly rather than left to be
 * discovered: the clamp some published versions apply, which forbids the stop
 * from entering the previous two bars' range. `stdlib.md` does not mention it
 * and the algorithm below is the one the plain description gives.
 */
import type { Bar, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, result } from '../values/index.js';

/** `psar(start, step, max)`. */
export function psarTail(start = 0.02, step = 0.02, ceiling = 0.2): Tail<Bar, Value[]> {
  let previous: Bar | null = null;
  let seeded = false;
  let long = true;
  let extreme = 0;
  let stop = 0;
  let acceleration = start;

  return {
    next(bar: Bar): Value[] {
      const before = previous;
      previous = bar;

      if (!isPresent(bar.high) || !isPresent(bar.low) || !isPresent(bar.close)) {
        return [NONE, NONE];
      }

      // Seeding waits for a pair of complete bars rather than for bar 1 by
      // number. On clean data that is bar 1, which is the declared warmup; on
      // data with a hole at the start it is the first bar the seed can honestly
      // be taken from, rather than a stop placed at whatever the state happened
      // to hold.
      if (!seeded) {
        if (before === null) return [NONE, NONE];
        if (!isPresent(before.high) || !isPresent(before.low) || !isPresent(before.close)) {
          return [NONE, NONE];
        }
        long = bar.close > before.close;
        extreme = long ? bar.high : bar.low;
        stop = long ? before.low : before.high;
        acceleration = start;
        seeded = true;
        return [result(stop), long ? -1 : 1];
      }

      stop = stop + acceleration * (extreme - stop);

      if (long) {
        if (stop > bar.low) {
          long = false;
          stop = extreme;
          extreme = bar.low;
          acceleration = start;
        }
      } else if (stop < bar.high) {
        long = true;
        stop = extreme;
        extreme = bar.high;
        acceleration = start;
      }

      if (long) {
        if (bar.high > extreme) {
          extreme = bar.high;
          acceleration = Math.min(acceleration + step, ceiling);
        }
      } else if (bar.low < extreme) {
        extreme = bar.low;
        acceleration = Math.min(acceleration + step, ceiling);
      }

      return [result(stop), long ? -1 : 1];
    },
  };
}

/** `psar(start, step, max)` over a run of bars. */
export function psar(
  bars: readonly Bar[],
  start = 0.02,
  step = 0.02,
  ceiling = 0.2,
): Value[][] {
  return fold(psarTail(start, step, ceiling), bars);
}
