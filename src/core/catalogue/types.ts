/**
 * The shape of a catalogue entry, hand written because the generated files are
 * data and this is the contract they satisfy.
 */

/** What a diagnostic does to the run. An error stops it; a warning never does. */
export type Severity = 'error' | 'warning';

/** Which part of the pipeline raised a diagnostic. */
export type Stage = 'lex' | 'parse' | 'check' | 'runtime' | 'host';

/**
 * What a compiler puts into a message slot.
 *
 * Numbers are kept as numbers rather than pre-formatted strings so that a host
 * rendering a diagnostic in another language, or in a table, still has the
 * value rather than one rendering of it.
 */
export type PlaceholderValue = string | number;

/** One code, as the compiler needs it. */
export interface CatalogueEntry {
  readonly code: string;
  readonly title: string;
  readonly severity: Severity;
  readonly stage: Stage;
  /** The language version the code first appeared in. */
  readonly since: number;
  /** Whether an editor may apply the fix without asking a question. */
  readonly autofix: boolean;
  /** The message template, with {name} slots. */
  readonly message: string;
  /** The fix template, with {name} slots. Never a restatement of the message. */
  readonly fix: string;
  /** Every slot the two templates use. */
  readonly placeholders: readonly string[];
}
