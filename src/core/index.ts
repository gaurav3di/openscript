/**
 * OpenScript, the compiler tier.
 *
 * This is the whole of what a host needs to turn a script into a compiled
 * program, and it knows nothing about a chart, an editor or a broker. It
 * imports no package and touches no browser global, so the same file runs in a
 * worker, on a server and inside somebody else's application under a content
 * security policy that forbids turning text into code.
 *
 * The tiers above it are separate entry points, so a host that wants only this
 * one never loads the editor intelligence or an adapter.
 */

export type { Positioned, Span } from './span/index.js';
export { containsOffset, endOffset, makeSpan, spanning } from './span/index.js';

export type { SourceFile, SourcePosition } from './source/index.js';
export { normaliseSource, sourceFile } from './source/index.js';

export type {
  CatalogueEntry,
  DiagnosticCode,
  DiagnosticValues,
  PlaceholderValue,
  Severity,
  Stage,
} from './catalogue/index.js';
export {
  CATALOGUE_LANGUAGE_VERSION,
  CATALOGUE_SCHEMA_VERSION,
  STAGE_LABELS,
  allCodes,
  entryFor,
  fillTemplate,
  isDiagnosticCode,
} from './catalogue/index.js';

export type { Diagnostic, DiagnosticSink } from './diagnostics/index.js';
export { DiagnosticBag, diagnosticFor, isError } from './diagnostics/index.js';

export { renderDiagnostic, renderDiagnostics } from './render/index.js';

export type {
  KeywordKind,
  LayoutKind,
  LiteralKind,
  NameKind,
  NumberToken,
  PunctuationKind,
  SimpleToken,
  StringToken,
  Token,
  TokenKind,
} from './tokens/index.js';
export { PUNCTUATORS, RESERVED_WORDS } from './tokens/index.js';

export type {
  Argument,
  ArithmeticOperator,
  ArrayLiteral,
  ArrayType,
  Assignment,
  AssignmentOperator,
  AstNode,
  Binary,
  BinaryOperator,
  Block,
  BooleanLiteral,
  BreakStatement,
  Call,
  ColorLiteral,
  ComparisonOperator,
  ContinueStatement,
  ElseBranch,
  EqualityOperator,
  Expression,
  ExpressionStatement,
  ForInStatement,
  ForRangeStatement,
  FunctionDeclaration,
  Grouping,
  IfBranch,
  IfStatement,
  Index,
  LimitsLine,
  LogicalOperator,
  Member,
  MissingExpression,
  Name,
  NameReference,
  NamedType,
  NodeFields,
  NodeKind,
  NodeOfKind,
  NoneLiteral,
  NumberLiteral,
  ObjectTypeName,
  Parameter,
  ReturnStatement,
  Script,
  ScriptDeclaration,
  SeriesType,
  Statement,
  StringLiteral,
  SwitchCase,
  SwitchDefault,
  SwitchStatement,
  Ternary,
  TopLevelItem,
  TypeAnnotation,
  Unary,
  UnaryOperator,
  ValueTypeName,
  VarDeclaration,
  VersionLine,
  Visit,
  Visitor,
  WhileStatement,
} from './ast/index.js';
export {
  ARITHMETIC_OPERATORS,
  ASSIGNMENT_OPERATORS,
  COMPARISON_OPERATORS,
  EQUALITY_OPERATORS,
  LOGICAL_OPERATORS,
  OBJECT_TYPE_NAMES,
  UNARY_OPERATORS,
  VALUE_TYPE_NAMES,
  binaryPrecedence,
  childrenOf,
  isExpression,
  isObjectTypeName,
  isStatement,
  isTypeAnnotation,
  isValueTypeName,
  makeNode,
  nodeAtOffset,
  pathAtOffset,
  typeAnnotationText,
  walk,
  withoutGrouping,
} from './ast/index.js';

export { lex } from './lex/index.js';

export { parse, parseTokens } from './parse/index.js';
export { COMPILED_FORMAT_VERSION, VERSION } from './version/index.js';
