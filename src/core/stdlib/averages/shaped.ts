/**
 * The averages with a shape to them: `hma`, `alma` and `linreg`.
 *
 * Each one is a weighted lookback like `wma`, and each accumulates oldest bar
 * first, in index order, for the reason `lookback.ts` gives.
 */
import type { Series, StateRecord, Tail, Value } from '../values/index.js';
import {
  NONE,
  fold,
  isLength,
  isPresent,
  makeLookback,
  result,
  tailOf,
} from '../values/index.js';
import { roundHalfAway } from '../maths/index.js';

import { wmaStep } from './simple.js';

/**
 * `hma(src, len)`: from bar `len + round(sqrt(len)) - 2`.
 *
 * `wma` of twice the half length average less the full length one, smoothed
 * again over the square root of the length.
 *
 * **The half length is not stated.** `stdlib.md` section 4 fixes the outer
 * length as `round(sqrt(len))`, which the declared warmup confirms, and says
 * nothing about the inner one. `floor(len / 2)` is used here, held at a minimum
 * of 1 so a length of 1 or 2 still has a lookback, and the declared warmup holds
 * for any inner length at or below `len`, so nothing in the warmup column
 * settles it. This is recorded as a gap rather than presented as a reading.
 */
export function hmaStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
): Value {
  if (len === null) return NONE;
  const half = Math.max(1, Math.floor(len / 2));
  const outer = Math.max(1, roundHalfAway(Math.sqrt(len)));
  const near = wmaStep(state, `${key}f`, value, half);
  const far = wmaStep(state, `${key}s`, value, len);
  const raw = isPresent(near) && isPresent(far) ? result(2 * near - far) : NONE;
  return wmaStep(state, `${key}o`, raw, outer);
}

/** `hma(src, len)` as a tail. */
export function hmaTail(len: number): Tail<Value, Value> {
  return tailOf((state, value: Value) => hmaStep(state, '', value, len));
}

/** `hma(src, len)` over a whole series. */
export function hma(src: Series, len: number): Value[] {
  return fold(hmaTail(len), src);
}

/**
 * `alma(src, len, offset, sigma)`: the Gaussian weighted mean, from bar `len - 1`.
 *
 * The kernel depends only on the position in the lookback, so it is built once.
 * `offset` slides its peak between lag and smoothness and `sigma` sets how
 * sharply it falls away.
 */
export function almaTail(len: number, offset = 0.85, sigma = 6): Tail<Value, Value> {
  const lookback = makeLookback(len);
  const peak = offset * (len - 1);
  const spread = len / sigma;
  const weights: number[] = [];
  let norm = 0;
  if (sigma > 0 && isLength(len)) {
    // Index order: position 0 is the oldest bar in the lookback.
    for (let position = 0; position < len; position += 1) {
      const gap = position - peak;
      const weight = Math.exp(-(gap * gap) / (2 * spread * spread));
      weights.push(weight);
      norm += weight;
    }
  }
  return {
    next(value: Value): Value {
      lookback.push(value);
      if (!lookback.complete() || norm === 0 || weights.length !== len) return NONE;
      let total = 0;
      for (let position = 0; position < len; position += 1) {
        total += (lookback.at(len - 1 - position) as number) * (weights[position] as number);
      }
      return result(total / norm);
    },
  };
}

/** `alma(src, len, offset, sigma)` over a whole series. */
export function alma(src: Series, len: number, offset = 0.85, sigma = 6): Value[] {
  return fold(almaTail(len, offset, sigma), src);
}

/**
 * `linreg(src, len, offset)`: the least squares line through the last `len`
 * points, read `offset` bars back along it, from bar `len - 1`.
 *
 * `x` runs 0 at the oldest bar of the lookback to `len - 1` at the current one,
 * so the value at the current bar is `intercept + slope * (len - 1)` and a
 * positive `offset` steps back down the line without refitting it.
 *
 * A length of 1 has no line through it: the normal equations are singular, and
 * the answer is absence rather than the single point, because a line fitted to
 * one point is not a fit.
 */
export function linregTail(len: number, offset = 0): Tail<Value, Value> {
  const lookback = makeLookback(len);
  // The x values are the same lookback every bar, so their sums are constants.
  const sumX = ((len - 1) * len) / 2;
  const sumXSquared = ((len - 1) * len * (2 * len - 1)) / 6;
  const divisor = len * sumXSquared - sumX * sumX;
  return {
    next(value: Value): Value {
      lookback.push(value);
      if (!lookback.complete() || divisor === 0) return NONE;
      let sumY = 0;
      let sumXY = 0;
      for (let position = 0; position < len; position += 1) {
        const y = lookback.at(len - 1 - position) as number;
        sumY += y;
        sumXY += y * position;
      }
      const slope = (len * sumXY - sumX * sumY) / divisor;
      const intercept = (sumY - slope * sumX) / len;
      return result(intercept + slope * (len - 1 - offset));
    },
  };
}

/** `linreg(src, len, offset)` over a whole series. */
export function linreg(src: Series, len: number, offset = 0): Value[] {
  return fold(linregTail(len, offset), src);
}
