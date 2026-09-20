/**
 * Bar colouring and the pane background, and the rule for who owns the candles.
 *
 * Both are one colour per bar on one channel, so both ride the values table as
 * the two number columns a colour packs into, and both are read back as a column
 * of colours the length of the bars. A bar the script left alone has an absent
 * channel, and absence on a drawing surface is a gap: the bar keeps its own
 * colour and the column behind it stays unshaded, which is the `null` the chart
 * reads for exactly that.
 *
 * **Bar colouring is a statement about the price bars themselves, and they are
 * not the study's to own.** A pane may hold several studies and the instrument's
 * candles are one object, so two studies painting them is not two drawings that
 * overlap, it is two answers to one question. The rule is
 * `compiled-program.md` 11's: the owner is the study latest in the chart's own
 * study order that paints, and every other study's bar colouring is not drawn.
 *
 * Two things follow, and both are the point of having a rule at all. It is
 * decided from the list of studies, which is what the legend shows and what the
 * user reorders, rather than from the order the calculations happened to return
 * in, so it does not change when one study is slower than another on one frame.
 * And it changes only when the user adds, removes or reorders a study, so the
 * candles do not flicker between two colourings while both studies keep
 * recomputing. A chart that arbitrates between publishers itself applies that
 * rule from its own list and this descriptor simply states what it wants;
 * `candleOwner` is the same rule for a host whose chart does not.
 *
 * A background needs no such rule. It is drawn behind everything in its own
 * pane, a colour carries its own alpha in this language, and two translucent
 * shadings compose the way any two drawings in a pane do.
 */
import type { CompiledProgram, Paint } from '../../core/emit/index.js';
import { colourAt, colourColumns } from './columns.js';
import type { ColumnSpec } from './columns.js';
import type { ChartSurfaceContext } from './surfaces.js';

/** The key each paint channel's two colour columns travel under. */
const BAR_COLOR = 'openscript:barColor';
const BACKGROUND = 'openscript:background';

/** A column of colours, one per bar, `null` where the script painted none. */
export type Painting = (ctx: ChartSurfaceContext) => readonly (string | null)[];

export interface PaintBuild {
  readonly columns: readonly ColumnSpec[];
  readonly barColors: Painting | undefined;
  readonly background: Painting | undefined;
}

export function buildPaint(program: CompiledProgram): PaintBuild {
  const bar = oneOf(program.outputs.barColor, BAR_COLOR);
  const pane = oneOf(program.outputs.background, BACKGROUND);
  return {
    columns: [...bar.columns, ...pane.columns],
    barColors: bar.read,
    background: pane.read,
  };
}

function oneOf(
  paint: Paint | null,
  key: string,
): { readonly columns: readonly ColumnSpec[]; readonly read: Painting | undefined } {
  if (paint === null) return { columns: [], read: undefined };
  return {
    columns: colourColumns(key, paint.channel),
    read: (ctx: ChartSurfaceContext): readonly (string | null)[] => {
      const out = new Array<string | null>(ctx.bars.length);
      for (let index = 0; index < out.length; index += 1) {
        out[index] = colourAt(ctx.values, index, key) ?? null;
      }
      return out;
    },
  };
}

/** A study on the chart, as the ownership rule reads one. */
export interface Painter {
  readonly id: string;
  /** The study's own `barColors`, or nothing where it declares none. */
  readonly barColors?: unknown;
}

/**
 * Which study's bar colouring is drawn, given the chart's own study order.
 *
 * The list is the host's, oldest first, which is the order a legend lists them
 * and the order a user changes deliberately. The answer is the last study in it
 * that paints: a study added on top of another is the one whose colouring the
 * user just asked to see, and adding a study that paints nothing changes
 * nothing.
 *
 * Nothing is returned when no study paints, which is the ordinary case.
 */
export function candleOwner(studies: readonly Painter[]): string | undefined {
  for (let index = studies.length - 1; index >= 0; index -= 1) {
    const study = studies[index];
    if (study !== undefined && study.barColors !== undefined) return study.id;
  }
  return undefined;
}
