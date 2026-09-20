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
 *
 * Everything the algorithm carries between bars is a number or a flag in a
 * state region, which is what lets an engine advance one bar at a time over the
 * same step this file's tail folds over a run.
 */
import type { Bar, StateRecord, Tail, Value } from '../values/index.js';
import { NONE, flag, fold, held, isPresent, result, slot, tailOf } from '../values/index.js';

/** `psar(start, step, max)`. */
export function psarStep(
  state: StateRecord,
  key: string,
  bar: Bar,
  start: number | null,
  step: number | null,
  ceiling: number | null,
): Value[] {
  const seenKey = `${key}k`;
  const beforeHigh = held(state, `${key}h`);
  const beforeLow = held(state, `${key}l`);
  const beforeClose = held(state, `${key}c`);
  const started = state[seenKey] === true;
  state[seenKey] = true;
  state[`${key}h`] = bar.high;
  state[`${key}l`] = bar.low;
  state[`${key}c`] = bar.close;

  if (start === null || step === null || ceiling === null) return [NONE, NONE];
  if (!isPresent(bar.high) || !isPresent(bar.low) || !isPresent(bar.close)) {
    return [NONE, NONE];
  }

  const seededKey = `${key}s`;
  const longKey = `${key}g`;
  const extremeKey = `${key}e`;
  const stopKey = `${key}p`;
  const rateKey = `${key}a`;

  // Seeding waits for a pair of complete bars rather than for bar 1 by
  // number. On clean data that is bar 1, which is the declared warmup; on
  // data with a hole at the start it is the first bar the seed can honestly
  // be taken from, rather than a stop placed at whatever the state happened
  // to hold.
  if (!flag(state, seededKey)) {
    if (!started) return [NONE, NONE];
    if (!isPresent(beforeHigh) || !isPresent(beforeLow) || !isPresent(beforeClose)) {
      return [NONE, NONE];
    }
    const up = bar.close > beforeClose;
    const seed = up ? beforeLow : beforeHigh;
    state[longKey] = up;
    state[extremeKey] = up ? bar.high : bar.low;
    state[stopKey] = seed;
    state[rateKey] = start;
    state[seededKey] = true;
    return [result(seed), up ? -1 : 1];
  }

  let long = flag(state, longKey);
  let extreme = slot(state, extremeKey, 0);
  let acceleration = slot(state, rateKey, start);
  let stop = slot(state, stopKey, 0);

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

  state[longKey] = long;
  state[extremeKey] = extreme;
  state[stopKey] = stop;
  state[rateKey] = acceleration;

  return [result(stop), long ? -1 : 1];
}

/** `psar(start, step, max)` as a tail. */
export function psarTail(start = 0.02, step = 0.02, ceiling = 0.2): Tail<Bar, Value[]> {
  return tailOf((state, bar: Bar) => psarStep(state, '', bar, start, step, ceiling));
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
