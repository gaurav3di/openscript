/**
 * What the Phase 3 gate runs, and what it looks at.
 *
 * The Phase 2 gate compared plot columns. This one compares **every surface a
 * study writes**: the plots and the levels, the text of each marker, the colour
 * a bar was painted, the pane background, the cells of every grid, the drawing
 * objects the script holds, and the alerts a bar raised. A study that plots the
 * right line and marks the wrong bar has failed, and a suite that only reads
 * the columns would call it a pass.
 *
 * **Bar by bar rather than in one call.** `Engine.run` hands the whole dataset
 * to the fold before bar 0, which is right for a history load and wrong for a
 * suite that wants the grid and the drawing set as they stood on each bar: a
 * grid's cells are a buffer that step 3 empties, so the only place to read bar
 * forty's panel is immediately after bar forty. Appending one bar at a time
 * with the dataset's length supplied gives the same numbers, which is what the
 * engine's own documentation of the two paths says, with the single exception
 * of a `"lookahead"` read. A study making one passes `whole` and is run the
 * other way, with the drawing and grid snapshots taken at the end instead.
 *
 * **Nothing here computes a study.** Every expected value in this suite comes
 * from a reference transcription beside the test that uses it, and the numbers
 * travel through the compiler, the canonical encoding, the engine's load-time
 * verification and the instruction loop before they are compared.
 *
 * **Naming.** This half of the gate owns the studies whose names begin in the
 * first half of the alphabet, and every file it adds is named to sit there too.
 * The other half owns the second half of the alphabet and says so in its own
 * reader, so the two cannot collide on a filename while both are being written.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { Diagnostic } from '../../../src/core/index.js';
import type { CompiledProgram, Field } from '../../../src/core/emit/index.js';
import { namedColour } from '../../../src/core/engine/index.js';
import type {
  AlertFiring,
  Anchor,
  Drawing,
  Engine,
  Grid,
  LoadOptions,
  Value,
} from '../../../src/core/engine/index.js';
import type { Series } from '../../../src/core/stdlib/index.js';

import { GATE_BARS, GATE_ROOT, GATE_STATES, compileText, loadCompiled } from '../support.js';

export { CLOSE, GATE_BARS, REF_BARS, deviation } from '../support.js';

const SCRIPTS = new URL('tests/gate/studies/scripts/', GATE_ROOT);

/**
 * The fixture's own columns, for a reference that reads a bar rather than a
 * close. Taken from the bars the engine is given, so there is no second copy of
 * the fixture anywhere in this suite.
 */
export const OPEN: readonly number[] = GATE_BARS.map((bar) => bar.open as number);
export const HIGH: readonly number[] = GATE_BARS.map((bar) => bar.high as number);
export const LOW: readonly number[] = GATE_BARS.map((bar) => bar.low as number);
export const VOLUME: readonly number[] = GATE_BARS.map((bar) => bar.volume as number);
export const TIME: readonly number[] = GATE_BARS.map((bar) => bar.time as number);
/** How many bars the fixture has, which every reference column is as long as. */
export const BAR_COUNT = GATE_BARS.length;

/** A study script, read from the source tree rather than written into a test. */
export function studySource(name: string): string {
  return readFileSync(new URL(`${name}.oscript`, SCRIPTS), 'utf8');
}

/** One `signal()` call site: its fixed declaration, and its text per bar. */
export interface MarkerColumn {
  readonly key: string;
  /** `"above"`, `"below"` or `"price"`, as the declaration fixed it. */
  readonly at: Field;
  readonly shape: Field;
  /** The text the script wrote on each bar, absent where it wrote none. */
  readonly text: readonly (string | null)[];
}

/** One grid as it stood at the end of one bar. */
export interface GridSnapshot {
  readonly key: string;
  readonly rows: number;
  readonly cols: number;
  readonly cells: readonly string[];
}

/** One band a study declared between two of its plots. */
export interface BandDeclaration {
  readonly between: readonly [string, string];
  /** The two sides a band may be coloured by, which `fill`'s one colour sets alike. */
  readonly colorUp: Field;
  readonly colorDown: Field;
  readonly opacity: Field;
}

/** Everything one run of one study produced. */
export interface StudyRun {
  readonly name: string;
  readonly engine: Engine;
  /** Plot columns, keyed by the title the script gave each one. */
  readonly plots: ReadonlyMap<string, Series>;
  /** Level columns, keyed by title, because a level's price may be data-driven. */
  readonly levels: ReadonlyMap<string, Series>;
  /**
   * The colour a plot was drawn in on each bar, keyed by title.
   *
   * Only for a plot whose colour is a series: a constant colour is part of the
   * declaration and has no per-bar channel, so it is absent from this map
   * entirely rather than repeated eighty times.
   */
  readonly plotColors: ReadonlyMap<string, readonly string[]>;
  readonly markers: readonly MarkerColumn[];
  /** The shaded bands, in declaration order, by the plot keys they join. */
  readonly bands: readonly BandDeclaration[];
  /** The candle colour and the pane shading, spelled for a readable failure. */
  readonly barColor: readonly string[];
  readonly background: readonly string[];
  /** The grids at the end of each bar, and the drawings the script then held. */
  readonly grids: readonly (readonly GridSnapshot[])[];
  readonly drawings: readonly (readonly Drawing[])[];
  readonly alerts: readonly (readonly AlertFiring[])[];
}

export interface RunOptions {
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly load?: LoadOptions;
  /**
   * Hand the engine the whole dataset instead of one bar at a time.
   *
   * Only a `"lookahead"` read needs this, and it costs the per-bar grid and
   * drawing snapshots, which are then taken once at the end.
   */
  readonly whole?: boolean;
  /**
   * Run the bars as a live feed rather than as a history load.
   *
   * `stdlib.md` 16.2: adding a study to a chart that already holds history
   * fires no alert for those bars, and the fact that separates the two is one
   * the host states rather than one an engine can derive. So a study with a
   * watched condition is run both ways, and the difference is the rule.
   */
  readonly realtime?: boolean;
}

/**
 * A colour as a failure message can carry it.
 *
 * Deliberately not the `#rrggbbaa` spelling `text(color)` produces: that
 * spelling is the language's, defined in the specification, and a second copy
 * of it here would be a fact stated twice. This is a label for a test, so it is
 * the four channels as they are.
 */
export function swatch(value: Value): string {
  if (value === null) return 'none';
  if (typeof value === 'object' && 'tag' in value && value.tag === 'color') {
    return `${value.r}:${value.g}:${value.b}:${value.a}`;
  }
  return `not a colour: ${typeof value}`;
}

/** A named colour, spelled as the columns above spell one. */
export function paint(name: string): string {
  const colour = namedColour(name);
  assert.notEqual(colour, null, `${name} is not a colour this engine has`);
  return swatch(colour);
}

/** A named colour with transparency applied, as `fade` applies it. */
export function faded(name: string, percent: number): string {
  const colour = namedColour(name);
  assert.notEqual(colour, null, `${name} is not a colour this engine has`);
  if (colour === null || typeof colour !== 'object' || !('tag' in colour)) return 'none';
  if (colour.tag !== 'color') return 'none';
  return `${colour.r}:${colour.g}:${colour.b}:${colour.a * (1 - percent / 100)}`;
}

/** Nothing painted, on every bar. */
export const UNPAINTED: readonly string[] = GATE_BARS.map(() => 'none');

function numberCell(cell: Value, what: string, bar: number): number | null {
  if (cell === null) return null;
  assert.equal(typeof cell, 'number', `${what}: bar ${bar} published a ${typeof cell}`);
  return cell as number;
}

function textCell(cell: Value, what: string, bar: number): string | null {
  if (cell === null) return null;
  assert.equal(typeof cell, 'string', `${what}: bar ${bar} published a ${typeof cell}`);
  return cell as string;
}

/** One grid's cells, spelled in the order the bar wrote them. */
function snapshot(grids: readonly Grid[]): readonly GridSnapshot[] {
  return grids.map((grid) => ({
    key: grid.key,
    rows: grid.rows,
    cols: grid.cols,
    cells: grid.cells.map(
      (cell) =>
        `${cell.row},${cell.col}=${cell.text === null ? 'none' : String(cell.text)}` +
        `|${swatch(cell.textColor)}|${swatch(cell.bgColor)}` +
        `|${cell.align === null ? 'none' : String(cell.align)}`,
    ),
  }));
}

function columnsOf(
  program: CompiledProgram,
  engine: Engine,
  name: string,
): {
  plots: Map<string, Series>;
  levels: Map<string, Series>;
  markers: MarkerColumn[];
  plotColors: Map<string, readonly string[]>;
} {
  const plots = new Map<string, Series>();
  const plotColors = new Map<string, readonly string[]>();
  for (const one of program.outputs.plots) {
    const title = typeof one.title === 'string' ? one.title : one.key;
    assert.equal(plots.has(title), false, `${name} has two plots titled ${title}`);
    plots.set(
      title,
      engine.column(one.channel).map((cell, bar) => numberCell(cell, `${name} ${title}`, bar)),
    );
    if (one.colorChannel !== null) {
      plotColors.set(title, engine.column(one.colorChannel).map((cell) => swatch(cell)));
    }
  }

  const levels = new Map<string, Series>();
  for (const one of program.outputs.levels) {
    const title = typeof one.title === 'string' ? one.title : 'level';
    assert.equal(levels.has(title), false, `${name} has two levels titled ${title}`);
    levels.set(
      title,
      engine.column(one.channel).map((cell, bar) => numberCell(cell, `${name} ${title}`, bar)),
    );
  }

  for (const one of program.outputs.plots) {
    const candles = one.ohlc;
    if (candles === null) continue;
    const title = typeof one.title === 'string' ? one.title : one.key;
    // A candle plot carries four columns rather than one, and its own `channel`
    // is the close. The other three are only reachable here, so a study drawing
    // a smoothed or a coarse candle has its open, high and low compared too.
    for (const [part, channel] of [
      ['open', candles.open],
      ['high', candles.high],
      ['low', candles.low],
    ] as const) {
      const key = `${title}.${part}`;
      assert.equal(plots.has(key), false, `${name} has two columns called ${key}`);
      plots.set(
        key,
        engine.column(channel).map((cell, bar) => numberCell(cell, `${name} ${key}`, bar)),
      );
    }
  }

  const markers = program.outputs.markers.map((one) => ({
    key: one.key,
    at: one.position,
    shape: one.shape,
    text: engine
      .column(one.channel)
      .map((cell, bar) => textCell(cell, `${name} marker ${one.key}`, bar)),
  }));

  return { plots, levels, markers, plotColors };
}

function paintOf(program: CompiledProgram, engine: Engine, which: 'barColor' | 'background'): string[] {
  const declared = program.outputs[which];
  if (declared === null) return GATE_BARS.map(() => 'none');
  return engine.column(declared.channel).map((cell) => swatch(cell));
}

/**
 * Compile a study, run it over the fixture, and collect every surface.
 *
 * A diagnostic on any bar fails here rather than in the comparison, naming the
 * bar it stopped on: a study that stopped halfway would otherwise be reported
 * as a column of absences, which reads as a warmup fault and sends the reader
 * to the wrong place.
 */
export function runStudy(name: string, options: RunOptions = {}): StudyRun {
  const compiled = compileText(name, studySource(name));
  const engine = loadCompiled(compiled, name, options.settings ?? {}, options.load ?? {});
  const states = options.realtime === true
    ? GATE_BARS.map(() => ({ isConfirmed: true, isRealtime: true }))
    : GATE_STATES;
  const grids: (readonly GridSnapshot[])[] = [];
  const drawings: (readonly Drawing[])[] = [];
  const alerts: (readonly AlertFiring[])[] = [];

  const stop = (bar: number, diagnostic: Diagnostic | undefined): void => {
    assert.equal(diagnostic, undefined, `${name} stopped on bar ${bar}: ${diagnostic?.code ?? ''}`);
  };

  if (options.whole === true) {
    const result = engine.run(GATE_BARS, states);
    stop(result.bars.length - 1, result.diagnostic);
    for (const bar of result.bars) alerts.push(bar.alerts);
    grids.push(snapshot(engine.tables()));
    drawings.push(engine.drawings());
  } else {
    for (let bar = 0; bar < GATE_BARS.length; bar += 1) {
      const state = states[bar];
      const supplied = GATE_BARS.length;
      const result = engine.append(GATE_BARS[bar] as (typeof GATE_BARS)[number], state, supplied);
      stop(bar, result.diagnostic);
      alerts.push(result.alerts);
      grids.push(snapshot(engine.tables()));
      drawings.push(engine.drawings());
    }
  }

  const { plots, levels, markers, plotColors } = columnsOf(compiled.program, engine, name);
  const bands = compiled.program.outputs.fills.map((one) => ({
    between: one.between,
    colorUp: one.colorUp,
    colorDown: one.colorDown,
    opacity: one.opacity,
  }));
  return {
    name,
    engine,
    plots,
    levels,
    markers,
    plotColors,
    bands,
    barColor: paintOf(compiled.program, engine, 'barColor'),
    background: paintOf(compiled.program, engine, 'background'),
    grids,
    drawings,
    alerts,
  };
}

/** One plot column by title, failing the test rather than returning nothing. */
export function column(run: StudyRun, title: string): Series {
  const found = run.plots.get(title);
  assert.notEqual(found, undefined, `${run.name}: no plot titled ${title}`);
  return found as Series;
}

/** The colour column of a plot whose colour is a series, by the plot's title. */
export function plotColour(run: StudyRun, title: string): readonly string[] {
  const found = run.plotColors.get(title);
  assert.notEqual(found, undefined, `${run.name}: ${title} has no per-bar colour`);
  return found as readonly string[];
}

/** One level column by title. */
export function levelColumn(run: StudyRun, title: string): Series {
  const found = run.levels.get(title);
  assert.notEqual(found, undefined, `${run.name}: no level titled ${title}`);
  return found as Series;
}

/** One marker column, by the order its `signal()` call appears in the script. */
export function marker(run: StudyRun, index: number): MarkerColumn {
  assert.equal(
    index < run.markers.length,
    true,
    `${run.name}: has ${run.markers.length} markers, asked for ${index}`,
  );
  return run.markers[index] as MarkerColumn;
}

/**
 * Two columns of anything comparable agree bar for bar, absence included.
 *
 * Exact equality, never a tolerance, for the reason `tests/stdlib/support.ts`
 * sets out: the order of floating point operations is part of the contract, so
 * a comparison that accepted an epsilon would pass an implementation that
 * reassociated a sum, which is the one thing the contract forbids.
 */
export function assertColumn<T>(
  actual: readonly T[],
  expected: readonly T[],
  what: string,
): void {
  assert.equal(actual.length, expected.length, `${what}: length`);
  for (let bar = 0; bar < actual.length; bar += 1) {
    assert.equal(
      actual[bar],
      expected[bar],
      `${what}: bar ${bar} is ${String(actual[bar])}, expected ${String(expected[bar])}`,
    );
  }
}

/**
 * The first bar a sparse column has a value on.
 *
 * `assertWarmup` is the assertion for a column that is absent and then present
 * for ever, which is what a moving average does. A marker column, a gapped rail
 * and a signal column are absent again afterwards, so the warmup fact about
 * them is the first bar that carries one, and it is asserted separately from
 * the values so that a study firing one bar early says so in one line.
 */
export function assertFirstAt<T>(column: readonly (T | null)[], at: number, what: string): void {
  let first = -1;
  for (let bar = 0; bar < column.length && first < 0; bar += 1) {
    if (column[bar] !== null && column[bar] !== undefined) first = bar;
  }
  assert.equal(first, at, `${what}: first value should be at bar ${at}`);
}

/** Which bar of the fixture an instant belongs to, for a readable anchor. */
const BAR_AT = new Map<number, number>(TIME.map((time, bar) => [time, bar]));

/**
 * One anchor of a drawing, as this suite spells one.
 *
 * A time is spelled as the fixture bar it names rather than as the instant,
 * because a failure message reading `#37` sends the reader to a bar and one
 * reading `1748738220000` sends them to a calculator. An instant that is not a
 * bar of the fixture keeps its number, which is what a projection into the
 * margin past the newest bar looks like.
 */
export function anchorText(bar: number | null, price: number | null): string {
  const when = bar === null ? 'none' : `#${bar}`;
  return `${when}@${price === null ? 'none' : String(price)}`;
}

function spellAnchor(anchor: Anchor): string {
  if (anchor.time === null) return anchorText(null, anchor.price);
  const bar = BAR_AT.get(anchor.time);
  return bar === undefined
    ? `${anchor.time}@${anchor.price === null ? 'none' : String(anchor.price)}`
    : anchorText(bar, anchor.price);
}

function spellValue(value: Value | undefined): string {
  if (value === undefined || value === null) return 'none';
  if (typeof value === 'object' && 'tag' in value && value.tag === 'color') return swatch(value);
  return String(value);
}

/**
 * One drawing as a line of text: its kind, its anchors in order, and whichever
 * style fields the test asked for.
 *
 * The style is named rather than dumped whole, because a study that sets a
 * tooltip and a study that sets a width are asking different questions, and a
 * comparison that carried every field would fail on the one nobody was testing.
 */
export function spellDrawing(one: Drawing, styleKeys: readonly string[] = []): string {
  const anchors = one.anchors.map(spellAnchor).join(' ');
  const style = styleKeys.map((key) => ` ${key}=${spellValue(one.style[key])}`).join('');
  return `${one.kind}[${anchors}]${style}`;
}

/** Every live drawing on one bar, in creation order. */
export function spellDrawings(
  drawings: readonly Drawing[],
  styleKeys: readonly string[] = [],
): string[] {
  return drawings.map((one) => spellDrawing(one, styleKeys));
}

/** The bars a sparse column carries a value on, which is what a marker is. */
export function barsWith<T>(column: readonly (T | null)[]): number[] {
  const out: number[] = [];
  for (let bar = 0; bar < column.length; bar += 1) {
    if (column[bar] !== null && column[bar] !== undefined) out.push(bar);
  }
  return out;
}
