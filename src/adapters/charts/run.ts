/**
 * Driving the engine from a chart's recompute.
 *
 * The descriptor's two calculation hooks are the engine's two entry points
 * almost exactly. A full recompute is a fresh engine over every bar. A tail
 * change is `update()` on the bar that moved and `append()` for anything after
 * it, which is what the engine's rollback exists for: re-executing a moving bar
 * gives the same numbers as executing it once, so a live chart and a backtest of
 * the same data agree. Nothing here recomputes anything the engine computes.
 *
 * **The tail path is refused rather than trusted.** A held engine is only usable
 * while it was loaded from the same settings and has executed exactly the bars
 * before the tail, so the settings are compared by their own spelling and the
 * first and last bar times are compared against what was run. Anything that does
 * not line up returns nothing and the chart falls back to a full recompute,
 * because splicing a tail onto a history that has changed underneath it draws a
 * wrong study that looks entirely plausible.
 *
 * **The engine never throws and a chart's calculation has to.** A failure the
 * engine returns becomes an error carrying that diagnostic whole, which is the
 * one place in this adapter where the two error models meet.
 */
import type {
  Clock,
  EffectRoute,
  Engine,
  EngineHost,
  EngineLimits,
  Instrument,
  Position,
  TimeResolver,
  Value,
} from '../../core/engine/index.js';
import { load, utcTime } from '../../core/engine/index.js';
import type { CompiledProgram } from '../../core/emit/index.js';
import type { SourceFile } from '../../core/index.js';
import { hostBar, hostNow, stateFor } from './bars.js';
import type { SessionCalendar } from './bars.js';
import type { ChartBar, ChartCalcContext, ChartSettings, ChartStore } from './contract.js';
import { refused, stopped } from './errors.js';
import { engineSettings, signatureOf } from './settings.js';

/** What a host tells the adapter that neither the chart nor the program says. */
export interface ChartAdapterOptions {
  /**
   * The registry id, and the name a saved layout stores.
   *
   * It defaults to the program's own source hash, so the same script restores
   * to the same study and an edited script does not silently inherit the
   * settings of the one it replaced.
   */
  readonly id?: string;
  /** The category a picker groups the study under, when `meta.group` is empty. */
  readonly category?: string;
  /** The source, so a diagnostic can carry an offset as well as a line. */
  readonly source?: SourceFile;
  /** Instrument facts a chart does not hold: the exchange, the lot size. */
  readonly instrument?: Instrument;
  /** The position a strategy reads, until a backtester owns one. */
  readonly position?: Position;
  /**
   * Where an applied order goes.
   *
   * Without one the engine declares no `orders` capability and refuses a
   * strategy at load with OS6006, naming it. That is deliberate: a chart that
   * quietly swallowed a strategy's orders while drawing its plots would be a
   * strategy the user believes is running.
   */
  readonly orders?: EffectRoute;
  readonly limits?: Partial<EngineLimits>;
  readonly clock?: Clock;
  /**
   * A wall clock string in the chart's zone, as UTC seconds.
   *
   * A `"time"` input is stored as a wall clock string so that a saved layout
   * restores to the same reading in another zone, and turning one into an
   * instant needs the zone's calendar, which the engine does not have. A host
   * passes the chart's own conversion; without one the string is read as UTC.
   */
  readonly resolveTime?: (text: string, timezone: string) => number;
  /** Where a trading session begins and ends. */
  readonly session?: SessionCalendar;
}

/** The engine one chart instance is holding, between recomputes. */
interface Held {
  readonly engine: Engine;
  readonly signature: string;
  count: number;
  firstTime: number;
  lastTime: number;
}

/** The store key. Namespaced, because the store belongs to the host as well. */
const HELD = 'openscript';

/** Every channel's whole column, for the bars that were run. */
export type Columns = readonly (readonly Value[])[];

export function fullRun(
  program: CompiledProgram,
  bars: readonly ChartBar[],
  settings: ChartSettings,
  store: ChartStore,
  ctx: ChartCalcContext | undefined,
  options: ChartAdapterOptions,
): Columns {
  const engine = start(program, settings, ctx, options);
  const zone = ctx?.timezone ?? '';
  const result = engine.run(
    bars.map(hostBar),
    bars.map((_, index) => stateFor(index, bars, ctx, options.session, zone)),
  );
  if (result.diagnostic !== undefined) throw stopped(result.diagnostic);

  const held: Held = {
    engine,
    signature: signatureOf(program, settings),
    count: bars.length,
    firstTime: bars[0]?.time ?? 0,
    lastTime: bars[bars.length - 1]?.time ?? 0,
  };
  store[HELD] = held;
  return columnsOf(program, engine);
}

/**
 * The bars from `from` onwards, or nothing when the held engine cannot serve
 * them.
 *
 * `from` is the previously last bar, which may have been replaced rather than
 * followed, so it is re-executed rather than appended: that is step 1 of the bar
 * cycle and the reason a moving bar draws the same study however many ticks it
 * took.
 */
export function tailRun(
  program: CompiledProgram,
  bars: readonly ChartBar[],
  from: number,
  settings: ChartSettings,
  store: ChartStore,
  ctx: ChartCalcContext | undefined,
  options: ChartAdapterOptions,
): Columns | null {
  const held = store[HELD] as Held | undefined;
  if (held === undefined || held.engine.failed) return null;
  if (held.count !== from + 1 || from < 0 || bars.length < held.count) return null;
  if (held.signature !== signatureOf(program, settings)) return null;
  if ((bars[0]?.time ?? 0) !== held.firstTime) return null;
  if ((bars[from]?.time ?? 0) !== held.lastTime) return null;

  const zone = ctx?.timezone ?? '';
  for (let index = from; index < bars.length; index += 1) {
    const bar = bars[index];
    if (bar === undefined) return null;
    const state = stateFor(index, bars, ctx, options.session, zone);
    const result =
      index === from
        ? held.engine.update(hostBar(bar), state)
        : held.engine.append(hostBar(bar), state);
    if (result.diagnostic !== undefined) throw stopped(result.diagnostic);
  }

  held.count = bars.length;
  held.lastTime = bars[bars.length - 1]?.time ?? held.lastTime;
  return columnsOf(program, held.engine);
}

/** A held engine is dropped when the descriptor's instance goes away. */
export function release(store: ChartStore): void {
  delete store[HELD];
}

function columnsOf(program: CompiledProgram, engine: Engine): Columns {
  const out: (readonly Value[])[] = [];
  for (let channel = 0; channel < program.channels.length; channel += 1) {
    out.push(engine.column(channel));
  }
  return out;
}

function start(
  program: CompiledProgram,
  settings: ChartSettings,
  ctx: ChartCalcContext | undefined,
  options: ChartAdapterOptions,
): Engine {
  const loaded = load(program, {
    settings: engineSettings(program, settings),
    host: hostFor(ctx, options),
    time: timeFor(options, ctx?.timezone ?? ''),
    ...(options.limits === undefined ? {} : { limits: options.limits }),
    ...(options.source === undefined ? {} : { source: options.source }),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  });
  if (!loaded.ok) throw refused(loaded.diagnostic);
  return loaded.engine;
}

function hostFor(ctx: ChartCalcContext | undefined, options: ChartAdapterOptions): EngineHost {
  const instrument: Instrument = {
    ...(options.instrument ?? {}),
    ...(ctx?.symbol === undefined ? {} : { symbol: ctx.symbol }),
    ...(ctx?.interval === undefined ? {} : { interval: ctx.interval }),
    ...(ctx?.tickSize === undefined ? {} : { tickSize: ctx.tickSize }),
  };
  return {
    instrument,
    ...(ctx === undefined ? {} : { now: hostNow(ctx.now()) }),
    ...(options.position === undefined ? {} : { position: options.position }),
    ...(options.orders === undefined ? {} : { route: options.orders }),
  };
}

function timeFor(options: ChartAdapterOptions, timezone: string): TimeResolver {
  const resolve = options.resolveTime;
  if (resolve === undefined) return utcTime;
  return (text: string): number | null => {
    try {
      const seconds = resolve(text, timezone);
      return Number.isFinite(seconds) ? hostNow(seconds) : null;
    } catch {
      // A host's conversion refuses an unreadable string by throwing. That is a
      // value the input's own validation has to refuse, not a failure of the
      // chart, so it becomes absence and OS6019 names the key and the value.
      return null;
    }
  };
}
