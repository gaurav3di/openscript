/**
 * Totals and counts over a lookback, and the three functions that deliberately
 * ignore absent bars.
 *
 * `sum` propagates absence, as every lookback function does. `sumSkip`,
 * `avgSkip` and `countPresent` do not, and they say so in their names because
 * a function that quietly ignored a gap would report a total over a lookback it
 * never had.
 */
import type { Flag, Flags, Series, StateRecord, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, result, ring, slot, tailOf } from '../values/index.js';

/** `sum(src, len)`: the total over the lookback, from bar `len - 1`. */
export function sumStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
): Value {
  const lookback = ring(state, key, len);
  lookback.push(value);
  return lookback.sum();
}

/** `sum(src, len)` as a tail. */
export function sumTail(len: number): Tail<Value, Value> {
  return tailOf((state, value: Value) => sumStep(state, 'q', value, len));
}

/** `sum(src, len)` over a whole series. */
export function sum(src: Series, len: number): Value[] {
  return fold(sumTail(len), src);
}

/**
 * `cum(src)`: the running total from the first bar, from bar 0.
 *
 * An absent bar produces an absent bar out and leaves the total where it was.
 * The alternatives are both wrong: treating absence as zero would report a
 * total over bars that had no value, and propagating it into the total would
 * end the series permanently at the first gap.
 */
export function cumStep(state: StateRecord, key: string, value: Value): Value {
  if (!isPresent(value)) return NONE;
  const total = slot(state, key, 0) + value;
  state[key] = total;
  return result(total);
}

/** `cum(src)` as a tail. */
export function cumTail(): Tail<Value, Value> {
  return tailOf((state, value: Value) => cumStep(state, 't', value));
}

/** `cum(src)` over a whole series. */
export function cum(src: Series): Value[] {
  return fold(cumTail(), src);
}

/**
 * `count(cond, len)`: how many of the last `len` bars the condition held on,
 * from bar `len - 1`.
 *
 * An absent condition is a condition that did not hold, matching the rule that
 * absence is false at a branch (`language.md` section 6). Propagating it
 * instead would make a count over a condition built from an average absent for
 * a second warmup on top of the average's own.
 */
export function countStep(
  state: StateRecord,
  key: string,
  cond: Flag,
  len: number | null,
): Value {
  const lookback = ring(state, key, len);
  lookback.push(cond === true ? 1 : 0);
  return lookback.sum();
}

/** `count(cond, len)` as a tail. */
export function countTail(len: number): Tail<Flag, Value> {
  return tailOf((state, cond: Flag) => countStep(state, 'q', cond, len));
}

/** `count(cond, len)` over a whole series. */
export function count(cond: Flags, len: number): Value[] {
  return fold(countTail(len), cond);
}

/** `sumSkip(src, len)`: the total over the lookback, ignoring absent bars. */
export function sumSkipStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
): Value {
  const lookback = ring(state, key, len);
  lookback.push(value);
  return lookback.sumPresent();
}

/** `sumSkip(src, len)` as a tail. */
export function sumSkipTail(len: number): Tail<Value, Value> {
  return tailOf((state, value: Value) => sumSkipStep(state, 'q', value, len));
}

/** `sumSkip(src, len)` over a whole series. */
export function sumSkip(src: Series, len: number): Value[] {
  return fold(sumSkipTail(len), src);
}

/** `countPresent(src, len)`: how many bars of the lookback had a value. */
export function countPresentStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
): Value {
  const lookback = ring(state, key, len);
  lookback.push(value);
  return lookback.filled() ? lookback.presentCount() : NONE;
}

/** `countPresent(src, len)` as a tail. */
export function countPresentTail(len: number): Tail<Value, Value> {
  return tailOf((state, value: Value) => countPresentStep(state, 'q', value, len));
}

/** `countPresent(src, len)` over a whole series. */
export function countPresent(src: Series, len: number): Value[] {
  return fold(countPresentTail(len), src);
}

/**
 * `avgSkip(src, len)`: the mean over the lookback, ignoring absent bars.
 *
 * A lookback with nothing present in it is absent, not zero: there is no mean of
 * no values, and a division by zero is absence by the rule of `stdlib.md`
 * section 2.4.
 */
export function avgSkipStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
): Value {
  const lookback = ring(state, key, len);
  lookback.push(value);
  if (!lookback.filled()) return NONE;
  const counted = lookback.presentCount();
  const total = lookback.sumPresent();
  if (counted === 0 || !isPresent(total)) return NONE;
  return result(total / counted);
}

/** `avgSkip(src, len)` as a tail. */
export function avgSkipTail(len: number): Tail<Value, Value> {
  return tailOf((state, value: Value) => avgSkipStep(state, 'q', value, len));
}

/** `avgSkip(src, len)` over a whole series. */
export function avgSkip(src: Series, len: number): Value[] {
  return fold(avgSkipTail(len), src);
}
