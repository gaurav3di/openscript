/**
 * The built output a check loads, named once.
 *
 * Two checks run the compiler rather than reading its source, because what they
 * are about is what a host is handed. Both of them used to name the same two
 * paths, which is one fact written in two files.
 *
 * ## Why these are relative and what they are relative to
 *
 * A module specifier is **a literal, or a name holding one, and nothing else**:
 * the note on written down against built in `no-eval-rules.mjs` says why, and a
 * chain of calls in front of a loader is what got past the check in the round
 * that inverted the rule. So the paths are written the way a loader takes them.
 *
 * A dynamic load resolves its specifier against the file doing the loading, not
 * against the file the string came from, so `../dist/...` is correct in every
 * check in `scripts/` and would be wrong one directory deeper. Nothing in
 * `scripts/lib/` loads these; they are here to be handed up, not used here.
 */

/** The compiler and the language surface a host imports. */
export const CORE_MODULE = '../dist/core/index.js';

/** The emitter, whose defaults a declaration call resolves against. */
export const EMITTER_MODULE = '../dist/core/emit/index.js';

/** The chart adapter, which is the shipped consumer of the emitter's output. */
export const CHART_ADAPTER_MODULE = '../dist/adapters/charts/index.js';

/**
 * The two files behind the emitter's door, which a check reads on purpose.
 *
 * A declaration call's defaults and the colour a name denotes are both inside
 * the emit module rather than on its index, because nothing in the compiler
 * needs them from outside. The defaults check does, and reading the compiled
 * values is the whole point: a transcription of them there would be the second
 * copy that the drift that check exists for lives in.
 */
export const DEFAULTS_MODULE = '../dist/core/emit/defaults.js';
export const COLOURS_MODULE = '../dist/core/emit/colours.js';

/**
 * The same path as the working directory sees it, for a message or an existence
 * check, derived from the loader spelling rather than written beside it.
 */
export const fromRoot = (specifier) => specifier.slice('../'.length);
