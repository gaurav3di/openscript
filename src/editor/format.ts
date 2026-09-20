/**
 * `format`: source text in, the same program in its canonical layout out.
 *
 * ## The rule that makes a format button safe to press
 *
 * **Formatting a source must not change what it means.** A trader presses this
 * on a script that is holding a position. If a reprint can change a number, the
 * button is a hazard whatever else it does for the diff.
 *
 * That is not asserted here, it is proved twice over:
 *
 * - **Per call, before this function returns.** The output is lexed again and
 *   compared with the tokens that went in, token for token. If anything moved,
 *   the source is returned untouched. The parser reads nothing but the token
 *   stream, so an identical stream is an identical tree, and an identical tree
 *   is an identical program. A formatter that is wrong about a rule therefore
 *   fails by doing nothing, which is the only acceptable way for it to fail.
 * - **Over a corpus, in the suite.** `tests/editor/format.test.ts` formats every
 *   example in the repository and every script the phase gates run, compiles
 *   both texts, and asserts the compiled programs are identical. That is the
 *   test that says the formatter works; the check above is what says it is safe
 *   when it does not.
 *
 * ## A source that does not parse
 *
 * It is returned unchanged. Not reformatted as best it can be, and not partly
 * reformatted: unchanged, exactly, including its line endings.
 *
 * The reason is what a diagnostic from either stage means. The lexer reports a
 * character it could not read and emits no token for it, so a reprint from the
 * token stream would delete it, and a reader would watch a character disappear
 * from their file. The parser reports a line it could not read and recovers, so
 * the tree describes a program nobody wrote and the three questions the spacing
 * rules ask of it have no trustworthy answers. Neither is a file to lay out. A
 * host formats on demand rather than on every keystroke, and a file mid-edit is
 * simply left alone until it reads.
 */
import type { Token } from '../core/index.js';
import { layOut } from './layout.js';
import { readTree } from './reading.js';
import { scan } from './scan.js';
import { shapesOf } from './spacing.js';

/**
 * Whether two token streams are the same stream.
 *
 * Kind and text for everything, except the indent token, whose text is the
 * leading whitespace of the line it opens and is exactly what a formatter is
 * allowed to change. It is the only token that carries layout as text: a
 * newline, a dedent and the end of the file have none.
 *
 * Spans are not compared, and must not be: every one of them moves when a line
 * is re-indented, which is the whole point of the exercise.
 */
function sameStream(before: readonly Token[], after: readonly Token[]): boolean {
  if (before.length !== after.length) return false;
  for (const [at, token] of before.entries()) {
    const other = after[at];
    if (other === undefined || other.kind !== token.kind) return false;
    if (token.kind !== 'indent' && other.text !== token.text) return false;
  }
  return true;
}

/**
 * The canonical layout of a source, or the source itself where it cannot be
 * given one safely.
 *
 * The output always ends in a single line ending and uses LF, because a file is
 * normalised before anything reads it (`language.md` 3.1). A host holding CRLF
 * text gets LF back, which is the same file to the compiler and to every other
 * part of this project.
 */
export function format(source: string): string {
  const held = readTree(source);
  if (!held.bag.isEmpty) return source;

  const shapes = shapesOf(held.script, held.tokens);
  const out = layOut(held.file, held.tokens, scan(held.file, held.tokens), shapes);

  const again = readTree(out);
  if (!again.bag.isEmpty) return source;
  if (!sameStream(held.tokens, again.tokens)) return source;
  return out;
}
