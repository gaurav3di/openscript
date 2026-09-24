/**
 * The checker's working state: scopes, bindings, and the answers as they are
 * worked out.
 *
 * Everything mutable in the check lives here and nowhere else, so the passes
 * over the tree are ordinary functions that take this and a node. The state is
 * handed out as a `CheckedScript` at the end and is not touched again.
 *
 * Nothing in this file decides a rule of the language. It holds what the rules
 * are decided from: which names are in scope here, what the source said, and
 * where to put an answer once one of the passes has it.
 */
import type {
  Call,
  Expression,
  FunctionDeclaration,
  Name,
  NameReference,
  Script,
} from '../ast/index.js';
import type { DiagnosticCode, DiagnosticValues } from '../catalogue/index.js';
import type { DiagnosticSink } from '../diagnostics/index.js';
import type { SourceFile } from '../source/index.js';
import type { Span } from '../span/index.js';
import type {
  Binding,
  BindingKind,
  CheckedCall,
  CheckedDeclaration,
  CheckedFunction,
  CheckedInput,
  CheckedOutput,
  CheckedRequest,
  CheckedScript,
  Mutable,
  Storage,
} from './checked.js';
import { namesGivenAValue } from './assigned.js';
import { conditionalCalls } from './conditional.js';
import { libraryFunctionNames, libraryNames } from './surface.js';
import { closestName } from './suggest.js';
import type { Type } from './types.js';
import { UNKNOWN } from './types.js';
import type { Warmup } from './warmup.js';
import { BAR_ZERO, weaken } from './warmup.js';

/**
 * One nesting of names, `language.md` 12.1.
 *
 * The global scope is not one of these: the library is a lookup of its own,
 * consulted after every scope has been tried, because it holds three hundred
 * names that never change and copying them into a map per compile would be the
 * most expensive thing the checker does.
 */
export interface Scope {
  readonly kind: 'file' | 'block' | 'function';
  readonly names: Map<string, Mutable<Binding>>;
  readonly parent: Scope | undefined;
  /** The loop variable this scope introduced, which OS2006 refuses assignment to. */
  readonly loopVariable: string | undefined;
}

/**
 * What surrounds the statement being checked, for OS3006.
 *
 * Whether the thing being checked runs on every bar is deliberately not here.
 * It is a fact about a node rather than about the path the pass took to reach
 * it, and half of what makes a call conditional is an operator rather than a
 * statement, so `conditional.ts` answers it from the tree and this carries only
 * what a pass can know.
 */
export interface Placement {
  /** True only for a statement written directly in the file, `language.md` 15.3. */
  readonly topLevel: boolean;
  /** The enclosing construct, named in OS3006's message. */
  readonly construct: string | undefined;
  /** Inside a `for` or `while` body, where `break` and `continue` are legal. */
  readonly inLoop: boolean;
}

export const TOP_LEVEL: Placement = {
  topLevel: true,
  construct: undefined,
  inLoop: false,
};

export class Checker {
  readonly file: SourceFile;
  readonly sink: DiagnosticSink;
  readonly script: Script;

  /** The file scope, which is also where a `fn` puts its name. */
  readonly fileScope: Scope;
  scope: Scope;

  declaration: CheckedDeclaration | undefined = undefined;
  readonly inputs: Mutable<CheckedInput>[] = [];
  readonly outputs: CheckedOutput[] = [];
  readonly functions: Mutable<CheckedFunction>[] = [];
  readonly bindings: Mutable<Binding>[] = [];
  readonly calls: CheckedCall[] = [];
  readonly requests: CheckedRequest[] = [];

  readonly types = new Map<Expression, Type>();
  readonly warmups = new Map<Expression, Warmup>();
  /**
   * The expressions a declaration handle is allowed to stand in, 5.4.
   *
   * `handles.ts` holds the rule and fills this. It is a set of permissions
   * rather than a flag on the pass, because the permission belongs to one
   * written expression: `fill(upper, lower)` may name a handle, and an
   * expression inside one of those arguments may not.
   */
  readonly handleSites = new Set<Expression>();
  readonly references = new Map<NameReference, Binding>();
  readonly targets = new Map<Name, Binding>();
  readonly callSites = new Map<Call, CheckedCall>();
  /**
   * The multi-output call a name holds, by binding, for `m[1]`.
   *
   * A warmup is recorded against an expression, and an element's warmup is not
   * a fact about the array expression: it is a fact about the call the name was
   * given, which `m[1]` has to reach two statements later. Only the calls whose
   * outputs warm up at different bars are kept, because for every other one the
   * array's warmup is already the element's.
   */
  private readonly multiOutputs = new Map<number, CheckedCall>();

  /** The declarations of every `fn`, collected before any body is checked. */
  readonly functionsByName = new Map<string, number>();
  readonly functionNodes = new Map<string, FunctionDeclaration>();
  /** Bodies already checked, and the ones being checked, so a cycle stops. */
  readonly checkedFunctions = new Set<number>();
  readonly checkingFunctions = new Set<number>();

  repaints = false;
  stateCount = 0;
  /** How deep inside a `req` expression the pass is, `stdlib.md` 15.4. */
  requestDepth = 0;
  /** The function whose body is being checked, for its own statefulness. */
  currentFunction: Mutable<CheckedFunction> | undefined = undefined;
  /** What the body being checked returns, gathered as the `return`s are met. */
  pendingReturns: { readonly type: Type; readonly warmup: Warmup }[] = [];

  /** Every call site a bar can pass without evaluating, `language.md` 11.4. */
  private readonly conditional: ReadonlySet<Call>;
  /** The names some line gives a value, read before a `var` is called never. */
  private readonly givenAValue: ReadonlySet<string>;

  constructor(file: SourceFile, script: Script, sink: DiagnosticSink) {
    this.file = file;
    this.script = script;
    this.sink = sink;
    this.fileScope = { kind: 'file', names: new Map(), parent: undefined, loopVariable: undefined };
    this.scope = this.fileScope;
    this.conditional = conditionalCalls(script);
    this.givenAValue = namesGivenAValue(script);
  }

  /**
   * Whether this call site can be skipped on a bar, which is what OS8001 asks.
   *
   * Asked of the call rather than of the pass that reached it, so the answer is
   * the same wherever the call was written: inside an `if`, in a ternary arm,
   * or on the right of an `and` that short-circuited.
   */
  isConditional(call: Call): boolean {
    return this.conditional.has(call);
  }

  report<Code extends DiagnosticCode>(
    code: Code,
    span: Span,
    values: DiagnosticValues[Code],
  ): void {
    this.sink.report(code, span, values);
  }

  /** The source text a span covers, for the codes that quote what was written. */
  textOf(span: Span): string {
    return this.file.text.slice(span.offset, span.offset + span.length).trim();
  }

  /** Opens a scope, runs the body in it, and closes it however the body ends. */
  inScope<T>(kind: Scope['kind'], loopVariable: string | undefined, body: () => T): T {
    const parent = this.scope;
    this.scope = { kind, names: new Map(), parent, loopVariable };
    try {
      return body();
    } finally {
      this.scope = parent;
    }
  }

  /**
   * The declaration a name means here, and whether a function body stands
   * between the two.
   *
   * A plain assignment updates an enclosing name (`language.md` 12.2), and a
   * function body is the one place that does not hold: 12.3's own example makes
   * an assignment to a file-scope name from inside a `fn` OS2002.
   */
  lookupAcross(name: string): {
    readonly binding: Mutable<Binding> | undefined;
    readonly crossedFunction: boolean;
  } {
    let crossedFunction = false;
    for (let scope: Scope | undefined = this.scope; scope !== undefined; scope = scope.parent) {
      const found = scope.names.get(name);
      if (found !== undefined) return { binding: found, crossedFunction };
      if (scope.kind === 'function') crossedFunction = true;
    }
    return { binding: undefined, crossedFunction };
  }

  /** The declaration a name means here, or nothing when no scope holds it. */
  lookup(name: string): Mutable<Binding> | undefined {
    for (let scope: Scope | undefined = this.scope; scope !== undefined; scope = scope.parent) {
      const found = scope.names.get(name);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  /** Whether an enclosing scope already holds the name, which is OS2002. */
  enclosing(name: string): Mutable<Binding> | undefined {
    for (
      let scope: Scope | undefined = this.scope.parent;
      scope !== undefined;
      scope = scope.parent
    ) {
      const found = scope.names.get(name);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  /** Whether the name belongs to the loop being executed, `language.md` 10.3. */
  loopVariableNamed(name: string): boolean {
    for (let scope: Scope | undefined = this.scope; scope !== undefined; scope = scope.parent) {
      if (scope.loopVariable === name) return true;
      if (scope.names.has(name)) return false;
    }
    return false;
  }

  /** Declares a name in the current scope and records it in the checked tree. */
  declare(
    name: Name,
    kind: BindingKind,
    type: Type,
    warmup: Warmup,
    persistence: Binding['persistence'] = 'none',
  ): Mutable<Binding> {
    const binding: Mutable<Binding> = {
      id: this.bindings.length,
      name: name.text,
      kind,
      persistence,
      type,
      warmup,
      storage: storageFor(kind, persistence),
      declaredAt: name.span,
      readsHistory: false,
      isRead: false,
      input: undefined,
      handle: undefined,
    };
    this.bindings.push(binding);
    this.scope.names.set(name.text, binding);
    this.targets.set(name, binding);
    return binding;
  }

  /**
   * Remembers, or forgets, the multi-output call a name was just given.
   *
   * Forgetting on a reassignment rather than keeping the first call is what
   * stops `m[1]` from being answered about a call the name no longer holds:
   * the array's own warmup is the fallback, and it is a floor for every
   * element.
   */
  holdsMultiOutput(binding: number, call: CheckedCall | undefined): void {
    if (call === undefined || call.entry === undefined || call.entry.elements.length === 0) {
      this.multiOutputs.delete(binding);
      return;
    }
    this.multiOutputs.set(binding, call);
  }

  /** The multi-output call this name holds here, when it holds one. */
  multiOutputOf(name: string): CheckedCall | undefined {
    const binding = this.lookup(name);
    return binding === undefined ? undefined : this.multiOutputs.get(binding.id);
  }

  record(expression: Expression, type: Type, warmup: Warmup): Type {
    this.types.set(expression, type);
    this.warmups.set(expression, warmup);
    return type;
  }

  typeOf(expression: Expression): Type {
    return this.types.get(expression) ?? UNKNOWN;
  }

  /**
   * The warmup a read of this name sees, here.
   *
   * A `var` that is still never at this line but that a later line gives a
   * value is not never: the later line wrote it on the bar before, or on an
   * earlier pass of the same loop. The honest answer is a floor of bar 0,
   * which claims nothing and withdraws the claim OS8009 is built on, where an
   * exact bar would need the later line's warmup before it has been read.
   */
  warmupOfRead(binding: Binding): Warmup {
    if (binding.warmup.kind !== 'never' || binding.persistence === 'none') return binding.warmup;
    return this.givenAValue.has(binding.name) ? weaken(BAR_ZERO) : binding.warmup;
  }

  warmupOf(expression: Expression): Warmup {
    return this.warmups.get(expression) ?? BAR_ZERO;
  }

  /** Every name a reader could have meant here: the scopes, then the library. */
  namesInScope(): readonly string[] {
    const names = new Set<string>();
    for (let scope: Scope | undefined = this.scope; scope !== undefined; scope = scope.parent) {
      for (const name of scope.names.keys()) names.add(name);
    }
    for (const name of libraryNames()) names.add(name);
    return [...names];
  }

  suggestionFor(written: string): string {
    return closestName(written, this.namesInScope());
  }

  /**
   * OS2010's suggestion: the closest function, called with what was written.
   *
   * The catalogue documents the slot as the library function whose name is
   * closest, with its first argument filled in, so `volume(20)` is offered a
   * function over `volume` and the arguments the reader already wrote,
   * rather than a name that cannot be called either.
   */
  callSuggestionFor(written: string, args: readonly string[]): string {
    const inStrategy = this.declaration?.form === 'strategy';
    const name = closestName(written, libraryFunctionNames(inStrategy));
    return `${name}(${[written, ...args].join(', ')})`;
  }

  /** A state region for one call site, `compiled-program.md` 2.11. */
  takeStateId(): number {
    const id = this.stateCount;
    this.stateCount += 1;
    return id;
  }

  finish(): CheckedScript {
    return {
      script: this.script,
      declaration: this.declaration,
      inputs: this.inputs,
      outputs: this.outputs,
      functions: this.functions,
      bindings: this.bindings,
      calls: this.calls,
      requests: this.requests,
      repaints: this.repaints,
      stateCount: this.stateCount,
      types: this.types,
      warmups: this.warmups,
      references: this.references,
      targets: this.targets,
      callSites: this.callSites,
    };
  }
}

/**
 * OS7001: a name the library gives only to a file declared with `strategy()`.
 *
 * The message names the line of the `study()` declaration rather than the call,
 * because that is the line the reader has to change: the call is what they
 * meant, and the declaration is what refuses it.
 */
export function reportStrategyOnly(
  checker: Checker,
  name: string,
  span: Span,
  strategyOnly: boolean,
): void {
  const declaration = checker.declaration;
  if (!strategyOnly || declaration === undefined || declaration.form === 'strategy') return;
  checker.report('OS7001', span, { name, line: declaration.node.span.line });
}

/**
 * Where a name's value lives between bars.
 *
 * A top-level name starts in a slot and is moved to a register only when the
 * program turns out to read its history, which the checker knows by the end and
 * `finaliseStorage` applies. Everything below the top level is a slot, and a
 * `var` is a cell whatever scope it was written in.
 */
function storageFor(kind: BindingKind, persistence: Binding['persistence']): Storage {
  if (persistence !== 'none') return 'cell';
  return kind === 'library' || kind === 'function' ? 'none' : 'slot';
}

/**
 * Promotes the top-level names whose history is read to series registers.
 *
 * `compiled-program.md` 2.10 allocates a register only for a name the program
 * reads the past of, and this is the one place that decides it, once every read
 * in the file has been seen.
 */
export function finaliseStorage(checker: Checker): void {
  for (const binding of checker.bindings) {
    if (binding.readsHistory && binding.kind === 'file' && binding.persistence === 'none') {
      binding.storage = 'register';
    }
  }
}
