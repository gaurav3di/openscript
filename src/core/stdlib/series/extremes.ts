/**
 * The lookback extremes: `highest`, `lowest` and the two that report where the
 * extreme was set.
 *
 * `highestBars` and `lowestBars` count bars back, 0 being this bar, which is
 * what `stdlib.md` section 9 says they return. A tie goes to the most recent
 * bar: the lookback's high was set most recently at that bar, and reporting the
 * older one would make the answer jump backwards as an equal high rolls in.
 */
import type { Series, StateRecord, Tail, Value } from '../values/index.js';
import { NONE, fold, result, ring, tailOf } from '../values/index.js';

/** Where the extreme sits in a complete lookback, as bars back from this one. */
function extremeBack(
  read: (back: number) => Value,
  len: number,
  wantHigh: boolean,
): number {
  let best = read(len - 1) as number;
  let bestBack = len - 1;
  // Oldest first, so an equal value later in the lookback replaces the earlier
  // one and the answer is the most recent bar that set the extreme.
  for (let position = 1; position < len; position += 1) {
    const back = len - 1 - position;
    const value = read(back) as number;
    if (wantHigh ? value >= best : value <= best) {
      best = value;
      bestBack = back;
    }
  }
  return bestBack;
}

/** `highest`, `lowest` and the two that report where the extreme was set. */
export function extremeStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
  wantHigh: boolean,
  asBars: boolean,
): Value {
  const lookback = ring(state, key, len);
  lookback.push(value);
  if (len === null || !lookback.complete()) return NONE;
  const back = extremeBack((k) => lookback.at(k), len, wantHigh);
  return asBars ? back : result(lookback.at(back) as number);
}

function extremeTail(len: number, wantHigh: boolean, asBars: boolean): Tail<Value, Value> {
  return tailOf((state, value: Value) => extremeStep(state, 'q', value, len, wantHigh, asBars));
}

/** `highest(src, len)`: the largest value in the last `len` bars, from bar `len - 1`. */
export function highestTail(len: number): Tail<Value, Value> {
  return extremeTail(len, true, false);
}

/** `highest(src, len)` over a whole series. */
export function highest(src: Series, len: number): Value[] {
  return fold(highestTail(len), src);
}

/** `lowest(src, len)`: the smallest value in the last `len` bars, from bar `len - 1`. */
export function lowestTail(len: number): Tail<Value, Value> {
  return extremeTail(len, false, false);
}

/** `lowest(src, len)` over a whole series. */
export function lowest(src: Series, len: number): Value[] {
  return fold(lowestTail(len), src);
}

/** `highestBars(src, len)`: how many bars back the lookback's high was set. */
export function highestBarsTail(len: number): Tail<Value, Value> {
  return extremeTail(len, true, true);
}

/** `highestBars(src, len)` over a whole series. */
export function highestBars(src: Series, len: number): Value[] {
  return fold(highestBarsTail(len), src);
}

/** `lowestBars(src, len)`: how many bars back the lookback's low was set. */
export function lowestBarsTail(len: number): Tail<Value, Value> {
  return extremeTail(len, false, true);
}

/** `lowestBars(src, len)` over a whole series. */
export function lowestBars(src: Series, len: number): Value[] {
  return fold(lowestBarsTail(len), src);
}
