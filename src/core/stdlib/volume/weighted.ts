/**
 * `vwap` and `vwapAnchor`: the volume weighted average price since an anchor.
 *
 * `stdlib.md` section 7 writes `vwap(src)` and says it resets at the start of
 * each trading session **as the instrument defines it**, not at midnight,
 * because the session is what the number means. Where a session starts follows
 * from the instrument's own trading hours and not from any arithmetic here, so
 * this library takes the anchor as a flag per bar and an engine derives it.
 * `vwapAnchor` is therefore the whole of the calculation and `vwap` is that
 * calculation with the session's first bars passed in.
 *
 * The running totals are carried rather than rebuilt, because that is the
 * definition: a volume weighted average since an anchor is a pair of running
 * totals, and a lookback over the bars since the anchor would be a different
 * quantity with a different value.
 */
import type { Series, StateRecord, Tail, Value } from '../values/index.js';
import { NONE, flag, fold, isPresent, result, slot, tailOf } from '../values/index.js';

/** A bar's source price, its volume, and whether the average restarts here. */
export interface Anchored {
  readonly src: Value;
  readonly volume: Value;
  readonly reset: boolean;
}

/**
 * `vwapAnchor(src, resetWhen)`: from the first bar `resetWhen` is true.
 *
 * The bar the condition holds on is the first bar of the new average, not the
 * last bar of the old one. Absent before the condition has ever been true,
 * because there is no anchor to measure from and zero would read as a price.
 *
 * A price times volume that overflows is an absent term (`compiled-program.md`
 * section 3.1): the bar is absent and neither total moves, so the bar costs its
 * own reading and nothing after it. A total that overflows is kept as the
 * arithmetic produced it and is absent, so the average divided by it is absent
 * until the next anchor rather than the exact zero a finite flow over an
 * infinite volume would give.
 */
export function vwapAnchorStep(state: StateRecord, key: string, input: Anchored): Value {
  const flowKey = `${key}f`;
  const tradedKey = `${key}v`;
  const anchoredKey = `${key}a`;
  if (input.reset) {
    state[flowKey] = 0;
    state[tradedKey] = 0;
    state[anchoredKey] = true;
  }
  if (!flag(state, anchoredKey)) return NONE;
  if (!isPresent(input.src) || !isPresent(input.volume)) return NONE;
  const term = result(input.src * input.volume);
  if (!isPresent(term)) return NONE;
  const flow = slot(state, flowKey, 0) + term;
  const traded = slot(state, tradedKey, 0) + input.volume;
  state[flowKey] = flow;
  state[tradedKey] = traded;
  const numerator = result(flow);
  const divisor = result(traded);
  if (!isPresent(numerator) || !isPresent(divisor) || divisor === 0) return NONE;
  return result(numerator / divisor);
}

/** `vwapAnchor(src, resetWhen)` as a tail. */
export function vwapAnchorTail(): Tail<Anchored, Value> {
  return tailOf((state, input: Anchored) => vwapAnchorStep(state, '', input));
}

/** `vwapAnchor(src, resetWhen)` over whole series. */
export function vwapAnchor(
  src: Series,
  volume: Series,
  resetWhen: readonly boolean[],
): Value[] {
  return fold(
    vwapAnchorTail(),
    src.map((value, index) => ({
      src: value,
      volume: volume[index] ?? NONE,
      reset: resetWhen[index] === true,
    })),
  );
}

/**
 * `vwap(src)`: the same average anchored to the session, from the session's
 * first bar.
 *
 * `sessionStart` is the engine's answer to "does a new trading session begin on
 * this bar", read off the instrument's stated trading hours, which is why it
 * is an argument rather than something derived from the timestamps here. On a daily or longer interval every bar is its own
 * session, so every bar is an anchor and the result equals `src`; the compiler
 * emits warning OS8006 saying so, which is a compile-time matter and not this
 * library's.
 */
export function vwapTail(): Tail<Anchored, Value> {
  return vwapAnchorTail();
}

/** `vwap(src)` as a step, which is `vwapAnchor` anchored to the session. */
export function vwapStep(state: StateRecord, key: string, input: Anchored): Value {
  return vwapAnchorStep(state, key, input);
}

/** `vwap(src)` over whole series. */
export function vwap(
  src: Series,
  volume: Series,
  sessionStart: readonly boolean[],
): Value[] {
  return vwapAnchor(src, volume, sessionStart);
}
