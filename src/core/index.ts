/**
 * OpenScript, the compiler and the engine.
 *
 * This is the whole of what a host needs to take a script and produce values,
 * and it knows nothing about a chart, an editor or a broker. It imports no
 * package and touches no browser global, so the same file runs in a worker, on
 * a server and inside somebody else's application under a content security
 * policy that forbids turning text into code.
 *
 * Three things a host does, and the names that do them:
 *
 *     sourceFile, parse, check, emit   source text becomes a compiled program
 *     load                             a program is verified and made runnable
 *     Engine.run, Engine.append        it runs over bars, and values come out
 *
 * Every name below is a promise to somebody who is not in this repository, so
 * the surface is a decision rather than everything the modules hold: a pass, a
 * table or an instruction stays behind its module's door, and a host never has
 * to reach past this file to compile or run a script.
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

export type {
  Binding,
  BindingKind,
  CheckedCall,
  CheckedDeclaration,
  CheckedFunction,
  CheckedInput,
  CheckedOutput,
  CheckedRequest,
  CheckedScript,
  HandleKind,
  InputKind,
  LibraryEntry,
  LibraryParameter,
  ObjectKind,
  RequestMode,
  Storage,
  Type,
  ValueKind,
  WarmupRule,
  Warmup,
} from './check/index.js';
export {
  BAR_ZERO,
  HANDLE_KINDS,
  NAMESPACES,
  OBJECT_KINDS,
  STRATEGY_NAMESPACES,
  VALUE_KINDS,
  accepts,
  allOf,
  arrayOf,
  atBar,
  atLeastBar,
  check,
  delayed,
  earlier,
  elementOf,
  isLibraryName,
  isNamespace,
  isNever,
  isSeries,
  join,
  later,
  libraryEntries,
  libraryNames,
  membersOf,
  sameType,
  seriesOf,
  typeText,
} from './check/index.js';
export { REQUEST_NAMES } from './check/index.js';
export { COMPILED_FORMAT_VERSION, VERSION } from './version/index.js';

/**
 * The emitter: a checked script becomes the compiled program.
 *
 * The program is plain data, so a host may store it, send it, and run it here
 * or on an engine somebody else wrote from the specification.
 *
 * `canonicalise` is the encoding the two hashes are taken over and the bytes
 * that travel. A host that records the source hash and the program hash beside
 * a result can later prove an engine upgrade did not change it, which is what
 * `compiled-program.md` 9.5 promises.
 */
export { emit } from './emit/index.js';
export type { EmitOptions, EmitResult } from './emit/index.js';
export type { CompiledProgram } from './emit/index.js';
export { canonicalise, programHash, sourceHash } from './emit/index.js';

/**
 * The engine: a program in, one bar at a time, values out.
 *
 * `load` verifies the program in full before a bar executes and answers with a
 * diagnostic rather than an exception, because a host runs many scripts in one
 * process and one failing script must take nothing else down. `verify` is that
 * same check on its own, for a host that keeps compiled programs and wants to
 * refuse a bad one when it arrives rather than when it is first drawn.
 *
 * `capabilitiesFor` and `LANGUAGE_VERSIONS` are this engine's half of the
 * compatibility statement in 9.1, beside `COMPILED_FORMAT_VERSION` above.
 */
export { load } from './engine/index.js';
export type { BarResult, Engine, LoadOptions, LoadResult, RunResult } from './engine/index.js';
export type {
  BarState,
  EffectRoute,
  EngineHost,
  HostBar,
  Instrument,
  PendingEffect,
  Position,
} from './engine/index.js';
export { DEFAULT_LIMITS } from './engine/index.js';
export type { EngineLimits } from './engine/index.js';
export { isAbsent } from './engine/index.js';
export type { Value } from './engine/index.js';
export { LANGUAGE_VERSIONS, capabilitiesFor, verify } from './engine/index.js';
export type { VerifyOptions, VerifyResult } from './engine/index.js';
