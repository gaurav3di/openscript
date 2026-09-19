/**
 * Warmup: the first bar an expression can honestly produce a value for.
 *
 * language.md 7.3 makes warmup a promise rather than a hint, and stdlib.md
 * states a length per function so two engines cannot disagree by a bar. This
 * module is the arithmetic of composing those lengths, and nothing else.
 *
 * Three answers are possible and all three are useful, which is why this is a
 * small lattice and not a number:
 *
 * `at` is an exact first bar. Every length on the path was known while
 * compiling, so the checker can say "bar 33" and mean it.
 *
 * `atLeast` is a floor. A length that comes from `input()` is not known until
 * the settings are resolved, and a warmup that depends on the data (`vwap`
 * starts at the session's first bar) is not known even then. Saying "at least
 * bar 9" is true; saying "bar 9" would not be, and a warning built on a number
 * that was invented is worse than no warning.
 *
 * `never` is a value that is absent on every bar of the run: a name that was
 * never given a definite type is of type `none` (language.md 10.1), and a plot
 * of one is OS8009. This is the one case where the compiler can tell a trader
 * that a line will not appear before they run the study and wonder why.
 *
 * There is no warmup field in a compiled program (`compiled-program.md` section
 * 7) and there is not meant to be one: the line starts on the bar the value
 * stops being absent. What is here serves the diagnostics and the editor, which
 * is why it is allowed to be approximate and has to say when it is.
 */
export type Warmup =
  | { readonly kind: 'at'; readonly bar: number }
  | { readonly kind: 'atLeast'; readonly bar: number }
  | { readonly kind: 'never' };

/** A value on the very first bar. */
export const BAR_ZERO: Warmup = { kind: 'at', bar: 0 };

export const NEVER: Warmup = { kind: 'never' };

export function atBar(bar: number): Warmup {
  return { kind: 'at', bar: Math.max(0, Math.trunc(bar)) };
}

export function atLeastBar(bar: number): Warmup {
  return { kind: 'atLeast', bar: Math.max(0, Math.trunc(bar)) };
}

/** The floor of a warmup, for a rule that can only give a lower bound. */
export function weaken(warmup: Warmup): Warmup {
  return warmup.kind === 'at' ? atLeastBar(warmup.bar) : warmup;
}

/**
 * The warmup of something that needs both of two values.
 *
 * Arithmetic propagates absence (language.md 6.2), so a sum is absent until
 * both sides are present: the later of the two. An operand that is never
 * present makes the whole thing never present.
 */
export function later(left: Warmup, right: Warmup): Warmup {
  if (left.kind === 'never' || right.kind === 'never') return NEVER;
  const bar = Math.max(left.bar, right.bar);
  return left.kind === 'at' && right.kind === 'at' ? atBar(bar) : atLeastBar(bar);
}

/**
 * The warmup of something that needs either of two values.
 *
 * `orElse(x, fallback)` and a ternary whose arms warm up at different bars are
 * both this: present as soon as the earlier one is.
 */
export function earlier(left: Warmup, right: Warmup): Warmup {
  if (left.kind === 'never') return right;
  if (right.kind === 'never') return left;
  const bar = Math.min(left.bar, right.bar);
  return left.kind === 'at' && right.kind === 'at' ? atBar(bar) : atLeastBar(bar);
}

/** The warmup of every one of these together, or bar 0 when there are none. */
export function allOf(warmups: readonly Warmup[]): Warmup {
  return warmups.reduce<Warmup>(later, BAR_ZERO);
}

/**
 * The same value, delayed by a stated number of bars.
 *
 * This is how a library entry's declared length composes with its source's:
 * `sma(ema(close, 10), 10)` is absent until bar 18 because each call delays
 * whatever it was given by its own length, and stdlib.md section 1 says so.
 */
export function delayed(warmup: Warmup, bars: number): Warmup {
  if (warmup.kind === 'never') return NEVER;
  const bar = warmup.bar + Math.trunc(bars);
  return warmup.kind === 'at' ? atBar(bar) : atLeastBar(bar);
}

/** Whether this value is absent on every bar, which is what OS8009 reports. */
export function isNever(warmup: Warmup): boolean {
  return warmup.kind === 'never';
}
