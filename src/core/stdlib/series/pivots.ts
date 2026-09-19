/**
 * `pivotHigh` and `pivotLow`.
 *
 * The answer lands on the bar `right` bars after the pivot, which is the first
 * bar on which the pivot is knowable. Returning it at the pivot bar would be a
 * lookahead: the value would appear on history at a bar where no script could
 * have had it, and a backtest built on that is a backtest of a strategy nobody
 * could have run.
 *
 * Comparisons are strict on both sides, so an equal neighbour means there is no
 * pivot there. A run of equal highs has no single highest bar, and picking one
 * of them would make the answer depend on which end the scan started from.
 */
import type { Series, StateRecord, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, result, ring, tailOf } from '../values/index.js';

/** `pivotHigh` and `pivotLow`, answered on the bar the pivot becomes knowable. */
export function pivotStep(
  state: StateRecord,
  key: string,
  value: Value,
  left: number | null,
  right: number | null,
  wantHigh: boolean,
): Value {
  const span = left === null || right === null ? null : left + right + 1;
  const lookback = ring(state, key, span);
  lookback.push(value);
  if (span === null || right === null || !lookback.filled()) return NONE;
  const candidate = lookback.at(right);
  if (!isPresent(candidate)) return NONE;
  for (let back = span - 1; back >= 0; back -= 1) {
    if (back === right) continue;
    const other = lookback.at(back);
    if (!isPresent(other)) return NONE;
    if (wantHigh ? other >= candidate : other <= candidate) return NONE;
  }
  return result(candidate);
}

function pivotTail(left: number, right: number, wantHigh: boolean): Tail<Value, Value> {
  return tailOf((state, value: Value) => pivotStep(state, 'q', value, left, right, wantHigh));
}

/** `pivotHigh(src, left, right)`: the value of a local high, from bar `left + right`. */
export function pivotHighTail(left: number, right: number): Tail<Value, Value> {
  return pivotTail(left, right, true);
}

/** `pivotHigh(src, left, right)` over a whole series. */
export function pivotHigh(src: Series, left: number, right: number): Value[] {
  return fold(pivotHighTail(left, right), src);
}

/** `pivotLow(src, left, right)`: the value of a local low, from bar `left + right`. */
export function pivotLowTail(left: number, right: number): Tail<Value, Value> {
  return pivotTail(left, right, false);
}

/** `pivotLow(src, left, right)` over a whole series. */
export function pivotLow(src: Series, left: number, right: number): Value[] {
  return fold(pivotLowTail(left, right), src);
}
