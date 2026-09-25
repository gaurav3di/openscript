/**
 * Square root, the logarithms, the powers and the trigonometry.
 *
 * **A gap, stated here rather than discovered later.**
 * `compiled-program.md` section 8.3 requires that the transcendental functions
 * not use the platform's own maths library, because a platform implementation
 * is correct to within an ulp or so and differs between platforms in the last
 * bit, which this project has declared a release blocker. It names the portable
 * reference algorithm as living in the library manifest. **That manifest does
 * not exist yet**, so there is nothing to implement against, and the functions
 * below call the host until it does. Their last bits are not yet guaranteed.
 *
 * `sqrt` is not affected: IEEE-754 requires it to be correctly rounded.
 * `hypot` has its own exact integer algorithm in `stdlib.md` 20.10.1 and no
 * longer depends on a host approximation.
 *
 * The consequence is worth stating plainly, because it decides what is safe to
 * gate on today. Of the five gate studies, EMA, RSI, MACD, Bollinger Bands and
 * Supertrend, four use only addition, subtraction, multiplication and division,
 * and Bollinger Bands adds `sqrt`. None of them reaches this file's uncertain
 * half. The functions that do are `alma` (exp), `hv` (log) and `chop` (log10).
 */
import type { Value } from '../values/index.js';
import { NONE, isPresent, result } from '../values/index.js';
import { hypotenuse } from './hypot.js';

/**
 * `sqrt(x)`: square root, absent below zero.
 *
 * Correctly rounded on every conforming platform, so this one is bit-identical
 * everywhere without a portable implementation of its own.
 */
export function sqrt(x: Value): Value {
  if (!isPresent(x) || x < 0) return NONE;
  return result(Math.sqrt(x));
}

/** `pow(x, y)`: absent where the result is not a finite real. */
export function pow(x: Value, y: Value): Value {
  if (!isPresent(x) || !isPresent(y)) return NONE;
  return result(Math.pow(x, y));
}

/** `exp(x)`: e to the power x. */
export function exp(x: Value): Value {
  return isPresent(x) ? result(Math.exp(x)) : NONE;
}

/** `log(x)`: natural logarithm, absent at or below zero. */
export function log(x: Value): Value {
  if (!isPresent(x) || x <= 0) return NONE;
  return result(Math.log(x));
}

/** `log10(x)`: base ten logarithm, absent at or below zero. */
export function log10(x: Value): Value {
  if (!isPresent(x) || x <= 0) return NONE;
  return result(Math.log10(x));
}

/** `math.log2(x)`: base two logarithm, absent at or below zero. */
export function log2(x: Value): Value {
  if (!isPresent(x) || x <= 0) return NONE;
  return result(Math.log2(x));
}

/** The circle constant. */
export const PI: number = Math.PI;

/** The base of the natural logarithm. */
export const E: number = Math.E;

/** `math.hypot(x, y)`: `sqrt(x * x + y * y)` without intermediate overflow. */
export function hypot(x: Value, y: Value): Value {
  if (!isPresent(x) || !isPresent(y)) return NONE;
  return hypotenuse(x, y);
}

/** `math.toDegrees(x)`: radians to degrees. */
export function toDegrees(x: Value): Value {
  return isPresent(x) ? result((x * 180) / Math.PI) : NONE;
}

/** `math.toRadians(x)`: degrees to radians. */
export function toRadians(x: Value): Value {
  return isPresent(x) ? result((x * Math.PI) / 180) : NONE;
}

/** `math.sin(x)`: sine of an angle in radians. */
export function sin(x: Value): Value {
  return isPresent(x) ? result(Math.sin(x)) : NONE;
}

/** `math.cos(x)`: cosine. */
export function cos(x: Value): Value {
  return isPresent(x) ? result(Math.cos(x)) : NONE;
}

/** `math.tan(x)`: tangent. */
export function tan(x: Value): Value {
  return isPresent(x) ? result(Math.tan(x)) : NONE;
}

/** `math.asin(x)`: inverse sine, absent outside -1 to 1. */
export function asin(x: Value): Value {
  if (!isPresent(x) || x < -1 || x > 1) return NONE;
  return result(Math.asin(x));
}

/** `math.acos(x)`: inverse cosine, absent outside -1 to 1. */
export function acos(x: Value): Value {
  if (!isPresent(x) || x < -1 || x > 1) return NONE;
  return result(Math.acos(x));
}

/** `math.atan(x)`: inverse tangent. */
export function atan(x: Value): Value {
  return isPresent(x) ? result(Math.atan(x)) : NONE;
}

/** `math.atan2(y, x)`: angle of a vector, correct in all four quadrants. */
export function atan2(y: Value, x: Value): Value {
  if (!isPresent(y) || !isPresent(x)) return NONE;
  return result(Math.atan2(y, x));
}
