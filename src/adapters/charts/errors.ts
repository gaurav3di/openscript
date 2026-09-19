/**
 * How the adapter tells a chart that a study cannot be drawn.
 *
 * The engine's surface never throws: it returns a diagnostic. The chart's
 * surface is the opposite, because a descriptor's `calc` has nowhere else to
 * put a failure, so this is where the one becomes the other. Nothing is
 * invented on the way across: the diagnostic the engine produced is carried
 * whole, with its catalogue code, its source position and its fix, and the
 * thrown error's message is the sentence the catalogue already wrote.
 *
 * **The name is what a chart reads.** The chart's runtime tells a bad input,
 * which a user can fix from the settings dialog, from a defect, which they
 * cannot, by the error's name. So a failure raised before any bar ran is named
 * as an input error, because everything refused at load is a setting, a limit
 * or a capability the host chose, and a failure raised on a bar keeps this
 * adapter's own name, because a script that computed four thousand bars and
 * then stopped is not something a settings dialog can repair.
 */
import type { Diagnostic } from '../../core/index.js';

/** The name the chart's runtime reads for a condition a user can fix. */
const INPUT_ERROR = 'IndicatorInputError';

/** The name for a failure that is not about a setting. */
const SCRIPT_ERROR = 'OpenScriptError';

export class ChartAdapterError extends Error {
  readonly diagnostic: Diagnostic;

  constructor(diagnostic: Diagnostic, name: string) {
    super(`${diagnostic.code}: ${diagnostic.message} ${diagnostic.fix}`);
    this.name = name;
    this.diagnostic = diagnostic;
  }
}

/** A refusal at load: the program never ran, so a setting is what to change. */
export function refused(diagnostic: Diagnostic): ChartAdapterError {
  return new ChartAdapterError(diagnostic, INPUT_ERROR);
}

/** A failure on a bar: the program ran and stopped. */
export function stopped(diagnostic: Diagnostic): ChartAdapterError {
  return new ChartAdapterError(diagnostic, SCRIPT_ERROR);
}
