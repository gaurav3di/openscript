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
 *
 * **Where the previous close comes from is a host fact, not an arithmetic one.**
 * A run of bars has it in the bar before; an engine is handed it with the bar,
 * and that is the one it must use, because a call inside a branch does not see
 * every bar and the close of the bar it last ran on is a different number. So
 * the arithmetic below takes it as an argument and `gapOf` is the small piece
 * that remembers it for a caller folding over a series.
 */
import type { Bar, StateRecord, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, result, tailOf } from '../values/index.js';
import { rmaStep } from '../averages/index.js';

/** A bar's two extremes and the close before it, which is what a range needs. */
export interface Gap {
  readonly high: Value;
  readonly low: Value;
  /** The close of the bar before this one, absent on the first bar. */
  readonly previousClose: Value;
  /** Whether this is the first bar of the run. */
  readonly isFirstBar: boolean;
}

/** `trueRange()`: the bar's range including any gap from the previous close. */
export function trueRangeOf(gap: Gap, allowFirstBar: boolean): Value {
  if (gap.isFirstBar) {
    return allowFirstBar && isPresent(gap.high) && isPresent(gap.low)
      ? result(gap.high - gap.low)
      : NONE;
  }
  if (!isPresent(gap.high) || !isPresent(gap.low) || !isPresent(gap.previousClose)) return NONE;
  const within = gap.high - gap.low;
  const upGap = Math.abs(gap.high - gap.previousClose);
  const downGap = Math.abs(gap.low - gap.previousClose);
  return result(Math.max(within, upGap, downGap));
}

/**
 * The previous close remembered in a region, for a caller folding over a run of
 * bars rather than being handed one at a time.
 */
export function gapOf(state: StateRecord, key: string, bar: Bar): Gap {
  const closeKey = `${key}p`;
  const seenKey = `${key}k`;
  const held = state[closeKey];
  const gap: Gap = {
    high: bar.high,
    low: bar.low,
    previousClose: typeof held === 'number' ? held : NONE,
    isFirstBar: state[seenKey] !== true,
  };
  state[seenKey] = true;
  state[closeKey] = bar.close;
  return gap;
}

/** `trueRange()` as a tail. */
export function trueRangeTail(): Tail<Bar, Value> {
  return tailOf((state, bar: Bar) => trueRangeOf(gapOf(state, 'g', bar), true));
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
  return tailOf((state, bar: Bar) => trueRangeOf(gapOf(state, 'g', bar), false));
}

/** The gap-aware true range over a run of bars. */
export function gapTrueRange(bars: readonly Bar[]): Value[] {
  return fold(gapTrueRangeTail(), bars);
}

/** `atr(len)`: the smoothed mean of true range, from bar `len - 1`. */
export function atrStep(
  state: StateRecord,
  key: string,
  gap: Gap,
  len: number | null,
): Value {
  return rmaStep(state, `${key}a`, trueRangeOf(gap, true), len);
}

/** `atr(len)` as a tail. */
export function atrTail(len: number): Tail<Bar, Value> {
  return tailOf((state, bar: Bar) => atrStep(state, '', gapOf(state, 'g', bar), len));
}

/** `atr(len)` over a run of bars. */
export function atr(bars: readonly Bar[], len = 14): Value[] {
  return fold(atrTail(len), bars);
}

/** `natr(len)`: `atr` as a percentage of close, from bar `len - 1`. */
export function natrStep(
  state: StateRecord,
  key: string,
  gap: Gap,
  close: Value,
  len: number | null,
): Value {
  const average = atrStep(state, key, gap, len);
  if (!isPresent(average) || !isPresent(close) || close === 0) return NONE;
  return result((100 * average) / close);
}

/** `natr(len)` as a tail. */
export function natrTail(len: number): Tail<Bar, Value> {
  return tailOf((state, bar: Bar) => natrStep(state, '', gapOf(state, 'g', bar), bar.close, len));
}

/** `natr(len)` over a run of bars. */
export function natr(bars: readonly Bar[], len = 14): Value[] {
  return fold(natrTail(len), bars);
}
