/**
 * What the compiler has to say, and where it is put while it says it.
 *
 * Nothing here decides how a diagnostic looks on a screen. That is the render
 * module, because a terminal, an editor gutter and a chart all want a different
 * shape from the same diagnostic.
 */
export type { Diagnostic } from './diagnostic.js';
export { diagnosticFor, isError } from './diagnostic.js';

export type { DiagnosticSink } from './collector.js';
export { DiagnosticBag } from './collector.js';
