/**
 * A compiled program as a chart's indicator descriptor.
 *
 * The whole of the mapping is here in one function, because the mapping is the
 * adapter: every other file in this module is one column of the table this
 * assembles. `compiled-program.md` 11 writes that table out, and the shape of
 * this function follows it line for line.
 *
 * **The calculation drives the engine and computes nothing.** A descriptor's
 * `calc` is the chart asking for one column per plot; the engine already
 * produces exactly that, one channel at a time, so `calc` loads a program, runs
 * the bars and reads the channels out. Nothing here knows what a moving average
 * is, and that is the point: a second implementation of any of it would be a
 * second thing to keep in step with the specification.
 *
 * **The hooks that follow a calculation read it and do not repeat it.** Markers,
 * the grid, the drawing objects and each alert's message channel are taken once,
 * while the engine is in hand, and left in the run record `produced.ts` keeps.
 * The chart calls each hook after every calculation, so asking twice gives one
 * answer and a study with a grid costs the same over a hundred thousand bars as
 * over ten. A message is the channel itself rather than a copy of it: an alert
 * asks about one bar, and building a column of strings to answer that would cost
 * the history.
 *
 * **The id is the source hash, not the title.** A saved layout stores the
 * descriptor id and the settings, and two scripts can easily share a title while
 * an edited script keeps the one it had. Hashing the source means the same
 * script restores to the same study and an edited one does not silently inherit
 * the settings of the study it replaced. A host that manages its own script
 * identities passes its own id instead.
 */
import type { CompiledProgram } from '../../core/emit/index.js';
import { alertMessages, buildAlerts } from './alerts.js';
import { valuesFrom } from './columns.js';
import type {
  ChartBar,
  ChartCalcContext,
  ChartDescriptor,
  ChartSettings,
  ChartStore,
  ChartValues,
} from './contract.js';
import { buildDrawings } from './drawings.js';
import { buildFills } from './fills.js';
import { boolField, stringField } from './fields.js';
import { buildLevels, buildRange } from './levels.js';
import { buildMarkers } from './markers.js';
import { buildPaint } from './paint.js';
import { buildPlots } from './plots.js';
import { producedFor, remember } from './produced.js';
import { stationIn } from './requests.js';
import { fullRun, release, tailRun } from './run.js';
import type { ChartAdapterOptions, RunOutput } from './run.js';
import { inputRows, lookupFor } from './settings.js';
import type {
  ChartAttachContext,
  ChartDrawing,
  ChartGrid,
  ChartMarker,
  ChartSurfaceContext,
} from './surfaces.js';
import { buildTable } from './tables.js';

/** The grey an unnamed marker is drawn in, where the host names no default. */
const MARKER_COLOUR = 'rgba(128, 128, 128, 1)';

export function descriptorFor(
  program: CompiledProgram,
  options: ChartAdapterOptions = {},
): ChartDescriptor {
  // The declared shape is fixed before bar 0, so the fields that make it up are
  // read against the declared defaults. The ones a settings change may move
  // afterwards carry a settings key instead of a value, and the two that cannot
  // are read again per call: a level's style and the pane's range.
  const declared = lookupFor(program, {});

  const overlay = boolField(program.meta.overlay, declared) === true;
  const plots = buildPlots(program, declared, !overlay);
  const levels = buildLevels(program);
  const fills = buildFills(program, declared);
  const paint = buildPaint(program);
  const alerts = buildAlerts(program, declared);
  const columns = [
    ...plots.columns,
    ...levels.columns,
    ...paint.columns,
    ...alerts.columns,
  ];
  const markerColour = options.markerColor ?? MARKER_COLOUR;

  /**
   * What the run produced that is not a column of numbers.
   *
   * It is keyed by the settings object the chart handed in, because that object
   * is the study instance: the same one reaches every hook that follows the
   * calculation, and `produced.ts` says why that is the only handle there is.
   */
  const keep = (
    bars: readonly ChartBar[],
    settings: ChartSettings,
    ran: RunOutput,
  ): void => {
    const lookup = lookupFor(program, settings);
    remember(settings, {
      markers: buildMarkers(program, lookup, bars, ran.columns, markerColour),
      table: buildTable(program, lookup, ran.tables),
      drawings: buildDrawings(ran.drawings),
      messages: alertMessages(program, ran.columns),
    });
  };
  // A study's own group is its category, and a host may name one for a script
  // whose author left the group blank.
  const group = stringField(program.meta.group, declared, '');
  const category = group === '' ? options.category : group;

  return {
    id: options.id ?? `openscript:${program.source.hash}`,
    name: stringField(program.meta.title, declared, 'Study'),
    ...(category === undefined ? {} : { category }),
    placement: overlay ? 'onchart' : 'pane',
    inputs: inputRows(program),
    plots: plots.plots,
    ...(fills.length === 0 ? {} : { fills }),

    ...(alerts.alerts.length === 0 ? {} : { alerts: alerts.alerts }),

    calc(
      bars: readonly ChartBar[],
      settings: ChartSettings,
      store: ChartStore,
      ctx?: ChartCalcContext,
    ): ChartValues {
      const ran = fullRun(program, bars, settings, store, ctx, options);
      keep(bars, settings, ran);
      return valuesFrom(columns, ran.columns, 0, bars.length);
    },

    calcTail(
      bars: readonly ChartBar[],
      settings: ChartSettings,
      fromIndex: number,
      _previous: ChartValues,
      store: ChartStore,
      ctx?: ChartCalcContext,
    ): ChartValues | null {
      const ran = tailRun(program, bars, fromIndex, settings, store, ctx, options);
      if (ran === null) return null;
      keep(bars, settings, ran);
      return valuesFrom(columns, ran.columns, fromIndex, bars.length);
    },

    ...(program.outputs.levels.length === 0 ? {} : { levels: levels.levels }),
    ...(program.meta.range === null ? {} : { range: buildRange(program) }),
    ...(paint.barColors === undefined ? {} : { barColors: paint.barColors }),
    ...(paint.background === undefined ? {} : { background: paint.background }),
    ...(program.outputs.markers.length === 0
      ? {}
      : {
          markers: (ctx: ChartSurfaceContext): readonly ChartMarker[] =>
            producedFor(ctx.settings).markers,
        }),
    ...(program.outputs.tables.length === 0
      ? {}
      : { table: (ctx: ChartSurfaceContext): ChartGrid | null => producedFor(ctx.settings).table }),
    ...(program.requires.includes('objects')
      ? {
          draws: (ctx: ChartSurfaceContext): readonly ChartDrawing[] =>
            producedFor(ctx.settings).drawings,
        }
      : {}),
    // A study that reads only this chart's bars needs no lifecycle: the engine
    // folds its own, and a descriptor that declared one anyway would cost every
    // host a subscription for a transport nothing asks to use.
    ...(program.requires.includes('req.symbol')
      ? {
          attach(ctx: ChartAttachContext): () => void {
            stationIn(ctx.store).open(ctx);
            return (): void => {
              release(ctx.store);
            };
          },
        }
      : {}),
  };
}
