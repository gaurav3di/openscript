/**
 * Errors as you type, as the editor's linter.
 *
 * The diagnostics are the compiler's own, whole: `diagnose` runs the lexer, the
 * parser, the checker and the emitter, so what a writer sees beside their line
 * is exactly what a compile produces and nothing new can appear when they press
 * apply. Every message and every fix came from the error catalogue that the
 * documentation site is generated from.
 *
 * Three decisions worth stating, because each one is visible to a trader.
 *
 * **The fix is shown.** A `Diagnostic` carries a message saying what is wrong and
 * a fix saying what to do, and the fix is the half that is worth reading. The
 * editor's panel shows one string, so the two are joined with a line break
 * rather than the fix being dropped.
 *
 * **The code is the source.** The editor shows a diagnostic's source beside its
 * message, and a code is the one part of a diagnostic this project promises never
 * to change, so it is what a trader quotes and what a support page is indexed by.
 *
 * **A zero width span is widened by one character.** The compiler points at a
 * position for a mistake that is an absence, a missing bracket among them, and a
 * squiggle of no width is a squiggle nobody sees.
 */
import { endOffset } from '../../core/index.js';
import type { Diagnostic } from '../../core/index.js';
import { diagnose } from '../../editor/index.js';
import type { EditorDiagnostic, EditorView } from './contract.js';
import { documentOf } from './positions.js';

/** What the editor prints beside a message, which is the code and nothing else. */
function sourceOf(one: Diagnostic): string {
  return one.code;
}

/** Every diagnostic of a document, in the editor's own shape. */
export function diagnosticsFor(raw: string): readonly EditorDiagnostic[] {
  const held = documentOf(raw);
  return diagnose(held.text).map((one) => {
    const from = held.at(one.span.offset);
    const to = held.at(endOffset(one.span));
    return {
      from,
      to: to > from ? to : from + 1,
      severity: one.severity,
      message: `${one.message}\n${one.fix}`,
      source: sourceOf(one),
    };
  });
}

/**
 * The linter a host wires in one line.
 *
 * ```ts
 * linter(openscriptLint)
 * ```
 *
 * It is synchronous because it is fast enough to be: a finished ninety line
 * study compiles in a third of a millisecond and the same file with a bracket
 * left open in about a millisecond, both with a budget in the benchmark suite.
 * The editor's own linter already debounces, so nothing here does it twice.
 */
export function openscriptLint(view: EditorView): readonly EditorDiagnostic[] {
  return diagnosticsFor(view.state.doc.toString());
}
