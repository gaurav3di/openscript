/**
 * `vwap` and `vwapAnchor`: the volume weighted average price since an anchor.
 *
 * `stdlib.md` section 7 writes `vwap(src)` and says it resets at the start of
 * each trading session **as the host defines it**, not at midnight, because the
 * session is what the number means. Where a session starts is a host fact and
 * not a numeric one, so this library takes the anchor as a flag per bar and an
 * engine supplies it. `vwapAnchor` is therefore the whole of the calculation
 * and `vwap` is that calculation with the host's session starts passed in.
 *
 * The running totals are carried rather than rebuilt, because that is the
 * definition: a volume weighted average since an anchor is a pair of running
 * totals, and a lookback over the bars since the anchor would be a different
 * quantity with a different value.
 */
import type { Series, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, result } from '../values/index.js';

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
 */
export function vwapAnchorTail(): Tail<Anchored, Value> {
  let flow = 0;
  let traded = 0;
  let anchored = false;
  return {
    next(input: Anchored): Value {
      if (input.reset) {
        flow = 0;
        traded = 0;
        anchored = true;
      }
      if (!anchored) return NONE;
      if (!isPresent(input.src) || !isPresent(input.volume)) return NONE;
      flow += input.src * input.volume;
      traded += input.volume;
      if (traded === 0) return NONE;
      return result(flow / traded);
    },
  };
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
 * `sessionStart` is the host's answer to "does a new trading session begin on
 * this bar", which is why it is an argument rather than something derived from
 * the timestamps here. On a daily or longer interval every bar is its own
 * session, so every bar is an anchor and the result equals `src`; the compiler
 * emits warning OS8006 saying so, which is a compile-time matter and not this
 * library's.
 */
export function vwapTail(): Tail<Anchored, Value> {
  return vwapAnchorTail();
}

/** `vwap(src)` over whole series. */
export function vwap(
  src: Series,
  volume: Series,
  sessionStart: readonly boolean[],
): Value[] {
  return vwapAnchor(src, volume, sessionStart);
}
