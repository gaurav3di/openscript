/**
 * Totals and counts over a window, and the three functions that deliberately
 * ignore absent bars.
 *
 * `sum` propagates absence, as every windowed function does. `sumSkip`,
 * `avgSkip` and `countPresent` do not, and they say so in their names because
 * a function that quietly ignored a gap would report a total over a window it
 * never had.
 */
import type { Flag, Flags, Series, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, makeWindow, result } from '../values/index.js';

/** `sum(src, len)`: the total over the window, from bar `len - 1`. */
export function sumTail(len: number): Tail<Value, Value> {
  const window = makeWindow(len);
  return {
    next(value: Value): Value {
      window.push(value);
      return window.sum();
    },
  };
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
export function cumTail(): Tail<Value, Value> {
  let total = 0;
  return {
    next(value: Value): Value {
      if (!isPresent(value)) return NONE;
      total += value;
      return result(total);
    },
  };
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
export function countTail(len: number): Tail<Flag, Value> {
  const window = makeWindow(len);
  return {
    next(flag: Flag): Value {
      window.push(flag === true ? 1 : 0);
      return window.sum();
    },
  };
}

/** `count(cond, len)` over a whole series. */
export function count(cond: Flags, len: number): Value[] {
  return fold(countTail(len), cond);
}

/** `sumSkip(src, len)`: the total over the window, ignoring absent bars. */
export function sumSkipTail(len: number): Tail<Value, Value> {
  const window = makeWindow(len);
  return {
    next(value: Value): Value {
      window.push(value);
      return window.sumPresent();
    },
  };
}

/** `sumSkip(src, len)` over a whole series. */
export function sumSkip(src: Series, len: number): Value[] {
  return fold(sumSkipTail(len), src);
}

/** `countPresent(src, len)`: how many bars of the window had a value. */
export function countPresentTail(len: number): Tail<Value, Value> {
  const window = makeWindow(len);
  return {
    next(value: Value): Value {
      window.push(value);
      return window.filled() ? window.presentCount() : NONE;
    },
  };
}

/** `countPresent(src, len)` over a whole series. */
export function countPresent(src: Series, len: number): Value[] {
  return fold(countPresentTail(len), src);
}

/**
 * `avgSkip(src, len)`: the mean over the window, ignoring absent bars.
 *
 * A window with nothing present in it is absent, not zero: there is no mean of
 * no values, and a division by zero is absence by the rule of `stdlib.md`
 * section 2.4.
 */
export function avgSkipTail(len: number): Tail<Value, Value> {
  const window = makeWindow(len);
  return {
    next(value: Value): Value {
      window.push(value);
      if (!window.filled()) return NONE;
      const present = window.presentCount();
      const total = window.sumPresent();
      if (present === 0 || !isPresent(total)) return NONE;
      return result(total / present);
    },
  };
}

/** `avgSkip(src, len)` over a whole series. */
export function avgSkip(src: Series, len: number): Value[] {
  return fold(avgSkipTail(len), src);
}
