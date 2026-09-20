/**
 * `complete`: what may be written at a position.
 *
 * Four kinds of answer, and every one of them is read out of something the
 * compiler already holds:
 *
 *     the members of a namespace   `membersOf`, after `draw.`
 *     the named arguments of the   the manifest's parameters for the call the
 *     call being written           brackets say the cursor is inside
 *     the file's own names         the checker's bindings, filtered by the two
 *                                  scope rules of `scope.ts`
 *     the library's names          `libraryNames`, the same index the checker
 *                                  resolves against and the example check reads
 *                                  its globals from
 *
 * **A hand written list of function names is the exact failure this project
 * keeps removing.** It would be right on the day it was written and wrong at the
 * next release, and nobody would report it, because a missing completion is
 * indistinguishable from a completion that has not loaded yet. Nothing below
 * names a single function of the language.
 *
 * ## A planned call is offered, and is marked as one
 *
 * `stdlib.md` lists calls that are named and not implemented, so that the gap in
 * the surface is visible rather than looking like an oversight. Writing one is
 * OS2020.
 *
 * Three answers were possible: leave them out, offer them as though they worked,
 * or offer them marked. Leaving them out is the worst of the three, because the
 * writer then types the name from the documentation, gets no completion, and
 * learns nothing about why; offering them unmarked walks somebody into OS2020
 * with a plot that will not compile.
 *
 * So they are offered, they sort after everything a script may write today, and
 * each one carries `refusal`, which is **the catalogue's own OS2020 message
 * filled with that name**. A host greys the row, shows the sentence, or drops
 * the row with one field, and the sentence it shows is the same sentence the
 * compiler would produce, because it came from the same catalogue.
 */
import {
  NAMESPACES,
  entryFor,
  fillTemplate,
  isNamespace,
  libraryEntries,
  libraryNames,
  membersOf,
  proseFor,
  typeText,
} from '../core/index.js';
import type { Binding, LibraryEntry, Span } from '../core/index.js';
import { entryAt, parametersOf, signatureTextOf } from './manifest.js';
import { readChecked } from './reading.js';
import { inScopeAt } from './scope.js';
import { siteAt } from './site.js';

/**
 * What a completion is, which decides the icon a host puts beside it.
 *
 * `value` is a library name read without brackets, `close` and `aqua` among
 * them; `function` is one that is called. The two are the manifest's own
 * `callable`, not a guess from the spelling.
 */
export type CompletionKind =
  | 'function'
  | 'value'
  | 'namespace'
  | 'member'
  | 'variable'
  | 'argument';

export interface Completion {
  /** What the row reads as: the name, or the parameter for a named argument. */
  readonly label: string;
  /**
   * What a host puts into the text, which is not always the label.
   *
   * A named argument is written `len = `, so accepting the row leaves the caret
   * where the value goes rather than beside a label with no equals sign.
   */
  readonly insert: string;
  readonly kind: CompletionKind;
  /** The signature or the type, spelled by the manifest and the checker. */
  readonly detail: string;
  /** The line the specification gives it, where it gives one. */
  readonly summary: string | undefined;
  /** Named in the library and not implemented in this version: OS2020. */
  readonly planned: boolean;
  /** The catalogue's OS2020 message for this name, on a planned row and no other. */
  readonly refusal: string | undefined;
  /** The text the row replaces, which is the word being typed or nothing. */
  readonly replace: Span;
}

/** The order a host shows them in, decided here so two hosts agree. */
const ORDER: Readonly<Record<CompletionKind, number>> = {
  argument: 0,
  variable: 1,
  function: 2,
  member: 2,
  value: 3,
  namespace: 4,
};

/**
 * The order, and the two things that decide it.
 *
 * Named arguments keep the order the signature states them in, because that is
 * the order they are written in and an alphabetical list of them would put
 * `len` before `src` in a call whose first argument is the source. Everything
 * else is sorted: a planned call after every call a script may write today,
 * then the kinds above, then the name.
 *
 * The name comparison has no locale in it. `compiled-program.md` 8.4 forbids
 * one, and it is the same rule here for the same reason: two machines set
 * differently would order a list differently, and the machine set differently is
 * the one nobody is looking at.
 */
function ordered(completions: readonly Completion[]): readonly Completion[] {
  const written = completions.filter((one) => one.kind === 'argument');
  const rest = completions.filter((one) => one.kind !== 'argument');
  rest.sort((a, b) => {
    if (a.planned !== b.planned) return a.planned ? 1 : -1;
    const kind = (ORDER[a.kind] ?? 0) - (ORDER[b.kind] ?? 0);
    if (kind !== 0) return kind;
    if (a.label === b.label) return 0;
    return a.label < b.label ? -1 : 1;
  });
  return [...written, ...rest];
}

/** The OS2020 sentence, filled with the name, for a call that is not here yet. */
function refusalFor(name: string): string {
  return fillTemplate(entryFor('OS2020').message, { name });
}

function fromEntry(
  entry: LibraryEntry,
  label: string,
  kind: CompletionKind,
  replace: Span,
): Completion {
  return {
    label,
    insert: label,
    kind,
    detail: signatureTextOf(entry),
    summary: proseFor(entry.name)?.summary,
    planned: entry.planned,
    refusal: entry.planned ? refusalFor(entry.name) : undefined,
    replace,
  };
}

/**
 * One row per library name, taking the first signature for the detail.
 *
 * A name with several signatures is one row and not several: `clear` is one
 * thing to write and two things to write it about, and a list that showed it
 * twice would be a list about the manifest rather than about the language.
 * `signature` is what tells a writer which one they are in once they have
 * opened the bracket.
 */
function libraryRow(name: string, replace: Span): Completion | undefined {
  const entries = libraryEntries(name);
  const entry = entries[0];
  if (entry === undefined) return undefined;
  return fromEntry(entry, name, entry.callable ? 'function' : 'value', replace);
}

/** A name the file declared, with the type and the storage the checker gave it. */
function declaredRow(binding: Binding, replace: Span): Completion {
  const kind: CompletionKind = binding.kind === 'function' ? 'function' : 'variable';
  const persistence = binding.persistence === 'none' ? '' : `${binding.persistence} `;
  return {
    label: binding.name,
    insert: binding.name,
    kind,
    detail: `${persistence}${binding.name}: ${typeText(binding.type)}`,
    summary: undefined,
    planned: false,
    refusal: undefined,
    replace,
  };
}

/**
 * Everything that may be written at an offset, most useful first.
 *
 * Rows are filtered by the word already typed, which is compared exactly:
 * `language.md` makes names case sensitive, so `EM` is not a start of `ema` and
 * offering it would be offering a name that does not compile.
 */
export function complete(source: string, offset: number): readonly Completion[] {
  const { file, tokens, checked } = readChecked(source);
  const site = siteAt(file, tokens, offset);
  const at = site.replace.offset;

  const rows: Completion[] = [];

  // After a dot, the only thing that may be written is a member of the
  // namespace, and only where the name before the dot is one. A dotted read of
  // anything else is not a member read at all in version 1 (`language.md` 15.2),
  // so there is nothing to offer rather than the whole library offered wrongly.
  if (site.afterDot) {
    const namespace = site.namespace;
    if (namespace !== undefined && isNamespace(namespace)) {
      for (const member of membersOf(namespace)) {
        const entry = libraryEntries(`${namespace}.${member}`)[0];
        if (entry !== undefined) rows.push(fromEntry(entry, member, 'member', site.replace));
      }
    }
    return ordered(rows.filter((row) => row.label.startsWith(site.word)));
  }

  // The named arguments of the call being written, where one is being written
  // and the label of this argument has not been decided yet.
  const call = site.call;
  if (call !== undefined && call.label === undefined) {
    const entry = entryAt(call.name, call.argument + 1);
    if (entry !== undefined) {
      for (const parameter of parametersOf(entry)) {
        if (call.labels.includes(parameter.name)) continue;
        rows.push({
          label: parameter.name,
          insert: `${parameter.name} = `,
          kind: 'argument',
          detail:
            `${parameter.name}: ${parameter.type}` +
            (parameter.defaultText === undefined ? '' : ` = ${parameter.defaultText}`),
          summary: undefined,
          planned: entry.planned,
          refusal: entry.planned ? refusalFor(entry.name) : undefined,
          replace: site.replace,
        });
      }
    }
  }

  for (const binding of inScopeAt(checked, at)) {
    rows.push(declaredRow(binding, site.replace));
  }

  for (const name of libraryNames()) {
    // A dotted name is reached through its namespace and not written whole from
    // nothing, so the namespace is the row and `membersOf` is the rest.
    if (name.includes('.')) continue;
    const row = libraryRow(name, site.replace);
    if (row !== undefined) rows.push(row);
  }

  for (const namespace of NAMESPACES) {
    rows.push({
      label: namespace,
      insert: `${namespace}.`,
      kind: 'namespace',
      detail: `${namespace}.`,
      summary: undefined,
      planned: false,
      refusal: undefined,
      replace: site.replace,
    });
  }

  return ordered(rows.filter((row) => row.label.startsWith(site.word)));
}
