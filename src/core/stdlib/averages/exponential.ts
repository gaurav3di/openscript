/**
 * The exponential family: `ema`, `rma`, `dema` and `tema`.
 *
 * All four share one seeding rule, which `stdlib.md` section 4 states for `ema`
 * and then refers `rma` to: the average is seeded on bar `len - 1` with the
 * simple average of those `len` values, and is absent before it. Seeding from
 * bar 0 instead, which is common and cheaper, draws a line where there should
 * be a gap and stays materially wrong until the seed decays away. The seeding
 * itself is `smoothed` in `lookback.ts`, which every seeded average here and in
 * the studies built on them goes through.
 *
 * **Two arrangements, deliberately.** `ema` steps as `value * k + prev * (1 - k)`
 * and `rma` steps as `(prev * (len - 1) + value) / len`. Those are the same
 * function in exact arithmetic and two different numbers in binary64, and each
 * is the arrangement its name has always meant. Writing `rma` as a weight of
 * `1 / len` in `ema`'s shape would disagree in the last bits with every
 * implementation of the classic oscillators, which is precisely what this
 * project treats as a release blocker.
 */
import type { Series, StateRecord, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, result, smoothed, tailOf } from '../values/index.js';

/** `ema(src, len)`: exponential mean, weight `2 / (len + 1)`, from bar `len - 1`. */
export function emaStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
): Value {
  if (len === null) return NONE;
  const weight = 2 / (len + 1);
  const rest = 1 - weight;
  return smoothed(state, key, len, value, (previous, next) => next * weight + previous * rest);
}

/** `ema(src, len)` as a tail. */
export function emaTail(len: number): Tail<Value, Value> {
  return tailOf((state, value: Value) => emaStep(state, 'e', value, len));
}

/** `ema(src, len)` over a whole series. */
export function ema(src: Series, len: number): Value[] {
  return fold(emaTail(len), src);
}

/** `rma(src, len)`: the smoothing the classic oscillators use, from bar `len - 1`. */
export function rmaStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
): Value {
  if (len === null) return NONE;
  return smoothed(state, key, len, value, (previous, next) => (previous * (len - 1) + next) / len);
}

/** `rma(src, len)` as a tail. */
export function rmaTail(len: number): Tail<Value, Value> {
  return tailOf((state, value: Value) => rmaStep(state, 'r', value, len));
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
export function demaStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
): Value {
  const once = emaStep(state, `${key}a`, value, len);
  const twice = emaStep(state, `${key}b`, once, len);
  if (!isPresent(once) || !isPresent(twice)) return NONE;
  return result(2 * once - twice);
}

/** `dema(src, len)` as a tail. */
export function demaTail(len: number): Tail<Value, Value> {
  return tailOf((state, value: Value) => demaStep(state, 'e', value, len));
}

/** `dema(src, len)` over a whole series. */
export function dema(src: Series, len: number): Value[] {
  return fold(demaTail(len), src);
}

/** `tema(src, len)`: `3 * e1 - 3 * e2 + e3`, from bar `3 * len - 3`. */
export function temaStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
): Value {
  const once = emaStep(state, `${key}a`, value, len);
  const twice = emaStep(state, `${key}b`, once, len);
  const thrice = emaStep(state, `${key}c`, twice, len);
  if (!isPresent(once) || !isPresent(twice) || !isPresent(thrice)) return NONE;
  // Left to right, as written: 3 * e1, less 3 * e2, plus e3.
  return result(3 * once - 3 * twice + thrice);
}

/** `tema(src, len)` as a tail. */
export function temaTail(len: number): Tail<Value, Value> {
  return tailOf((state, value: Value) => temaStep(state, 'e', value, len));
}

/** `tema(src, len)` over a whole series. */
export function tema(src: Series, len: number): Value[] {
  return fold(temaTail(len), src);
}
