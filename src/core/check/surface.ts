/**
 * The library as one surface, and the questions the checker asks of it.
 *
 * The four data files are split by what a call does rather than by anything the
 * checker cares about, so that each one sits beside the section of `stdlib.md`
 * it was transcribed from and a reader can check them against each other a
 * table at a time.
 *
 * Two names carry more than one entry on purpose. `close` is a built-in series
 * read bare and an order function written with brackets (`stdlib.md` 3.2), and
 * `clear` empties an array or a grid depending on what it is handed (14.3). The
 * index holds a list per name for exactly this, and a call site picks by arity
 * and by argument type, at compile time, with no run-time dispatch anywhere.
 */
import { BAR_ENTRIES, COLOUR_NAMES } from './library-bars.js';
import { ORDER_ENTRIES, ORDER_NAMES } from './library-orders.js';
import { OUTPUT_ENTRIES, REQUEST_NAMES, TOP_LEVEL_NAMES } from './library-output.js';
import { SERIES_ENTRIES } from './library-series.js';
import { LIBRARY_PROSE } from './library-prose.generated.js';
import type { LibraryProse } from './library-prose.generated.js';
import { indexOf } from './library.js';
import type { LibraryEntry, LibraryIndex } from './library.js';

export { BAR_SERIES, COLOUR_NAMES } from './library-bars.js';
export { ORDER_NAMES } from './library-orders.js';
export { REQUEST_NAMES, TOP_LEVEL_NAMES } from './library-output.js';

/**
 * The closed list of namespaces, `language.md` 15.2.
 *
 * A dotted name whose first part is not one of these is not a namespace read at
 * all: it is a member of a value, and version 1 has no such thing, so the
 * checker can say so instead of guessing which of the two the writer meant.
 */
export const NAMESPACES: readonly string[] = [
  'bar',
  'chart',
  'session',
  'date',
  'str',
  'math',
  'pos',
  'order',
  'leg',
  'book',
  'draw',
  'req',
];

/** The namespaces that exist only in a `strategy()` file, `language.md` 15.2. */
export const STRATEGY_NAMESPACES: readonly string[] = ['pos', 'order', 'leg', 'book'];

const ENTRIES: readonly LibraryEntry[] = [
  ...BAR_ENTRIES,
  ...SERIES_ENTRIES,
  ...OUTPUT_ENTRIES,
  ...ORDER_ENTRIES,
];

const INDEX: LibraryIndex = indexOf(ENTRIES);

/** Every signature of one name, or nothing when the library has no such name. */
export function libraryEntries(name: string): readonly LibraryEntry[] {
  return INDEX.get(name) ?? [];
}

export function isLibraryName(name: string): boolean {
  return INDEX.has(name);
}

/** Every name in the global scope, for the "did you mean" of OS2001 and OS2010. */
export function libraryNames(): readonly string[] {
  return [...INDEX.keys()];
}

/** The members of one namespace, spelled bare, for OS2009's suggestion. */
export function membersOf(namespace: string): readonly string[] {
  const prefix = `${namespace}.`;
  return libraryNames()
    .filter((name) => name.startsWith(prefix))
    .map((name) => name.slice(prefix.length));
}

export function isNamespace(name: string): boolean {
  return NAMESPACES.includes(name);
}

export function isColourName(name: string): boolean {
  return COLOUR_NAMES.includes(name);
}

/** Whether every entry of a name is only available in a `strategy()` file. */
export function isStrategyOnly(name: string): boolean {
  const entries = libraryEntries(name);
  return entries.length > 0 && entries.every((one) => one.strategyOnly);
}

/** Whether the name is a bare order function, which `close` is one spelling of. */
export function isOrderName(name: string): boolean {
  return ORDER_NAMES.includes(name) || name.startsWith('order.');
}

/** Whether the call is one of the two higher timeframe reads of stdlib.md 15.1. */
export function isRequestName(name: string): boolean {
  return REQUEST_NAMES.includes(name);
}

/**
 * Whether the call declares part of the file's fixed shape.
 *
 * `input` is deliberately not in this list. Its refusal is OS3007 rather than
 * OS3006 because the fix is different: a plot has to move out of the branch,
 * and an input has to move out and be read from inside it.
 */
export function isTopLevelOnly(name: string): boolean {
  return TOP_LEVEL_NAMES.includes(name);
}

export type { LibraryProse } from './library-prose.generated.js';

/**
 * What the specification says about a name, or nothing where it says nothing.
 *
 * Two cells of the name's own row in the specification: the line on what it is
 * for, and the first bar it can produce a value for. Read from `stdlib.md`'s own
 * tables at build time, by `scripts/generate-library-prose.mjs`, and never
 * written down here. A description typed into this repository twice is a
 * description that disagrees with itself the first time either copy is edited,
 * and the copy an editor shows a writer is the one nobody proofreads.
 *
 * **What comes back is one line per name, not one per signature.** A name with
 * several signatures is described by the first row the specification states for
 * it, because the map is keyed by name; `close` is the case to have in mind,
 * where the row is the bar series rather than the order function.
 *
 * Nothing comes back for the nineteen named colours. `stdlib.md` 11.1 lists
 * them in a block rather than in a table and says their channel values are the
 * description, which `namedColour` answers.
 */
export function proseFor(name: string): LibraryProse | undefined {
  return Object.prototype.hasOwnProperty.call(LIBRARY_PROSE, name)
    ? LIBRARY_PROSE[name]
    : undefined;
}

/** Every name the specification describes, for the check that the two agree. */
export function describedNames(): readonly string[] {
  return Object.keys(LIBRARY_PROSE);
}
