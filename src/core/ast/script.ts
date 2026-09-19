import type { Positioned } from '../span/index.js';
import type { TypeAnnotation } from './annotations.js';
import type { Expression } from './expressions.js';
import type { Name } from './name.js';
import type { Block, Statement } from './statements.js';

/**
 * A parameter of a user function, language.md 11.2.
 *
 * A parameter is an ordinary identifier and a reserved word is OS1019 here,
 * which is the rule a named argument label does not follow: the body refers to
 * a parameter and nothing ever refers to a label.
 */
export interface Parameter extends Positioned {
  readonly kind: 'parameter';
  readonly name: Name;
  readonly annotation: TypeAnnotation | undefined;
  readonly defaultValue: Expression | undefined;
}

/**
 * `fn name(parameters) => body`, language.md 11.1.
 *
 * The body is an expression for the single line form and a block for the
 * indented one, kept apart rather than wrapped, because the single line form
 * has no block to give a span to and an editor folding a function should fold
 * what was written.
 *
 * A function is not a statement. Functions may not be nested and may not be
 * assigned to a name, so there is nowhere but the top level for one to appear,
 * and the tree says so rather than leaving it to a later check.
 */
export interface FunctionDeclaration extends Positioned {
  readonly kind: 'functionDeclaration';
  readonly name: Name;
  readonly parameters: readonly Parameter[];
  readonly body: Block | Expression;
}

export type TopLevelItem = Statement | FunctionDeclaration;

/**
 * One source file.
 *
 * The items are everything the file holds, in source order, including the
 * version line, the declaration and the limits line: a header node is a
 * statement (see header.ts) and sits among the rest. So a file with no
 * declaration, a file with two, and a version line halfway down all have a tree,
 * which is what OS2007, OS2008 and OS1021 need in order to report a line number
 * and a fix instead of a parse failure.
 *
 * A consumer reaches the declaration by looking through the items for the one
 * kind it wants, and finds every occurrence rather than the first.
 */
export interface Script extends Positioned {
  readonly kind: 'script';
  readonly items: readonly TopLevelItem[];
}
