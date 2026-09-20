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
import type { Series, StateRecord, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, result, tailOf } from '../values/index.js';
import { emaStep } from '../averages/index.js';

/**
 * `macd(src, fast, slow, signal)`: `[macd, signal, histogram]`, element 0 from
 * bar `slow - 1` and the other two from bar `slow + signal - 2`.
 */
export function macdStep(
  state: StateRecord,
  key: string,
  value: Value,
  fast: number | null,
  slow: number | null,
  signal: number | null,
): Value[] {
  const near = emaStep(state, `${key}e`, value, fast);
  const far = emaStep(state, `${key}g`, value, slow);
  const line = isPresent(near) && isPresent(far) ? result(near - far) : NONE;
  const trigger = emaStep(state, `${key}i`, line, signal);
  const histogram = isPresent(line) && isPresent(trigger) ? result(line - trigger) : NONE;
  return [line, trigger, histogram];
}

/** `macd(src, fast, slow, signal)` as a tail. */
export function macdTail(fast = 12, slow = 26, signal = 9): Tail<Value, Value[]> {
  return tailOf((state, value: Value) => macdStep(state, '', value, fast, slow, signal));
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
export function ppoStep(
  state: StateRecord,
  key: string,
  value: Value,
  fast: number | null,
  slow: number | null,
  signal: number | null,
): Value[] {
  const near = emaStep(state, `${key}e`, value, fast);
  const far = emaStep(state, `${key}g`, value, slow);
  const line =
    isPresent(near) && isPresent(far) && far !== 0
      ? result((100 * (near - far)) / far)
      : NONE;
  const trigger = emaStep(state, `${key}i`, line, signal);
  const histogram = isPresent(line) && isPresent(trigger) ? result(line - trigger) : NONE;
  return [line, trigger, histogram];
}

/** `ppo(src, fast, slow, signal)` as a tail. */
export function ppoTail(fast = 12, slow = 26, signal = 9): Tail<Value, Value[]> {
  return tailOf((state, value: Value) => ppoStep(state, '', value, fast, slow, signal));
}

/** `ppo(src, fast, slow, signal)` over a whole series. */
export function ppo(src: Series, fast = 12, slow = 26, signal = 9): Value[][] {
  return fold(ppoTail(fast, slow, signal), src);
}
