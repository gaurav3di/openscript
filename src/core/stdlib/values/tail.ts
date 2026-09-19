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
 */

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
 * A tail built from another tail, with its output passed through a function of
 * this bar's input and that output.
 *
 * Chaining rather than materialising an intermediate series is what keeps the
 * tail path O(1) in the length of history for a study built out of other
 * studies.
 */
export function mapTail<In, Mid, Out>(
  tail: Tail<In, Mid>,
  step: (input: In, value: Mid) => Out,
): Tail<In, Out> {
  return {
    next(input: In): Out {
      return step(input, tail.next(input));
    },
  };
}
