/**
 * The window averages: `sma`, `wma`, `swma` and `vwma`.
 *
 * Each is a fresh accumulation over the window in index order, oldest bar
 * first, for the reason `window.ts` sets out: a sum has an order as well as a
 * value, and a running total that subtracts the bar leaving the window is a
 * different number.
 */
import type { Series, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, makeWindow, result } from '../values/index.js';

/** A bar's source value paired with its volume, for the volume weighted forms. */
export interface Weighted {
  readonly src: Value;
  readonly volume: Value;
}

/** `sma(src, len)`: the arithmetic mean of the last `len` values, from bar `len - 1`. */
export function smaTail(len: number): Tail<Value, Value> {
  const window = makeWindow(len);
  return {
    next(value: Value): Value {
      window.push(value);
      return window.mean();
    },
  };
}

/** `sma(src, len)` over a whole series. */
export function sma(src: Series, len: number): Value[] {
  return fold(smaTail(len), src);
}

/**
 * `wma(src, len)`: linearly weighted, the newest value weighted `len`, from bar
 * `len - 1`.
 *
 * `stdlib.md` section 4 fixes the weights and not the order they are summed in,
 * so the order is this library's own and is the one stated in `window.ts`:
 * oldest bar first, which is weight 1 first and weight `len` last.
 */
export function wmaTail(len: number): Tail<Value, Value> {
  const window = makeWindow(len);
  const divisor = (len * (len + 1)) / 2;
  return {
    next(value: Value): Value {
      window.push(value);
      if (!window.complete()) return NONE;
      let total = 0;
      for (let back = len - 1; back >= 0; back -= 1) {
        total += (window.at(back) as number) * (len - back);
      }
      return result(total / divisor);
    },
  };
}

/** `wma(src, len)` over a whole series. */
export function wma(src: Series, len: number): Value[] {
  return fold(wmaTail(len), src);
}

/** `swma(src)`: the fixed four bar symmetric mean, weights 1, 2, 2, 1 over 6, from bar 3. */
export function swmaTail(): Tail<Value, Value> {
  const window = makeWindow(4);
  return {
    next(value: Value): Value {
      window.push(value);
      if (!window.complete()) return NONE;
      const oldest = window.at(3) as number;
      const second = window.at(2) as number;
      const third = window.at(1) as number;
      const newest = window.at(0) as number;
      return result((oldest + 2 * second + 2 * third + newest) / 6);
    },
  };
}

/** `swma(src)` over a whole series. */
export function swma(src: Series): Value[] {
  return fold(swmaTail(), src);
}

/**
 * `vwma(src, len)`: the mean weighted by each bar's volume, from bar `len - 1`.
 *
 * The total of `src * volume` over the total of `volume`, which is what "mean
 * weighted by volume" says. Dividing two means by `len` first and then dividing
 * one by the other is the same quantity with two extra roundings in it, and
 * this is the arrangement without them.
 */
export function vwmaTail(len: number): Tail<Weighted, Value> {
  const flow = makeWindow(len);
  const quantity = makeWindow(len);
  return {
    next(input: Weighted): Value {
      const product =
        isPresent(input.src) && isPresent(input.volume) ? result(input.src * input.volume) : NONE;
      flow.push(product);
      quantity.push(input.volume);
      const numerator = flow.sum();
      const denominator = quantity.sum();
      if (!isPresent(numerator) || !isPresent(denominator) || denominator === 0) return NONE;
      return result(numerator / denominator);
    },
  };
}

/** `vwma(src, len)` over a whole series. */
export function vwma(src: Series, volume: Series, len: number): Value[] {
  return fold(
    vwmaTail(len),
    src.map((value, index) => ({ src: value, volume: volume[index] ?? NONE })),
  );
}
