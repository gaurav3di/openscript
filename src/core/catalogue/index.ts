/**
 * The error catalogue, as the compiler sees it.
 *
 * Every code, message and fix in OpenScript comes from spec/errors.json and is
 * generated into this module. No stage anywhere retypes one, so the words a
 * trader reads on screen and the words on the documentation page are the same
 * words by construction rather than by review.
 */
export type { CatalogueEntry, PlaceholderValue, Severity, Stage } from './types.js';
export type { DiagnosticCode } from './catalogue.generated.js';
export type { DiagnosticValues } from './values.generated.js';

export {
  CATALOGUE_LANGUAGE_VERSION,
  CATALOGUE_SCHEMA_VERSION,
  STAGE_LABELS,
} from './catalogue.generated.js';

export { allCodes, entryFor, isDiagnosticCode } from './lookup.js';
export { fillTemplate, slotsIn } from './template.js';
