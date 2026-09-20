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
  Grid,
  RequestProvider,
  Instrument,
  Drawing,
  TimeResolver,
  Value,
} from '../../core/engine/index.js';
import { load, utcTime } from '../../core/engine/index.js';
import type { CompiledProgram } from '../../core/emit/index.js';
import type { SourceFile } from '../../core/index.js';
import { hostBar, hostNow, stateFor } from './bars.js';
import type { ChartBar, ChartCalcContext, ChartSettings, ChartStore } from './contract.js';
import { refused, stopped } from './errors.js';
import { stationIn, stationOf } from './requests.js';
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
  /**
   * What the host has stored for this study's inputs, for the declared shape.
   *
   * A declaration option may be written as an `input()`, and `docs/inputs.md`
   * teaches that as how a reader changes something the declaration decides:
   * `study("S", precision = input(2, "Places"))` puts the pane's precision on
   * the settings dialog. The engine resolves such a field against the settings
   * it was loaded with. The descriptor's declared shape is fixed before bar 0
   * and is a value rather than a call, so the only settings it can be resolved
   * against are the ones a host states here; built without them, every one of
   * those fields reads the declared default and a stored value reaches none of
   * them.
   *
   * A host that keeps one descriptor per study instance passes that instance's
   * stored settings and builds again when a user changes one. A host that
   * registers one descriptor for a script and runs several instances against it
   * gets the declared shape of whatever it built with, and the parts that are
   * asked for again per call follow each instance: which those are is recorded
   * in `spec/chart-narrowings.json`, and `scripts/check-chart-surface.mjs`
   * measures both halves rather than leaving the sentence to be believed.
   *
   * These are the chart's own settings object, in the chart's own spelling, and
   * the same conversions apply as on the calculation path: a colour arrives as
   * a CSS string and a choice as the text of an option.
   */
  readonly settings?: ChartSettings;
  /**
   * The plate colour a marker takes when the script named none.
   *
   * `signal`'s colour argument defaults to absence, which `stdlib.md` 14.3
   * reads as the host's own default for a marker, and a chart needs a colour
   * for every marker it draws. A host with a marker colour in its theme states
   * it here; without one every unnamed marker is drawn in a neutral grey.
   */
  readonly markerColor?: string;
  /** The source, so a diagnostic can carry an offset as well as a line. */
  readonly source?: SourceFile;
  /**
   * Instrument facts a chart does not hold: the exchange, the lot size, and
   * the trading session.
   *
   * The session is where every per-bar session fact comes from
   * (`host-interface.md` 4.3), so a host that knows its calendar states the
   * hours here and the engine derives the rest. A chart holds an interval and a
   * timezone and no exchange calendar, so a host that states none gets a study
   * whose session never begins, which is the honest answer rather than a
   * guessed one.
   */
  readonly instrument?: Instrument;
  /**
   * Where an applied order goes, and where its frames come back from.
   *
   * Without one the engine declares no `orders` capability and refuses a
   * strategy at load with OS6006, naming it. That is deliberate: a chart that
   * quietly swallowed a strategy's orders while drawing its plots would be a
   * strategy the user believes is running.
   *
   * There is no position option beside it. A strategy's position is folded from
   * the orders it sent and the frames this route's owner reports back
   * (`stdlib.md` 17.1), never handed over by the chart.
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

/**
 * What one run produced beyond the columns.
 *
 * The grids and the drawing objects are here because neither is a column of
 * numbers: a grid is the buffer the last executed bar left behind, and an object
 * is a shape the script created and has been mutating since. They are read off
 * the engine while it is in hand rather than left for a caller to go back for,
 * because after a tail run the engine is the held one and nobody else has it.
 */
export interface RunOutput {
  readonly columns: Columns;
  readonly tables: readonly Grid[];
  readonly drawings: readonly Drawing[];
}

export function fullRun(
  program: CompiledProgram,
  bars: readonly ChartBar[],
  settings: ChartSettings,
  store: ChartStore,
  ctx: ChartCalcContext | undefined,
  options: ChartAdapterOptions,
): RunOutput {
  const station = stationIn(store);
  const engine = start(program, settings, ctx, options, station.provider(bars));
  const result = engine.run(
    bars.map(hostBar),
    bars.map((_, index) => stateFor(index, bars, ctx)),
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
  station.settle();
  return outputOf(program, engine);
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
  // Held for the shape of the pair: a full recompute reads the host's options
  // and a tail run reads the engine it already built from them.
  _options: ChartAdapterOptions,
): RunOutput | null {
  const held = store[HELD] as Held | undefined;
  if (held === undefined || held.engine.failed) return null;
  if (held.count !== from + 1 || from < 0 || bars.length < held.count) return null;
  if (held.signature !== signatureOf(program, settings)) return null;
  if ((bars[0]?.time ?? 0) !== held.firstTime) return null;
  if ((bars[from]?.time ?? 0) !== held.lastTime) return null;

  for (let index = from; index < bars.length; index += 1) {
    const bar = bars[index];
    if (bar === undefined) return null;
    const state = stateFor(index, bars, ctx);
    const result =
      index === from
        ? held.engine.update(hostBar(bar), state)
        : held.engine.append(hostBar(bar), state);
    if (result.diagnostic !== undefined) throw stopped(result.diagnostic);
  }

  held.count = bars.length;
  held.lastTime = bars[bars.length - 1]?.time ?? held.lastTime;
  // The provider was not asked anything this time, so the station is told where
  // the newest bar now stands rather than working it out from a question.
  const station = stationOf(store);
  station?.extend(bars);
  station?.settle();
  return outputOf(program, held.engine);
}

/**
 * A held engine is dropped when the descriptor's instance goes away.
 *
 * The station goes with it, because a fetch still in flight would otherwise ask
 * a chart that has removed this study to recompute it.
 */
export function release(store: ChartStore): void {
  delete store[HELD];
  stationOf(store)?.close();
}

function outputOf(program: CompiledProgram, engine: Engine): RunOutput {
  const columns: (readonly Value[])[] = [];
  for (let channel = 0; channel < program.channels.length; channel += 1) {
    columns.push(engine.column(channel));
  }
  // The grids and the objects are read once, here. Reading either per bar would
  // cost the length of the history to display the last state of it, which is
  // `tables.ts`'s own first paragraph.
  return { columns, tables: engine.tables(), drawings: engine.drawings() };
}

function start(
  program: CompiledProgram,
  settings: ChartSettings,
  ctx: ChartCalcContext | undefined,
  options: ChartAdapterOptions,
  requests: RequestProvider,
): Engine {
  const loaded = load(program, {
    settings: engineSettings(program, settings),
    host: hostFor(ctx, options, requests),
    time: timeFor(options, ctx?.timezone ?? ''),
    ...(options.limits === undefined ? {} : { limits: options.limits }),
    ...(options.source === undefined ? {} : { source: options.source }),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  });
  if (!loaded.ok) throw refused(loaded.diagnostic);
  return loaded.engine;
}

/**
 * The host the engine reads, which always serves requests.
 *
 * A chart offers the transport whether or not its own host registered a
 * provider, and it refuses with its own words when none was registered. So the
 * capability is declared here rather than withheld: a study that reads another
 * instrument then draws everything that does not depend on the read and puts
 * the chart's own sentence in `req.error`, instead of being refused at load
 * with OS6006 naming a capability the chart does have.
 */
function hostFor(
  ctx: ChartCalcContext | undefined,
  options: ChartAdapterOptions,
  requests: RequestProvider,
): EngineHost {
  const instrument: Instrument = {
    ...(options.instrument ?? {}),
    ...(ctx?.symbol === undefined ? {} : { symbol: ctx.symbol }),
    ...(ctx?.interval === undefined ? {} : { interval: ctx.interval }),
    ...(ctx?.tickSize === undefined ? {} : { tickSize: ctx.tickSize }),
    // The chart states the zone it labels its own axis in, and every calendar
    // and session call reads in it. Leaving it out left the engine reading the
    // record's zone or nothing, so a session study could be an offset away from
    // the chart it was drawn on.
    ...(ctx === undefined || ctx.timezone === '' ? {} : { timezone: ctx.timezone }),
  };
  return {
    instrument,
    requestBars: requests,
    ...(ctx === undefined ? {} : { now: hostNow(ctx.now()) }),
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
