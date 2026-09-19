/**
 * The state one compile of one file shares, and the small answers every pass
 * asks of it.
 *
 * The passes that emit code are ordinary functions taking this and a node, on
 * the same arrangement the checker uses, so a reader can follow one expression
 * from its syntax to its instructions without holding a class hierarchy in
 * their head. Everything mutable is here and nowhere else.
 */
import type { Argument, Call, Expression, NameReference } from '../ast/index.js';
import { withoutGrouping } from '../ast/index.js';
import type { Binding, CheckedCall, CheckedScript, LibraryEntry } from '../check/index.js';
import type { DiagnosticSink } from '../diagnostics/index.js';
import type { SourceFile } from '../source/index.js';
import type { Span } from '../span/index.js';
import { CodeBuilder } from './code.js';
import { GapLog } from './gaps.js';
import { FrameLayout, Layout } from './layout.js';
import { ConstantPool } from './pool.js';
import type {
  Alert,
  Band,
  CompiledFunction,
  CompiledInput,
  Grid,
  LibraryFunction,
  Level,
  Loop,
  Marker,
  Paint,
  Plot,
} from './program.js';
import { fold } from './values.js';
import type { FoldEnvironment, Value } from './values.js';

/**
 * The calls that declare part of the file's fixed shape and compile to no
 * `CALL_LIB` at all.
 *
 * This is the split the format turns on. A `plot` call is an entry in
 * `outputs.plots` plus one `EMIT` per bar; `input` is a row of the settings
 * dialog and an engine writing a slot at step 5; `table` is a declared grid.
 * None of them is a function an engine calls, so none of them belongs in
 * `lib.functions`, whose only purpose is to be named by a `CALL_LIB` (2.5).
 */
const DECLARATION_CALLS = new Set([
  'plot',
  'plotCandles',
  'fill',
  'level',
  'table',
  'input',
  'signal',
  'alert',
  'barColor',
  'background',
]);

export interface EmitOptions {
  /** The library manifest version, tied to `openscript.language` (2.5). */
  readonly manifest?: number;
  /** The engine's declared state region count, for OS5004. */
  readonly maxStates?: number;
  /** The engine's instruction ceiling, for OS5009. */
  readonly maxInstructions?: number;
  /** Give every top-level name a register, which is `debug.retain` (2.10). */
  readonly retain?: boolean;
}

/** One call site under construction; its bases are filled once totals are known. */
export interface Site {
  readonly index: number;
  fn: number;
  argc: number;
  cellBase: number;
  stateBase: number;
  series: number[];
  /** The body this site's `fn` entry was built from, for the base walk. */
  frame: FrameLayout | undefined;
  /** Sites reached from inside that body, so bases nest without overlapping. */
  children: number[];
}

/** A loop being emitted, and where `break` and `continue` jump to. */
export interface LoopFrame {
  readonly id: number;
  readonly breaks: number[];
  readonly continues: number[];
}

/** The frame a pass is emitting into: the top level, or one function body. */
export class Frame {
  readonly layout = new FrameLayout();
  readonly builder = new CodeBuilder();
  readonly loops: LoopFrame[] = [];
  /** Sites created while emitting this frame, in the order they were created. */
  readonly sites: number[] = [];
  /** A parameter's position, for `HISTP`, by the binding that declared it. */
  readonly parameters = new Map<number, number>();
  readonly topLevel: boolean;

  constructor(topLevel: boolean) {
    this.topLevel = topLevel;
  }
}

export class Emitter {
  readonly pool = new ConstantPool();
  readonly layout = new Layout();
  readonly gaps = new GapLog();
  readonly libraryFunctions: LibraryFunction[] = [];
  /** The signature behind each entry, which is what `requires` is derived from. */
  readonly calledEntries: LibraryEntry[] = [];
  readonly sites: Site[] = [];
  readonly functions: CompiledFunction[] = [];
  readonly functionPos: (readonly [number, readonly (readonly [number, number, number])[]])[] = [];
  readonly loops: Loop[] = [];
  /** A frame per emitted function entry, for the cell and state base walk. */
  readonly functionFrames: FrameLayout[] = [];
  /**
   * File-scope names given a register although nothing reads their history.
   *
   * A slot belongs to one frame, so a name a function body reads has to live
   * somewhere every frame can address; `registers.ts` is where that is decided.
   */
  readonly promoted = new Set<number>();
  /** Cells and input slots carrying a register beside them, kept in step per bar. */
  readonly shadowed = new Set<number>();
  /** Bodies being emitted, so a call graph with a cycle in it stops (11.4). */
  readonly emitting = new Set<number>();

  /**
   * The file's fixed shape, filled in source order as the declarations are met.
   *
   * Source order is declaration order is legend order, so nothing sorts these
   * afterwards: the script already decided, and a second decision here would be
   * a second answer (2.8).
   */
  readonly plots: Plot[] = [];
  readonly fills: Band[] = [];
  readonly levels: Level[] = [];
  readonly markers: Marker[] = [];
  readonly tables: Grid[] = [];
  readonly alerts: Alert[] = [];
  readonly inputs: CompiledInput[] = [];
  barColor: Paint | null = null;
  background: Paint | null = null;
  /** The plot key a declaration handle holds, so `fill` can name two of them. */
  readonly handleKeys = new Map<number, string>();

  private readonly libraryIndex = new Map<string, number>();
  /** A leaf body, which calls no user function, is shared by every call site. */
  private readonly sharedBodies = new Map<number, number>();

  readonly file: SourceFile;
  readonly checked: CheckedScript;
  readonly sink: DiagnosticSink;
  readonly options: EmitOptions;

  constructor(
    file: SourceFile,
    checked: CheckedScript,
    sink: DiagnosticSink,
    options: EmitOptions,
  ) {
    this.file = file;
    this.checked = checked;
    this.sink = sink;
    this.options = options;
  }

  /** The checker's answer for one call, which the emitter never re-derives. */
  callAt(call: Call): CheckedCall | undefined {
    return this.checked.callSites.get(call);
  }

  /** The declaration a name means, from the checker's own resolution. */
  bindingAt(reference: NameReference): Binding | undefined {
    return this.checked.references.get(reference);
  }

  /** Whether a call is a declaration rather than something an engine calls. */
  isDeclaration(name: string): boolean {
    return DECLARATION_CALLS.has(name);
  }

  /**
   * The index of a library function in `lib.functions`, adding it on first use.
   *
   * `state` and `effect` are recorded beside the name because 2.5 requires them
   * and because they are facts an engine already knows: they are there to be
   * disagreed with at load, which is how a program compiled against a newer
   * library is caught before it computes a wrong number.
   */
  libraryFunction(entry: LibraryEntry): number {
    // Keyed by name and arity, because a name may carry two signatures: `clear`
    // empties an array or a grid and the two are separate entries (stdlib 2.2).
    const key = `${entry.name}/${entry.parameters.length}`;
    const found = this.libraryIndex.get(key);
    if (found !== undefined) return found;
    const index = this.libraryFunctions.length;
    this.libraryFunctions.push({
      name: entry.name,
      arity: entry.parameters.length,
      state: entry.stateful,
      effect: effectOf(entry),
    });
    this.calledEntries.push(entry);
    this.libraryIndex.set(key, index);
    return index;
  }

  newSite(fn: number, argc: number): Site {
    const site: Site = {
      index: this.sites.length,
      fn,
      argc,
      cellBase: 0,
      stateBase: 0,
      series: [],
      frame: undefined,
      children: [],
    };
    this.sites.push(site);
    return site;
  }

  newLoop(kind: Loop['kind'], span: Span): number {
    const id = this.loops.length;
    this.loops.push({ id, kind, line: span.line, col: span.column });
    return id;
  }

  /** A body that calls no user function is one entry however many sites reach it. */
  shareableBody(checkedFunction: number): number | undefined {
    return this.sharedBodies.get(checkedFunction);
  }

  rememberShareableBody(checkedFunction: number, emitted: number): void {
    this.sharedBodies.set(checkedFunction, emitted);
  }

  gap(what: string, specification: string, span: Span | undefined, blocking: boolean): void {
    this.gaps.add({ what, specification, span, blocking });
  }

  /**
   * The value an expression has before bar 0, or nothing when it has none.
   *
   * The environment is built here because folding needs two answers only the
   * checker has: which declaration a name means, and which signature a call
   * resolved to with its arguments already in parameter order.
   */
  fold(expression: Expression): Value | undefined {
    return fold(expression, this.foldEnvironment());
  }

  private foldEnvironment(): FoldEnvironment {
    return {
      name: (reference: NameReference): Value | undefined => {
        const binding = this.bindingAt(reference);
        if (binding === undefined) return undefined;
        if (binding.input === undefined) return undefined;
        const input = this.checked.inputs[binding.input];
        return input === undefined ? undefined : { kind: 'input', key: keyOf(input.name, binding) };
      },
      call: (call: Call) => {
        const checked = this.callAt(call);
        if (checked === undefined || checked.target !== 'library') return undefined;
        return { name: checked.name, args: checked.arguments };
      },
    };
  }
}

function keyOf(name: string, binding: Binding): string {
  return name === '' ? binding.name : name;
}

/**
 * Which of the five effects a library call carries, `compiled-program.md` 2.5
 * and 5.4.
 *
 * The rule an entry is read by rather than a list of names, because a list in a
 * second place is a list that drifts. A call with an effect does not perform it
 * when it executes: it appends a record and **pushes absent as its result**. So
 * a call whose result a script uses cannot carry one, and that single sentence
 * settles every case in version 1.
 *
 * `order` is every call that spends money: `strategyOnly`, written with
 * brackets, and returning nothing. A `pos.*` reading is not one, because it is
 * read bare; `order.qtyForRisk` is not one, because it returns a number the
 * script goes on to size an order with.
 *
 * `log` is `print`, which reaches a log outside the machine.
 *
 * `draw` and `signal` are not reachable in version 1 and the emitter says so
 * rather than guessing. A drawing object lives in the object heap, which rolls
 * back with everything else (6.1), so a drawing needs no deferral to be
 * idempotent on a moving bar; a table cell is written to a per-bar output
 * buffer that is committed with the columns (2.8); and a marker and an alert
 * reach the host through a channel declared `defer`, not through a call.
 */
function effectOf(entry: LibraryEntry): LibraryFunction['effect'] {
  if (entry.name === 'print') return 'log';
  if (entry.strategyOnly && entry.callable && entry.returns.kind === 'nothing') return 'order';
  return 'none';
}

/** The argument written for one parameter of a resolved call, or nothing. */
export function argumentAt(
  checked: CheckedCall,
  entry: LibraryEntry,
  name: string,
): Argument | undefined {
  const index = entry.parameters.findIndex((one) => one.name === name);
  return index < 0 ? undefined : checked.arguments[index];
}

/** The dotted name a callee spells, for a call the checker did not resolve. */
export function calleeText(expression: Expression): string {
  const inner = withoutGrouping(expression);
  if (inner.kind === 'nameReference') return inner.name;
  if (inner.kind === 'member') {
    const object = withoutGrouping(inner.object);
    if (object.kind === 'nameReference') return `${object.name}.${inner.member.text}`;
  }
  return '';
}
