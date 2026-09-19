/**
 * The exponential family: `ema`, `rma`, `dema` and `tema`.
 *
 * All four share one seeding rule, which `stdlib.md` section 4 states for `ema`
 * and then refers `rma` to: the average is seeded on bar `len - 1` with the
 * simple average of those `len` values, and is absent before it. Seeding from
 * bar 0 instead, which is common and cheaper, draws a line where there should
 * be a gap and stays materially wrong until the seed decays away.
 *
 * **Two arrangements, deliberately.** `ema` steps as `value * k + prev * (1 - k)`
 * and `rma` steps as `(prev * (len - 1) + value) / len`. Those are the same
 * function in exact arithmetic and two different numbers in binary64, and each
 * is the arrangement its name has always meant. Writing `rma` as a weight of
 * `1 / len` in `ema`'s shape would disagree in the last bits with every
 * implementation of the classic oscillators, which is precisely what this
 * project treats as a release blocker.
 *
 * **A hole in the input freezes the recurrence.** An absent bar after seeding
 * produces an absent bar out and leaves the running value untouched, so the
 * next present bar continues from where the last one left off. The alternatives
 * are worse: consuming absence as zero would drag the average toward nothing,
 * and re-seeding would let one missing bar restart a two hundred bar average.
 */
import type { Series, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, makeLookback, result } from '../values/index.js';

/** One step of a recurrence, from the previous running value and this bar's. */
type Step = (previous: number, value: number) => number;

/**
 * Seeded smoothing: the mean of the first complete lookback, then `step` per bar.
 *
 * The seed lookback is complete only when it holds `len` present values, so an
 * average taken over another study's output starts counting at that study's
 * first value rather than at bar 0. That is what makes the warmups of
 * `stdlib.md` compose.
 */
function seeded(len: number, step: Step): Tail<Value, Value> {
  const lookback = makeLookback(len);
  let running = 0;
  let started = false;
  return {
    next(value: Value): Value {
      if (!started) {
        lookback.push(value);
        const mean = lookback.mean();
        if (!isPresent(mean)) return NONE;
        started = true;
        running = mean;
        return result(running);
      }
      if (!isPresent(value)) return NONE;
      running = step(running, value);
      return result(running);
    },
  };
}

/** `ema(src, len)`: exponential mean, weight `2 / (len + 1)`, from bar `len - 1`. */
export function emaTail(len: number): Tail<Value, Value> {
  const weight = 2 / (len + 1);
  const rest = 1 - weight;
  return seeded(len, (previous, value) => value * weight + previous * rest);
}

/** `ema(src, len)` over a whole series. */
export function ema(src: Series, len: number): Value[] {
  return fold(emaTail(len), src);
}

/** `rma(src, len)`: the smoothing the classic oscillators use, from bar `len - 1`. */
export function rmaTail(len: number): Tail<Value, Value> {
  return seeded(len, (previous, value) => (previous * (len - 1) + value) / len);
}

/** `rma(src, len)` over a whole series. */
export function rma(src: Series, len: number): Value[] {
  return fold(rmaTail(len), src);
}

/**
 * `dema(src, len)`: `2 * ema - ema(ema)`, from bar `2 * len - 2`.
 *
 * The second average is fed the first one's output, absences and all, so it
 * seeds on the first `len` values the first average produced. That is where the
 * declared warmup comes from rather than being asserted alongside it.
 */
export function demaTail(len: number): Tail<Value, Value> {
  const first = emaTail(len);
  const second = emaTail(len);
  return {
    next(value: Value): Value {
      const once = first.next(value);
      const twice = second.next(once);
      if (!isPresent(once) || !isPresent(twice)) return NONE;
      return result(2 * once - twice);
    },
  };
}

/** `dema(src, len)` over a whole series. */
export function dema(src: Series, len: number): Value[] {
  return fold(demaTail(len), src);
}

/** `tema(src, len)`: `3 * e1 - 3 * e2 + e3`, from bar `3 * len - 3`. */
export function temaTail(len: number): Tail<Value, Value> {
  const first = emaTail(len);
  const second = emaTail(len);
  const third = emaTail(len);
  return {
    next(value: Value): Value {
      const once = first.next(value);
      const twice = second.next(once);
      const thrice = third.next(twice);
      if (!isPresent(once) || !isPresent(twice) || !isPresent(thrice)) return NONE;
      // Left to right, as written: 3 * e1, less 3 * e2, plus e3.
      return result(3 * once - 3 * twice + thrice);
    },
  };
}

/** `tema(src, len)` over a whole series. */
export function tema(src: Series, len: number): Value[] {
  return fold(temaTail(len), src);
}
