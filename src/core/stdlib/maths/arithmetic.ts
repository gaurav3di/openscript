/**
 * The bare arithmetic of `stdlib.md` section 8.1.
 *
 * None of these has a warmup: they read this bar's values only, so each
 * produces a value on bar 0 whenever its arguments do. Every one is absent when
 * any argument is absent, and every result goes through `result`, so a value
 * with no finite real answer is absence rather than an infinity.
 */
import type { Value } from '../values/index.js';
import { NONE, isPresent, result } from '../values/index.js';

/** `abs(x)`: magnitude without sign. */
export function abs(x: Value): Value {
  return isPresent(x) ? result(Math.abs(x)) : NONE;
}

/** `sign(x)`: -1, 0 or 1. */
export function sign(x: Value): Value {
  if (!isPresent(x)) return NONE;
  if (x > 0) return 1;
  if (x < 0) return -1;
  return 0;
}

/** `min(a, b)`: the smaller of two. */
export function min(a: Value, b: Value): Value {
  if (!isPresent(a) || !isPresent(b)) return NONE;
  return result(a < b ? a : b);
}

/** `max(a, b)`: the larger of two. */
export function max(a: Value, b: Value): Value {
  if (!isPresent(a) || !isPresent(b)) return NONE;
  return result(a > b ? a : b);
}

/** `clamp(x, lo, hi)`: `x` held inside a range. */
export function clamp(x: Value, lo: Value, hi: Value): Value {
  if (!isPresent(x) || !isPresent(lo) || !isPresent(hi)) return NONE;
  if (x < lo) return result(lo);
  if (x > hi) return result(hi);
  return result(x);
}

/**
 * `mod(a, b)`: `a - b * floor(a / b)`, the floored remainder, whose sign
 * follows `b`.
 *
 * Written out rather than described because "the modulo" names two different
 * functions in common use. This is the floored one and the `%` operator is the
 * truncated one: `mod(-7, 3)` is 2 where `-7 % 3` is -1. The two agree for
 * every positive `b`, which is every use that wraps an index or a bar count.
 * `mod(a, 0)` is absent, on the rule that a result with no finite real value is
 * absent.
 */
export function mod(a: Value, b: Value): Value {
  if (!isPresent(a) || !isPresent(b) || b === 0) return NONE;
  return result(a - b * Math.floor(a / b));
}

/** True when the value is absent. */
export function isNone(x: Value): boolean {
  return !isPresent(x);
}

/** `x` when present, `fallback` when absent. */
export function orElse(x: Value, fallback: Value): Value {
  const value = isPresent(x) ? x : fallback;
  return value === 0 ? 0 : value;
}

/** `toBool(x)`: absence to false, a bool to itself. Numbers are a type error. */
export function boolOf(x: boolean | null): boolean {
  return x === null ? false : x;
}
