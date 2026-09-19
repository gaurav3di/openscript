/**
 * The seam between the machine and the numeric library.
 *
 * A stateful call is three things put together: a state region the machine
 * holds for the call site, the arguments the call site pushed, and the facts
 * about the bar that are not arithmetic. The arithmetic itself is not here and
 * is not anywhere else in the engine: every formula is computed under
 * `src/core/stdlib`, and `series.ts` and `studies.ts` are tables of call sites
 * pointing at it.
 *
 * **The region is the library's own shape.** `compiled-program.md` 2.11
 * requires a region to be snapshottable by a mechanical copy, so it is a flat
 * record rather than a closure, and the numeric library is written against that
 * record rather than against variables of its own. That is what lets one
 * implementation serve a chart advancing a bar at a time and a library call
 * folded over a whole series: there is no second arrangement of any formula for
 * the two to drift apart in. `copyState` is the mechanical copy, and `memory.ts`
 * is its only caller.
 */
import type { Gap } from '../../stdlib/index.js';
import { entry } from './binding.js';
import type { CallContext, ManifestEntry } from './binding.js';

export type { StateField, StateRecord, StateSlot } from '../../stdlib/index.js';
export { copyState } from '../../stdlib/index.js';

/** An entry for a call that keeps a region between bars. */
export function stateful(
  name: string,
  params: string,
  call: ManifestEntry['call'],
): ManifestEntry {
  return entry(name, params, call, { state: true });
}

/**
 * What a true range needs, taken from the bar the machine is executing.
 *
 * The previous close comes from the bar rather than from the region on purpose:
 * it is a fact about the dataset, the same for every call on the bar, and a
 * call inside a branch does not see every bar, so the close of the bar that
 * call last ran on would be a different number.
 */
export function gapAt(ctx: CallContext): Gap {
  const { high, low, previousClose, index } = ctx.bar;
  return { high, low, previousClose, isFirstBar: index === 0 };
}
