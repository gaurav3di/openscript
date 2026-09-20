/**
 * What the second half of the phase three gate runs, and how far it runs it.
 *
 * The phase two gate proved that five calculations survive the pipeline. This
 * half proves the rest of the surface: a marker, a bar colour, a pane
 * background, a panel of cells, a drawing a script mutates over many bars and a
 * read of a coarser timeframe. So a study here is compared on more than a
 * column of numbers, and everything a study publishes has a reader below.
 *
 * **Every value asserted has been through the whole pipeline.** Source text,
 * lexer, parser, checker, emitter, the canonical encoding, the engine's load
 * time verification, then one bar at a time through the instruction loop. The
 * program reaches the engine through `JSON.parse(JSON.stringify(...))`, because
 * an engine written in another language is handed text and the round trip is
 * what makes this a test of the contract rather than of two halves of one
 * process.
 *
 * **The bars are the fixture in `tests/stdlib/vectors.ts`**, not a second copy
 * of it. Session flags and a coarse bucket are layered on top of that one
 * fixture rather than beside it, so there is still one set of prices in this
 * repository and a study that reads a session or a higher timeframe reads the
 * same prices every other study does.
 *
 * Naming: this half of the gate owns the studies whose names begin in the
 * second half of the alphabet, and every file here is named to sit there too,
 * so the two halves of the gate cannot collide on a filename.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DiagnosticBag, check, lex, parseTokens, sourceFile } from '../../../src/core/index.js';
import type { Diagnostic, SourceFile } from '../../../src/core/index.js';
import { emit } from '../../../src/core/emit/index.js';
import type { CompiledProgram } from '../../../src/core/emit/index.js';
import { isColour, load, namedColour } from '../../../src/core/engine/index.js';
import type {
  BarState,
  ColourValue,
  Drawing,
  Engine,
  EngineHost,
  Grid,
  HostBar,
  LoadOptions,
  Value as MachineValue,
} from '../../../src/core/engine/index.js';
import type { Series, Value } from '../../../src/core/stdlib/index.js';

import { BARS } from '../../stdlib/vectors.js';

const ROOT = new URL('../../../../', import.meta.url);
const SCRIPTS = new URL('tests/gate/studies/scripts/', ROOT);

/**
 * One bar a minute from a fixed instant, so a time is the same on every run.
 *
 * The instant is the one the first half of the gate uses, read from the same
 * place rather than restated, because a bar time that differed between the two
 * halves would give two studies over one fixture two different calendars.
 */
export const BASE_TIME = 1_748_736_000_000;
export const BAR_MILLIS = 60_000;
const DAY_MILLIS = 24 * 60 * BAR_MILLIS;

/** How many one minute bars go into one bar of the coarse timeframe below. */
export const COARSE_BARS = 10;

/** The coarse timeframe the higher timeframe studies read. */
export const COARSE_TIMEFRAME = '10';

/**
 * The fixture as an engine receives it: the stdlib bars, dated.
 *
 * **Ten bars a day, and then the next day**, because a session is a window in
 * the instrument record and a window recurs daily. The fixture wants a session
 * boundary every tenth bar, so the instrument below trades ten minutes a day
 * and these are its bars: minute zero to minute nine, then tomorrow's. Spacing
 * is not required to be uniform and a real session is not uniform, which is why
 * this is a dataset an engine will actually be handed rather than a shape
 * invented for the fixture.
 *
 * A gap of a whole day between sessions moves no other expectation in this
 * suite. Every bucket boundary of the coarse timeframe is still a boundary of
 * ten fixture bars, because a day divides into whole coarse buckets, and every
 * expectation about a time is read back out of this array rather than restated.
 */
export const STUDY_BARS: readonly HostBar[] = BARS.map((bar, index) => ({
  open: bar.open,
  high: bar.high,
  low: bar.low,
  close: bar.close,
  volume: bar.volume,
  time:
    BASE_TIME +
    Math.floor(index / COARSE_BARS) * DAY_MILLIS +
    (index % COARSE_BARS) * BAR_MILLIS,
}));

/**
 * Every bar confirmed, which is what a history load looks like.
 *
 * **There is no session flag here, and that is the point.** The facts a host
 * states about an execution are the four of `language.md` 7.2, and where a
 * session begins is not one of them: it follows from the window in the
 * instrument record below. A fixture that stated it per bar was driving the
 * engine down a path no host built from the specification could take, and the
 * session boundary every tenth bar it produced was one no instrument record can
 * describe.
 */
export const STUDY_STATES: readonly BarState[] = STUDY_BARS.map(() => ({
  isConfirmed: true,
}));

/** A bar as the reference transcriptions read one. */
export interface StudyBar {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

/** The fixture as the references read it. */
export const REF_BARS: readonly StudyBar[] = BARS.map((bar) => ({
  open: bar.open as number,
  high: bar.high as number,
  low: bar.low as number,
  close: bar.close as number,
  volume: bar.volume as number,
}));

export const OPEN: readonly number[] = REF_BARS.map((bar) => bar.open);
export const HIGH: readonly number[] = REF_BARS.map((bar) => bar.high);
export const LOW: readonly number[] = REF_BARS.map((bar) => bar.low);
export const CLOSE: readonly number[] = REF_BARS.map((bar) => bar.close);
export const VOLUME: readonly number[] = REF_BARS.map((bar) => bar.volume);
export const BAR_TIMES: readonly number[] = STUDY_BARS.map((bar) => bar.time as number);

/** Which session each bar belongs to, counting from zero. */
export const SESSION_OF: readonly number[] = STUDY_BARS.map((_bar, index) =>
  Math.floor(index / COARSE_BARS),
);

/**
 * The host, whose instrument trades ten minutes a day.
 *
 * The session window and the timezone are what every session study in this half
 * of the gate is anchored by: the engine derives `session.isFirstBar` and
 * `session.isLastBar` from them, the bar's time and the interval, so a boundary
 * lands on every tenth bar of the fixture without anything stating one.
 */
export const HOST: EngineHost = {
  instrument: {
    symbol: 'AAA',
    exchange: 'XX',
    interval: '1',
    timezone: 'UTC',
    tickSize: 0.05,
    lotSize: 50,
    session: { start: '00:00', end: '00:10' },
  },
  now: BASE_TIME,
  position: { size: 0, avgPrice: 0 },
  route: () => {},
};

/**
 * The same host, declaring that it answers reads.
 *
 * It answers none of them: every query returns nothing, which is what a host
 * says when it does not serve a read itself. For a read of the chart's own
 * instrument at a coarser interval that is the ordinary case, and the engine
 * folds the bars it already holds. The provider still has to be present,
 * because the capability a program requires is declared from the host having
 * one at all, and a host without it is refused at load with a code naming the
 * capability rather than failing halfway through a bar.
 */
export const HOST_WITH_READS: EngineHost = {
  ...HOST,
  requestBars: () => undefined,
};

/** A study's source, read from disk rather than written into a test. */
export function studySource(name: string): string {
  return readFileSync(new URL(`${name}.oscript`, SCRIPTS), 'utf8');
}

export interface Compiled {
  readonly file: SourceFile;
  readonly program: CompiledProgram;
}

/**
 * Source to compiled program, with nothing reported.
 *
 * A warning is a failure here for the same reason it is in the first half: the
 * warnings in this language are about the mistakes that change a series, so a
 * study whose numbers were computed by a program the compiler had something to
 * say about has not reproduced anything.
 */
export function compileStudy(name: string): Compiled {
  const file = sourceFile(`${name}.oscript`, studySource(name));
  const bag = new DiagnosticBag();
  const tokens = lex(file, bag);
  const script = parseTokens(file, tokens, bag);
  const checked = check(file, script, bag);
  const result = emit(file, checked, bag, {});
  const reported: readonly Diagnostic[] = bag.ordered();
  assert.deepEqual(
    reported.map((one) => `${one.code} at ${one.span.line}:${one.span.column}`),
    [],
    `${name} should compile with nothing reported`,
  );
  assert.notEqual(result.program, undefined, `${name} produced no program`);
  return { file, program: result.program as CompiledProgram };
}

/** A loaded engine for a study, with the settings a dialog would hold. */
export function loadStudy(
  name: string,
  settings: Readonly<Record<string, unknown>> = {},
  options: LoadOptions = {},
): Engine {
  const compiled = compileStudy(name);
  const wire = JSON.parse(JSON.stringify(compiled.program)) as unknown;
  const loaded = load(wire, {
    source: compiled.file,
    host: HOST,
    settings,
    ...options,
  });
  assert.equal(loaded.ok, true, `${name} was refused at load`);
  return loaded.engine;
}

/** Everything one run of one study published, keyed the way a script named it. */
export interface Surface {
  readonly name: string;
  readonly engine: Engine;
  /** Plot columns, keyed by the title the script gave each plot. */
  readonly plots: ReadonlyMap<string, Series>;
  /**
   * The colour each plot was drawn in per bar, for the plots that decide one.
   *
   * A plot whose colour is a constant has no column here at all, because the
   * declaration carries it and no channel does. A plot that computes its colour
   * per bar has one, and it is the only place a histogram that changes colour
   * with its own direction can be checked.
   */
  readonly plotColors: ReadonlyMap<string, readonly (ColourValue | null)[]>;
  /** Marker text columns, keyed by the marker's own key. */
  readonly markers: ReadonlyMap<string, readonly (string | null)[]>;
  /** The colour each bar was painted, absent where the script painted none. */
  readonly barColors: readonly (ColourValue | null)[];
  /** The pane background per bar, absent where the script shaded none. */
  readonly background: readonly (ColourValue | null)[];
  /** The grids as they stood after the last bar. */
  readonly tables: readonly Grid[];
  /** The drawing objects alive after the last bar, in creation order. */
  readonly drawings: readonly Drawing[];
}

function numberOf(cell: MachineValue, what: string, bar: number): Value {
  if (cell === null) return null;
  assert.equal(typeof cell, 'number', `${what}: bar ${bar} published a ${typeof cell}`);
  return cell as number;
}

function textOf(cell: MachineValue, what: string, bar: number): string | null {
  if (cell === null) return null;
  assert.equal(typeof cell, 'string', `${what}: bar ${bar} published a ${typeof cell}`);
  return cell as string;
}

function colourOf(cell: MachineValue, what: string, bar: number): ColourValue | null {
  if (cell === null) return null;
  assert.equal(typeof cell, 'object', `${what}: bar ${bar} published a ${typeof cell}`);
  return cell as ColourValue;
}

/**
 * A study run over the whole fixture, with everything it published collected.
 *
 * Columns are keyed by title rather than by position so that adding a plot to a
 * script cannot silently renumber what a test asserts.
 */
export function runStudy(
  name: string,
  settings: Readonly<Record<string, unknown>> = {},
  options: LoadOptions = {},
): Surface {
  const engine = loadStudy(name, settings, options);
  const result = engine.run(STUDY_BARS, STUDY_STATES);
  assert.equal(
    result.diagnostic,
    undefined,
    `${name} stopped on bar ${result.bars.length - 1}: ${result.diagnostic?.code ?? ''}`,
  );
  assert.equal(result.bars.length, STUDY_BARS.length, `${name} did not run every bar`);

  const plots = new Map<string, Series>();
  const plotColors = new Map<string, readonly (ColourValue | null)[]>();
  for (const plot of engine.program.outputs.plots) {
    const title = typeof plot.title === 'string' ? plot.title : plot.key;
    assert.equal(plots.has(title), false, `${name} has two plots titled ${title}`);
    plots.set(
      title,
      engine.column(plot.channel).map((cell, bar) => numberOf(cell, `${name} ${title}`, bar)),
    );
    if (plot.colorChannel !== null) {
      plotColors.set(
        title,
        engine
          .column(plot.colorChannel)
          .map((cell, bar) => colourOf(cell, `${name} ${title} colour`, bar)),
      );
    }
  }

  const markers = new Map<string, readonly (string | null)[]>();
  for (const marker of engine.program.outputs.markers) {
    markers.set(
      marker.key,
      engine.column(marker.channel).map((cell, bar) => textOf(cell, `${name} ${marker.key}`, bar)),
    );
  }

  const paint = engine.program.outputs.barColor;
  const shade = engine.program.outputs.background;
  return {
    name,
    engine,
    plots,
    plotColors,
    markers,
    barColors:
      paint === null
        ? []
        : engine.column(paint.channel).map((cell, bar) => colourOf(cell, `${name} paint`, bar)),
    background:
      shade === null
        ? []
        : engine.column(shade.channel).map((cell, bar) => colourOf(cell, `${name} shade`, bar)),
    tables: engine.tables(),
    drawings: engine.drawings(),
  };
}

/** One plot column by its title, failing the test rather than returning nothing. */
export function plot(surface: Surface, title: string): Series {
  const found = surface.plots.get(title);
  assert.notEqual(found, undefined, `${surface.name}: no plot titled ${title}`);
  return found as Series;
}

/** One plot's per-bar colour column, failing the test rather than returning nothing. */
export function plotColour(surface: Surface, title: string): readonly (ColourValue | null)[] {
  const found = surface.plotColors.get(title);
  assert.notEqual(found, undefined, `${surface.name}: the plot titled ${title} has no colour column`);
  return found as readonly (ColourValue | null)[];
}

/** One marker's text column, failing the test rather than returning nothing. */
export function marker(surface: Surface, key: string): readonly (string | null)[] {
  const found = surface.markers.get(key);
  assert.notEqual(found, undefined, `${surface.name}: no marker keyed ${key}`);
  return found as readonly (string | null)[];
}

/** The bars a marker fired on, which is what a reader of a chart sees. */
export function firedOn(column: readonly (string | null)[]): number[] {
  const out: number[] = [];
  for (let bar = 0; bar < column.length; bar += 1) if (column[bar] !== null) out.push(bar);
  return out;
}

/**
 * A colour column read back as the names a script wrote.
 *
 * The channel values come from the engine's own table through `namedColour`
 * rather than from a copy here, so a test cannot assert a colour this engine
 * does not produce, and the day the library manifest replaces that table there
 * is nothing here to reconcile. A colour the caller did not name is rendered as
 * its channels, so a mismatch still reads as a colour rather than as an object.
 */
export function paintNames(
  column: readonly (ColourValue | null)[],
  names: readonly string[],
): (string | null)[] {
  const table = names.map((name) => [name, namedColour(name)] as const);
  return column.map((cell) => {
    if (cell === null) return null;
    const found = table.find(
      ([, value]) =>
        isColour(value) &&
        value.r === cell.r &&
        value.g === cell.g &&
        value.b === cell.b &&
        value.a === cell.a,
    );
    return found === undefined ? `rgba(${cell.r},${cell.g},${cell.b},${cell.a})` : found[0];
  });
}

/** One grid's cells as a row-major table of text, absent where nothing was written. */
export function cellText(grid: Grid): (string | null)[][] {
  const out: (string | null)[][] = [];
  for (let row = 0; row < grid.rows; row += 1) out.push(new Array<string | null>(grid.cols).fill(null));
  for (const cell of grid.cells) {
    const line = out[cell.row];
    if (line === undefined) continue;
    line[cell.col] = typeof cell.text === 'string' ? cell.text : null;
  }
  return out;
}
