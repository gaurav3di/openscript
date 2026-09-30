/**
 * Channels into the columns a chart reads.
 *
 * A chart's calculation returns one table: a key to a column of numbers, every
 * column the same length as the bars, `null` where there is no value. A plot's
 * own column is the obvious entry in it, and everything else a study emits has
 * to travel in the same table because there is nowhere else to put it.
 *
 * So three things ride here that a chart does not draw directly. A candle plot's
 * four columns, which the plot names and the chart assembles into bars. A level's
 * price, which is a channel evaluated on every bar and read at the last one. And
 * a per-bar colour, which is not a number at all and travels as two columns: the
 * three channels packed into one whole number and the alpha beside it, for the
 * reason `colours.ts` gives.
 *
 * Every key a chart does not draw is prefixed or suffixed so that it cannot
 * collide with a plot key, which the compiler writes as `p` and a number.
 */
import type { Value } from '../../core/engine/index.js';
import { isColourValue, packChannels, unpackColour } from './colours.js';
import type { ChartValues } from './contract.js';
import type { Columns } from './run.js';

/**
 * Which part of a channel's value a column carries.
 *
 * `flag` is a condition rather than a number: a channel that published `true`
 * for the bar reads 1 and everything else, absence included, reads as a gap.
 * That is what lets a watched condition travel in a table of numbers, and it
 * keeps `language.md` 6.6's answer intact on the way: absent is not true.
 */
export type ColumnPart = 'value' | 'rgb' | 'alpha' | 'flag';

/**
 * One column of the table: a part of a channel, or the bar each row came from.
 *
 * The second kind reads no channel. It holds the index of the bar in the run
 * the calculation was handed, and it exists because a chart may read the table
 * onto bars other than those: a chart that transforms its series and runs a
 * study on the bars the host fed it reads each column at the source bar every
 * drawn element was completed on, and then hands each hook the element's index.
 * A hook that reads a column is right by construction. A hook that reads
 * something the run left elsewhere, indexed by the run's own bars, finds the
 * bar through this column, which the chart reads across like any other.
 */
export type ColumnSpec =
  | { readonly key: string; readonly channel: number; readonly part: ColumnPart }
  | { readonly key: string; readonly part: 'bar' };

/** The key a level's price column travels under. */
export function levelKey(index: number): string {
  return `openscript:level:${index}`;
}

/** The key one side of a band's computed colour travels under. */
export function bandColourKey(band: number, side: 'up' | 'down'): string {
  return `openscript:fill:${band}:${side}`;
}

/** The two keys a per-bar colour travels under. */
export function colourKeys(key: string): { readonly rgb: string; readonly alpha: string } {
  return { rgb: `${key}:rgb`, alpha: `${key}:alpha` };
}

/** The colour a per-bar channel carried on one bar, as a chart spells one. */
export function colourAt(values: ChartValues, index: number, key: string): string | undefined {
  const keys = colourKeys(key);
  const rgb = values[keys.rgb]?.[index];
  const alpha = values[keys.alpha]?.[index];
  if (typeof rgb !== 'number' || typeof alpha !== 'number') return undefined;
  return unpackColour(rgb, alpha);
}

/** The two column specifications a per-bar colour channel needs. */
export function colourColumns(key: string, channel: number): readonly ColumnSpec[] {
  const keys = colourKeys(key);
  return [
    { key: keys.rgb, channel, part: 'rgb' },
    { key: keys.alpha, channel, part: 'alpha' },
  ];
}

/**
 * The table, for bars `from` up to `to`.
 *
 * `from` is zero for a full recompute and the first changed bar for a tail, and
 * the chart splices a tail onto what it already holds. Every key the full path
 * produces is produced here too, because a key the tail leaves out is dropped
 * from the spliced result rather than kept.
 */
export function valuesFrom(
  specs: readonly ColumnSpec[],
  columns: Columns,
  from: number,
  to: number,
): ChartValues {
  const out: Record<string, readonly (number | null)[]> = {};
  for (const spec of specs) {
    const built = new Array<number | null>(Math.max(0, to - from));
    if (spec.part === 'bar') {
      // The bar's own index, never its offset into the tail: the chart splices
      // a tail by position, so a row carries the same number either way.
      for (let bar = from; bar < to; bar += 1) built[bar - from] = bar;
    } else {
      const column = columns[spec.channel] ?? [];
      for (let bar = from; bar < to; bar += 1) {
        built[bar - from] = partOf(column[bar] ?? null, spec.part);
      }
    }
    out[spec.key] = built;
  }
  return out;
}

function partOf(value: Value, part: ColumnPart): number | null {
  if (part === 'value') return typeof value === 'number' ? value : null;
  if (part === 'flag') return value === true ? 1 : null;
  if (!isColourValue(value)) return null;
  return part === 'rgb' ? packChannels(value) : value.a;
}
