/**
 * The checked tree: what the checker hands the code generator.
 *
 * The syntax tree is not rebuilt. Every answer the checker worked out is
 * recorded against the node it is about, so the generator walks the same tree
 * the parser produced and looks up what it needs. The alternative, a second
 * tree of parallel nodes, would double the shapes anyone has to learn and would
 * put the spans one edit away from disagreeing with the source.
 *
 * What is here is chosen so the generator re-derives nothing. It does not have
 * to work out which declaration a name means, what type an expression has, how
 * many bars a value needs, whether a name lives in a slot, a cell or a series
 * register, which call sites need a state region, or which reads repaint. Each
 * of those is a question the checker already had to answer to report its own
 * diagnostics, and asking it twice is how two stages come to disagree.
 *
 * `compiled-program.md` sections 2.6 to 2.13 name the arrays a program carries.
 * The lists below are in the same order the program's are, so the generator
 * writes them out rather than sorting anything.
 */
import type {
  Argument,
  Call,
  Expression,
  FunctionDeclaration,
  Name,
  NameReference,
  Script,
  ScriptDeclaration,
} from '../ast/index.js';
import type { Span } from '../span/index.js';
import type { LibraryEntry } from './library.js';
import type { HandleKind, Type } from './types.js';
import type { Warmup } from './warmup.js';

/** Where a name was introduced, which decides what may be done to it. */
export type BindingKind = 'file' | 'block' | 'parameter' | 'loop' | 'library' | 'function';

/**
 * Where the value lives between bars, `compiled-program.md` 2.10 and 2.11.
 *
 * A register is allocated only for a top-level name whose history the program
 * reads, which is the rule that section states; everything else that is not
 * persistent is a slot, and a `var` is a cell.
 */
export type Storage = 'slot' | 'cell' | 'register' | 'none';

export interface Binding {
  readonly id: number;
  readonly name: string;
  readonly kind: BindingKind;
  /** `var` and `live var` survive the bar; `live` opts out of rollback. */
  readonly persistence: 'none' | 'var' | 'live';
  readonly type: Type;
  readonly warmup: Warmup;
  readonly storage: Storage;
  /** The name as it was written, which is what OS2002 and OS8010 point at. */
  readonly declaredAt: Span;
  /** Whether any line reads this name's past, which is what allocates a register. */
  readonly readsHistory: boolean;
  /** Whether any line reads it at all. False is OS8010. */
  readonly isRead: boolean;
  /** The input this name holds, when its value came from `input()`. */
  readonly input: number | undefined;
  /** The declaration handle this name holds, when it came from `plot` or `level`. */
  readonly handle: HandleKind | undefined;
}

/** The control a host builds for one `input()`, `compiled-program.md` 2.6. */
export type InputKind =
  | 'number'
  | 'bool'
  | 'string'
  | 'select'
  | 'color'
  | 'source'
  | 'interval'
  | 'time';

export interface CheckedInput {
  readonly id: number;
  readonly call: Call;
  /** The name the value was assigned to, or an empty string where it was not. */
  readonly name: string;
  readonly title: string;
  readonly kind: InputKind;
  readonly type: Type;
  readonly span: Span;
}

/** One entry of the study's fixed shape, `compiled-program.md` 2.8. */
export interface CheckedOutput {
  readonly id: number;
  readonly form: 'plot' | 'plotCandles' | 'fill' | 'level' | 'table';
  readonly title: string;
  readonly call: Call;
  /** The first bar this column can draw on, which is what OS8009 reads. */
  readonly warmup: Warmup;
  readonly span: Span;
}

export interface CheckedFunction {
  readonly id: number;
  readonly declaration: FunctionDeclaration;
  readonly parameters: readonly Binding[];
  readonly returns: Type;
  readonly warmup: Warmup;
  /** Holds a `var` or calls something that does, so its call sites need state. */
  readonly stateful: boolean;
}

/**
 * One call site, resolved.
 *
 * `arguments` is in the callee's parameter order with a hole where the default
 * applies, rather than in the order they were written, so the generator emits
 * them without matching labels a second time. What each default is belongs to
 * the library manifest (`compiled-program.md` 2.5) and is not copied here.
 */
export interface CheckedCall {
  readonly call: Call;
  readonly name: string;
  readonly target: 'library' | 'user' | 'unresolved';
  readonly entry: LibraryEntry | undefined;
  /** The index into `functions` when the callee is a user function. */
  readonly fn: number | undefined;
  readonly arguments: readonly (Argument | undefined)[];
  readonly returns: Type;
  readonly warmup: Warmup;
  readonly stateful: boolean;
  /** The per-call-site state region, `compiled-program.md` 2.11. */
  readonly stateId: number | undefined;
  /**
   * The arguments whose per-bar values this call site has to retain.
   *
   * A user function that reads `src[1]` reads the history of whatever the
   * caller passed, so the caller writes that expression to a series register
   * before the call (`compiled-program.md` 2.10 and 2.12). These are the
   * parameter positions that need one.
   */
  readonly seriesArguments: readonly number[];
}

/** What a higher timeframe read is allowed to know, `stdlib.md` 15.3. */
export type RequestMode = 'confirmed' | 'developing' | 'lookahead' | 'unknown';

export interface CheckedRequest {
  readonly id: number;
  readonly call: Call;
  readonly name: string;
  readonly mode: RequestMode;
  /** The timeframe as the source writes it: a literal, or the name that holds it. */
  readonly timeframe: string;
  readonly repaints: boolean;
  readonly span: Span;
}

export interface CheckedDeclaration {
  readonly node: ScriptDeclaration;
  readonly form: 'study' | 'strategy';
  readonly title: string;
  /** Every option that was given, by name, with the expression it was given. */
  readonly options: ReadonlyMap<string, Expression>;
  readonly overlay: boolean;
  /** Signals and orders may act on a bar that is still moving, language.md 7.5. */
  readonly onUnconfirmed: boolean;
}

/**
 * A file, checked.
 *
 * `types` and `warmups` hold an answer for every expression the checker
 * reached, including the ones it reported a diagnostic about, where the type is
 * `unknown` so that nothing above them reports a second time.
 */
export interface CheckedScript {
  readonly script: Script;
  readonly declaration: CheckedDeclaration | undefined;
  readonly inputs: readonly CheckedInput[];
  readonly outputs: readonly CheckedOutput[];
  readonly functions: readonly CheckedFunction[];
  readonly bindings: readonly Binding[];
  readonly calls: readonly CheckedCall[];
  readonly requests: readonly CheckedRequest[];
  /** Whether any read in the file shows a bar values from the future. */
  readonly repaints: boolean;
  /** How many state regions the program needs, `compiled-program.md` 2.11. */
  readonly stateCount: number;
  readonly types: ReadonlyMap<Expression, Type>;
  readonly warmups: ReadonlyMap<Expression, Warmup>;
  /** Every name used as a value, bound to the declaration it means. */
  readonly references: ReadonlyMap<NameReference, Binding>;
  /** Every name that introduces or updates one: a target, a `var`, a loop variable. */
  readonly targets: ReadonlyMap<Name, Binding>;
  readonly callSites: ReadonlyMap<Call, CheckedCall>;
}

/** The checker's own working copy of a record the tree publishes as read-only. */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };
