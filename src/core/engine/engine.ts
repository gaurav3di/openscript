/**
 * The bar cycle, `compiled-program.md` 5.1, and the one door a host comes
 * through.
 *
 * Eleven steps in one order, and everything else in the engine is a detail of
 * one of them. Two pairs of steps carry the whole of what makes a live chart
 * and a backtest of the same data agree:
 *
 * - **Steps 1 and 2 make a still-moving bar idempotent.** The newest bar
 *   re-executes on every update, so the state rolls back to the start of that
 *   bar and the register histories are truncated before anything runs again.
 * - **Steps 8 and 9 separate what a script may do on a moving bar from what it
 *   may not.** The drawing is recomputed from scratch and published every time;
 *   a signal, an alert or an order waits for the bar to close.
 *
 * **Nothing here throws.** A host draws many studies in one render loop and a
 * platform runs many customers' scripts in one process, so a failure becomes a
 * diagnostic on this script and touches nothing else. The catch is deliberately
 * broad: a diagnostic carries its code and position, and anything else becomes
 * OS6018, because a verified program that still threw is not the program
 * verification walked.
 */
import type { Diagnostic } from '../diagnostics/index.js';
import type { SourceFile } from '../source/index.js';
import type { Span } from '../span/index.js';
import { BAR_FIELDS, barField, factsFor } from './bars.js';
import type { BarFacts, BarState, HostBar } from './bars.js';
import { Budget, limitsWith, stepBound } from './budget.js';
import type { Clock, EngineLimits } from './budget.js';
import { Channels } from './channels.js';
import type { PendingEffect } from './channels.js';
import { ScriptError, malformed, spanAt, unexpected } from './errors.js';
import { guardFor } from './guard.js';
import type { EngineHost } from './host.js';
import { hostBool, hostNumber, hostString } from './host.js';
import { fieldValue, resolveInputs, utcTime } from './inputs.js';
import type { ResolvedInput, TimeResolver } from './inputs.js';
import { manifestEntry } from './library/index.js';
import type { BarView, HostFacts, ManifestEntry } from './library/index.js';
import { Machine } from './machine.js';
import { Memory } from './memory.js';
import { Registers } from './registers.js';
import type { CompiledProgram, Position } from './types.js';
import { capabilitiesFor, verify } from './verify.js';
import type { DrawingObject, GridCell, Value } from './values/index.js';
import { Heap, reference } from './values/index.js';

export interface LoadOptions {
  /** The host's settings, keyed by input `key`. */
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly limits?: Partial<EngineLimits>;
  /** The source, so a diagnostic's span can carry an offset as well as a line. */
  readonly source?: SourceFile;
  readonly host?: EngineHost;
  /** A reading of the wall clock, for the per bar time budget. */
  readonly clock?: Clock;
  /** How a `"time"` input's stored wall clock string becomes a timestamp. */
  readonly time?: TimeResolver;
}

export type LoadResult =
  | { readonly ok: true; readonly engine: Engine }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

/** What one execution of one bar produced. */
export interface BarResult {
  readonly index: number;
  /** One value per channel, absent where nothing wrote, in channel order. */
  readonly columns: readonly Value[];
  /** Whether step 9 applied the deferred channels and the pending effects. */
  readonly applied: boolean;
  readonly effects: readonly PendingEffect[];
  /** The failure that stopped the bar, when one did. */
  readonly diagnostic: Diagnostic | undefined;
}

export interface RunResult {
  readonly bars: readonly BarResult[];
  readonly diagnostic: Diagnostic | undefined;
}

/** A grid the program declared, with the cells this bar wrote into it. */
export interface Grid {
  readonly key: string;
  readonly rows: number;
  readonly cols: number;
  readonly cells: readonly GridCell[];
}

/**
 * Loads a compiled program.
 *
 * Verification runs first and in full (3.5), then the refusals a host makes,
 * then input resolution. Nothing is executed until all three pass, so a program
 * that cannot run says so before a chart has drawn anything.
 */
export function load(program: unknown, options: LoadOptions = {}): LoadResult {
  const limits = limitsWith(options.limits);
  const host = options.host ?? {};
  const checked = verify(program, {
    capabilities: capabilitiesFor(host.route !== undefined),
    limits,
  });
  if (!checked.ok) return { ok: false, diagnostic: checked.diagnostic };

  const unknownField = checked.program.series.find(
    (one) => one.kind === 'bar' && (one.field === null || !BAR_FIELDS.includes(one.field)),
  );
  if (unknownField !== undefined) {
    return {
      ok: false,
      diagnostic: malformed(
        `series[${unknownField.id}].field`,
        `${String(unknownField.field)} is not a bar field this engine can fill`,
      ),
    };
  }

  const resolved = resolveInputs(
    checked.program,
    options.settings ?? {},
    options.time ?? utcTime,
  );
  if (!resolved.ok) return { ok: false, diagnostic: resolved.diagnostic };

  return { ok: true, engine: new Engine(checked.program, resolved.inputs, options, limits) };
}

export class Engine {
  private readonly registers: Registers;
  private readonly memory: Memory;
  private readonly channels: Channels;
  private readonly heap = new Heap();
  private readonly budget: Budget;
  private readonly machine: Machine;
  private readonly library: ManifestEntry[] = [];
  private readonly grids: { readonly key: string; readonly slot: number; readonly id: number }[] =
    [];
  private readonly onUnconfirmed: boolean;

  private supplied = 0;
  private index = -1;
  private updates = 0;
  private started = false;
  private previousClose: Value = null;
  private lastClose: Value = null;
  private facts: BarFacts;
  private view: BarView;
  private failure: Diagnostic | undefined;

  readonly program: CompiledProgram;
  private readonly inputs: readonly ResolvedInput[];
  private readonly options: LoadOptions;

  constructor(
    program: CompiledProgram,
    inputs: readonly ResolvedInput[],
    options: LoadOptions,
    limits: EngineLimits,
  ) {
    this.program = program;
    this.inputs = inputs;
    this.options = options;
    this.registers = new Registers(program.series.length);
    this.memory = new Memory(program.cells, program.states);
    this.channels = new Channels(program.channels);
    this.budget = new Budget(
      limits,
      limits.steps ?? stepBound(program),
      program.limits.loops,
      options.clock,
    );
    this.onUnconfirmed = fieldValue(program.meta.onUnconfirmed, inputs) === true;

    for (const entry of program.lib.functions) {
      // Verification refused a name this engine does not have, so the lookup
      // cannot fail here and the table is resolved once rather than per call.
      this.library.push(manifestEntry(entry.name, entry.arity) as ManifestEntry);
    }

    this.facts = factsFor(0, 1, {}, true, 1);
    this.view = this.viewOf({ open: null, high: null, low: null, close: null, time: null });

    const fnPositions: (readonly Position[])[] = program.functions.map(() => []);
    for (const [fn, positions] of program.debug.fnPos) fnPositions[fn] = positions;

    this.machine = new Machine(
      {
        program,
        registers: this.registers,
        memory: this.memory,
        channels: this.channels,
        heap: this.heap,
        budget: this.budget,
        guard: guardFor(this.budget),
        host: this.hostFacts(),
        library: this.library,
        fnPositions,
        spanAt: (line: number, column: number): Span => spanAt(options.source, line, column),
      },
      this.view,
    );

    this.buildGrids();
  }

  /**
   * The grids the program declared, built once before bar 0.
   *
   * `table()` emits no instruction. The declaration fixes the grid's shape
   * before the first bar, exactly as an input's does, and the engine fills the
   * declared slot with the handle at step 5. Building it per bar would give a
   * script a different object every bar for something 2.8 calls part of the
   * study's fixed shape.
   */
  private buildGrids(): void {
    for (const declared of this.program.outputs.tables) {
      const rows = fieldValue(declared.rows, this.inputs);
      const cols = fieldValue(declared.cols, this.inputs);
      const id = this.heap.allocate({
        kind: 'table',
        rows: typeof rows === 'number' ? rows : 0,
        cols: typeof cols === 'number' ? cols : 0,
        cells: [],
      });
      this.grids.push({ key: declared.key, slot: declared.slot, id });
    }
    // The grids exist before the first bar, so nothing about them belongs to a
    // bar's undo journal.
    this.heap.commit();
  }

  private hostFacts(): HostFacts {
    const of = (): EngineHost => this.options.host ?? {};
    return {
      symbol: () => hostString(of().instrument?.symbol),
      exchange: () => hostString(of().instrument?.exchange),
      interval: () => hostString(of().instrument?.interval),
      timezone: () => hostString(of().instrument?.timezone),
      tickSize: () => hostNumber(of().instrument?.tickSize),
      lotSize: () => hostNumber(of().instrument?.lotSize),
      pointValue: () => hostNumber(of().instrument?.pointValue),
      currency: () => hostString(of().instrument?.currency),
      instrumentType: () => hostString(of().instrument?.instrumentType),
      hasVolume: () => hostBool(of().instrument?.hasVolume),
      hasOpenInterest: () => hostBool(of().instrument?.hasOpenInterest),
      now: () => hostNumber(of().now),
      // A host that answers no request has answered this one no, and has
      // reported no reason, which is what the two calls of stdlib.md 15.1 say
      // those states read as. An engine given request answers replaces both.
      requestReady: () => false,
      requestError: () => '',
      positionSize: () => hostNumber(of().position?.size),
      positionPrice: () => hostNumber(of().position?.avgPrice),
    };
  }

  private viewOf(bar: HostBar): BarView {
    return {
      index: this.facts.index,
      open: bar.open ?? null,
      high: bar.high ?? null,
      low: bar.low ?? null,
      close: bar.close ?? null,
      volume: bar.volume ?? null,
      time: bar.time ?? null,
      previousClose: typeof this.previousClose === 'number' ? this.previousClose : null,
      isConfirmed: this.facts.isConfirmed,
      isRealtime: this.facts.isRealtime,
      isNew: this.facts.isNew,
      isLast: this.facts.isLast,
      updates: this.facts.updates,
      isSessionStart: this.facts.isSessionStart,
      isSessionEnd: this.facts.isSessionEnd,
    };
  }

  /** Whether a failure has stopped this script. A stopped script stays stopped. */
  get failed(): boolean {
    return this.failure !== undefined;
  }

  /** How many bars the engine has been given. */
  get barCount(): number {
    return this.supplied;
  }

  /**
   * A new bar arrives.
   *
   * Step 11 of the previous bar happens here rather than at the end of it,
   * because a checkpoint is taken only if the engine is moving on to the next
   * bar, and until one arrives the previous bar may still be re-executed.
   */
  append(bar: HostBar, state: BarState = {}, supplied = this.supplied + 1): BarResult {
    if (this.started) this.checkpoint();
    this.index += 1;
    this.supplied = Math.max(supplied, this.index + 1);
    this.updates = 1;
    this.started = true;
    this.previousClose = this.lastClose;
    return this.execute(bar, state, true);
  }

  /**
   * The newest bar changed, so it runs again.
   *
   * Step 1: the checkpoint from the end of the previous bar is restored, except
   * that `"live"` cells keep their current values, which is the whole of
   * `live var`. Everything else rolls back, so executing a moving bar ten times
   * gives the same answer as executing it once.
   */
  update(bar: HostBar, state: BarState = {}): BarResult {
    if (!this.started) return this.append(bar, state);
    this.rollback();
    this.updates += 1;
    return this.execute(bar, state, false);
  }

  /** A whole dataset, appended in order. Stops at the first bar that fails. */
  run(bars: readonly HostBar[], states: readonly BarState[] = []): RunResult {
    const out: BarResult[] = [];
    for (let i = 0; i < bars.length; i += 1) {
      const bar = bars[i];
      if (bar === undefined) continue;
      const result = this.append(bar, states[i] ?? {}, bars.length);
      out.push(result);
      if (result.diagnostic !== undefined) return { bars: out, diagnostic: result.diagnostic };
    }
    return { bars: out, diagnostic: undefined };
  }

  private execute(bar: HostBar, state: BarState, isNew: boolean): BarResult {
    if (this.failure !== undefined) {
      return { index: this.index, columns: [], applied: false, effects: [], diagnostic: this.failure };
    }
    const index = this.index;
    this.facts = factsFor(index, this.supplied, state, isNew, this.updates);
    this.view = this.viewOf(bar);

    try {
      // Step 2. Any entry a previous execution of this bar wrote is discarded.
      this.registers.truncate(index);

      // Step 3.
      this.channels.clear();
      this.registers.clearCurrent();
      this.budget.begin(index);
      for (const grid of this.grids) {
        const object = this.heap.get(grid.id);
        if (object !== undefined && object.kind === 'table') object.cells = [];
      }
      this.machine.begin(this.view, index);

      // Step 4.
      const slots = this.machine.slots();
      for (const register of this.program.series) {
        if (register.kind !== 'bar' || register.field === null) continue;
        this.registers.set(register.id, barField(register.field, bar, this.facts));
      }

      // Step 5. An input's value and a grid's handle land in their slots here,
      // and nothing is resolved: that happened once, at load.
      for (const input of this.inputs) {
        slots[input.slot] =
          input.field === undefined ? input.value : barField(input.field, bar, this.facts);
      }
      for (const grid of this.grids) slots[grid.slot] = reference(grid.id);

      // Step 6.
      this.machine.run();
    } catch (thrown) {
      return this.stopped(thrown);
    }

    // Step 7.
    this.registers.close(index);
    // Step 8: the columns, whatever the bar's state.
    this.channels.publish(index);
    // Step 9.
    const applied = this.facts.isConfirmed || this.onUnconfirmed;
    const effects = this.channels.decide(applied);
    const route = this.options.host?.route;
    if (route !== undefined) for (const effect of effects) route(effect, index);
    // Step 10.
    this.registers.trim(index, this.program.limits.history);

    this.lastClose = bar.close ?? null;
    return {
      index,
      columns: this.channels.row(index),
      applied,
      effects,
      diagnostic: undefined,
    };
  }

  /**
   * A bar that failed.
   *
   * Steps 7 to 11 do not run, the bar's output columns keep whatever the
   * previous execution published or stay absent, and the engine reports the
   * error with its code and source position. It does not continue to the next
   * bar with a half executed state, so the journal is rolled back and the
   * script is marked stopped.
   */
  private stopped(thrown: unknown): BarResult {
    const diagnostic =
      thrown instanceof ScriptError ? thrown.diagnostic : unexpected('the bar', thrown);
    this.rollback();
    this.failure = diagnostic;
    return { index: this.index, columns: [], applied: false, effects: [], diagnostic };
  }

  /** Step 11, and the sweep that pays for the objects the bar left behind. */
  private checkpoint(): void {
    this.memory.commit();
    this.heap.commit();
    this.heap.sweep((visit) => {
      this.memory.walk(visit);
      this.registers.walk(visit);
      for (const grid of this.grids) visit(reference(grid.id));
    });
  }

  private rollback(): void {
    this.memory.rollback();
    this.heap.rollback();
  }

  /** One channel's column over every bar executed so far. */
  column(channel: number): readonly Value[] {
    return this.channels.column(channel, this.supplied);
  }

  /** The drawing objects a host should render, in creation order. */
  drawings(): readonly { readonly id: number; readonly object: DrawingObject }[] {
    return this.heap.drawings();
  }

  /** The grids and the cells the last executed bar wrote into them. */
  tables(): readonly Grid[] {
    return this.grids.map((grid) => {
      const object = this.heap.get(grid.id);
      const table = object !== undefined && object.kind === 'table' ? object : undefined;
      return {
        key: grid.key,
        rows: table?.rows ?? 0,
        cols: table?.cols ?? 0,
        cells: table?.cells ?? [],
      };
    });
  }
}
