import type { DiagnosticCode, DiagnosticValues } from '../catalogue/index.js';
import type { Span } from '../span/index.js';
import { diagnosticFor, isError } from './diagnostic.js';
import type { Diagnostic } from './diagnostic.js';

/**
 * What a stage is handed so it can report.
 *
 * A stage takes the narrow interface rather than the bag, so a stage can be
 * driven by an editor that wants diagnostics streamed to it and by a compile
 * that wants them collected, without either of them being the stage's business.
 */
export interface DiagnosticSink {
  report<Code extends DiagnosticCode>(
    code: Code,
    span: Span,
    values: DiagnosticValues[Code],
  ): void;
}

/**
 * Gathers diagnostics instead of throwing on the first one.
 *
 * A trader who has three syntax errors in a file wants to see three, not one
 * per compile. A compiler that throws makes the second error cost a whole
 * edit-and-run cycle to discover, and it is the same file, so the cost is paid
 * for nothing.
 *
 * The bag refuses an exact repeat: the same code over the same span, which is
 * what a parser that recovers and re-enters the same construct produces. It
 * refuses nothing else, so two different codes on one character both survive
 * and the reader decides which one they believe.
 */
export class DiagnosticBag implements DiagnosticSink {
  readonly #items: Diagnostic[] = [];
  readonly #seen = new Set<string>();

  report<Code extends DiagnosticCode>(
    code: Code,
    span: Span,
    values: DiagnosticValues[Code],
  ): void {
    this.add(diagnosticFor(code, span, values));
  }

  add(diagnostic: Diagnostic): void {
    const key = `${diagnostic.code}:${diagnostic.span.offset}:${diagnostic.span.length}`;
    if (this.#seen.has(key)) return;
    this.#seen.add(key);
    this.#items.push(diagnostic);
  }

  /** Everything reported, in the order it was reported. */
  get all(): readonly Diagnostic[] {
    return this.#items;
  }

  get isEmpty(): boolean {
    return this.#items.length === 0;
  }

  /** Whether compilation has to stop. A file with only warnings still runs. */
  get hasErrors(): boolean {
    return this.#items.some(isError);
  }

  get errors(): readonly Diagnostic[] {
    return this.#items.filter(isError);
  }

  get warnings(): readonly Diagnostic[] {
    return this.#items.filter((item) => !isError(item));
  }

  /**
   * Everything reported, in the order a reader walks the file.
   *
   * Stages report in the order they run, so a checker warning about line 2
   * arrives after a parser error about line 40. A reader reads top to bottom.
   */
  ordered(): readonly Diagnostic[] {
    return [...this.#items].sort(
      (left, right) =>
        left.span.offset - right.span.offset || left.code.localeCompare(right.code),
    );
  }
}
