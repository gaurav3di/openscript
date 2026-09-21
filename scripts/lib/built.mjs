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
 * The page-built host the engine suite drives, from the built test tree.
 *
 * A check that runs a program needs a host, and the one host in this repository
 * written from `host-interface.md` rather than against the engine is the suite's.
 * A second host written here would be a second reading of that document, which
 * is the drift the suite's own duty test exists to stop. It comes from the test
 * build rather than the package build, so a check that names it says which
 * build it needs.
 */
export const TEST_HOSTS_MODULE = '../dist-test/tests/hosts/index.js';

/**
 * The gate's reading of `stdlib.md` section 20.11, from the built test tree.
 *
 * Which calls reach which gap is derived once, in the module the gate's test
 * holds the section to the tree with, and the harvest refuses a script by that
 * same reading: `conformance.md` section 8 admits no case that reaches a gap,
 * and a second reading of the table would be the drift the test exists to
 * stop, one directory over. From the test build for the reason the host above
 * is: the one reading of that page written from the page is the suite's.
 */
export const GAPS_MODULE = '../dist-test/tests/gate/gaps-derivation.js';

/**
 * The same path as the working directory sees it, for a message or an existence
 * check, derived from the loader spelling rather than written beside it.
 */
export const fromRoot = (specifier) => specifier.slice('../'.length);
