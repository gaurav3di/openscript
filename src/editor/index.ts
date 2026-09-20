/**
 * OpenScript, the language intelligence, headless.
 *
 * Six pure functions, text in and data out: highlight, complete, diagnose,
 * hover, signature, format. Three of them are here. No DOM anywhere, no package,
 * no browser global, and nothing on screen: a host supplies the text component,
 * the panel, the apply button, saving and revisions, and keeps its own design
 * system. `scripts/check-layering.mjs` fails the build if this tier so much as
 * mentions a document object, because an editor half that reaches for one is the
 * thing that stops a platform embedding it.
 *
 * **None of it is hand written.** That is the whole reason it is worth shipping
 * rather than leaving to each host, and it is a property of how each function is
 * built rather than an intention:
 *
 *     highlight    the real lexer, and the language's own tables of words and
 *                  marks decide what each token is painted as
 *     diagnose     the whole compiler, and every message and fix comes from the
 *                  error catalogue the documentation is generated from
 *     format       the real lexer for the tokens and the real parser for the
 *                  three questions spacing cannot answer without a tree
 *
 * A hand written version of any of them drifts from the language and nobody
 * notices for a release: a word is added and stays grey, a diagnostic's wording
 * improves in one place. The editor is the compiler wearing a different hat, not
 * a second implementation to keep in step.
 *
 *     complete     the standard library manifest, the checker's bindings for
 *                  what the file itself declares, and the error catalogue for
 *                  what a planned call would be refused with
 *     hover        the manifest again, and the specification's own tables, read
 *                  at build time rather than retyped here
 *     signature    the manifest and the emitter, which between them are where
 *                  every default the compiler applies lives
 *
 * All six exist, so `openalgo-script/editor` is an entry point in the package's
 * export map. It was not one while three of them were missing, because an entry
 * point that resolves to half a tier fails at a consumer's run time rather than
 * honestly at install.
 *
 * What a host loses by taking the drop-in adapter beside this rather than
 * calling these six itself, and the three places a hover has no sentence to show
 * because none exists in a machine readable form, are recorded together in
 * `spec/editor-narrowings.json`.
 */
export type { Diagnostic, Span } from '../core/index.js';

export type { HighlightKind } from './kinds.js';
export type { Highlight } from './scan.js';
export type { HighlightedLine } from './highlight.js';
export { highlight, highlightLines } from './highlight.js';

export { diagnose } from './diagnose.js';

export { format } from './format.js';

export type { Completion, CompletionKind } from './complete.js';
export { complete } from './complete.js';

export type { Hover, HoverKind } from './hover.js';
export { hover } from './hover.js';

export type { Parameter } from './manifest.js';
export type { SignatureHelp } from './signature.js';
export { signature } from './signature.js';
