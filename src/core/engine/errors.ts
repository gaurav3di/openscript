/**
 * How the engine says something went wrong, and why it does it by throwing.
 *
 * **Nothing the engine exposes ever throws.** A host draws many studies in one
 * render loop and runs many customers' scripts in one process, so a script that
 * fails has to become a diagnostic about that script and nothing else. The
 * public surface catches everything and returns.
 *
 * Inside, a failure is thrown, because an error in the middle of an expression
 * has to abandon the rest of the bar and there is no answer to return from a
 * `DIV` that would not have to be checked again by every instruction above it.
 * The throw crosses the interpreter and stops at the one boundary that knows
 * what to do with it.
 *
 * Every failure carries a catalogue code and a position. A bare string is not
 * available here: `diagnosticFor` is typed per code, so a call that forgets a
 * placeholder does not compile.
 */
import type { DiagnosticCode, DiagnosticValues } from '../catalogue/index.js';
import { diagnosticFor } from '../diagnostics/index.js';
import type { Diagnostic } from '../diagnostics/index.js';
import type { SourceFile } from '../source/index.js';
import { makeSpan } from '../span/index.js';
import type { Span } from '../span/index.js';

/** A diagnostic on its way out of the machine. */
export class ScriptError extends Error {
  readonly diagnostic: Diagnostic;

  constructor(diagnostic: Diagnostic) {
    super(diagnostic.code);
    this.name = 'ScriptError';
    this.diagnostic = diagnostic;
  }
}

/**
 * Where a diagnostic points.
 *
 * A compiled program carries a line and a column per instruction and not an
 * offset, because `debug.pos` is a position in the source rather than an index
 * into text the engine was never given. When a host hands the engine the source
 * file as well, the offset is worked out from the position and a renderer can
 * draw the caret under the line; without it the line and the column still say
 * where, which is what an error message needs.
 */
export function spanAt(source: SourceFile | undefined, line: number, column: number): Span {
  if (source === undefined) return makeSpan(0, 0, line, column);
  return makeSpan(source.offsetAt({ line, column }), 0, line, column);
}

/** The position a load-time failure carries: the program, not a line of source. */
export const NO_POSITION: Span = makeSpan(0, 0, 0, 0);

export function raise<Code extends DiagnosticCode>(
  code: Code,
  span: Span,
  values: DiagnosticValues[Code],
): never {
  throw new ScriptError(diagnosticFor(code, span, values));
}

export function failure<Code extends DiagnosticCode>(
  code: Code,
  span: Span,
  values: DiagnosticValues[Code],
): Diagnostic {
  return diagnosticFor(code, span, values);
}

/**
 * A verification failure, `compiled-program.md` 3.5.
 *
 * One code covers a malformed instruction list, an unreadable encoding and an
 * input reference naming an input that was never declared, because they are not
 * separate fixes: all three are defects of the compiler that wrote the program
 * and none of them is repairable by hand.
 */
export function malformed(location: string, reason: string): Diagnostic {
  return failure('OS6018', NO_POSITION, { location, reason });
}

/** The location half of OS6018 for an instruction, in the spelling 3.5 gives. */
export function atInstruction(list: string, index: number): string {
  return list === 'code' ? `instruction ${index}` : `${list} instruction ${index}`;
}

/**
 * Whatever escaped that was not a diagnostic.
 *
 * A verified program cannot underflow the stack, jump out of bounds or address
 * a slot that does not exist, so an exception from inside the interpreter means
 * the program is not what verification said it was. It becomes a diagnostic on
 * this script rather than an exception in the host's render loop, which is the
 * whole of "one script failing takes nothing else down".
 */
export function unexpected(where: string, thrown: unknown): Diagnostic {
  const reason = thrown instanceof Error ? thrown.message : String(thrown);
  return malformed(where, `the engine could not execute it: ${reason}`);
}
