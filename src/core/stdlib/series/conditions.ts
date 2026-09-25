/**
 * The two functions that look back to the last time something happened.
 *
 * Both are absent, not zero, before the condition has ever been true.
 * `stdlib.md` section 9 states it and the reason is that zero would read as "it
 * happened on this bar", which is the one answer a reader would act on.
 */
import type { Flag, Flags, Series, StateRecord, Tail, Value } from '../values/index.js';
import { ContributionHistory, NONE, fold, slot, tailOf } from '../values/index.js';

/** `barsSince(cond)`: bars since the condition last held, 0 on the bar itself. */
export function barsSinceStep(state: StateRecord, key: string, cond: Flag): Value {
  let since = slot(state, key, -1);
  if (cond === true) since = 0;
  else if (since >= 0) since += 1;
  state[key] = since;
  return since < 0 ? NONE : since;
}

/** `barsSince(cond)` as a tail. */
export function barsSinceTail(): Tail<Flag, Value> {
  return tailOf((state, cond: Flag) => barsSinceStep(state, 's', cond));
}

/** `barsSince(cond)` over a whole series. */
export function barsSince(cond: Flags): Value[] {
  return fold(barsSinceTail(), cond);
}

/** A condition and the value to remember when it holds, read on the same bar. */
export interface Occasion {
  readonly cond: Flag;
  readonly src: Value;
}

/**
 * `valueWhen(cond, src, occurrence)`: `src` as it stood the last time the
 * condition held, or the one before that.
 *
 * A later occurrence can name any earlier true event. Immutable history keeps
 * those values, including absence, while checkpoints share the sealed prefix.
 */
export function valueWhenStep(
  state: StateRecord,
  key: string,
  input: Occasion,
  occurrence: number,
): Value {
  if (!Number.isInteger(occurrence) || occurrence < 0) return NONE;
  const held = state[key];
  let hits = held instanceof ContributionHistory ? held : new ContributionHistory();
  if (input.cond === true) {
    hits = hits.append(input.src);
    state[key] = hits;
  }
  if (hits.count <= occurrence) return NONE;
  return hits.view(occurrence + 1).at(occurrence);
}

/** `valueWhen(cond, src, occurrence)` as a tail. */
export function valueWhenTail(occurrence = 0): Tail<Occasion, Value> {
  return tailOf((state, input: Occasion) => valueWhenStep(state, 'v', input, occurrence));
}

/** `valueWhen(cond, src, occurrence)` over whole series. */
export function valueWhen(cond: Flags, src: Series, occurrence = 0): Value[] {
  return fold(
    valueWhenTail(occurrence),
    cond.map((flag, index) => ({ cond: flag, src: src[index] ?? NONE })),
  );
}
