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
import type { Span } from '../span/index.js';
import { barField, barViewOf, factsFor } from './bars.js';
import type { BarFacts, BarState, HostBar } from './bars.js';
import { alertsFor } from './alerts.js';
import type { Alerts } from './alerts.js';
import { Budget, stepBound } from './budget.js';
import type { EngineLimits } from './budget.js';
import { Channels } from './channels.js';
import { ScriptError, spanAt, unexpected } from './errors.js';
import { guardFor } from './guard.js';
import { hostFactsFor } from './host.js';
import { fieldValue } from './inputs.js';
import type { ResolvedInput } from './inputs.js';
import { manifestEntry } from './library/index.js';
import type { BarView, ManifestEntry } from './library/index.js';
import type { LoadOptions } from './load.js';
import { Machine } from './machine.js';
import { Memory } from './memory.js';
import { Registers } from './registers.js';
import { Grids } from './grids.js';
import type { Grid } from './grids.js';
import type { Ledger } from './ledger/index.js';
import type { LedgerRow, OrderFrame } from './ledger/index.js';
import { ledgerFor, routedEffects } from './orders.js';
import type { CompiledProgram, Position } from './types.js';
import type { RequestPlan } from './request-plan.js';
import { NO_SESSION, sessionReader } from './session/index.js';
import type { SessionReader } from './session/index.js';
import { handOver, noBars } from './series.js';
import { KnownBars, sourceOf } from './bar-source.js';
import type { BarColumns } from './bar-source.js';
import { barMinutesOf } from './timeframe.js';
import { RequestSet } from './requests.js';
import type { Value } from './values/index.js';
import { Heap } from './values/index.js';
import { drawingsIn } from './drawings.js';
import type { Drawing } from './drawings.js';
import type { BarResult, RunResult } from './results.js';

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
   * What this strategy sent and what became of it, `stdlib.md` 17.7. Held by
   * the run rather than asked of the host, because a host's position row is per
   * contract and shared: reading it is reading somebody else's trade.
   */
  private readonly ledger: Ledger;
  /**
   * The instrument's session, read once from the record it belongs to.
   *
   * Once because the record is read once, at load, and is constant for the
   * whole run (`host-interface.md` 4.4). A session that changed between bar ten
   * and bar eleven would anchor the first ten bars of a study to one schedule
   * and the rest of the same chart to another.
   */
  private readonly sessions: SessionReader;
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
  private readonly known = new KnownBars();

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

    const instrument = options.host?.instrument;
    this.sessions = sessionReader(
      instrument?.session,
      typeof instrument?.timezone === 'string' ? instrument.timezone : null,
      barMinutesOf(instrument?.interval),
    );

    const facts = hostFactsFor(() => this.options.host ?? {}, {
      answered: (id: Value) => this.requests.answered(id),
      failure: (id: Value) => this.requests.failure(id),
    });

    this.ledger = ledgerFor(program, inputs, instrument);
    const position = {
      size: (): Value => this.ledger.size(),
      avgPrice: (): Value => this.ledger.avgPrice(),
    };

    this.facts = factsFor(0, 1, {}, true, 1, NO_SESSION);
    this.view = barViewOf({ open: null, high: null, low: null, close: null, time: null }, this.facts, null);

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
        host: facts,
        position,
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
        facts,
        position,
        heapOf: () => this.heap,
        spanAt: (line: number, column: number): Span => spanAt(options.source, line, column),
      },
      program.requests,
    );

    this.grids = new Grids(program, inputs, this.heap);
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
    // Before anything moves: a bar that does not follow the one before it is
    // refused rather than executed, because every value the bar produces would
    // be derived from a history that never happened (`series.ts`). A script
    // that has already failed keeps the failure it has, which is the one that
    // explains what went wrong first.
    if (this.failure === undefined) {
      const problem = handOver(bar, this.known.at(this.index), this.index + 1);
      if (problem !== undefined) return this.refuse(problem);
    }
    if (this.started) this.checkpoint();
    this.index += 1;
    this.supplied = Math.max(supplied, this.index + 1);
    this.updates = 1;
    this.started = true;
    this.previousClose = this.lastClose;
    if (this.known.length <= this.index) this.known.set(this.index, bar);
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
    // A revision is the same bar again, so it is held to the same order: an
    // update whose time has moved back onto the bar before it is a series the
    // engine cannot run on, whatever it is called.
    if (this.failure === undefined) {
      const problem = handOver(bar, this.known.at(this.index - 1), this.index);
      if (problem !== undefined) return this.refuse(problem);
    }
    this.rollback();
    this.updates += 1;
    // A revision replaces the bar the fold already read, so the bucket it is
    // inside is rebuilt from this reading rather than from the one it replaced.
    this.known.set(this.index, bar);
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
   *
   * A dataset with nothing in it is OS6010 and not an empty result, because a
   * pane with nothing drawn on it is what a study that computed nothing also
   * produces and only the engine can tell the two apart.
   */
  run(bars: readonly HostBar[] | BarColumns, states: readonly BarState[] = []): RunResult {
    const source = sourceOf(bars);
    const out: BarResult[] = [];
    // No bars at all is answered here: the loop below would return an empty, wordless result.
    if (source.length === 0 && !this.started) {
      const diagnostic = this.failure ?? noBars(this.options.host?.instrument);
      this.failure = diagnostic;
      return { bars: [], diagnostic };
    }
    this.known.reset(source);
    for (let i = 0; i < source.length; i += 1) {
      const bar = source.at(i);
      if (bar === undefined) continue;
      const result = this.append(bar, states[i] ?? {}, source.length);
      out.push(result);
      if (result.diagnostic !== undefined) return { bars: out, diagnostic: result.diagnostic };
    }
    return { bars: out, diagnostic: undefined };
  }

  /**
   * A frame from the destination, `host-interface.md` 7.2. Held until the next
   * bar begins rather than folded where it lands: nothing reaches a running
   * execution, so every position fact is constant for the length of one and a
   * moving bar sees what its first execution saw.
   */
  deliver(frame: OrderFrame): void {
    this.ledger.deliver(frame);
  }

  /** The strategy's own ledger, `stdlib.md` 17.7, oldest row first. */
  orders(): readonly LedgerRow[] {
    return this.ledger.rows();
  }

  private execute(bar: HostBar, state: BarState, isNew: boolean): BarResult {
    if (this.failure !== undefined) {
      return {
        index: this.index,
        columns: [],
        applied: false,
        effects: [],
        frames: [],
        alerts: [],
        diagnostic: this.failure,
      };
    }
    const index = this.index;
    // The fold, at the boundary between two bars and before step 4. A
    // re-execution folds nothing: the same frames reaching one bar twice would
    // settle the same fill twice.
    const frames = isNew ? this.ledger.settle() : [];
    // The bar before this one, which is what says whether this bar opened a
    // session or is inside the one that bar was already in. Read from the bars
    // themselves rather than carried, so a re-executed bar compares against the
    // same neighbour it compared against the first time.
    const previous = this.known.at(index - 1)?.time ?? null;
    this.facts = factsFor(
      index,
      this.supplied,
      state,
      isNew,
      this.updates,
      this.sessions.factsAt(bar.time ?? null, previous),
    );
    this.view = barViewOf(bar, this.facts, this.previousClose);

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
    // marker, an alert and an order are one decision about one bar, and an
    // order the language will not place stops the bar with nothing routed.
    const applied = this.facts.isConfirmed || this.onUnconfirmed;
    const pending = this.channels.decide(index, applied);
    const sending = { index, time: bar.time ?? null };
    const routed = routedEffects(this.ledger, pending, sending, this.options.host?.route);
    if (routed.refusal !== undefined) return this.stopped(new ScriptError(routed.refusal));
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
      effects: routed.effects,
      frames,
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
  /**
   * A hand-over the engine refuses, before any of it has been executed.
   *
   * Nothing is rolled back because nothing has run: the bar was never begun,
   * the previous bar's checkpoint still stands, and the columns already
   * published stay as they are. The script is stopped for the same reason a
   * failed bar stops it, which is that the next bar would be computed on a
   * state nobody can account for.
   */
  private refuse(diagnostic: Diagnostic): BarResult {
    this.failure = diagnostic;
    return {
      index: this.index,
      columns: [],
      applied: false,
      effects: [],
      frames: [],
      alerts: [],
      diagnostic,
    };
  }

  private stopped(thrown: unknown): BarResult {
    const diagnostic =
      thrown instanceof ScriptError ? thrown.diagnostic : unexpected('the bar', thrown);
    this.rollback();
    this.failure = diagnostic;
    return {
      index: this.index,
      columns: [],
      applied: false,
      effects: [],
      frames: [],
      alerts: [],
      diagnostic,
    };
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
