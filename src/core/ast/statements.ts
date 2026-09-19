import type { Positioned } from '../span/index.js';
import type { TypeAnnotation } from './annotations.js';
import type { Expression } from './expressions.js';
import type { LimitsLine, ScriptDeclaration, VersionLine } from './header.js';
import type { Name } from './name.js';

/**
 * Every statement form of language.md section 10, plus the block they nest in.
 *
 * There is no statement that is also an expression and no expression that is
 * also a statement: assignment is a statement (10.1), and `switch` is a
 * statement rather than a value (10.6). That is why `if x = 5` can be OS1006
 * with a fix naming `==` instead of a type error three stages later.
 */

export const ASSIGNMENT_OPERATORS = ['=', '+=', '-=', '*=', '/=', '%='] as const;
export type AssignmentOperator = (typeof ASSIGNMENT_OPERATORS)[number];

/**
 * The indented lines under a header, language.md 3.10.
 *
 * A block is a node with a span of its own so that OS1003 and OS1010 have
 * something to point at, and so an editor can fold one. Blank and comment only
 * lines produce no token, so they are not statements and never appear here.
 */
export interface Block extends Positioned {
  readonly kind: 'block';
  readonly statements: readonly Statement[];
}

/** A bare expression on a line, which is how a script calls `plot` or `signal`. */
export interface ExpressionStatement extends Positioned {
  readonly kind: 'expressionStatement';
  readonly expression: Expression;
}

/**
 * `name = value`, and the five compound forms.
 *
 * The target is a bare name, because that is the whole of the form: there is no
 * `a[i] = v` and no `a.b = v` in the language, so an element is written with
 * `set(arr, i, v)` and a runtime object with a `draw` setter.
 */
export interface Assignment extends Positioned {
  readonly kind: 'assignment';
  readonly target: Name;
  readonly operator: AssignmentOperator;
  readonly value: Expression;
}

/**
 * `var name = initial`, and `live var name = initial`, language.md 8.2.
 *
 * The initialiser is required rather than optional, because `var name` with no
 * value is OS1011 and the fix names `= none`. A parser reporting it puts a
 * `missingExpression` here and carries on, so the name is still declared for
 * every later diagnostic about it.
 */
export interface VarDeclaration extends Positioned {
  readonly kind: 'varDeclaration';
  /** `live var`: the value does not roll back when the moving bar re-executes. */
  readonly live: boolean;
  readonly name: Name;
  readonly annotation: TypeAnnotation | undefined;
  readonly initialiser: Expression;
}

/** One `if` or `else if` header and the block under it. */
export interface IfBranch extends Positioned {
  readonly kind: 'ifBranch';
  readonly condition: Expression;
  readonly body: Block;
}

/** The final `else` and its block. A node, so the word itself has a span. */
export interface ElseBranch extends Positioned {
  readonly kind: 'elseBranch';
  readonly body: Block;
}

/**
 * `if`, with its `else if` branches beside it rather than nested inside it.
 *
 * `else if` is two words on one line and does not increase indentation
 * (language.md 10.2), so a reader sees one statement with several branches.
 * Nesting each branch inside the previous one would make a chain of five read
 * as five statements to every pass that walks the tree, and the depth would be
 * visible in every diagnostic and every fold an editor offers.
 */
export interface IfStatement extends Positioned {
  readonly kind: 'ifStatement';
  /** At least one: the `if` itself, then each `else if` in source order. */
  readonly branches: readonly IfBranch[];
  readonly elseBranch: ElseBranch | undefined;
}

/**
 * `for i = 0 to 9` and `for i = 9 to 0 step -1`, language.md 10.3. Both ends
 * are inclusive, and a missing `step` means one rather than a hidden node, so
 * that OS3004 on a step of zero always has a span the reader wrote.
 */
export interface ForRangeStatement extends Positioned {
  readonly kind: 'forRangeStatement';
  readonly variable: Name;
  readonly from: Expression;
  readonly to: Expression;
  readonly step: Expression | undefined;
  readonly body: Block;
}

/** `for price in prices`: the loop variable takes each element, not each index. */
export interface ForInStatement extends Positioned {
  readonly kind: 'forInStatement';
  readonly variable: Name;
  readonly iterable: Expression;
  readonly body: Block;
}

export interface WhileStatement extends Positioned {
  readonly kind: 'whileStatement';
  readonly condition: Expression;
  readonly body: Block;
}

/** One `case` arm. Several values are one arm, not several arms. */
export interface SwitchCase extends Positioned {
  readonly kind: 'switchCase';
  readonly values: readonly Expression[];
  readonly body: Block;
}

export interface SwitchDefault extends Positioned {
  readonly kind: 'switchDefault';
  readonly body: Block;
}

/**
 * `switch`, in both forms of language.md 10.6.
 *
 * With a subject, each case value is compared against it. Without one, each
 * case value is a condition and the first true arm runs. The absent subject is
 * the difference between the two forms and needs no flag beside it.
 *
 * `default` has its own slot rather than sitting among the cases, because it
 * must be last and because the arms do not fall through, so nothing downstream
 * has to check the order it found them in.
 */
export interface SwitchStatement extends Positioned {
  readonly kind: 'switchStatement';
  readonly subject: Expression | undefined;
  readonly cases: readonly SwitchCase[];
  readonly defaultCase: SwitchDefault | undefined;
}

export interface BreakStatement extends Positioned {
  readonly kind: 'breakStatement';
}

export interface ContinueStatement extends Positioned {
  readonly kind: 'continueStatement';
}

/** `return expression`, or a bare `return`, which returns `none`. */
export interface ReturnStatement extends Positioned {
  readonly kind: 'returnStatement';
  readonly value: Expression | undefined;
}

export type Statement =
  | ExpressionStatement
  | Assignment
  | VarDeclaration
  | IfStatement
  | ForRangeStatement
  | ForInStatement
  | WhileStatement
  | SwitchStatement
  | BreakStatement
  | ContinueStatement
  | ReturnStatement
  | VersionLine
  | ScriptDeclaration
  | LimitsLine;
