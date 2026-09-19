import type { Positioned } from '../span/index.js';
import type { Argument, NumberLiteral } from './expressions.js';

/**
 * The three lines that describe the file rather than compute anything: the
 * version line, the study or strategy declaration, and the limits line.
 *
 * All three are statements, and the tree lets them appear anywhere a statement
 * appears. The specification calls each one a statement (4, 13.1 and 10.7), and
 * more to the point the errors for putting one in the wrong place are OS1021,
 * OS2007 and OS2008, which name a line and suggest a move. A tree with one slot
 * for the declaration could not hold the second one long enough for OS2008 to
 * say where it was, and a tree that refused a file with no declaration at all
 * would turn OS2007 into a parse failure with nothing else checked.
 */

/**
 * `version 1`.
 *
 * `version` is not a reserved word: it is an ordinary identifier to the lexer,
 * recognised here by its position, so that a script written before the word
 * existed keeps compiling (language.md 3.4 and 4.1).
 */
export interface VersionLine extends Positioned {
  readonly kind: 'versionLine';
  readonly version: NumberLiteral;
}

/**
 * `study("Name", ...)` or `strategy("Name", ...)`, language.md 13.1.
 *
 * The form is kept as the word that was written rather than as a boolean,
 * because it is what OS2008 and OS7001 quote back to the reader, and because a
 * later version that adds a third form adds a member here rather than a second
 * flag.
 */
export interface ScriptDeclaration extends Positioned {
  readonly kind: 'scriptDeclaration';
  readonly form: 'study' | 'strategy';
  readonly args: readonly Argument[];
}

/**
 * `limits(loops = 50_000_000)`, language.md 10.7.
 *
 * Which options exist, that the values are literal numbers, and that the host
 * is willing to run them (OS5003) are all decided later. The tree carries the
 * arguments as written.
 */
export interface LimitsLine extends Positioned {
  readonly kind: 'limitsLine';
  readonly args: readonly Argument[];
}
