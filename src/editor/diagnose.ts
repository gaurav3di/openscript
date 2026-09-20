/**
 * `diagnose`: source text in, everything the compiler has to say about it out.
 *
 * This is the one a trader sees most. It runs on a debounce while somebody
 * types, so two things about it are decisions rather than details: what it
 * costs, and what it does with a file that does not parse.
 *
 * ## It is the whole compile, on purpose
 *
 * Lexer, parser, checker, emitter. Not a subset, and not a faster partial
 * compiler written for the editor, because a second implementation of the
 * language is the thing this project refuses to have: the editor is the compiler
 * wearing a different hat.
 *
 * It matters concretely as well as in principle. There are codes a script can
 * carry that the emitter raises and nothing before it does, so an editor that
 * stopped after the checker would show a clean file and then refuse it the
 * moment somebody pressed apply. What a host sees here is exactly what a compile
 * produces, so nothing new can appear at apply, and a test holds that by taking
 * a file whose only fault the emitter is the one to find.
 *
 * ## What it costs
 *
 * A full compile of a ninety line study is a third of a millisecond, and the
 * same file with a bracket left open mid way through, which is what a file looks
 * like the moment somebody types one, is about a millisecond. Both are in the
 * benchmark suite with a budget, as `diagnose-heavy` and `diagnose-typing`, so a
 * change that makes the editor cost ten times what it costs today fails the
 * build rather than being felt by a trader.
 *
 * That is why there is no partial compiler here. At this price, one is not worth
 * the second implementation it would cost; if a script ever arrives that makes
 * it worth one, the number to beat is in the benchmark table rather than in
 * somebody's impression.
 *
 * ## A file that does not parse
 *
 * That is the normal state of a file being typed into, so it is the case this
 * has to be good at rather than the case it survives. Every stage of this
 * compiler recovers and reports instead of throwing: a lexical error costs its
 * own character, a statement that will not parse costs its own line, a name that
 * does not resolve becomes `unknown` and the lines around it are still checked.
 * So a half typed file produces the diagnostics its finished lines have earned,
 * plus the one about the line being typed, and nothing here needs a try block to
 * make that true. `tests/editor/diagnose.test.ts` puts a corpus of malformed
 * files through it, including text that is not the language at all.
 */
import { check, emit } from '../core/index.js';
import type { Diagnostic } from '../core/index.js';
import { readTree } from './reading.js';

/**
 * Every diagnostic a compile of this source produces, in the order a reader
 * walks the file.
 *
 * Each one carries its code, its span, its message and its fix, because that is
 * what a `Diagnostic` is: the stage that raised it supplied the code and the
 * span, and everything a person reads came from the error catalogue. There is no
 * editor-shaped diagnostic type here for the same reason there is no editor
 * compiler. A host that renders one in a panel and a terminal that renders the
 * same one under a caret are looking at the same record.
 *
 * The order is the bag's own: by offset, then by the span's length, then by code
 * point of the code. It depends on nothing outside the file, so two machines
 * list them identically.
 */
export function diagnose(source: string): readonly Diagnostic[] {
  const { file, bag, script } = readTree(source);
  emit(file, check(file, script, bag), bag, {});
  return bag.ordered();
}
