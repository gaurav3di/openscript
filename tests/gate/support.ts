/**
 * What the phase gate runs, and how far it runs it.
 *
 * **Every number this suite asserts has been through the whole pipeline**:
 * source text, lexer, parser, checker, emitter, the canonical encoding, the
 * engine's load-time verification, and then one bar at a time through the
 * instruction loop. Nothing here calls the numeric library. That is the point
 * of the gate: `tests/stdlib` already proves the arithmetic, and what is left
 * to prove is that a script a trader writes still produces those numbers after
 * passing through every stage between the two.
 *
 * The program goes to the engine through `JSON.parse(JSON.stringify(...))`
 * rather than as the emitter's own object, because an engine in another
 * language is handed text and the round trip is what makes this a test of the
 * contract rather than of two halves of one process.
 *
 * The bars are the fixture in `tests/stdlib/vectors.ts`, not a second copy of
 * it. They carry a trend, a pullback, a gap, a flat stretch and a reversal, so
 * a band flips and a strength reading reaches both ends of its scale, and a
 * second fixture would be a fact stated twice.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DiagnosticBag, check, lex, parseTokens, sourceFile } from '../../src/core/index.js';
import type { Diagnostic, SourceFile } from '../../src/core/index.js';
import { emit } from '../../src/core/emit/index.js';
import type { CompiledProgram } from '../../src/core/emit/index.js';
import { load } from '../../src/core/engine/index.js';
import type {
  BarState,
  Engine,
  EngineHost,
  HostBar,
  LoadOptions,
  Value as MachineValue,
} from '../../src/core/engine/index.js';
import type { Series, Value } from '../../src/core/stdlib/index.js';

import { BARS } from '../stdlib/vectors.js';
import type { RefBar } from './reference.js';

const ROOT = new URL('../../../', import.meta.url);
const SCRIPTS = new URL('tests/gate/scripts/', ROOT);

/** One bar a minute, from a fixed instant, so a time is the same on every run. */
const BASE_TIME = 1_748_736_000_000;

/** The fixture as an engine receives it: the stdlib bars with a bar time added. */
export const GATE_BARS: readonly HostBar[] = BARS.map((bar, index) => ({
  open: bar.open,
  high: bar.high,
  low: bar.low,
  close: bar.close,
  volume: bar.volume,
  time: BASE_TIME + index * 60_000,
}));

/** Every bar confirmed, which is what a history load looks like. */
export const GATE_STATES: readonly BarState[] = GATE_BARS.map(() => ({ isConfirmed: true }));

/** The fixture as the reference reads it. */
export const REF_BARS: readonly RefBar[] = BARS.map((bar) => ({
  open: bar.open as number,
  high: bar.high as number,
  low: bar.low as number,
  close: bar.close as number,
}));

/** The source the studies are computed from. */
export const CLOSE: readonly number[] = BARS.map((bar) => bar.close as number);

export const HOST: EngineHost = {
  instrument: { symbol: 'AAA', exchange: 'XX', interval: '1', tickSize: 0.05, lotSize: 50 },
  now: BASE_TIME,
  position: { size: 0, avgPrice: 0 },
  route: () => {},
};

export interface Compiled {
  readonly file: SourceFile;
  readonly program: CompiledProgram;
  readonly diagnostics: readonly Diagnostic[];
}

/** A gate script, read from disk rather than written into a test. */
export function gateSource(name: string): string {
  return readFileSync(new URL(`${name}.oscript`, SCRIPTS), 'utf8');
}

/**
 * Source to compiled program, with nothing reported.
 *
 * A warning is a failure here. A gate script that draws a warning is a script
 * whose numbers were computed by a program the compiler had something to say
 * about, and the warnings in this language are about exactly the mistakes that
 * change a series: a stateful call inside a branch, a name never read.
 */
export function compileGate(name: string): Compiled {
  const file = sourceFile(`${name}.oscript`, gateSource(name));
  const bag = new DiagnosticBag();
  const tokens = lex(file, bag);
  const script = parseTokens(file, tokens, bag);
  const checked = check(file, script, bag);
  const result = emit(file, checked, bag, {});
  const diagnostics = bag.ordered();
  assert.deepEqual(
    diagnostics.map((one) => `${one.code} at ${one.span.line}:${one.span.column}`),
    [],
    `${name} should compile with nothing reported`,
  );
  assert.notEqual(result.program, undefined, `${name} produced no program`);
  return { file, program: result.program as CompiledProgram, diagnostics };
}

/** A loaded engine for a gate script, with the settings a dialog would hold. */
export function loadGate(
  name: string,
  settings: Readonly<Record<string, unknown>> = {},
  options: LoadOptions = {},
): Engine {
  const compiled = compileGate(name);
  const wire = JSON.parse(JSON.stringify(compiled.program)) as unknown;
  const loaded = load(wire, {
    source: compiled.file,
    host: HOST,
    settings,
    ...options,
  });
  // `assert.equal` narrows the union, so the refusal branch is gone by here and
  // a load that failed has already reported which script it was.
  assert.equal(loaded.ok, true, `${name} was refused at load`);
  return loaded.engine;
}

/**
 * A value the engine published, narrowed to a number or absence.
 *
 * The narrowing is an assertion rather than a cast. A plot column that came
 * back holding a string or a colour would otherwise be compared against a
 * number and reported as a value mismatch, which sends the reader looking at
 * the arithmetic for a fault that is in the channel.
 */
function asValue(cell: MachineValue, what: string, bar: number): Value {
  if (cell === null) return null;
  assert.equal(typeof cell, 'number', `${what}: bar ${bar} published a ${typeof cell}`);
  return cell as number;
}

/**
 * Every plot column of a gate script, keyed by the title the script gave it.
 *
 * Keyed by title rather than by position so that adding a plot to a script
 * cannot silently renumber what a test asserts.
 */
export function plotsOf(
  name: string,
  settings: Readonly<Record<string, unknown>> = {},
): ReadonlyMap<string, Series> {
  const engine = loadGate(name, settings);
  const result = engine.run(GATE_BARS, GATE_STATES);
  assert.equal(
    result.diagnostic,
    undefined,
    `${name} stopped on bar ${result.bars.length - 1}: ${result.diagnostic?.code ?? ''}`,
  );
  assert.equal(result.bars.length, GATE_BARS.length, `${name} did not run every bar`);

  const out = new Map<string, Series>();
  for (const plot of engine.program.outputs.plots) {
    const title = typeof plot.title === 'string' ? plot.title : plot.key;
    assert.equal(out.has(title), false, `${name} has two plots titled ${title}`);
    out.set(
      title,
      engine.column(plot.channel).map((cell, bar) => asValue(cell, `${name} ${title}`, bar)),
    );
  }
  return out;
}

/** One plot column by its title, failing the test rather than returning nothing. */
export function plot(columns: ReadonlyMap<string, Series>, title: string): Series {
  const found = columns.get(title);
  assert.notEqual(found, undefined, `no plot titled ${title}`);
  return found as Series;
}

/** The largest difference between two series, and the first bar they differ on. */
export interface Deviation {
  readonly largest: number;
  readonly largestAt: number;
  readonly firstAt: number;
  /** Bars where one series has a value and the other does not. */
  readonly absences: number;
}

/**
 * How far apart two series are, measured rather than asserted.
 *
 * The gate asserts equality with `assertSame`. This is for the two places the
 * reference and the specification knowingly disagree, where the useful thing to
 * record is the size and the position of the difference rather than to hide it
 * behind a tolerance.
 */
export function deviation(actual: Series, expected: Series): Deviation {
  let largest = 0;
  let largestAt = -1;
  let firstAt = -1;
  let absences = 0;
  const count = Math.max(actual.length, expected.length);
  for (let bar = 0; bar < count; bar += 1) {
    const left = actual[bar] ?? null;
    const right = expected[bar] ?? null;
    if (left === null && right === null) continue;
    if (left === null || right === null) {
      absences += 1;
      if (firstAt < 0) firstAt = bar;
      continue;
    }
    if (left === right) continue;
    if (firstAt < 0) firstAt = bar;
    const apart = Math.abs(left - right);
    if (apart > largest) {
      largest = apart;
      largestAt = bar;
    }
  }
  return { largest, largestAt, firstAt, absences };
}
