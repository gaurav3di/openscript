/**
 * The editor adapter: the language intelligence, wired into a text component.
 *
 * This and the chart adapter are the only modules in the repository allowed to
 * know two worlds at once, and it is the piece a platform with its own editor
 * replaces rather than the piece it patches. Everything under `src/editor` stays
 * ignorant of any component, and the layering check is what keeps it that way.
 *
 * **The editor component is a peer dependency, and nothing here imports it.** A
 * package that pulled a text component into everyone's install would defeat the
 * point of a language a platform can take on its own, so the shapes this
 * produces are declared in `contract.ts` and the host's own build is where the
 * two are compared, in one line per piece. See that file for the lines. The
 * entry point resolves and every function here runs in an install that holds no
 * editor at all, which `scripts/check-entry-points.mjs` proves on every build.
 *
 * Six functions in, five pieces out:
 *
 *     openscriptStream             highlighting, a line at a time
 *     openscriptCompletion         the completion list
 *     openscriptLint               errors as you type, with their fixes
 *     openscriptHoverTooltip       what the thing under the pointer is
 *     openscriptSignatureTooltip   the call being written
 *     formatDocument               lay the script out again
 *
 * The two tooltips take the markup as a parameter and have no default for it, so
 * nothing in this package names a browser global at any tier. A host that wants
 * none of this calls the six functions itself and draws its own. That is not the fallback, it is the supported path: what a host gives up
 * by taking these instead is recorded in `spec/editor-narrowings.json`, which is
 * three lines long and worth reading before choosing.
 */
export type {
  EditorCompletion,
  EditorCompletionContext,
  EditorCompletionResult,
  EditorDiagnostic,
  EditorState,
  EditorStreamParser,
  EditorStringStream,
  EditorText,
  EditorTooltip,
  EditorTooltipView,
  EditorView,
} from './contract.js';

export { COMPLETION_TYPES, HIGHLIGHT_TOKENS } from './tokens.js';

export type { StreamState } from './stream.js';
export { openscriptStream } from './stream.js';

export { openscriptCompletion } from './completion.js';

export { diagnosticsFor, openscriptLint } from './lint.js';

export type { Renderer } from './tooltips.js';
export {
  hoverLines,
  openscriptHoverTooltip,
  openscriptSignatureTooltip,
  signatureLines,
} from './tooltips.js';

export { formatDocument } from './commands.js';

export type { Document } from './positions.js';
export { documentOf, normalisedOffset } from './positions.js';
