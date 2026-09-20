/**
 * The part of the library that reaches the chart or the host: `stdlib.md`
 * sections 13 to 16.
 *
 * Two facts about this group drive most of the checking around it. The four
 * declaration calls and `table` and `input` are top level only, because they
 * describe the study's fixed shape and that shape is settled before bar 0
 * (`language.md` 15.3). And the arguments that land in a declaration rather
 * than in a bar are marked constant, so a value computed from bar data in one
 * of them is OS3003 rather than something the host discovers it cannot honour.
 */
import { DATA_DRIVEN, entry, wholeRange } from './library.js';
import type { LibraryEntry } from './library.js';

const PLOT_STYLES = ['line', 'lineWithMarkers', 'step', 'area', 'histogram', 'column'];
const SCALES = ['right', 'left', 'none'];
const FORMATS = ['price', 'percent', 'volume'];
const MARKER_AT = ['above', 'below', 'price'];
const MARKER_SHAPES = [
  'label',
  'arrowUp',
  'arrowDown',
  'triangleUp',
  'triangleDown',
  'circle',
  'square',
  'diamond',
  'cross',
  'flag',
];
const CORNERS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
const CELL_ALIGN = ['left', 'center', 'right'];
const LINE_STYLES = ['solid', 'dashed', 'dotted'];
const REQUEST_MODES = ['confirmed', 'developing', 'lookahead'];
const ALERT_FREQUENCIES = ['oncePerBar', 'once', 'everyUpdate'];

/** The two reads of stdlib.md 15.1, which are the only calls that can repaint. */
export const REQUEST_NAMES: readonly string[] = ['req.timeframe', 'req.symbol'];

/** The calls `language.md` 15.3 puts at the top level, minus `input` and the legs. */
export const TOP_LEVEL_NAMES: readonly string[] = [
  'plot',
  'plotCandles',
  'fill',
  'level',
  'table',
  'leg.fixed',
  'leg.relative',
];

const inputs: readonly LibraryEntry[] = [
  entry(
    'input(value: any, title?: string, min?: number, max?: number, step?: number, options?: array<string>, kind?: string, group?: string, tooltip?: string, inline?: string, confirm?: bool) -> any',
    {
      topLevel: true,
      values: { kind: ['interval', 'time', 'symbol', 'price', 'session'] },
      constant: [
        'title',
        'min',
        'max',
        'step',
        'options',
        'kind',
        'group',
        'tooltip',
        'inline',
        'confirm',
      ],
    },
  ),
];

const declarations: readonly LibraryEntry[] = [
  entry(
    'plot(value: series number, title: string, color?: color, width?: number, style?: string, offset?: number, overlay?: bool, precision?: number, format?: string, scale?: string) -> plot',
    {
      topLevel: true,
      values: { style: PLOT_STYLES, format: FORMATS, scale: SCALES },
      constant: ['title', 'width', 'style', 'offset', 'overlay', 'precision', 'format', 'scale'],
      whole: { precision: wholeRange(0, 10), offset: wholeRange() },
    },
  ),
  entry(
    'plotCandles(open: series number, high: series number, low: series number, close: series number, title: string, colorUp?: color, colorDown?: color, wickColor?: color, borderColor?: color) -> plot',
    { topLevel: true, constant: ['title'] },
  ),
  entry(
    'fill(plotA: plot, plotB: plot, color?: color, colorUp?: color, colorDown?: color, opacity?: number, overlay?: bool) -> fill',
    {
      topLevel: true,
      constant: ['opacity', 'overlay'],
      // One colour for the whole band or one for each side, never both: any
      // rule for reconciling them surprises somebody (stdlib.md 14.2).
      conflicts: [
        ['color', 'colorUp'],
        ['color', 'colorDown'],
      ],
    },
  ),
  entry(
    'level(price: series number, title?: string, color?: color, style?: string, width?: number) -> level',
    {
      topLevel: true,
      values: { style: LINE_STYLES },
      // A level's colour is one field of the declaration and the format gives it
      // no per-bar channel, unlike a plot's, so a bar-dependent one has nowhere
      // to land (`compiled-program.md` 2.8).
      constant: ['title', 'color', 'style', 'width'],
    },
  ),
  entry(
    'table(title: string, rows: number, cols: number, position?: string, textColor?: color, bgColor?: color, borderWidth?: number) -> table',
    {
      topLevel: true,
      values: { position: CORNERS },
      // The grid's own style is declared once, in `options`. A cell's colours
      // are the per-bar ones, and `cell` takes them.
      constant: ['title', 'rows', 'cols', 'position', 'textColor', 'bgColor', 'borderWidth'],
      whole: { rows: wholeRange(1), cols: wholeRange(1) },
    },
  ),
];

const perBar: readonly LibraryEntry[] = [
  entry('signal(text: string, color?: color, at?: string, shape?: string) -> nothing', {
    values: { at: MARKER_AT, shape: MARKER_SHAPES },
    constant: ['color', 'at', 'shape'],
  }),
  entry('barColor(color: color) -> nothing'),
  entry('background(color: color) -> nothing'),
  entry(
    'cell(t: table, row: number, col: number, text: string, textColor?: color, bgColor?: color, align?: string) -> nothing',
    { values: { align: CELL_ALIGN }, whole: { row: wholeRange(0), col: wholeRange(0) } },
  ),
  entry('clear(t: table) -> nothing'),
  entry('print(value: any) -> nothing'),
  // Only the message is read per bar. The other three are the entry's own
  // identity and its firing rule, written into `outputs.alerts` before bar 0,
  // so a bar-dependent one has nowhere to land (`compiled-program.md` 2.8).
  entry('alert(message: string, id?: string, title?: string, frequency?: string) -> nothing', {
    values: { frequency: ALERT_FREQUENCIES },
    constant: ['id', 'title', 'frequency'],
  }),
  entry('notify(message: string, channel: string) -> nothing', { planned: true }),
];

/**
 * The four creation calls, with the defaults of `stdlib.md` 14.4 written out.
 *
 * These four say what their optional arguments default to, and most of the
 * library still does not. The difference is what the omitted argument becomes:
 * a calculation reads an absent length and answers absence, which is a truthful
 * answer that costs nothing, while an object created with an absent width and
 * an absent style is a drawing with no thickness and no line style, and absence
 * on a drawing surface means nothing is drawn (`language.md` 6.7). So a
 * drawing's defaults have to be in the program, and 4.10 says where they are
 * decided: here, at compile time, rather than in an engine's table.
 */
const drawing: readonly LibraryEntry[] = [
  entry(
    'draw.line(t1: number, p1: number, t2: number, p2: number, color?: color = gray, width?: number = 1, style?: string = "solid", extendLeft?: bool = false, extendRight?: bool = false) -> line',
    { values: { style: LINE_STYLES } },
  ),
  entry(
    'draw.label(t: number, p: number, text: string, color?: color = none, textColor?: color = white, align?: string = "center", tooltip?: string = "") -> label',
  ),
  entry(
    'draw.box(t1: number, p1: number, t2: number, p2: number, color?: color = none, fillColor?: color = none, opacity?: number = 0.12, width?: number = 1, text?: string = "", textColor?: color = white, tooltip?: string = "") -> box',
  ),
  entry(
    'draw.polyline(times: array<number>, prices: array<number>, color?: color = gray, width?: number = 1, closed?: bool = false, fillColor?: color = none, opacity?: number = 0.12) -> polyline',
  ),
  entry('draw.setFrom(obj: any, t: number, p: number) -> nothing'),
  entry('draw.setTo(obj: any, t: number, p: number) -> nothing'),
  entry('draw.setBounds(obj: any, t1: number, p1: number, t2: number, p2: number) -> nothing'),
  entry('draw.setAt(label: label, t: number, p: number) -> nothing'),
  entry(
    'draw.setPoints(polyline: polyline, times: array<number>, prices: array<number>) -> nothing',
  ),
  entry('draw.setText(obj: any, text: string) -> nothing'),
  entry('draw.setColor(obj: any, color: color) -> nothing'),
  entry('draw.setTextColor(obj: any, color: color) -> nothing'),
  entry('draw.setFillColor(obj: any, color: color) -> nothing'),
  entry('draw.setWidth(obj: any, width: number) -> nothing'),
  entry('draw.setStyle(obj: any, style: string) -> nothing', { values: { style: LINE_STYLES } }),
  entry('draw.setExtend(line: line, left: bool, right: bool) -> nothing'),
  entry('draw.setTooltip(obj: any, text: string) -> nothing'),
  entry('draw.delete(obj: any) -> nothing'),
  entry('draw.deleteAll() -> nothing'),
  entry('draw.count() -> number'),
];

const requests: readonly LibraryEntry[] = [
  // Not planned, and deliberately so: a target script uses a higher timeframe
  // read, so the language has it in version one and the checker accepts it.
  //
  // The engine is what does not execute a request body yet, and the format
  // already has the honest way to say that: the program carries a `req.timeframe`
  // capability tag, and an engine without it refuses at load with OS6006 naming
  // the capability. That is a third legitimate state beside "runs" and
  // "planned", and it is the one the compiled format was designed for, because
  // it is how an old engine tells a new program what it is missing.
  entry('req.timeframe(timeframe: string, expr: T, mode?: string) -> T', {
    warmup: DATA_DRIVEN,
    values: { mode: REQUEST_MODES },
  }),
  entry(
    'req.symbol(symbol: string, timeframe: string, expr: T, exchange?: string, mode?: string) -> T',
    {
      warmup: DATA_DRIVEN,
      values: { mode: REQUEST_MODES },
    },
  ),
  entry('req.isReady(read: any) -> series bool'),
  entry('req.error(read: any) -> series string'),
  entry('req.candle(timeframe: string, mode?: string) -> array<number>', { planned: true }),
  entry('req.events(kind: string) -> series number', { planned: true }),
];

export const OUTPUT_ENTRIES: readonly LibraryEntry[] = [
  ...inputs,
  ...declarations,
  ...perBar,
  ...drawing,
  ...requests,
];
