/**
 * The running totals: `obv`, `ad`, `adOsc` and `pvt`.
 *
 * Every function in this module returns absence on every bar when the host
 * supplies no volume, because `volume` is absent rather than zero there
 * (`stdlib.md` sections 3.1 and 7). A script tests `chart.hasVolume` to branch
 * on that rather than inspecting the result, and nothing here substitutes a
 * zero to keep a line drawing.
 *
 * A running total is the one thing a lookback cannot stand in for, so each of
 * these carries its total in the state region rather than in a closure: that is
 * what lets an engine roll one back with the rest of a moving bar's state.
 *
 * A bar's term is checked after every operation that forms it
 * (`compiled-program.md` section 3.1), and a term that is not finite is an absent
 * term: the bar is absent and the total is left where it was, so one overflowing
 * bar costs its own reading and nothing after it. A total that overflows although
 * its term was finite is kept as the arithmetic produced it, and every later
 * reading is absent, which is what `stdlib.md` section 20.6 says of every running
 * total there.
 */
import type { Bar, StateRecord, Tail, Value } from '../values/index.js';
import { NONE, fold, held, isPresent, result, slot, tailOf } from '../values/index.js';
import { emaStep } from '../averages/index.js';

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
export function obvStep(state: StateRecord, key: string, bar: Bar): Value {
  const totalKey = `${key}t`;
  const closeKey = `${key}p`;
  const seenKey = `${key}k`;
  const previousClose = held(state, closeKey);
  const started = state[seenKey] === true;

  if (!isPresent(bar.volume) || !isPresent(bar.close)) {
    state[seenKey] = true;
    state[closeKey] = bar.close;
    return NONE;
  }

  let total = slot(state, totalKey, 0);
  if (started && isPresent(previousClose)) {
    if (bar.close > previousClose) total += bar.volume;
    else if (bar.close < previousClose) total -= bar.volume;
  }
  state[seenKey] = true;
  state[closeKey] = bar.close;
  state[totalKey] = total;
  return result(total);
}

/** `obv()` as a tail. */
export function obvTail(): Tail<Bar, Value> {
  return tailOf((state, bar: Bar) => obvStep(state, '', bar));
}

/** `obv()` over a run of bars. */
export function obv(bars: readonly Bar[]): Value[] {
  return fold(obvTail(), bars);
}

/** `ad()`: the running total of volume weighted by where the close sat, from bar 0. */
export function adStep(state: StateRecord, key: string, bar: Bar): Value {
  const flow = moneyFlow(bar);
  if (!isPresent(flow)) return NONE;
  const total = slot(state, `${key}t`, 0) + flow;
  state[`${key}t`] = total;
  return result(total);
}

/** `ad()` as a tail. */
export function adTail(): Tail<Bar, Value> {
  return tailOf((state, bar: Bar) => adStep(state, '', bar));
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
export function adOscStep(
  state: StateRecord,
  key: string,
  bar: Bar,
  fast: number | null,
  slow: number | null,
): Value {
  const total = adStep(state, `${key}a`, bar);
  const near = emaStep(state, `${key}f`, total, fast);
  const far = emaStep(state, `${key}s`, total, slow);
  if (!isPresent(near) || !isPresent(far)) return NONE;
  return result(near - far);
}

/** `adOsc(fast, slow)` as a tail. */
export function adOscTail(fast = 3, slow = 10): Tail<Bar, Value> {
  return tailOf((state, bar: Bar) => adOscStep(state, '', bar, fast, slow));
}

/** `adOsc(fast, slow)` over a run of bars. */
export function adOsc(bars: readonly Bar[], fast = 3, slow = 10): Value[] {
  return fold(adOscTail(fast, slow), bars);
}

/**
 * The per-bar term `pvt` adds: the change, then the proportion, then the
 * product with the volume, each checked as it is formed.
 *
 * A change can overflow although the true proportion is finite: a close of
 * -1e308 after one of 1e308 is a proportion of -2. Section 3.1 makes that change
 * absent, and so the term. Each step is checked where it rounds because that is
 * how the rule is stated, not because a later step could turn an infinity back
 * into a number here: none of these three can.
 */
function trendTerm(close: number, before: number, volume: number): Value {
  const change = result(close - before);
  if (!isPresent(change)) return NONE;
  const proportion = result(change / before);
  if (!isPresent(proportion)) return NONE;
  return result(proportion * volume);
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
export function pvtStep(state: StateRecord, key: string, bar: Bar): Value {
  const totalKey = `${key}t`;
  const closeKey = `${key}p`;
  const seenKey = `${key}k`;
  const before = held(state, closeKey);
  const started = state[seenKey] === true;
  state[seenKey] = true;
  state[closeKey] = bar.close;

  if (!started) return NONE;
  if (!isPresent(before) || before === 0) return NONE;
  if (!isPresent(bar.close) || !isPresent(bar.volume)) return NONE;
  const term = trendTerm(bar.close, before, bar.volume);
  if (!isPresent(term)) return NONE;
  const total = slot(state, totalKey, 0) + term;
  state[totalKey] = total;
  return result(total);
}

/** `pvt()` as a tail. */
export function pvtTail(): Tail<Bar, Value> {
  return tailOf((state, bar: Bar) => pvtStep(state, '', bar));
}

/** `pvt()` over a run of bars. */
export function pvt(bars: readonly Bar[]): Value[] {
  return fold(pvtTail(), bars);
}
