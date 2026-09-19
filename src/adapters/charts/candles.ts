/**
 * A candle plot: one declaration, four columns.
 *
 * `plotCandles` is one entry with one key and one legend row, and the four
 * values it draws travel as four ordinary columns that the entry names. The
 * chart's descriptor has exactly that shape, so the mapping is a rename.
 *
 * The colours are where the two contracts differ and the difference is worth
 * stating. A candle's colour is declared four ways: one for a bar that closed at
 * or above its open, one for a bar that closed below, and two overrides for the
 * wick and the border alone. Where all four are constants they are the series'
 * own style and cost nothing per bar. Where a script passed a series colour
 * instead, the value arrives on a channel and the colour is decided per bar,
 * which is the split callback the chart takes.
 *
 * **A null override means the wick or the border follows the body**, which is
 * the opposite of a null colour on a line plot: the host may choose an
 * undecorated line's colour because nothing depends on it, and a wick the host
 * coloured independently of the body it grows out of would draw a different
 * candle on every chart. So an override with neither a channel nor a declared
 * value is answered with the body's own colour for that bar, and one with a
 * declared value is left alone for the style to carry.
 */
import type { CandleChannels } from '../../core/emit/index.js';
import type { ColourValue } from '../../core/engine/index.js';
import { cssColour } from './colours.js';
import type { ChartBarColor, ChartColorContext, ChartSeriesStyle } from './contract.js';
import { colourAt, colourColumns } from './columns.js';
import type { ColumnSpec } from './columns.js';
import { colourField } from './fields.js';
import type { InputLookup } from './fields.js';

export interface CandleBuild {
  readonly ohlc: {
    readonly open: string;
    readonly high: string;
    readonly low: string;
    readonly close: string;
  };
  readonly style: ChartSeriesStyle;
  readonly columns: readonly ColumnSpec[];
  readonly colorParts: ((ctx: ChartColorContext) => ChartBarColor | undefined) | undefined;
}

export function buildCandle(key: string, ohlc: CandleChannels, lookup: InputLookup): CandleBuild {
  const keys = {
    open: `${key}:open`,
    high: `${key}:high`,
    low: `${key}:low`,
    close: `${key}:close`,
  };

  const up = colourField(ohlc.colorUp, lookup);
  const down = colourField(ohlc.colorDown, lookup);
  const wick = colourField(ohlc.wickColor, lookup);
  const border = colourField(ohlc.borderColor, lookup);

  const borderUp = border ?? up;
  const borderDown = border ?? down;
  const wickUp = wick ?? up;
  const wickDown = wick ?? down;

  const style: ChartSeriesStyle = {
    ...(up === undefined ? {} : { upColor: cssColour(up) }),
    ...(down === undefined ? {} : { downColor: cssColour(down) }),
    ...(borderUp === undefined ? {} : { borderUpColor: cssColour(borderUp) }),
    ...(borderDown === undefined ? {} : { borderDownColor: cssColour(borderDown) }),
    ...(wickUp === undefined ? {} : { wickUpColor: cssColour(wickUp) }),
    ...(wickDown === undefined ? {} : { wickDownColor: cssColour(wickDown) }),
  };

  const columns: ColumnSpec[] = [
    { key: keys.open, channel: ohlc.open, part: 'value' },
    { key: keys.high, channel: ohlc.high, part: 'value' },
    { key: keys.low, channel: ohlc.low, part: 'value' },
    { key: keys.close, channel: ohlc.close, part: 'value' },
  ];

  const parts: { readonly name: string; readonly channel: number | null }[] = [
    { name: `${key}:up`, channel: ohlc.colorUpChannel },
    { name: `${key}:down`, channel: ohlc.colorDownChannel },
    { name: `${key}:wick`, channel: ohlc.wickColorChannel },
    { name: `${key}:border`, channel: ohlc.borderColorChannel },
  ];
  for (const part of parts) {
    if (part.channel !== null) columns.push(...colourColumns(part.name, part.channel));
  }

  const perBar = parts.some((one) => one.channel !== null);
  return {
    ohlc: keys,
    style,
    columns,
    colorParts: perBar
      ? (ctx: ChartColorContext): ChartBarColor | undefined => {
          const rising = isRising(ctx, keys.open, keys.close);
          const bodyChannel = rising ? ohlc.colorUpChannel : ohlc.colorDownChannel;
          const body =
            bodyChannel === null
              ? undefined
              : colourAt(ctx.values, ctx.index, rising ? `${key}:up` : `${key}:down`);
          const wickPart = override(ctx, `${key}:wick`, ohlc.wickColorChannel, wick, body);
          const borderPart = override(ctx, `${key}:border`, ohlc.borderColorChannel, border, body);
          return {
            ...(body === undefined ? {} : { body }),
            ...(wickPart === undefined ? {} : { wick: wickPart }),
            ...(borderPart === undefined ? {} : { border: borderPart }),
          };
        }
      : undefined,
  };
}

/** Whether this bar closed at or above its own open, by the candle's columns. */
function isRising(ctx: ChartColorContext, openKey: string, closeKey: string): boolean {
  const open = ctx.values[openKey]?.[ctx.index];
  const close = ctx.values[closeKey]?.[ctx.index];
  if (typeof open !== 'number' || typeof close !== 'number') return true;
  return close >= open;
}

/**
 * The wick or the border for one bar.
 *
 * Its own channel wins, then a declared constant, which the series style already
 * carries and this leaves alone, and otherwise the part follows the body.
 */
function override(
  ctx: ChartColorContext,
  name: string,
  channel: number | null,
  declared: ColourValue | undefined,
  body: string | undefined,
): string | undefined {
  if (channel !== null) return colourAt(ctx.values, ctx.index, name);
  return declared === undefined ? body : undefined;
}
