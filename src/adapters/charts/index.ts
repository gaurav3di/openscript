/**
 * The chart adapter: a compiled program becomes a chart's indicator descriptor.
 *
 * This is the only module in the repository allowed to know two worlds at once,
 * and it is the piece a platform with its own chart replaces rather than the
 * piece it patches. Everything under `src/core` stays ignorant of charts, and
 * the layering check is what keeps it that way.
 *
 * **The chart library is a peer dependency, and nothing here imports it.** A
 * package that pulled a chart into everyone's install would defeat the point of
 * a language that a platform can take on its own, so the descriptor's shape is
 * declared in `contract.ts` and the value this produces is assigned to the
 * library's own type by the host, in one line, at the host's build. See that
 * file for the line.
 *
 * What is mapped today is the first slice: the declared inputs and the settings
 * dialog a chart generates from them, the plots with their styles and scales,
 * the bands between them, the horizontal levels and the pane's fixed range. A
 * study's markers, its summary grid, its drawings, its bar colouring, its pane
 * background and its alerts are slots the descriptor has and this does not fill
 * yet.
 */
export { descriptorFor } from './descriptor.js';

export { ChartAdapterError } from './errors.js';

export { release } from './run.js';
export type { ChartAdapterOptions } from './run.js';

export type { SessionCalendar } from './bars.js';

export type {
  ChartBar,
  ChartBarColor,
  ChartCalcContext,
  ChartColorContext,
  ChartDescriptor,
  ChartFill,
  ChartInput,
  ChartLevel,
  ChartLevelContext,
  ChartLineStyle,
  ChartPlot,
  ChartPriceFormat,
  ChartPriceScaleId,
  ChartSeriesStyle,
  ChartSeriesType,
  ChartSettings,
  ChartSource,
  ChartStore,
  ChartValues,
} from './contract.js';
