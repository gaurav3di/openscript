/**
 * The syntax tree of language.md, and the one traversal over it.
 *
 * Types and constructors, and no parsing: the tree is what the parser produces
 * and what the checker, the code generator and the editor's intelligence all
 * read, so it is defined on its own and none of the four owns it.
 *
 * Two things here are worth knowing before reading the rest. Every node carries
 * a `Span`, so anything the compiler says about a node has a caret. And every
 * node is a member of one discriminated union, `AstNode`, so a pass that
 * switches on `kind` without a default arm is told at compile time about the
 * kinds it has not handled.
 */

export type { Name } from './name.js';

export type {
  ArrayType,
  NamedType,
  ObjectTypeName,
  SeriesType,
  TypeAnnotation,
  ValueTypeName,
} from './annotations.js';
export {
  OBJECT_TYPE_NAMES,
  VALUE_TYPE_NAMES,
  isObjectTypeName,
  isValueTypeName,
} from './annotations.js';

export type {
  ArithmeticOperator,
  Argument,
  ArrayLiteral,
  Binary,
  BinaryOperator,
  BooleanLiteral,
  Call,
  ColorLiteral,
  ComparisonOperator,
  EqualityOperator,
  Expression,
  Grouping,
  Index,
  LogicalOperator,
  Member,
  MissingExpression,
  NameReference,
  NoneLiteral,
  NumberLiteral,
  StringLiteral,
  Ternary,
  Unary,
  UnaryOperator,
} from './expressions.js';
export {
  ARITHMETIC_OPERATORS,
  COMPARISON_OPERATORS,
  EQUALITY_OPERATORS,
  LOGICAL_OPERATORS,
  UNARY_OPERATORS,
  binaryPrecedence,
  withoutGrouping,
} from './expressions.js';

export type { LimitsLine, ScriptDeclaration, VersionLine } from './header.js';

export type {
  Assignment,
  AssignmentOperator,
  Block,
  BreakStatement,
  ContinueStatement,
  ElseBranch,
  ExpressionStatement,
  ForInStatement,
  ForRangeStatement,
  IfBranch,
  IfStatement,
  ReturnStatement,
  Statement,
  SwitchCase,
  SwitchDefault,
  SwitchStatement,
  VarDeclaration,
  WhileStatement,
} from './statements.js';
export { ASSIGNMENT_OPERATORS } from './statements.js';

export type { FunctionDeclaration, Parameter, Script, TopLevelItem } from './script.js';

export type { AstNode, NodeKind, NodeOfKind } from './node.js';
export { isExpression, isStatement, isTypeAnnotation, typeAnnotationText } from './node.js';

export type { NodeFields } from './build.js';
export { makeNode } from './build.js';

export { childrenOf } from './children.js';

export type { Visit, Visitor } from './walk.js';
export { nodeAtOffset, pathAtOffset, walk } from './walk.js';
