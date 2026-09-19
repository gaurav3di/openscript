/**
 * The absent value, and the two rules every result in this library obeys.
 *
 * Absence is a value of its own and is never a number. A warmup bar is absent,
 * and anything computed from an absent value is absent. Returning zero instead
 * would draw a line along the axis that looks exactly like data, and a reader
 * has no way to tell the two apart.
 *
 * Not-a-number is not used as the sentinel, for the reason `compiled-program.md`
 * section 3.4 gives: it would propagate through arithmetic by accident, which
 * is the right answer for some operators and the wrong one for others, and it
 * would turn an absence test into a floating point comparison.
 */

/** A number, or absence. */
export type Value = number | null;

/** A series is one value per bar, oldest first. */
export type Series = readonly Value[];

/**
 * A condition, one per bar: true, false, or absent.
 *
 * Absence is its own answer here too. A comparison against a warmup bar is
 * absent rather than false, and the functions that consume a condition say
 * which of the two they treat it as.
 */
export type Flag = boolean | null;

/** A series of conditions, one per bar, oldest first. */
export type Flags = readonly Flag[];

/** Absence, written `none` in a script. */
export const NONE: Value = null;

/** True when the value is present, narrowing it to a number. */
export function isPresent(value: Value): value is number {
  return value !== null;
}

/**
 * A computed number, made safe to return.
 *
 * Two rules from `compiled-program.md` section 3.1, applied at every value this
 * library hands back:
 *
 * - A result with no finite real value is absent, not an infinity and not a
 *   not-a-number. `log(0)` and a division by zero inside a ratio study are the
 *   everyday cases.
 * - Negative zero is normalised to positive zero, so nothing downstream can
 *   observe the sign of a zero and two engines cannot differ over it.
 */
export function result(x: number): Value {
  if (!Number.isFinite(x)) return NONE;
  return x === 0 ? 0 : x;
}

/**
 * Element `index` of a series, or absence when the index falls off either end.
 *
 * Reading before the start of the dataset is absent rather than an error, which
 * is what makes `history` and every windowed function fall out of one rule
 * instead of a special case each.
 */
export function at(values: Series, index: number): Value {
  const value = values[index];
  return value === undefined ? NONE : value;
}

/** A series of `length` absent bars. */
export function absentSeries(length: number): Value[] {
  return new Array<Value>(Math.max(0, length)).fill(NONE);
}

/**
 * Whether a length argument is inside its contract: a whole number of one or
 * more, per `stdlib.md` section 2.5.
 *
 * This library raises nothing. A length outside the contract is OS3004 at
 * compile time when it is a literal and OS4003 at run time when it is computed,
 * and both are raised before a call reaches here. The functions below use this
 * only as a backstop, and a backstop returns absence rather than a guess: a
 * wrong number drawn on a chart is worse than a gap.
 */
export function isLength(length: number): boolean {
  return Number.isInteger(length) && length >= 1;
}
