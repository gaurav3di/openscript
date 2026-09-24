/**
 * The tree the importer reads a source script into.
 *
 * It holds the subset of the source dialect the importer can say something
 * about, and one node for everything else: a statement the reader could not
 * take apart is kept whole as `refused`, carrying the few words that name what
 * it is, so the translator can report it and keep it as a comment without
 * having to understand it.
 */
import type { Remark } from './lexer.js';

/** A stretch of the input text: where a finding's caret goes. */
export interface Place {
  readonly offset: number;
  readonly length: number;
}

export type Expr =
  | { readonly kind: 'number'; readonly text: string; readonly at: Place }
  | { readonly kind: 'string'; readonly value: string; readonly at: Place }
  | { readonly kind: 'bool'; readonly value: boolean; readonly at: Place }
  | { readonly kind: 'color'; readonly text: string; readonly at: Place }
  | { readonly kind: 'name'; readonly name: string; readonly at: Place }
  | { readonly kind: 'member'; readonly object: Expr; readonly property: string; readonly at: Place }
  | { readonly kind: 'call'; readonly callee: Expr; readonly args: readonly Arg[]; readonly at: Place }
  | { readonly kind: 'index'; readonly target: Expr; readonly index: Expr; readonly at: Place }
  | { readonly kind: 'unary'; readonly op: string; readonly operand: Expr; readonly at: Place }
  | {
      readonly kind: 'binary';
      readonly op: string;
      readonly left: Expr;
      readonly right: Expr;
      readonly at: Place;
      readonly opAt: Place;
    }
  | {
      readonly kind: 'ternary';
      readonly condition: Expr;
      readonly then: Expr;
      readonly otherwise: Expr;
      readonly at: Place;
    }
  | { readonly kind: 'group'; readonly inner: Expr; readonly at: Place }
  | { readonly kind: 'list'; readonly items: readonly Expr[]; readonly at: Place };

export type CallExpr = Extract<Expr, { kind: 'call' }>;

export interface Arg {
  /** The label of a named argument, or undefined for a positional one. */
  readonly label: string | undefined;
  readonly value: Expr;
  readonly at: Place;
}

/** The physical lines of the input a statement covers, its block included. */
export interface Lines {
  readonly first: number;
  readonly last: number;
}

interface Common {
  /** The statement's head, where a finding about the whole statement points. */
  readonly at: Place;
  readonly lines: Lines;
  readonly remarks: readonly Remark[];
}

export interface Named {
  readonly name: string;
  readonly at: Place;
}

export interface Param {
  readonly name: string;
  readonly at: Place;
  readonly fallback: Expr | undefined;
}

export interface Branch {
  readonly condition: Expr;
  readonly body: Body;
}

export interface Arm {
  /** The value or condition the arm matches, undefined for the default arm. */
  readonly match: Expr | undefined;
  readonly body: Body;
}

export type Stmt =
  | (Common & {
      readonly kind: 'declare';
      readonly mode: 'plain' | 'var' | 'varip';
      readonly name: Named;
      readonly value: Expr;
    })
  | (Common & { readonly kind: 'tuple'; readonly names: readonly Named[]; readonly value: Expr })
  | (Common & { readonly kind: 'assign'; readonly op: string; readonly name: Named; readonly value: Expr })
  | (Common & { readonly kind: 'evaluate'; readonly expr: Expr })
  | (Common & { readonly kind: 'if'; readonly branches: readonly Branch[]; readonly otherwise: Body | undefined })
  | (Common & {
      readonly kind: 'for';
      readonly variable: Named;
      readonly from: Expr;
      readonly to: Expr;
      readonly by: Expr | undefined;
      readonly body: Body;
    })
  | (Common & { readonly kind: 'while'; readonly condition: Expr; readonly body: Body })
  | (Common & { readonly kind: 'switch'; readonly subject: Expr | undefined; readonly arms: readonly Arm[] })
  | (Common & { readonly kind: 'break' | 'continue' })
  | (Common & {
      readonly kind: 'function';
      readonly name: Named;
      readonly params: readonly Param[];
      readonly body: Expr | Body;
    })
  | (Common & {
      readonly kind: 'refused';
      /** A few words naming the form, which fill the finding's placeholder. */
      readonly construct: string;
      /** Names the statement would have declared, so what reads them follows it. */
      readonly declares: readonly Named[];
    });

export type Entry =
  | { readonly kind: 'stmt'; readonly stmt: Stmt }
  | { readonly kind: 'remark'; readonly remark: Remark }
  | { readonly kind: 'blank'; readonly line: number };

export type Body = readonly Entry[];

/** `ta.sma` for a member chain of plain names, and undefined for anything else. */
export function pathOf(expr: Expr): string | undefined {
  if (expr.kind === 'name') return expr.name;
  if (expr.kind !== 'member') return undefined;
  const base = pathOf(expr.object);
  return base === undefined ? undefined : `${base}.${expr.property}`;
}

/** The place covering two places and everything between them. */
export function joined(first: Place, last: Place): Place {
  return { offset: first.offset, length: Math.max(last.offset + last.length - first.offset, 0) };
}
