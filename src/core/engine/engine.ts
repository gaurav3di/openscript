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
import { alertsFor } from './alerts.js';
import type { AlertFiring, Alerts } from './alerts.js';
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
import { Grids } from './grids.js';
import type { Grid } from './grids.js';
import type { CompiledProgram, Position } from './types.js';
import { planRequests } from './request-plan.js';
import type { RequestPlan } from './request-plan.js';
import { RequestSet } from './requests.js';
import { capabilitiesFor, verify } from './verify.js';
import type { Value } from './values/index.js';
import { Heap } from './values/index.js';
import { drawingsIn } from './drawings.js';
import type { Drawing } from './drawings.js';

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
  /** The watched conditions this bar raised, empty on a bar that raised none. */
  readonly alerts: readonly AlertFiring[];
  /** The failure that stopped the bar, when one did. */
  readonly diagnostic: Diagnostic | undefined;
}

export interface RunResult {
  readonly bars: readonly BarResult[];
  readonly diagnostic: Diagnostic | undefined;
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
    capabilities: capabilitiesFor(host.route !== undefined, host.requestBars !== undefined),
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

  // 2.16: a request's identity is fixed before bar 0, so it is settled here,
  // along with the two refusals that are facts about the program and the chart
  // rather than answers from the host: a timeframe the language does not know,
  // and one that cannot be folded onto this chart's bars.
  const planned = planRequests(checked.program.requests, resolved.inputs, host);
  if (!planned.ok) return { ok: false, diagnostic: planned.diagnostic };

  return {
    ok: true,
    engine: new Engine(checked.program, resolved.inputs, options, limits, planned.plans),
  };
}

export class Engine {
  private readonly registers: Registers;
  private readonly memory: Memory;
  private readonly channels: Channels;
  private readonly heap = new Heap();
  private readonly budget: Budget;
  private readonly machine: Machine;
  private readonly library: ManifestEntry[] = [];
  private readonly grids: Grids;
  private readonly onUnconfirmed: boolean;
  private readonly alerting: Alerts;
  private readonly requests: RequestSet;
  /**
   * The bars the engine has been given, which a read folds.
   *
   * A read of the chart's own instrument at a coarser interval is folded from
   * these, so the fold needs the bars themselves and not only the registers
   * derived from them. `run` seeds the whole dataset before bar 0 and `append`
   * adds one at a time, which is the difference a `"lookahead"` read shows and
   * the other two modes do not: lookahead reads to the end of the bucket the
   * chart bar is inside, and on a live feed there is nothing there yet. That is
   * the mode repainting on history, permanently and by design.
   */
  private known: HostBar[] = [];

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
    plans: readonly RequestPlan[] = [],
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
    // A watched condition's title and frequency are declaration fields, which a
    // script may write with an `input()`, and inputs are resolved at load. So
    // they are read once here rather than per bar, as every other declaration
    // the descriptor is built from is.
    this.alerting = alertsFor(program, inputs);

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

    this.requests = new RequestSet(
      {
        program,
        plans: new Map(plans.map((one) => [one.request.id, one])),
        host: options.host ?? {},
        limits,
        clock: options.clock,
        library: this.library,
        inputs,
        facts: this.hostFacts(),
        heapOf: () => this.heap,
        spanAt: (line: number, column: number): Span => spanAt(options.source, line, column),
      },
      program.requests,
    );

    this.grids = new Grids(program, inputs, this.heap);
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
      // Both name a read rather than taking its value, which is why the
      // compiler resolved the name to the request's id: a value on a bar cannot
      // say which request produced it (2.16). A read this program does not make
      // has not been answered and has reported no reason.
      requestReady: (id: Value) => this.requests.answered(id),
      requestError: (id: Value) => this.requests.failure(id),
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
    if (this.known.length <= this.index) this.known[this.index] = bar;
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
    // A revision replaces the bar the fold already read, so the bucket it is
    // inside is rebuilt from this reading rather than from the one it replaced.
    this.known[this.index] = bar;
    return this.execute(bar, state, false);
  }

  /**
   * A whole dataset, appended in order. Stops at the first bar that fails.
   *
   * The whole set is handed to the fold before bar 0 rather than discovered one
   * bar at a time. Nothing about a confirmed or a developing read changes: both
   * stop at the bar being executed, so running a dataset and appending it bar by
   * bar give the same numbers. A `"lookahead"` read is the one that differs, and
   * that difference is the mode: it reads to the end of the bucket the chart bar
   * is inside, which exists in a dataset and does not exist on a live feed.
   */
  run(bars: readonly HostBar[], states: readonly BarState[] = []): RunResult {
    const out: BarResult[] = [];
    this.known = [...bars];
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
      return {
        index: this.index,
        columns: [],
        applied: false,
        effects: [],
        alerts: [],
        diagnostic: this.failure,
      };
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
      this.grids.clear();
      this.machine.begin(this.view, index);

      // Step 4.
      const slots = this.machine.slots();
      for (const register of this.program.series) {
        if (register.kind !== 'bar' || register.field === null) continue;
        this.registers.set(register.id, barField(register.field, bar, this.facts));
      }
      // The same step fills each read's `"request"` register, absent where the
      // answer has not arrived or the read's mode allows no value yet (2.16).
      if (!this.requests.empty) this.requests.fill(this.registers, this.known, index, isNew);

      // Step 5. An input's value and a grid's handle land in their slots here,
      // and nothing is resolved: that happened once, at load.
      for (const input of this.inputs) {
        slots[input.slot] =
          input.field === undefined ? input.value : barField(input.field, bar, this.facts);
      }
      this.grids.fill(slots);

      // Step 6.
      this.machine.run();
    } catch (thrown) {
      return this.stopped(thrown);
    }

    // Step 7.
    this.registers.close(index);
    // Step 8: the columns, whatever the bar's state.
    this.channels.publish(index);
    // Step 9. The deferred channels and the pending effects, together: a
    // marker, an alert and an order are one decision about one bar.
    const applied = this.facts.isConfirmed || this.onUnconfirmed;
    const effects = this.channels.decide(index, applied);
    const route = this.options.host?.route;
    if (route !== undefined) for (const effect of effects) route(effect, index);
    const alerts = applied
      ? this.alerting.raise(
          { index, time: bar.time ?? null, isRealtime: this.facts.isRealtime },
          (channel) => this.channels.at(channel, index),
        )
      : [];
    // Step 10.
    this.registers.trim(index, this.program.limits.history);

    this.lastClose = bar.close ?? null;
    return {
      index,
      columns: this.channels.row(index),
      applied,
      effects,
      alerts,
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
    return { index: this.index, columns: [], applied: false, effects: [], alerts: [], diagnostic };
  }

  /** Step 11, and the sweep that pays for the objects the bar left behind. */
  private checkpoint(): void {
    this.memory.commit();
    this.heap.commit();
    this.heap.sweep((visit) => {
      this.memory.walk(visit);
      this.registers.walk(visit);
      this.grids.walk(visit);
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
  drawings(): readonly Drawing[] {
    return drawingsIn(this.heap);
  }

  /** The grids and the cells the last executed bar wrote into them. */
  tables(): readonly Grid[] {
    return this.grids.read();
  }
}
