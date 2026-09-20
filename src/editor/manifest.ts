/**
 * The standard library manifest, as the three functions that read it need it.
 *
 * `complete`, `hover` and `signature` all want the same things about a name:
 * which signature the writer means, how to spell that signature, what each
 * parameter defaults to, and the line the specification gives it. Every one of
 * those is a question the compiler already answers, and the whole value of this
 * file is that it asks rather than knows.
 *
 *     which entries a name has    the manifest index, `libraryEntries`
 *     what a parameter defaults   the manifest, or the emitter for the eight
 *                                 declaration calls
 *     what the call is for        `proseFor`, read out of `stdlib.md`'s own
 *                                 tables at build time, with the warmup its row
 *                                 states beside it
 *     what a type is called       `typeText`, the checker's own spelling
 *
 * A list of function names typed into this repository would be right on the day
 * it was typed and wrong at the next release, and a missing completion looks
 * exactly like a completion that has not loaded yet, so nobody would report it.
 *
 * ## The default is the compiler's, including for the eight that hide it
 *
 * Most calls carry their default in the manifest, spelled as `stdlib.md` prints
 * it. A `plot`, a `level`, a `table` and the five like them do not: their
 * optional arguments become fields of a declaration rather than arguments an
 * engine is passed, so their values live in the emitter
 * (`compiled-program.md` 2.3). A tooltip built on the manifest alone would show
 * a writer nothing beside `width?` while the compiler writes 1.5.
 *
 * So both are read, through `declarationDefaultText`, which is the same answer
 * `scripts/check-defaults.mjs` holds to what the specification prints. A default
 * shown here cannot differ from the one the compiler applies without failing the
 * build, which is the only way a tooltip's number is worth anything.
 */
import {
  DECLARATION_CALLS,
  declarationDefaultText,
  libraryEntries,
  typeText,
} from '../core/index.js';
import type { LibraryEntry } from '../core/index.js';

/** One parameter of a call, with everything a writer is shown about it. */
export interface Parameter {
  readonly name: string;
  /** The type as the checker spells it: `series number`, `array<line>`. */
  readonly type: string;
  /** Whether the call is refused without it, which is OS3012. */
  readonly required: boolean;
  /**
   * What an omitted argument resolves to, as the specification prints it.
   *
   * Nothing where the specification states no value: `spec/default-exceptions.json`
   * records those and why each one has none, and a number invented to fill the
   * gap would be the defect that file exists to keep out.
   */
  readonly defaultText: string | undefined;
  /** The closed set of strings it accepts, where the library fixes one: OS3008. */
  readonly values: readonly string[];
}

/** Every parameter of one signature, with the defaults from both homes. */
export function parametersOf(entry: LibraryEntry): readonly Parameter[] {
  const declared = DECLARATION_CALLS.has(entry.name);
  return entry.parameters.map((one) => ({
    name: one.name,
    type: typeText(one.type),
    required: !one.optional,
    defaultText: declared
      ? declarationDefaultText(entry.name, one.name)
      : one.defaultText,
    values: entry.values[one.name] ?? [],
  }));
}

/**
 * One signature, written out the way the specification's tables write one.
 *
 * `ema(src: series number, len: number) -> series number`. The parameter names,
 * the types and the defaults are the manifest's; nothing about the spelling is
 * decided here except the punctuation between them.
 */
export function signatureTextOf(entry: LibraryEntry): string {
  if (!entry.callable) return `${entry.name}: ${typeText(entry.returns)}`;
  const written = parametersOf(entry).map((one) => {
    const head = `${one.name}${one.required ? '' : '?'}: ${one.type}`;
    return one.defaultText === undefined ? head : `${head} = ${one.defaultText}`;
  });
  return `${entry.name}(${written.join(', ')}) -> ${typeText(entry.returns)}`;
}

/**
 * The signature a half written call means, chosen by the rule that can be
 * applied to a half written call.
 *
 * `stdlib.md` 2.2 resolves an overload by arity first and by argument type
 * second, and the checker does exactly that. The second rule needs a type for
 * every argument, which needs a tree, which a call that is still being typed has
 * not got: `clear(` is two signatures until the argument arrives. So only the
 * first rule is applied here, and where it leaves more than one candidate the
 * first is taken, which is the order `stdlib.md` states them in.
 *
 * That is a narrowing of the checker's answer rather than a second opinion about
 * it: the tooltip may show the array signature of `clear` while the writer meant
 * the grid one, and the moment the argument is written the checker settles it
 * and `diagnose` is what says so. It is recorded in `spec/editor-narrowings.json`.
 */
export function entryAt(name: string, given: number): LibraryEntry | undefined {
  const entries = libraryEntries(name).filter((one) => one.callable);
  const first = entries[0];
  if (first === undefined || entries.length === 1) return first;

  const byArity = entries.filter((one) => {
    const required = one.parameters.filter((parameter) => !parameter.optional).length;
    return given >= required && given <= one.parameters.length;
  });
  return byArity[0] ?? first;
}
