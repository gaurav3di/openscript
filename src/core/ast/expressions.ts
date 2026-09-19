import type { Positioned } from '../span/index.js';
import type { Name } from './name.js';

/**
 * Every expression form of language.md section 9.
 *
 * Precedence is not a field anywhere below. It is in the shape of the tree: the
 * parser reads the levels of 9.1 and the result is already grouped, so a later
 * pass never has to know that `*` binds tighter than `+`. The one thing the
 * tree does keep is the brackets a script wrote, because they are the
 * difference between a caret under `(a < b)` and a caret under a whole line.
 */

export const ARITHMETIC_OPERATORS = ['+', '-', '*', '/', '%'] as const;
export type ArithmeticOperator = (typeof ARITHMETIC_OPERATORS)[number];

export const COMPARISON_OPERATORS = ['<', '<=', '>', '>='] as const;
export type ComparisonOperator = (typeof COMPARISON_OPERATORS)[number];

export const EQUALITY_OPERATORS = ['==', '!='] as const;
export type EqualityOperator = (typeof EQUALITY_OPERATORS)[number];

export const LOGICAL_OPERATORS = ['and', 'or'] as const;
export type LogicalOperator = (typeof LOGICAL_OPERATORS)[number];

export type BinaryOperator =
  | ArithmeticOperator
  | ComparisonOperator
  | EqualityOperator
  | LogicalOperator;

export const UNARY_OPERATORS = ['-', '+', 'not'] as const;
export type UnaryOperator = (typeof UNARY_OPERATORS)[number];

/**
 * The level each binary operator sits at in language.md 9.1, where a lower
 * number binds more tightly.
 *
 * The numbers are the specification's own rather than a private scale that runs
 * the other way, so a reader can check this table against language.md 9.1
 * without translating it as they read. It sits next to the operators because a
 * parser and a formatter that each kept a copy would disagree about one
 * operator eventually, and that disagreement reaches a chart as a wrong number.
 */
const BINARY_PRECEDENCE: Readonly<Record<BinaryOperator, number>> = {
  '*': 3,
  '/': 3,
  '%': 3,
  '+': 4,
  '-': 4,
  '<': 5,
  '<=': 5,
  '>': 5,
  '>=': 5,
  '==': 6,
  '!=': 6,
  and: 7,
  or: 8,
};

export function binaryPrecedence(operator: BinaryOperator): number {
  return BINARY_PRECEDENCE[operator];
}

/**
 * The value a number literal denotes, already read.
 *
 * The digit group underscores and the hexadecimal form of language.md 3.5 are
 * resolved by the lexer, so nothing downstream reads the text a second time and
 * nothing downstream can disagree with the lexer about what it meant.
 */
export interface NumberLiteral extends Positioned {
  readonly kind: 'numberLiteral';
  readonly value: number;
}

/** A string literal with its escape sequences already resolved. */
export interface StringLiteral extends Positioned {
  readonly kind: 'stringLiteral';
  readonly value: string;
}

export interface BooleanLiteral extends Positioned {
  readonly kind: 'booleanLiteral';
  readonly value: boolean;
}

/**
 * The `#rrggbb` and `#rrggbbaa` forms of language.md 3.8, text and all.
 *
 * A named colour is not one of these. The nineteen names are ordinary globals
 * so the standard library can add more without a grammar change, so `aqua` is a
 * `nameReference` and the checker resolves it like any other name.
 *
 * The text is kept rather than four channel numbers, because the channels are
 * the checker's reading of it and a diagnostic about a malformed colour has to
 * quote what was written.
 */
export interface ColorLiteral extends Positioned {
  readonly kind: 'colorLiteral';
  readonly text: string;
}

/** `none`, the absent value of language.md section 6. */
export interface NoneLiteral extends Positioned {
  readonly kind: 'noneLiteral';
}

/**
 * `[1, 2, 3]`, and `[]`.
 *
 * An empty literal is legal here. Its element type is unknown until the checker
 * finds an annotation or a first use, and OS2015 when it finds neither.
 */
export interface ArrayLiteral extends Positioned {
  readonly kind: 'arrayLiteral';
  readonly elements: readonly Expression[];
}

/** A name used as a value. Its span is the name, so it carries no child. */
export interface NameReference extends Positioned {
  readonly kind: 'nameReference';
  readonly name: string;
}

/**
 * `(expression)`.
 *
 * Kept rather than folded away, because both passes that point back at source
 * need it: a diagnostic about a grouped expression underlines the brackets a
 * reader can see, and a formatter that dropped them would turn `(a + b) * c`
 * into something else on its first reprint. A pass that wants the value inside
 * calls `withoutGrouping`.
 */
export interface Grouping extends Positioned {
  readonly kind: 'grouping';
  readonly expression: Expression;
}

export interface Unary extends Positioned {
  readonly kind: 'unary';
  readonly operator: UnaryOperator;
  readonly operand: Expression;
}

export interface Binary extends Positioned {
  readonly kind: 'binary';
  readonly operator: BinaryOperator;
  readonly left: Expression;
  readonly right: Expression;
}

/** `condition ? whenTrue : whenFalse`, language.md 9.5. */
export interface Ternary extends Positioned {
  readonly kind: 'ternary';
  readonly condition: Expression;
  readonly whenTrue: Expression;
  readonly whenFalse: Expression;
}

/**
 * One argument of a call, of `study()`, of `strategy()` or of `limits()`.
 *
 * A label is a `Name` and not a `nameReference` because it is never resolved.
 * It is matched against the callee's parameter list, which is what lets a
 * reserved word stand as one (language.md 3.4).
 */
export interface Argument extends Positioned {
  readonly kind: 'argument';
  readonly label: Name | undefined;
  readonly value: Expression;
}

/**
 * A call, with its arguments in the order they were written.
 *
 * Positional after named is OS3005, a check rather than a shape, so nothing is
 * sorted on the way in and the tree keeps the order that error has to quote.
 * The callee is an expression because `draw.box(...)` is an argument list
 * applied to a member access, and because `f(1)(2)` has to parse before it can
 * be told that it is not a thing OpenScript does.
 */
export interface Call extends Positioned {
  readonly kind: 'call';
  readonly callee: Expression;
  readonly args: readonly Argument[];
}

/**
 * `target[index]`: history when the target is a series, element access when it
 * is an array, and the checker decides which from the target's type
 * (language.md 9.6). There is no run-time dispatch and no third meaning.
 *
 * The explicit forms `history(expr, n)` and `element(arr, i)` are ordinary
 * calls and are not this node.
 */
export interface Index extends Positioned {
  readonly kind: 'index';
  readonly target: Expression;
  readonly index: Expression;
}

/**
 * `object.member`.
 *
 * A namespace read such as `bar.index` and a field of a runtime object are one
 * shape here. Which of the two it is, and whether the member exists at all
 * (OS2009), is the checker's answer.
 */
export interface Member extends Positioned {
  readonly kind: 'member';
  readonly object: Expression;
  readonly member: Name;
}

/**
 * A hole where an expression was required and none was written.
 *
 * The parser puts one here after reporting OS1022, OS1011 or OS1015, so a file
 * with a mistake in it still produces a tree. Everything downstream runs on
 * broken files by definition: an editor asks for completions inside a half
 * typed line, and a checker that stopped at the first syntax error would report
 * one mistake per compile.
 *
 * The span is where the expression should have been, and is usually empty, so
 * it never takes a caret meant for its neighbour.
 */
export interface MissingExpression extends Positioned {
  readonly kind: 'missingExpression';
}

export type Expression =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | ColorLiteral
  | NoneLiteral
  | ArrayLiteral
  | NameReference
  | Grouping
  | Unary
  | Binary
  | Ternary
  | Call
  | Index
  | Member
  | MissingExpression;

/** The expression inside however many brackets were written around it. */
export function withoutGrouping(expression: Expression): Expression {
  let inner = expression;
  while (inner.kind === 'grouping') inner = inner.expression;
  return inner;
}
