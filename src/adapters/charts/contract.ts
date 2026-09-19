/**
 * The chart's indicator descriptor, as this adapter targets it.
 *
 * **Why the shape is declared here rather than imported.** The chart library is
 * a peer dependency: a host that wants a chart installs it, and a host that
 * wants only the language must not be made to. This repository therefore does
 * not install it, cannot type check against it, and would fail its own build the
 * moment a file here imported it. So the adapter declares the shape it produces
 * and the host's own build is where the two are compared: assigning the result
 * of `descriptorFor` to the library's `IndicatorDescriptor` is a one line check
 * that fails to compile if this file has drifted, and it costs a host nothing to
 * write.
 *
 * ```ts
 * import type { IndicatorDescriptor } from "<the chart library>";
 * const descriptor: IndicatorDescriptor = descriptorFor(program);
 * ```
 *
 * Only the Phase 2 slice is declared: plots, bands, levels, inputs and the pane
 * range. Markers, grids, drawings, bar colouring, pane background and alerts are
 * slots the descriptor has and this adapter does not fill yet, and declaring
 * them here before anything writes them would claim a mapping that does not
 * exist.
 *
 * Every member is narrowed to what the adapter can emit. A narrower type is
 * still assignable to the library's wider one, and a value this adapter cannot
 * produce is better left out than declared and never written.
 */

/** One bar as the chart holds it. Its time is UTC seconds, not milliseconds. */
export interface ChartBar {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume?: number;
  readonly oi?: number;
}

/** The eight series a `"source"` input may select. */
export type ChartSource = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4' | 'volume';

/** The plot styles a single column of values can be drawn as, plus candles. */
export type ChartSeriesType =
  | 'line'
  | 'line-markers'
  | 'step'
  | 'area'
  | 'histogram'
  | 'column'
  | 'candlestick';

export type ChartLineStyle = 'solid' | 'dashed' | 'dotted';

/** Which price axis a plot maps to. The empty string is a hidden overlay scale. */
export type ChartPriceScaleId = 'right' | 'left' | '';

export type ChartPriceFormat =
  | { readonly type: 'price'; readonly precision?: number }
  | { readonly type: 'percent'; readonly precision?: number }
  | { readonly type: 'volume' };

/** The style fields a plot built here ever sets. */
export interface ChartSeriesStyle {
  readonly title?: string;
  readonly color?: string;
  readonly lineWidth?: number;
  readonly lineStyle?: ChartLineStyle;
  readonly precision?: number;
  readonly upColor?: string;
  readonly downColor?: string;
  readonly borderUpColor?: string;
  readonly borderDownColor?: string;
  readonly wickUpColor?: string;
  readonly wickDownColor?: string;
}

export type ChartSettings = Record<string, unknown>;
export type ChartStore = Record<string, unknown>;

/** One column per key, aligned one to one with the bars, `null` for a gap. */
export type ChartValues = Record<string, readonly (number | null)[]>;

/** One row of the generated settings dialog. */
export type ChartInput =
  | {
      readonly key: string;
      readonly type: 'number';
      readonly label: string;
      readonly default: number;
      readonly min?: number;
      readonly max?: number;
      readonly step?: number;
      readonly group?: string;
      readonly tooltip?: string;
    }
  | {
      readonly key: string;
      readonly type: 'boolean';
      readonly label: string;
      readonly default: boolean;
      readonly group?: string;
      readonly tooltip?: string;
    }
  | {
      readonly key: string;
      readonly type: 'color';
      readonly label: string;
      readonly default: string;
      readonly group?: string;
      readonly tooltip?: string;
    }
  | {
      readonly key: string;
      readonly type: 'text';
      readonly label: string;
      readonly default: string;
      readonly group?: string;
      readonly tooltip?: string;
    }
  | {
      readonly key: string;
      readonly type: 'select';
      readonly label: string;
      readonly default: string;
      readonly options: readonly { readonly label: string; readonly value: string }[];
      readonly group?: string;
      readonly tooltip?: string;
    }
  | {
      readonly key: string;
      readonly type: 'source';
      readonly label: string;
      readonly default: ChartSource;
      readonly group?: string;
      readonly tooltip?: string;
    }
  | {
      readonly key: string;
      readonly type: 'interval';
      readonly label: string;
      readonly default: string;
      readonly group?: string;
      readonly tooltip?: string;
    }
  | {
      readonly key: string;
      readonly type: 'time';
      readonly label: string;
      readonly default: string;
      readonly group?: string;
      readonly tooltip?: string;
    };

/** What a per-bar colour callback is handed. */
export interface ChartColorContext {
  readonly value: number;
  readonly index: number;
  readonly values: ChartValues;
  readonly settings: ChartSettings;
}

/** A candle plot's colour, split into the three parts a candle is drawn from. */
export interface ChartBarColor {
  readonly body?: string;
  readonly wick?: string;
  readonly border?: string;
}

export interface ChartPlot {
  readonly key: string;
  readonly type: ChartSeriesType;
  readonly title: string;
  readonly style?: ChartSeriesStyle;
  readonly priceScaleId?: ChartPriceScaleId;
  readonly priceFormat?: ChartPriceFormat;
  readonly overlay?: boolean;
  readonly offset?: number;
  readonly colorKey?: string;
  readonly ohlc?: {
    readonly open: string;
    readonly high: string;
    readonly low: string;
    readonly close: string;
  };
  colorBy?(ctx: ChartColorContext): string | undefined;
  colorParts?(ctx: ChartColorContext): ChartBarColor | undefined;
}

export interface ChartFill {
  readonly between: readonly [string, string];
  readonly colorUp?: string;
  readonly colorDown?: string;
  readonly colorUpKey?: string;
  readonly colorDownKey?: string;
  readonly opacity?: number;
  readonly overlay?: boolean;
}

export interface ChartLevel {
  readonly price: number;
  readonly color?: string;
  readonly title?: string;
  readonly lineWidth?: number;
  readonly lineStyle?: ChartLineStyle;
}

/** What `levels` is handed: the settings, with the data spread beside them. */
export type ChartLevelContext = ChartSettings & {
  readonly settings?: ChartSettings;
  readonly bars?: readonly ChartBar[];
  readonly values?: ChartValues;
};

/** What the calculation cannot read off the bars themselves. */
export interface ChartCalcContext {
  readonly barState: {
    readonly isNew: boolean;
    readonly isConfirmed: boolean;
    readonly isRealtime: boolean;
    readonly lastIndex: number;
  };
  readonly symbol?: string;
  readonly interval?: string;
  readonly timezone: string;
  now(): number;
  readonly tickSize?: number;
}

export interface ChartDescriptor {
  readonly id: string;
  readonly name: string;
  readonly category?: string;
  readonly placement: 'onchart' | 'pane';
  readonly inputs: readonly ChartInput[];
  readonly plots: readonly ChartPlot[];
  readonly fills?: readonly ChartFill[];
  calc(
    bars: readonly ChartBar[],
    settings: ChartSettings,
    store: ChartStore,
    ctx?: ChartCalcContext,
  ): ChartValues;
  calcTail?(
    bars: readonly ChartBar[],
    settings: ChartSettings,
    fromIndex: number,
    previous: ChartValues,
    store: ChartStore,
    ctx?: ChartCalcContext,
  ): ChartValues | null;
  levels?(ctx: ChartLevelContext): readonly ChartLevel[];
  range?(settings: ChartSettings): { readonly min: number; readonly max: number } | null;
}
