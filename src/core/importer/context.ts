/**
 * What the translators share while they work through one script.
 *
 * A translation is kept or refused per top level statement, never per line
 * inside one: a block with one line missing is a block that means something
 * the original did not, so the unit that is kept as a comment is the whole
 * statement at the top level. `Node` is that unit, and everything a refusal or
 * a warning needs to point at is recorded against it rather than decided on the
 * spot, because a statement translated now can still be refused later: by the
 * compiler, or because an earlier statement it reads was refused.
 */
import type { Diagnostic } from '../diagnostics/index.js';
import { canonicalNumber } from '../emit/index.js';
import type { SourceFile } from '../source/index.js';
import type { Span } from '../span/index.js';
import { Namer, Scope } from './names.js';
import type { Binding } from './names.js';
import type { Expr, Lines, Named, Place, Stmt } from './syntax.js';

export interface OutLine {
  readonly depth: number;
  readonly text: string;
}

/** A finding on a statement that is kept, and the key that makes it once per script where it is once per built-in. */
export interface Note {
  readonly diagnostic: Diagnostic;
  readonly once: string | undefined;
}

export interface Node {
  readonly stmt: Stmt;
  readonly lines: Lines;
  /** Top level names the statement declares, so what reads them can follow it. */
  readonly declares: readonly Named[];
  /** Top level names it reads, in source order, with where. */
  readonly reads: Named[];
  output: OutLine[];
  /** Why its translation was refused, if it was. */
  refusal: Diagnostic | undefined;
  /** Why the compiler refused the translation, if it did. */
  failed: Diagnostic | undefined;
  /** Why it reads a name a refused statement declared, recomputed on every pass. */
  lost: Diagnostic | undefined;
  readonly notes: Note[];
  /** The declaration, which is placed first and is never kept as a comment. */
  readonly declaration: boolean;
}

export function isKept(node: Node): boolean {
  return node.refusal === undefined && node.failed === undefined && node.lost === undefined;
}

/** The first reason a node is not kept, in the order the reasons are found. */
export function reasonOf(node: Node): Diagnostic | undefined {
  return node.refusal ?? node.failed ?? node.lost;
}

export type Version = 5 | 6;

export interface Reassignment {
  readonly op: string;
  readonly value: Expr;
}

/** Everything about the script the translators need before they start. */
export interface Facts {
  readonly file: SourceFile;
  readonly version: Version;
  /** Every identifier the source writes. */
  readonly used: ReadonlySet<string>;
  /**
   * Every reassignment the source makes, by name, anywhere in the file. A name
   * with any is never a constant, and is present only if every value it is
   * given is.
   */
  readonly reassigned: ReadonlyMap<string, readonly Reassignment[]>;
  /**
   * Every name the file declares at the top level, wherever. OpenScript lets a
   * block or a function see one declared below it, so an inner declaration of
   * the same name is renamed, which the source dialect's meaning allows.
   */
  readonly globals: ReadonlySet<string>;
  /** The side each literal entry id opens, from the script's entry calls. */
  readonly entries: ReadonlyMap<string, 'long' | 'short'>;
}

export class Context {
  readonly namer: Namer;
  readonly fileScope = new Scope(undefined);
  scope: Scope = this.fileScope;
  /** The statement being translated. */
  node: Node | undefined;
  /** Lines a statement needs evaluated before it, and whether it may have them. */
  hoisted: OutLine[] = [];
  mayHoist = false;
  /** Inside a ternary arm, where the source dialect evaluates lazily as OpenScript does. */
  lazy = 0;
  depth = 0;
  /** The declaration's pyramiding, read as the source dialect reads it: 0 is 1. */
  pyramiding = 1;
  /**
   * Whether the declaration sizes orders in units. The source dialect counts a
   * quantity written on an entry in contracts whatever the declaration says,
   * and OpenScript counts it in the declaration's own unit.
   */
  qtyInUnits = true;
  readonly titles = new Map<string, Set<string>>();
  readonly facts: Facts;

  constructor(facts: Facts) {
    this.facts = facts;
    this.namer = new Namer(facts.used);
  }

  span(at: Place): Span {
    return this.facts.file.spanAt(at.offset, at.length);
  }

  /** Records the first reason the current statement cannot be translated. */
  refuse(diagnostic: Diagnostic): void {
    if (this.node !== undefined && this.node.refusal === undefined) this.node.refusal = diagnostic;
  }

  get refused(): boolean {
    return this.node?.refusal !== undefined;
  }

  note(diagnostic: Diagnostic, once?: string): void {
    this.node?.notes.push({ diagnostic, once });
  }

  /** Whether declaring `name` in the current scope needs a new spelling to keep it apart. */
  hides(name: string): boolean {
    return this.scope.find(name) !== undefined || (!this.scope.isGlobal && this.facts.globals.has(name));
  }

  /** The binding a source name has here, recording a read of a top level one. */
  lookup(name: string, at: Place): Binding | undefined {
    const found = this.scope.find(name);
    if (found !== undefined && found.topLevel) this.node?.reads.push({ name, at });
    return found;
  }

  /** Enters a block scope for the length of `work`. */
  within<T>(work: () => T): T {
    const outer = this.scope;
    this.scope = new Scope(outer);
    try {
      return work();
    } finally {
      this.scope = outer;
    }
  }

  /**
   * Moves an expression to its own line before the current statement, and
   * returns the name it is read under, or undefined where it cannot be moved.
   */
  hoist(text: string): string | undefined {
    if (!this.mayHoist || this.lazy > 0) return undefined;
    const name = this.namer.fresh('everyBar');
    this.hoisted.push({ depth: this.depth, text: `${name} = ${text}` });
    return name;
  }

  /** A title for a declared output that no other output of its kind has. */
  title(kind: string, wanted: string): string {
    let seen = this.titles.get(kind);
    if (seen === undefined) {
      seen = new Set();
      this.titles.set(kind, seen);
    }
    let title = wanted;
    for (let n = 2; seen.has(title); n += 1) title = `${wanted} ${canonicalNumber(n)}`;
    seen.add(title);
    return title;
  }
}

const HEX = '0123456789abcdef';

/** A string literal in OpenScript's spelling of it (`language.md` 3.6). */
export function quoted(value: string): string {
  let out = '"';
  for (const c of value) {
    const code = c.codePointAt(0) ?? 0;
    if (c === '"') out += '\\"';
    else if (c === '\\') out += '\\\\';
    else if (c === '\n') out += '\\n';
    else if (c === '\t') out += '\\t';
    else if (c === '\r') out += '\\r';
    else if (code < 0x20) out += `\\u00${HEX[code >> 4] ?? '0'}${HEX[code & 15] ?? '0'}`;
    else out += c;
  }
  return `${out}"`;
}
