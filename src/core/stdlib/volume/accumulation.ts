/**
 * The running totals: `obv`, `ad`, `adOsc` and `pvt`.
 *
 * Every function in this module returns absence on every bar when the host
 * supplies no volume, because `volume` is absent rather than zero there
 * (`stdlib.md` sections 3.1 and 7). A script tests `chart.hasVolume` to branch
 * on that rather than inspecting the result, and nothing here substitutes a
 * zero to keep a line drawing.
 */
import type { Bar, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, result } from '../values/index.js';
import { emaTail } from '../averages/index.js';

/**
 * Where the close sat inside the bar, as -1 at the low to 1 at the high, times
 * the volume behind it.
 *
 * A bar whose high and low are equal has no position inside it to report, and
 * the settled treatment is that such a bar contributes nothing rather than
 * ending the running total.
 */
export function moneyFlow(bar: Bar): Value {
  if (!isPresent(bar.high) || !isPresent(bar.low)) return NONE;
  if (!isPresent(bar.close) || !isPresent(bar.volume)) return NONE;
  const span = bar.high - bar.low;
  if (!(span > 0)) return 0;
  return result((((bar.close - bar.low) - (bar.high - bar.close)) / span) * bar.volume);
}

/** `obv()`: the running total of volume signed by the close's direction, from bar 0, seeded 0. */
export function obvTail(): Tail<Bar, Value> {
  let total = 0;
  let previousClose: Value = NONE;
  let seenABar = false;
  return {
    next(bar: Bar): Value {
      if (!isPresent(bar.volume) || !isPresent(bar.close)) {
        seenABar = true;
        previousClose = bar.close;
        return NONE;
      }
      if (seenABar && isPresent(previousClose)) {
        if (bar.close > previousClose) total += bar.volume;
        else if (bar.close < previousClose) total -= bar.volume;
      }
      seenABar = true;
      previousClose = bar.close;
      return result(total);
    },
  };
}

/** `obv()` over a run of bars. */
export function obv(bars: readonly Bar[]): Value[] {
  return fold(obvTail(), bars);
}

/** `ad()`: the running total of volume weighted by where the close sat, from bar 0. */
export function adTail(): Tail<Bar, Value> {
  let total = 0;
  return {
    next(bar: Bar): Value {
      const flow = moneyFlow(bar);
      if (!isPresent(flow)) return NONE;
      total += flow;
      return result(total);
    },
  };
}

/** `ad()` over a run of bars. */
export function ad(bars: readonly Bar[]): Value[] {
  return fold(adTail(), bars);
}

/**
 * `adOsc(fast, slow)`: the difference of two means of `ad`, from bar `slow - 1`.
 *
 * The averages run over the running total, not over the per-bar term, so what
 * this measures is acceleration in accumulation rather than the flow itself.
 */
export function adOscTail(fast = 3, slow = 10): Tail<Bar, Value> {
  const line = adTail();
  const quick = emaTail(fast);
  const patient = emaTail(slow);
  return {
    next(bar: Bar): Value {
      const total = line.next(bar);
      const near = quick.next(total);
      const far = patient.next(total);
      if (!isPresent(near) || !isPresent(far)) return NONE;
      return result(near - far);
    },
  };
}

/** `adOsc(fast, slow)` over a run of bars. */
export function adOsc(bars: readonly Bar[], fast = 3, slow = 10): Value[] {
  return fold(adOscTail(fast, slow), bars);
}

/**
 * `pvt()`: the running total of volume weighted by percentage change, from bar
 * 1, seeded 0.
 *
 * The total starts at zero before the first change, and the first change is at
 * bar 1, so bar 0 is absent and bar 1 already carries its own term. Reporting a
 * zero at bar 0 would claim a reading on a bar where the quantity is not
 * defined.
 */
export function pvtTail(): Tail<Bar, Value> {
  let total = 0;
  let previousClose: Value = NONE;
  let seenABar = false;
  return {
    next(bar: Bar): Value {
      const before = previousClose;
      const started = seenABar;
      seenABar = true;
      previousClose = bar.close;
      if (!started) return NONE;
      if (!isPresent(before) || before === 0) return NONE;
      if (!isPresent(bar.close) || !isPresent(bar.volume)) return NONE;
      total += ((bar.close - before) / before) * bar.volume;
      return result(total);
    },
  };
}

/** `pvt()` over a run of bars. */
export function pvt(bars: readonly Bar[]): Value[] {
  return fold(pvtTail(), bars);
}
