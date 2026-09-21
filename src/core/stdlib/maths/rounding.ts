/**
 * Rounding, and the one rule that decides every case.
 *
 * **Halves go away from zero, never to even.** `stdlib.md` section 8.1 fixes it
 * there and the reason is legibility: a price rounded for display should agree
 * with what a trader would write down, and round-half-to-even surprises people
 * at exactly the values that matter. Fixing it also means two engines cannot
 * differ by one tick.
 *
 * The implementation does not add a half and take the floor. That is the usual
 * shortcut and it is wrong for the value just below a half, where adding 0.5
 * rounds up to the next representable number before the floor ever runs. The
 * fractional part is compared instead, which has no such case.
 */
import type { Value } from '../values/index.js';
import { NONE, isPresent, result } from '../values/index.js';

/** The nearest whole number, halves away from zero. */
export function roundHalfAway(x: number): number {
  const below = Math.floor(x);
  const fraction = x - below;
  if (fraction > 0.5) return below + 1;
  if (fraction < 0.5) return below;
  // Exactly a half. Away from zero: upward above zero, and `below` already is
  // the downward answer for a negative, since floor(-2.5) is -3.
  return x > 0 ? below + 1 : below;
}

/** `round(x)`: to the nearest whole number, halves away from zero. */
export function round(x: Value): Value {
  return isPresent(x) ? result(roundHalfAway(x)) : NONE;
}

/**
 * Ten to each whole power a binary64 can hold, as the binary64 nearest to it.
 *
 * `stdlib.md` 20.7: the scale a fixed decimal rounding or conversion multiplies
 * by is the nearest binary64 to the power of ten, the value the literal `1e23`
 * reads as, and not what a floating point power returns, which is an ulp away
 * from it for one count on this engine's host. Built once from exact integer
 * arithmetic, and it is the one table: `text(x, decimals)` in the engine's
 * library scales by it through `scaleOf` rather than holding a copy.
 */
const POWERS_OF_TEN: readonly number[] = Array.from({ length: 309 }, (_, count) =>
  Number(10n ** BigInt(count)),
);

/**
 * The scale for a digit count: the nearest binary64 to ten to that power, and
 * past the last finite power the infinity the power would have been.
 */
export function scaleOf(decimals: number): number {
  return POWERS_OF_TEN[decimals] ?? Infinity;
}

/**
 * `round(x, decimals)`: to a fixed number of decimals, halves away from zero.
 *
 * A digit count is a whole number of zero or more; anything else is OS3004 or
 * OS4003 before the call reaches here, and absence is the backstop.
 */
export function roundTo(x: Value, decimals: number): Value {
  if (!isPresent(x)) return NONE;
  if (!Number.isInteger(decimals) || decimals < 0) return NONE;
  const scale = scaleOf(decimals);
  return result(roundHalfAway(x * scale) / scale);
}

/** `floor(x)`: toward negative infinity. */
export function floor(x: Value): Value {
  return isPresent(x) ? result(Math.floor(x)) : NONE;
}

/** `ceil(x)`: toward positive infinity. */
export function ceil(x: Value): Value {
  return isPresent(x) ? result(Math.ceil(x)) : NONE;
}

/** `trunc(x)`: toward zero. */
export function trunc(x: Value): Value {
  return isPresent(x) ? result(Math.trunc(x)) : NONE;
}

/** `roundToStep(x, step)`: to the nearest multiple of `step`. */
export function roundToStep(x: Value, step: Value): Value {
  if (!isPresent(x) || !isPresent(step) || step <= 0) return NONE;
  return result(roundHalfAway(x / step) * step);
}

/**
 * `roundToTick(price)`: to the instrument's tick.
 *
 * Absent when the host supplied no tick size, rather than the price unrounded.
 * Returning the input would produce an order price that looks rounded and is
 * not, which is a defect nothing downstream can see.
 */
export function roundToTick(price: Value, tickSize: Value): Value {
  if (!isPresent(tickSize) || tickSize <= 0) return NONE;
  return roundToStep(price, tickSize);
}
