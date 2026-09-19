/**
 * True range, and the two averages of it.
 *
 * **Bar 0 is the one deliberate exception to absence propagation in this
 * library**, and `stdlib.md` section 6 puts it there rather than leaving it to
 * an engine. `trueRange()` on bar 0 is `high - low`: the other two terms need
 * the previous close, which does not exist there, and propagating absence would
 * start `atr` one bar later than every reference implementation while adding
 * nothing, because the bar's own range is a true statement about that bar.
 *
 * The exception is granted to `trueRange` and therefore to `atr` and `natr`.
 * It is not granted to every function that happens to use a range: where a
 * function's declared warmup shows it counts changes rather than levels,
 * `gapTrueRange` is the form it uses, and that one is absent on bar 0 like any
 * other change. `chop` and `adx` are the two, and both of their warmups in
 * `stdlib.md` are one bar later than the plain reading would give, which is how
 * the specification says which form they take.
 */
import type { Bar, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, result } from '../values/index.js';
import { rmaTail } from '../averages/index.js';

function rangeTail(allowFirstBar: boolean): Tail<Bar, Value> {
  let previousClose: Value = NONE;
  let seenABar = false;
  return {
    next(bar: Bar): Value {
      let range: Value = NONE;
      if (!seenABar) {
        range =
          allowFirstBar && isPresent(bar.high) && isPresent(bar.low)
            ? result(bar.high - bar.low)
            : NONE;
      } else if (isPresent(bar.high) && isPresent(bar.low) && isPresent(previousClose)) {
        const within = bar.high - bar.low;
        const upGap = Math.abs(bar.high - previousClose);
        const downGap = Math.abs(bar.low - previousClose);
        range = result(Math.max(within, upGap, downGap));
      }
      seenABar = true;
      previousClose = bar.close;
      return range;
    },
  };
}

/** `trueRange()`: the bar's range including any gap from the previous close, from bar 0. */
export function trueRangeTail(): Tail<Bar, Value> {
  return rangeTail(true);
}

/** `trueRange()` over a run of bars. */
export function trueRange(bars: readonly Bar[]): Value[] {
  return fold(trueRangeTail(), bars);
}

/**
 * True range with no exception on bar 0: absent there, like any other quantity
 * that needs the bar before it. Not a call a script can make; see this file's
 * opening note for which functions use it and why.
 */
export function gapTrueRangeTail(): Tail<Bar, Value> {
  return rangeTail(false);
}

/** The gap-aware true range over a run of bars. */
export function gapTrueRange(bars: readonly Bar[]): Value[] {
  return fold(gapTrueRangeTail(), bars);
}

/** `atr(len)`: the smoothed mean of true range, from bar `len - 1`. */
export function atrTail(len: number): Tail<Bar, Value> {
  const range = trueRangeTail();
  const smooth = rmaTail(len);
  return {
    next(bar: Bar): Value {
      return smooth.next(range.next(bar));
    },
  };
}

/** `atr(len)` over a run of bars. */
export function atr(bars: readonly Bar[], len = 14): Value[] {
  return fold(atrTail(len), bars);
}

/** `natr(len)`: `atr` as a percentage of close, from bar `len - 1`. */
export function natrTail(len: number): Tail<Bar, Value> {
  const average = atrTail(len);
  return {
    next(bar: Bar): Value {
      const value = average.next(bar);
      if (!isPresent(value) || !isPresent(bar.close) || bar.close === 0) return NONE;
      return result((100 * value) / bar.close);
    },
  };
}

/** `natr(len)` over a run of bars. */
export function natr(bars: readonly Bar[], len = 14): Value[] {
  return fold(natrTail(len), bars);
}
