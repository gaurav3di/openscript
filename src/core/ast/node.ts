import type { TypeAnnotation } from './annotations.js';
import type { Argument, Expression } from './expressions.js';
import type { Name } from './name.js';
import type { FunctionDeclaration, Parameter, Script } from './script.js';
import type {
  Block,
  ElseBranch,
  IfBranch,
  Statement,
  SwitchCase,
  SwitchDefault,
} from './statements.js';

/**
 * Every node of the tree, as one discriminated union.
 *
 * A pass switches on `kind` with no default arm, and the compiler names the
 * kinds it has not handled. Three passes walk this tree, each of them added
 * months apart, and each of them will otherwise forget a case: the shape of the
 * union is the only thing that tells them before a user does.
 *
 * The union is `AstNode` rather than `Node` because an adapter that draws into
 * a page has a `Node` of its own, and a file holding both would be one import
 * away from a mistake that type checks.
 */
export type AstNode =
  | Script
  | FunctionDeclaration
  | Parameter
  | Statement
  | Block
  | IfBranch
  | ElseBranch
  | SwitchCase
  | SwitchDefault
  | Expression
  | Argument
  | TypeAnnotation
  | Name;

export type NodeKind = AstNode['kind'];

/** The node type behind one kind, for a pass that indexes by kind. */
export type NodeOfKind<K extends NodeKind> = Extract<AstNode, { readonly kind: K }>;

/**
 * The three tables below are written as a record over the kinds of each group,
 * so a node kind added to a group without being added here does not compile.
 * A set built from an array would accept the omission and the guard would
 * quietly answer false for the new kind.
 */
const EXPRESSION_KINDS: Readonly<Record<Expression['kind'], true>> = {
  numberLiteral: true,
  stringLiteral: true,
  booleanLiteral: true,
  colorLiteral: true,
  noneLiteral: true,
  arrayLiteral: true,
  nameReference: true,
  grouping: true,
  unary: true,
  binary: true,
  ternary: true,
  call: true,
  index: true,
  member: true,
  missingExpression: true,
};

const STATEMENT_KINDS: Readonly<Record<Statement['kind'], true>> = {
  expressionStatement: true,
  assignment: true,
  varDeclaration: true,
  ifStatement: true,
  forRangeStatement: true,
  forInStatement: true,
  whileStatement: true,
  switchStatement: true,
  breakStatement: true,
  continueStatement: true,
  returnStatement: true,
  versionLine: true,
  scriptDeclaration: true,
  limitsLine: true,
};

const TYPE_ANNOTATION_KINDS: Readonly<Record<TypeAnnotation['kind'], true>> = {
  namedType: true,
  seriesType: true,
  arrayType: true,
};

export function isExpression(node: AstNode): node is Expression {
  return Object.hasOwn(EXPRESSION_KINDS, node.kind);
}

export function isStatement(node: AstNode): node is Statement {
  return Object.hasOwn(STATEMENT_KINDS, node.kind);
}

export function isTypeAnnotation(node: AstNode): node is TypeAnnotation {
  return Object.hasOwn(TYPE_ANNOTATION_KINDS, node.kind);
}

/**
 * The name a type annotation carries, for a diagnostic that has to quote it.
 *
 * OS2016 and OS2019 both put the annotation into their message, and the reader
 * expects to see what was written rather than the outermost word of it.
 */
export function typeAnnotationText(annotation: TypeAnnotation): string {
  switch (annotation.kind) {
    case 'namedType':
      return annotation.name;
    case 'seriesType':
      return `series ${typeAnnotationText(annotation.element)}`;
    case 'arrayType':
      return `array<${typeAnnotationText(annotation.element)}>`;
  }
}
