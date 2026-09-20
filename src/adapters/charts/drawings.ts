/**
 * Drawing objects into the chart's free drawings.
 *
 * A plot is a column of one value per bar and its set is fixed before bar 0. A
 * drawing object is neither: a script creates one on the bar it decides to, and
 * moves, recolours and deletes it on any bar afterwards (`stdlib.md` 14.4). The
 * chart's own field for that is a list of shapes anchored to time and price,
 * replaced wholesale on every recompute, and that replacement is what makes the
 * two halves fit without a protocol between them:
 *
 * - A script that deletes an object simply stops handing it over, and it is gone.
 * - A moving bar rolls its objects back before re-executing, so the list handed
 *   over after four ticks of one bar is the list after one, and a line drawn per
 *   tick does not accumulate four times.
 *
 * **An anchor is a time and a price, and neither is resolved against a bar.** An
 * anchor ten days past the newest bar crosses as the number it was written as and
 * lands in the margin, which is what a projection is for.
 *
 * **Absence is a gap, and it takes two shapes here.** An anchor with no time or
 * no price cannot be placed at all, so a line, a box or a label missing either is
 * not drawn: `language.md` 6.7 says nothing is drawn there and nothing is
 * invented to fill it, and a zero would be a price. A colour that is absent
 * becomes fully transparent rather than being left out, because the chart draws a
 * shape's border in its own ink where no colour is given, and `none` in this
 * language means nothing is drawn rather than "you choose".
 *
 * **A path with a gap in it becomes several paths.** The chart's polyline is one
 * run of points and the language's path may have a hole in it, so the path is cut
 * at the hole and each run is drawn. A run of one point is dropped, since a path
 * needs two, and the `closed` and `fillColor` of a path that was cut are left
 * off: closing each run separately would draw shapes the script never described.
 */
import type { Drawing, Value } from '../../core/engine/index.js';
import { MS } from './bars.js';
import { cssOf } from './colours.js';
import type { ChartLineStyle } from './contract.js';
import type { ChartAnchor, ChartCellAlign, ChartDrawing } from './surfaces.js';

/** A colour a script left absent: nothing is drawn there. */
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const LINE_STYLES: readonly string[] = ['solid', 'dashed', 'dotted'];
const ALIGNMENTS: readonly string[] = ['left', 'center', 'right'];

/**
 * One point, or nothing when either half of it is absent.
 *
 * The time crosses the same boundary a bar's does and in the same direction: an
 * anchor is written in the language's milliseconds and a chart counts seconds,
 * so an anchor handed over unconverted would sit fifty thousand years past the
 * newest bar and still draw. It is not rounded, because rounding an anchor moves
 * it, and a chart places one between two bars perfectly well.
 */
function anchorOf(anchor: { readonly time: number | null; readonly price: number | null } | undefined):
  ChartAnchor | undefined {
  if (anchor === undefined || anchor.time === null || anchor.price === null) return undefined;
  return { time: anchor.time / MS, price: anchor.price };
}

function colour(style: Readonly<Record<string, Value>>, key: string): string {
  return cssOf(style[key] ?? null) ?? TRANSPARENT;
}

function number(style: Readonly<Record<string, Value>>, key: string): number | undefined {
  const value = style[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function text(style: Readonly<Record<string, Value>>, key: string): string | undefined {
  const value = style[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function flag(style: Readonly<Record<string, Value>>, key: string): boolean | undefined {
  const value = style[key];
  return typeof value === 'boolean' ? value : undefined;
}

function lineStyle(style: Readonly<Record<string, Value>>): ChartLineStyle | undefined {
  const value = style['style'];
  return typeof value === 'string' && LINE_STYLES.includes(value)
    ? (value as ChartLineStyle)
    : undefined;
}

function align(style: Readonly<Record<string, Value>>): ChartCellAlign | undefined {
  const value = style['align'];
  return typeof value === 'string' && ALIGNMENTS.includes(value)
    ? (value as ChartCellAlign)
    : undefined;
}

function oneLine(one: Drawing): readonly ChartDrawing[] {
  const from = anchorOf(one.anchors[0]);
  const to = anchorOf(one.anchors[1]);
  if (from === undefined || to === undefined) return [];
  const width = number(one.style, 'width');
  const dash = lineStyle(one.style);
  const left = flag(one.style, 'extendLeft');
  const right = flag(one.style, 'extendRight');
  return [
    {
      kind: 'line',
      from,
      to,
      color: colour(one.style, 'color'),
      ...(width === undefined ? {} : { lineWidth: width }),
      ...(dash === undefined ? {} : { lineStyle: dash }),
      ...(left === undefined ? {} : { extendLeft: left }),
      ...(right === undefined ? {} : { extendRight: right }),
    },
  ];
}

function oneBox(one: Drawing): readonly ChartDrawing[] {
  const from = anchorOf(one.anchors[0]);
  const to = anchorOf(one.anchors[1]);
  if (from === undefined || to === undefined) return [];
  const opacity = number(one.style, 'opacity');
  const width = number(one.style, 'width');
  const caption = text(one.style, 'text');
  const tooltip = text(one.style, 'tooltip');
  return [
    {
      kind: 'box',
      from,
      to,
      color: colour(one.style, 'color'),
      fillColor: colour(one.style, 'fillColor'),
      textColor: colour(one.style, 'textColor'),
      ...(opacity === undefined ? {} : { opacity }),
      ...(width === undefined ? {} : { lineWidth: width }),
      ...(caption === undefined ? {} : { text: caption }),
      ...(tooltip === undefined ? {} : { tooltip }),
    },
  ];
}

function oneLabel(one: Drawing): readonly ChartDrawing[] {
  const at = anchorOf(one.anchors[0]);
  const written = one.style['text'];
  if (at === undefined || typeof written !== 'string') return [];
  const placement = align(one.style);
  const tooltip = text(one.style, 'tooltip');
  return [
    {
      kind: 'label',
      at,
      text: written,
      color: colour(one.style, 'color'),
      textColor: colour(one.style, 'textColor'),
      ...(placement === undefined ? {} : { align: placement }),
      ...(tooltip === undefined ? {} : { tooltip }),
    },
  ];
}

/** The path cut at its gaps: one run of points per stretch that has none. */
function runsOf(one: Drawing): readonly (readonly ChartAnchor[])[] {
  const runs: ChartAnchor[][] = [];
  let run: ChartAnchor[] = [];
  for (const point of one.anchors) {
    const anchor = anchorOf(point);
    if (anchor === undefined) {
      if (run.length > 1) runs.push(run);
      run = [];
      continue;
    }
    run.push(anchor);
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

function onePolyline(one: Drawing): readonly ChartDrawing[] {
  const runs = runsOf(one);
  const whole = runs.length === 1 && runs[0]?.length === one.anchors.length;
  const width = number(one.style, 'width');
  const opacity = number(one.style, 'opacity');
  const closed = flag(one.style, 'closed');
  const filled = whole
    ? {
        fillColor: colour(one.style, 'fillColor'),
        ...(closed === undefined ? {} : { closed }),
        ...(opacity === undefined ? {} : { opacity }),
      }
    : {};
  return runs.map((points) => ({
    kind: 'polyline' as const,
    points,
    color: colour(one.style, 'color'),
    ...(width === undefined ? {} : { lineWidth: width }),
    ...filled,
  }));
}

/**
 * Every object the script holds, in the order it created them.
 *
 * Creation order rather than any other, because it is the order the script wrote
 * and therefore the order a reader expects one shape to sit over another.
 */
export function buildDrawings(held: readonly Drawing[]): readonly ChartDrawing[] {
  const out: ChartDrawing[] = [];
  for (const one of held) {
    if (one.kind === 'line') out.push(...oneLine(one));
    else if (one.kind === 'box') out.push(...oneBox(one));
    else if (one.kind === 'label') out.push(...oneLabel(one));
    else out.push(...onePolyline(one));
  }
  return out;
}
