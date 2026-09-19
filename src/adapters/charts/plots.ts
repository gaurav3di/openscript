/**
 * Declared plots into the chart's plots.
 *
 * This is the part of the mapping that is a rename and a table. A plot names a
 * style, a width, a dash pattern, a scale, an offset and a colour, and every one
 * of those is a field the chart's plot spec already has. Three places are not a
 * rename and are worth knowing:
 *
 * **A colour a script wrote as an `input()` becomes the settings key rather than
 * a value.** The chart generates an appearance row per plot, and a descriptor
 * that already declares a colour input owns that key, so pointing the plot at
 * the script's own key makes one row drive both the drawn line and the value the
 * engine computes with. A generated row beside it would shadow the script's, and
 * changing the script's would silently stop working.
 *
 * **A colour a script computed per bar is not a value at all.** It arrives on a
 * channel, travels as two number columns and is read back by the per-bar colour
 * callback, which is the only shape a chart's values table has room for.
 *
 * **Scale formatting belongs to a scale and not to a series.** A study's own
 * `precision` and `format` are its pane's, so they reach only the plots that
 * stay in that pane: setting them on a plot drawn over the price pane would
 * reformat the instrument's own axis, which is what OS8007 warns a script about
 * at compile time.
 */
import type { CompiledProgram, Plot } from '../../core/emit/index.js';
import { buildCandle } from './candles.js';
import { cssColour } from './colours.js';
import { colourAt, colourColumns } from './columns.js';
import type { ColumnSpec } from './columns.js';
import type {
  ChartColorContext,
  ChartLineStyle,
  ChartPlot,
  ChartPriceFormat,
  ChartPriceScaleId,
  ChartSeriesStyle,
  ChartSeriesType,
} from './contract.js';
import { boolField, colourField, isReference, numberField, stringField } from './fields.js';
import type { InputLookup } from './fields.js';

/**
 * The seven styles a plot declaration may carry, in the chart's spelling.
 *
 * A name that is not one of them is drawn as a line. Load-time verification
 * enumerates a channel's type and not a plot's, so a program can reach here
 * carrying a style no engine has, and there is no catalogue code for a declared
 * plot style a host cannot draw. A line is the least wrong thing to draw and
 * inventing a code to refuse it is not this adapter's to do.
 */
const SERIES_TYPES: Readonly<Record<string, ChartSeriesType>> = {
  line: 'line',
  lineWithMarkers: 'line-markers',
  step: 'step',
  area: 'area',
  histogram: 'histogram',
  column: 'column',
  candle: 'candlestick',
};

const SCALES: Readonly<Record<string, ChartPriceScaleId>> = {
  right: 'right',
  left: 'left',
  none: '',
};

const LINE_STYLES: readonly string[] = ['solid', 'dashed', 'dotted'];

export interface PlotsBuild {
  readonly plots: readonly ChartPlot[];
  readonly columns: readonly ColumnSpec[];
}

/**
 * `ownPane` is whether the study draws in a pane of its own, which is what
 * decides whether the study's own scale formatting reaches a plot at all.
 */
export function buildPlots(
  program: CompiledProgram,
  lookup: InputLookup,
  ownPane: boolean,
): PlotsBuild {
  const plots: ChartPlot[] = [];
  const columns: ColumnSpec[] = [];
  for (const declared of program.outputs.plots) {
    const built = onePlot(program, declared, lookup, ownPane);
    plots.push(built.plot);
    columns.push(...built.columns);
  }
  return { plots, columns };
}

function onePlot(
  program: CompiledProgram,
  declared: Plot,
  lookup: InputLookup,
  ownPane: boolean,
): { readonly plot: ChartPlot; readonly columns: readonly ColumnSpec[] } {
  const key = declared.key;
  const title = stringField(declared.title, lookup, key);
  const overlay = boolField(declared.overlay, lookup);
  const inOwnPane = ownPane && overlay !== true;
  const offset = numberField(declared.offset, lookup, 0);

  const columns: ColumnSpec[] = [{ key, channel: declared.channel, part: 'value' }];
  const candle = declared.ohlc === null ? undefined : buildCandle(key, declared.ohlc, lookup);
  if (candle !== undefined) columns.push(...candle.columns);
  if (declared.colorChannel !== null) columns.push(...colourColumns(key, declared.colorChannel));

  // A constant colour is nothing when the script named none, which leaves the
  // colour to the host's palette, and nothing when a channel carries it per bar,
  // because a constant beside a per-bar colour is a colour the plot never draws.
  const constant =
    candle === undefined && declared.colorChannel === null
      ? colourField(declared.color, lookup)
      : undefined;

  const style: ChartSeriesStyle = {
    title,
    lineWidth: numberField(declared.width, lookup, 1.5),
    lineStyle: lineStyleOf(stringField(declared.lineStyle, lookup, 'solid')),
    ...(candle?.style ?? {}),
    ...(constant === undefined ? {} : { color: cssColour(constant) }),
  };

  const format = priceFormatOf(program, declared, lookup, inOwnPane);
  const plot: ChartPlot = {
    key,
    type: SERIES_TYPES[declared.type] ?? 'line',
    title,
    style,
    priceScaleId: SCALES[stringField(declared.scale, lookup, 'right')] ?? 'right',
    ...(format === undefined ? {} : { priceFormat: format }),
    ...(overlay === undefined ? {} : { overlay }),
    ...(offset === 0 ? {} : { offset }),
    ...(isReference(declared.color) ? { colorKey: declared.color.input } : {}),
    ...(candle === undefined ? {} : { ohlc: candle.ohlc }),
    ...(candle?.colorParts === undefined ? {} : { colorParts: candle.colorParts }),
    ...(declared.colorChannel === null
      ? {}
      : {
          colorBy: (ctx: ChartColorContext): string | undefined =>
            colourAt(ctx.values, ctx.index, key),
        }),
  };
  return { plot, columns };
}

function lineStyleOf(value: string): ChartLineStyle {
  return LINE_STYLES.includes(value) ? (value as ChartLineStyle) : 'solid';
}

/**
 * The value formatting of the scale this plot maps to.
 *
 * The plot's own `format` and `precision` win. The study's own are applied only
 * where the plot stays in the study's pane, so an overlaid column leaves the
 * instrument's axis exactly as the chart already formats it.
 */
function priceFormatOf(
  program: CompiledProgram,
  declared: Plot,
  lookup: InputLookup,
  inOwnPane: boolean,
): ChartPriceFormat | undefined {
  const format =
    declared.priceFormat !== null
      ? stringField(declared.priceFormat, lookup, 'price')
      : inOwnPane
        ? stringField(program.meta.format, lookup, 'price')
        : undefined;
  if (format === undefined) return undefined;
  if (format === 'volume') return { type: 'volume' };

  const precision =
    declared.precision !== null
      ? numberField(declared.precision, lookup, 4)
      : inOwnPane
        ? numberField(program.meta.precision, lookup, 4)
        : undefined;

  const type = format === 'percent' ? 'percent' : 'price';
  return precision === undefined ? { type } : { type, precision };
}
