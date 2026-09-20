/**
 * `variance` and `stdev`.
 *
 * **Population by default, the `len` divisor.** `stdlib.md` section 6 fixes it
 * and gives the reason: that is what the band studies a chart has to reproduce
 * use. `sample = true` switches to the `len - 1` divisor, so neither camp has
 * to write the correction by hand and neither has to guess which one a chart
 * drew.
 *
 * Two passes: the mean of the lookback first, then the deviations from it. The
 * one pass arrangement that subtracts the square of the mean from the mean of
 * the squares loses most of its significant digits on a price series, where the
 * values are large and their spread is small, and can even produce a negative
 * variance that then has to be floored at zero. A study whose implementation
 * needs a floor to stay real is a study computing the wrong quantity.
 */
import type { Series, StateRecord, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, result, ring, tailOf } from '../values/index.js';

/** `variance(src, len, sample)`: the squared deviation over the lookback, from bar `len - 1`. */
export function varianceStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
  sample: boolean,
): Value {
  const lookback = ring(state, key, len);
  lookback.push(value);
  if (len === null) return NONE;
  const divisor = sample ? len - 1 : len;
  if (!lookback.complete() || divisor <= 0) return NONE;
  const mean = lookback.mean();
  if (!isPresent(mean)) return NONE;
  let squares = 0;
  // Oldest bar first, the order of `lookback.ts`.
  for (let back = len - 1; back >= 0; back -= 1) {
    const deviation = (lookback.at(back) as number) - mean;
    squares += deviation * deviation;
  }
  return result(squares / divisor);
}

/** `variance(src, len, sample)` as a tail. */
export function varianceTail(len: number, sample = false): Tail<Value, Value> {
  return tailOf((state, value: Value) => varianceStep(state, 'q', value, len, sample));
}

/** `variance(src, len, sample)` over a whole series. */
export function variance(src: Series, len: number, sample = false): Value[] {
  return fold(varianceTail(len, sample), src);
}

/** `stdev(src, len, sample)`: the square root of the same, from bar `len - 1`. */
export function stdevStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
  sample: boolean,
): Value {
  const squared = varianceStep(state, key, value, len, sample);
  if (!isPresent(squared) || squared < 0) return NONE;
  return result(Math.sqrt(squared));
}

/** `stdev(src, len, sample)` as a tail. */
export function stdevTail(len: number, sample = false): Tail<Value, Value> {
  return tailOf((state, value: Value) => stdevStep(state, 'q', value, len, sample));
}

/** `stdev(src, len, sample)` over a whole series. */
export function stdev(src: Series, len: number, sample = false): Value[] {
  return fold(stdevTail(len, sample), src);
}

/**
 * The mean absolute deviation from the lookback's mean.
 *
 * Not a call of its own in `stdlib.md`, and here because `cci` is defined
 * against it rather than against `stdev`: the 0.015 constant in that study is
 * calibrated for this quantity, and substituting a standard deviation changes
 * every reading.
 */
export function meanDeviationStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
): Value {
  const lookback = ring(state, key, len);
  lookback.push(value);
  if (len === null || !lookback.complete()) return NONE;
  const mean = lookback.mean();
  if (!isPresent(mean)) return NONE;
  let total = 0;
  for (let back = len - 1; back >= 0; back -= 1) {
    total += Math.abs((lookback.at(back) as number) - mean);
  }
  return result(total / len);
}

/** The mean absolute deviation as a tail. */
export function meanDeviationTail(len: number): Tail<Value, Value> {
  return tailOf((state, value: Value) => meanDeviationStep(state, 'q', value, len));
}

/** The mean absolute deviation over a whole series. */
export function meanDeviation(src: Series, len: number): Value[] {
  return fold(meanDeviationTail(len), src);
}
