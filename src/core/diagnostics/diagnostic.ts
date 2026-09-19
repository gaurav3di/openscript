import { entryFor, fillTemplate } from '../catalogue/index.js';
import type {
  DiagnosticCode,
  DiagnosticValues,
  PlaceholderValue,
  Severity,
  Stage,
} from '../catalogue/index.js';
import type { Span } from '../span/index.js';

/**
 * One thing the compiler has to say about one place in a file.
 *
 * The code and the span come from the stage that raised it. Everything else
 * comes from the catalogue, filled with the values the stage supplied, so no
 * stage anywhere writes a sentence a reader sees.
 */
export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: Severity;
  readonly stage: Stage;
  readonly title: string;
  /** The catalogue message with its slots filled. */
  readonly message: string;
  /** The catalogue fix with its slots filled. What to do, in the imperative. */
  readonly fix: string;
  /** Whether an editor may apply the fix without asking a question. */
  readonly autofix: boolean;
  readonly span: Span;
  /**
   * The values that filled the slots, kept rather than discarded.
   *
   * An editor building a quick fix needs the name that went into the message,
   * not the sentence it was put into, and a host rendering a diagnostic in
   * another language needs every value the template consumed.
   */
  readonly values: Readonly<Record<string, PlaceholderValue>>;
}

/**
 * Builds a diagnostic.
 *
 * The values argument is typed per code, so a call site that forgets a slot or
 * misspells one fails to compile. That is the only guard that runs before a
 * trader sees the message, which is why the placeholders are generated as types.
 */
export function diagnosticFor<Code extends DiagnosticCode>(
  code: Code,
  span: Span,
  values: DiagnosticValues[Code],
): Diagnostic {
  const entry = entryFor(code);
  // DiagnosticValues is generated with every property typed PlaceholderValue,
  // so this widening loses the per-code shape and nothing else.
  const supplied = values as unknown as Readonly<Record<string, PlaceholderValue>>;

  return {
    code,
    severity: entry.severity,
    stage: entry.stage,
    title: entry.title,
    message: fillTemplate(entry.message, supplied),
    fix: fillTemplate(entry.fix, supplied),
    autofix: entry.autofix,
    span,
    values: supplied,
  };
}

export function isError(diagnostic: Diagnostic): boolean {
  return diagnostic.severity === 'error';
}
