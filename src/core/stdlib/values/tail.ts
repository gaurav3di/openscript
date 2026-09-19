/**
 * The tail path, and why the whole-series form is defined in terms of it.
 *
 * A live chart recomputes on every tick. A study that rescans its whole history
 * to produce one more bar makes a terminal slow in proportion to how much
 * history the trader has loaded, and nobody notices until the day somebody
 * scrolls back five years.
 *
 * So every function here is written once, as a tail: a small piece of state
 * plus a step that takes this bar's input and returns this bar's output. The
 * whole-series form is that step folded over the series and nothing else.
 *
 * That is not a convenience. `compiled-program.md` section 8.3 requires the two
 * to agree to the last bit, and the only way to be sure of that is to have one
 * implementation rather than two that are meant to match. A second batch
 * implementation, however carefully written, is a second accumulation order
 * waiting to drift.
 *
 * The state lives in a region (`region.ts`) rather than in the closure's own
 * variables, so the same step an engine advances over a live chart is the step
 * this folds over a series. `tailOf` is the whole of the tail form: a region
 * nobody else can reach, and the step applied to it.
 */
import type { StateRecord } from './region.js';
import { newState } from './region.js';

/**
 * One bar in, one bar out, with everything the function remembers held inside.
 *
 * A tail is stateful and single use: it is fed bars in order, from bar 0, and
 * each call advances it by one bar.
 */
export interface Tail<In, Out> {
  /** Advance by one bar and return that bar's output. */
  next(input: In): Out;
}

/** A tail's step applied to a whole series, oldest bar first. */
export function fold<In, Out>(tail: Tail<In, Out>, inputs: readonly In[]): Out[] {
  const out: Out[] = [];
  for (const input of inputs) out.push(tail.next(input));
  return out;
}

/**
 * A tail from a step: a private region, advanced one bar per call.
 *
 * The region is the same shape an engine hands a stateful call, so the function
 * underneath does not know which of the two is driving it.
 */
export function tailOf<In, Out>(step: (state: StateRecord, input: In) => Out): Tail<In, Out> {
  const state = newState();
  return {
    next(input: In): Out {
      return step(state, input);
    },
  };
}
