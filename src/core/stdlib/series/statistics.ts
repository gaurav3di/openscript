/**
 * Order statistics and the two joint statistics.
 *
 * `percentile` interpolates linearly between the two ranks either side, which
 * `stdlib.md` section 9 states. The nearest rank method, which returns an
 * actual member of the lookback, is the other common choice and gives a visibly
 * different answer for an even length lookback; it is not what is specified here.
 *
 * `covariance` and `correlation` are the population forms, and both are taken
 * in two passes: the mean first, then the deviations from it. The single pass
 * arrangement, summing squares and cross products and subtracting at the end,
 * needs one fewer pass and loses most of its significant digits when the values
 * are large and their spread is small, which is exactly what a price series is.
 * `stdlib.md` fixes neither arrangement, so this one is chosen and stated.
 */
import type { Series, StateRecord, Tail, Value } from '../values/index.js';
import { NONE, fold, result, ring, tailOf } from '../values/index.js';

import type { Pair } from './changes.js';

/** The lookback's values, oldest first, as plain numbers. */
function ordered(read: (back: number) => Value, len: number): number[] {
  const values: number[] = [];
  for (let back = len - 1; back >= 0; back -= 1) values.push(read(back) as number);
  return values;
}

/**
 * `percentile(src, len, p)`: the value at percentile `p` of the lookback,
 * linearly interpolated, from bar `len - 1`.
 */
export function percentileStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
  p: number | null,
): Value {
  const lookback = ring(state, key, len);
  lookback.push(value);
  if (len === null || p === null || !lookback.complete()) return NONE;
  if (!(p >= 0 && p <= 100)) return NONE;
  const sorted = ordered((back) => lookback.at(back), len).sort((a, b) => a - b);
  const rank = (p / 100) * (len - 1);
  const below = Math.floor(rank);
  const above = below + 1;
  const low = sorted[below] as number;
  if (above >= len) return result(low);
  const high = sorted[above] as number;
  return result(low + (rank - below) * (high - low));
}

/** `percentile(src, len, p)` as a tail. */
export function percentileTail(len: number, p: number): Tail<Value, Value> {
  return tailOf((state, value: Value) => percentileStep(state, 'q', value, len, p));
}

/** `percentile(src, len, p)` over a whole series. */
export function percentile(src: Series, len: number, p: number): Value[] {
  return fold(percentileTail(len, p), src);
}

/**
 * `median(src, len)`: the middle value of the lookback, from bar `len - 1`.
 *
 * The 50th percentile by the same interpolation, so an even length lookback is
 * the mean of its two middles rather than one of them chosen by a rule nobody
 * remembers.
 */
export function medianTail(len: number): Tail<Value, Value> {
  return percentileTail(len, 50);
}

/** `median(src, len)` over a whole series. */
export function median(src: Series, len: number): Value[] {
  return fold(medianTail(len), src);
}

/**
 * `percentRank(src, len)`: what percentage of the lookback this bar's value
 * exceeds, from bar `len - 1`.
 *
 * The lookback is the last `len` bars including this one, which is what the
 * declared warmup of bar `len - 1` says: a lookback of the `len` bars before this
 * one would not have its first answer until bar `len`. This bar is therefore
 * one of the values counted, so the reading runs from `100 / len` to 100 rather
 * than from 0.
 */
export function percentRankStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
): Value {
  const lookback = ring(state, key, len);
  lookback.push(value);
  if (len === null || !lookback.complete()) return NONE;
  const current = lookback.at(0) as number;
  let counted = 0;
  for (let back = len - 1; back >= 0; back -= 1) {
    if ((lookback.at(back) as number) <= current) counted += 1;
  }
  return result((counted * 100) / len);
}

/** `percentRank(src, len)` as a tail. */
export function percentRankTail(len: number): Tail<Value, Value> {
  return tailOf((state, value: Value) => percentRankStep(state, 'q', value, len));
}

/** `percentRank(src, len)` over a whole series. */
export function percentRank(src: Series, len: number): Value[] {
  return fold(percentRankTail(len), src);
}

interface Moments {
  readonly covariance: number;
  readonly varianceA: number;
  readonly varianceB: number;
}

function moments(a: readonly number[], b: readonly number[], len: number): Moments {
  let sumA = 0;
  let sumB = 0;
  for (let index = 0; index < len; index += 1) {
    sumA += a[index] as number;
    sumB += b[index] as number;
  }
  const meanA = sumA / len;
  const meanB = sumB / len;
  let cross = 0;
  let squaresA = 0;
  let squaresB = 0;
  for (let index = 0; index < len; index += 1) {
    const deviationA = (a[index] as number) - meanA;
    const deviationB = (b[index] as number) - meanB;
    cross += deviationA * deviationB;
    squaresA += deviationA * deviationA;
    squaresB += deviationB * deviationB;
  }
  return { covariance: cross / len, varianceA: squaresA / len, varianceB: squaresB / len };
}

function jointStep(
  state: StateRecord,
  key: string,
  pair: Pair,
  len: number | null,
  want: 'covariance' | 'correlation',
): Value {
  const left = ring(state, `${key}a`, len);
  const right = ring(state, `${key}b`, len);
  left.push(pair.a);
  right.push(pair.b);
  if (len === null || !left.complete() || !right.complete()) return NONE;
  const a = ordered((back) => left.at(back), len);
  const b = ordered((back) => right.at(back), len);
  const m = moments(a, b, len);
  if (want === 'covariance') return result(m.covariance);
  if (!Number.isFinite(m.varianceA) || !Number.isFinite(m.varianceB)) return NONE;
  const scale = Math.sqrt(m.varianceA) * Math.sqrt(m.varianceB);
  if (scale === 0) return NONE;
  return result(m.covariance / scale);
}

/** `covariance(a, b, len)`: the population covariance, from bar `len - 1`. */
export function covarianceStep(
  state: StateRecord,
  key: string,
  pair: Pair,
  len: number | null,
): Value {
  return jointStep(state, key, pair, len, 'covariance');
}

/** `correlation(a, b, len)`: linear correlation, -1 to 1, from bar `len - 1`. */
export function correlationStep(
  state: StateRecord,
  key: string,
  pair: Pair,
  len: number | null,
): Value {
  return jointStep(state, key, pair, len, 'correlation');
}

/** `covariance(a, b, len)` as a tail. */
export function covarianceTail(len: number): Tail<Pair, Value> {
  return tailOf((state, pair: Pair) => covarianceStep(state, 'q', pair, len));
}

/** `correlation(a, b, len)` as a tail. */
export function correlationTail(len: number): Tail<Pair, Value> {
  return tailOf((state, pair: Pair) => correlationStep(state, 'q', pair, len));
}

function pairs(a: Series, b: Series): Pair[] {
  return a.map((value, index) => ({ a: value, b: b[index] ?? NONE }));
}

/** `covariance(a, b, len)` over whole series. */
export function covariance(a: Series, b: Series, len: number): Value[] {
  return fold(covarianceTail(len), pairs(a, b));
}

/** `correlation(a, b, len)` over whole series. */
export function correlation(a: Series, b: Series, len: number): Value[] {
  return fold(correlationTail(len), pairs(a, b));
}
