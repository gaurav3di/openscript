import { ENTRIES } from './catalogue.generated.js';
import type { DiagnosticCode } from './catalogue.generated.js';
import type { CatalogueEntry } from './types.js';

/** What a code says. The argument type means there is no missing case. */
export function entryFor(code: DiagnosticCode): CatalogueEntry {
  return ENTRIES[code];
}

/**
 * Whether a string is a code this compiler knows.
 *
 * A host reading a code out of a saved report or a log has a string, not a
 * DiagnosticCode, and this is the one place that turns one into the other.
 */
export function isDiagnosticCode(text: string): text is DiagnosticCode {
  return Object.hasOwn(ENTRIES, text);
}

/** Every code, ascending. */
export function allCodes(): readonly DiagnosticCode[] {
  return Object.keys(ENTRIES) as DiagnosticCode[];
}
