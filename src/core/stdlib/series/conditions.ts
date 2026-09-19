/**
 * The two functions that look back to the last time something happened.
 *
 * Both are absent, not zero, before the condition has ever been true.
 * `stdlib.md` section 9 states it and the reason is that zero would read as "it
 * happened on this bar", which is the one answer a reader would act on.
 */
import type { Flag, Flags, Series, Tail, Value } from '../values/index.js';
import { NONE, fold } from '../values/index.js';

/** `barsSince(cond)`: bars since the condition last held, 0 on the bar itself. */
export function barsSinceTail(): Tail<Flag, Value> {
  let since = -1;
  return {
    next(flag: Flag): Value {
      if (flag === true) since = 0;
      else if (since >= 0) since += 1;
      return since < 0 ? NONE : since;
    },
  };
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
 * Only the `occurrence + 1` most recent hits are kept, so the memory is fixed
 * by the argument rather than by how much history is loaded.
 */
export function valueWhenTail(occurrence = 0): Tail<Occasion, Value> {
  const wanted = occurrence + 1;
  const hits: Value[] = [];
  return {
    next(input: Occasion): Value {
      if (input.cond === true) {
        hits.push(input.src);
        if (hits.length > wanted) hits.shift();
      }
      if (!Number.isInteger(occurrence) || occurrence < 0) return NONE;
      return hits.length === wanted ? (hits[0] as Value) : NONE;
    },
  };
}

/** `valueWhen(cond, src, occurrence)` over whole series. */
export function valueWhen(cond: Flags, src: Series, occurrence = 0): Value[] {
  return fold(
    valueWhenTail(occurrence),
    cond.map((flag, index) => ({ cond: flag, src: src[index] ?? NONE })),
  );
}
