/**
 * Elementary functions. Hypotenuse and exp/log use sections 20.10.1 and
 * 20.10.2. Square root uses its correctly rounded host operation. Power and
 * trigonometry still call host approximations under gap 1.
 */
import type { Value } from '../values/index.js';
import { NONE, isPresent, result } from '../values/index.js';
import { hypotenuse } from './hypot.js';
import { transcendental } from './transcendental.js';

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
  return isPresent(x) ? transcendental('exp', x) : NONE;
}

/** `log(x)`: natural logarithm, absent at or below zero. */
export function log(x: Value): Value {
  if (!isPresent(x) || x <= 0) return NONE;
  return transcendental('log', x);
}

/** `log10(x)`: base ten logarithm, absent at or below zero. */
export function log10(x: Value): Value {
  if (!isPresent(x) || x <= 0) return NONE;
  return transcendental('log10', x);
}

/** `math.log2(x)`: base two logarithm, absent at or below zero. */
export function log2(x: Value): Value {
  if (!isPresent(x) || x <= 0) return NONE;
  return transcendental('log2', x);
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
