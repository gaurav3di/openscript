/**
 * `rsi(src, len)`.
 *
 * **The first value is at bar `len`, not at bar `len - 1`.** `rsi` needs `len`
 * changes and a change needs two bars, so the smoothing's lookback is bars 1 to
 * `len`. `stdlib.md` section 5 states this warmup rather than leaving a reader
 * to work it out, and every entry in that section which consumes changes rather
 * than levels carries the same extra bar.
 *
 * The smoothing is `rma`, seeded with the simple average of the first `len`
 * changes, which is what makes this the classic reading rather than one of the
 * several averages that also produce a number between 0 and 100.
 */
import type { Series, StateRecord, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, result, tailOf } from '../values/index.js';
import { rmaStep } from '../averages/index.js';
import { changeStep } from '../series/index.js';

/** `rsi(src, len)`: from bar `len`. */
export function rsiStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
): Value {
  const delta = changeStep(state, `${key}c`, value, 1);
  const up = isPresent(delta) ? result(Math.max(delta, 0)) : NONE;
  const down = isPresent(delta) ? result(Math.max(-delta, 0)) : NONE;
  const averageUp = rmaStep(state, `${key}u`, up, len);
  const averageDown = rmaStep(state, `${key}d`, down, len);
  if (!isPresent(averageUp) || !isPresent(averageDown)) return NONE;
  // No down bar in the lookback is the top of the scale. This also catches a
  // lookback that never moved at all, where both averages are zero and the
  // ratio has no value; every reference implementation reads 100 there, and
  // disagreeing with all of them on a flat lookback would be a worse answer
  // than the one they give.
  if (averageDown === 0) return 100;
  return result(100 - 100 / (1 + averageUp / averageDown));
}

/** `rsi(src, len)` as a tail. */
export function rsiTail(len = 14): Tail<Value, Value> {
  return tailOf((state, value: Value) => rsiStep(state, '', value, len));
}

/** `rsi(src, len)` over a whole series. */
export function rsi(src: Series, len = 14): Value[] {
  return fold(rsiTail(len), src);
}
