/**
 * `macd` and `ppo`: the gap between a fast and a slow exponential mean, once as
 * a difference and once as a percentage.
 *
 * Both return an array holding this bar's outputs, per `stdlib.md` section 2.3.
 * One call, one state region: the alternative of three named functions would be
 * three call sites and therefore three independent states, and the shared
 * smoothing would be computed three times per bar.
 *
 * The signal average is fed the difference series, absences and all, so it
 * seeds on the first `signal` values the difference produced. That is where the
 * declared warmup of bar `slow + signal - 2` comes from.
 */
import type { Series, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, result } from '../values/index.js';
import { emaTail } from '../averages/index.js';

/**
 * `macd(src, fast, slow, signal)`: `[macd, signal, histogram]`, element 0 from
 * bar `slow - 1` and the other two from bar `slow + signal - 2`.
 */
export function macdTail(fast = 12, slow = 26, signal = 9): Tail<Value, Value[]> {
  const quick = emaTail(fast);
  const patient = emaTail(slow);
  const smooth = emaTail(signal);
  return {
    next(value: Value): Value[] {
      const near = quick.next(value);
      const far = patient.next(value);
      const line = isPresent(near) && isPresent(far) ? result(near - far) : NONE;
      const trigger = smooth.next(line);
      const histogram =
        isPresent(line) && isPresent(trigger) ? result(line - trigger) : NONE;
      return [line, trigger, histogram];
    },
  };
}

/** `macd(src, fast, slow, signal)` over a whole series. */
export function macd(src: Series, fast = 12, slow = 26, signal = 9): Value[][] {
  return fold(macdTail(fast, slow, signal), src);
}

/**
 * `ppo(src, fast, slow, signal)`: `[ppo, signal, histogram]`, on the same
 * warmups as `macd`.
 *
 * The same gap divided by the slow average, so the reading is a percentage and
 * two instruments at different price levels can be compared.
 */
export function ppoTail(fast = 12, slow = 26, signal = 9): Tail<Value, Value[]> {
  const quick = emaTail(fast);
  const patient = emaTail(slow);
  const smooth = emaTail(signal);
  return {
    next(value: Value): Value[] {
      const near = quick.next(value);
      const far = patient.next(value);
      const line =
        isPresent(near) && isPresent(far) && far !== 0
          ? result((100 * (near - far)) / far)
          : NONE;
      const trigger = smooth.next(line);
      const histogram =
        isPresent(line) && isPresent(trigger) ? result(line - trigger) : NONE;
      return [line, trigger, histogram];
    },
  };
}

/** `ppo(src, fast, slow, signal)` over a whole series. */
export function ppo(src: Series, fast = 12, slow = 26, signal = 9): Value[][] {
  return fold(ppoTail(fast, slow, signal), src);
}
