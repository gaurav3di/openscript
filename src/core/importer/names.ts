/**
 * Scopes, and the name each source name is written as.
 *
 * Two rules of the source dialect differ from OpenScript's, and both are about
 * meaning rather than spelling. A declaration inside a block or a function
 * always makes a new name there, hiding any outer name it shares a spelling
 * with, where OpenScript updates the outer name instead and refuses to hide one
 * (`language.md` 12.2 and 12.3). And the source dialect's built-ins live behind
 * namespaces, so `rsi` or `step` is an ordinary name there and a library name or
 * a reserved word here.
 *
 * So a declaration that would hide a visible name is renamed with a number, and
 * a name OpenScript reserves or defines is renamed with `Value` after it. Every
 * new spelling is checked against every name the source uses anywhere and every
 * name OpenScript has, so a rename can never land on another name. Nothing
 * else is renamed: a name that collides with neither keeps its spelling, and
 * two sibling blocks may both declare it, as both languages allow.
 */
import { NAMESPACES, isLibraryName } from '../check/index.js';
import { canonicalNumber } from '../emit/index.js';
import { RESERVED_WORDS } from '../tokens/index.js';

export type BindingKind = 'variable' | 'function' | 'parameter' | 'loop';

export interface Binding {
  readonly output: string;
  readonly kind: BindingKind;
  readonly topLevel: boolean;
  /** Bound to a declaration handle, which only `fill` may take. */
  handle: 'plot' | 'level' | undefined;
  /** Never absent on any bar: bound to an input or a literal and never reassigned. */
  present: boolean;
  /** A whole-number constant in the source dialect's sense, which version 5 divides without a fraction. */
  whole: boolean;
  /** A function's parameters, source spelling to output spelling, for its named arguments. */
  labels: ReadonlyMap<string, string> | undefined;
}

/** Words OpenScript gives a meaning of its own outside the library. */
const DECLARATION_WORDS = ['study', 'strategy', 'limits', 'version'];

export class Scope {
  readonly names = new Map<string, Binding>();
  readonly parent: Scope | undefined;

  constructor(parent: Scope | undefined) {
    this.parent = parent;
  }

  find(name: string): Binding | undefined {
    return this.names.get(name) ?? this.parent?.find(name);
  }

  get isGlobal(): boolean {
    return this.parent === undefined;
  }
}

export class Namer {
  readonly #taken: Set<string>;

  /** `used` is every identifier the source writes, anywhere. */
  constructor(used: Iterable<string>) {
    this.#taken = new Set(used);
  }

  /** Whether OpenScript already means something by this name. */
  static reserved(name: string): boolean {
    return (
      (RESERVED_WORDS as readonly string[]).includes(name) ||
      isLibraryName(name) ||
      NAMESPACES.includes(name) ||
      DECLARATION_WORDS.includes(name)
    );
  }

  /** A spelling no source name and no OpenScript name has, starting from `base`. */
  fresh(base: string): string {
    let candidate = base;
    for (let n = 2; this.#taken.has(candidate) || Namer.reserved(candidate); n += 1) {
      candidate = `${base}${canonicalNumber(n)}`;
    }
    this.#taken.add(candidate);
    return candidate;
  }

  /**
   * The spelling of a source name declared in `scope`.
   *
   * `hides` says whether an enclosing scope can already see the name, which is
   * the case the source dialect reads as a new name and OpenScript would read
   * as an update of the old one.
   */
  declare(name: string, hides: boolean): string {
    if (Namer.reserved(name)) return this.fresh(`${name}Value`);
    if (hides) return this.fresh(name);
    return name;
  }
}

/** A binding with the defaults a plain declaration has. */
export function binding(output: string, kind: BindingKind, topLevel: boolean): Binding {
  return { output, kind, topLevel, handle: undefined, present: false, whole: false, labels: undefined };
}
