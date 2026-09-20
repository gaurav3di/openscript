/**
 * What is timed, and why these six things and not others.
 *
 * A benchmark is a claim about what somebody will feel. These measure the three
 * moments a trader actually waits on, each in a light and a heavy form so a
 * regression shows up whether it is in the arithmetic or in the machinery around
 * it:
 *
 * - **A full compute over a long history.** Opening a study on years of data.
 *   Fifty thousand bars is several years of intraday history, and it is the
 *   number the phase's production bar is written against.
 * - **A single update on the newest bar.** This happens hundreds of times a
 *   minute on a live chart, once per tick that moves the price, and it is where
 *   a slow engine is felt as a chart that lags the market rather than as a wait.
 *   It is also the operation that does the most work per unit of visible output,
 *   because the bar rolls back and executes again from the start of itself.
 * - **A compile.** The editor compiles on every apply, so this is the delay
 *   between a trader changing a line and seeing it.
 *
 * The scripts are the project's own target scripts rather than something written
 * for the benchmark, so the numbers are about work somebody asked for. The light
 * one is two moving averages, a band and a crossing: arithmetic, series history,
 * and nothing else. The heavy one keeps parallel arrays and a roster of drawing
 * objects it creates, mutates and deletes, and walks a loop on every bar, which
 * is every expensive thing the engine does at once.
 *
 * Changing either script changes these numbers, and that is intended. They are
 * the workload, and a workload that quietly became something else would make the
 * recorded budgets a comparison between two different questions.
 */
import { readFileSync } from 'node:fs';

import { DiagnosticBag, check, lex, parseTokens, sourceFile } from '../../src/core/index.js';
import type { SourceFile } from '../../src/core/index.js';
import { emit } from '../../src/core/emit/index.js';
import type { CompiledProgram } from '../../src/core/emit/index.js';
import { load } from '../../src/core/engine/index.js';
import type { BarState, Engine, EngineHost, HostBar } from '../../src/core/engine/index.js';
import { engineHostFor, pageHost } from '../hosts/index.js';
import { bars, moved, states } from './data.js';
import type { Measurement, Run } from './timing.js';

/** Bars in the full compute. Several years of intraday history. */
const HISTORY = 50_000;

/** Bars of history behind the bar that is then updated. */
const WARM = 5_000;

/**
 * Iterations inside one timed repetition, for the two operations that take
 * microseconds.
 *
 * Both were smaller in the first draft and both were noisier for it: a single
 * collection inside a four millisecond repetition moves it by a quarter. Sized
 * so a repetition is tens of milliseconds, where one collection is a few percent
 * and the spread between repetitions came down by roughly half.
 */
const UPDATE_BATCH = 10_000;

const COMPILE_BATCH = 100;

const LIGHT = '01-ema-cross.oscript';
const HEAVY = '09-supply-demand-zones.oscript';

const EXAMPLES = new URL('../../../examples/', import.meta.url);

/**
 * A host with every fact stated.
 *
 * Absence is a legitimate answer to any of these and the engine handles it, but
 * a benchmark should time the path a real chart takes, and a real chart knows
 * its instrument.
 */
const HOST: EngineHost = engineHostFor(
  pageHost({
    instrument: {
      symbol: 'AAA',
      exchange: 'XX',
      interval: '1',
      tickSize: 0.05,
      lotSize: 50,
      hasVolume: true,
    },
    now: 1_748_736_000_000,
    destination: {},
  }),
);

const sources = new Map<string, string>();

function sourceOf(name: string): string {
  const held = sources.get(name);
  if (held !== undefined) return held;
  const text = readFileSync(new URL(name, EXAMPLES), 'utf8');
  sources.set(name, text);
  return text;
}

interface Compiled {
  readonly file: SourceFile;
  readonly program: CompiledProgram;
}

/** The whole front end, which is what an editor runs on every apply. */
function compile(name: string, text: string): Compiled {
  const file = sourceFile(name, text);
  const bag = new DiagnosticBag();
  const tokens = lex(file, bag);
  const script = parseTokens(file, tokens, bag);
  const checked = check(file, script, bag);
  const result = emit(file, checked, bag, {});
  if (result.program === undefined) {
    throw new Error(
      `${name} did not compile, so there is nothing to measure: ` +
        bag.ordered().map((one) => one.code).join(', '),
    );
  }
  return { file, program: result.program };
}

/**
 * A loaded engine, through the encoding a host receives the program in.
 *
 * The round trip is outside every timed region. It is here because loading the
 * emitter's own object would verify a program no host is ever handed, and a
 * shape that only survives inside one process is a shape the benchmark would not
 * notice going wrong.
 */
function engineFor(compiled: Compiled): Engine {
  const wire = JSON.parse(JSON.stringify(compiled.program)) as unknown;
  const loaded = load(wire, { source: compiled.file, host: HOST });
  if (!loaded.ok) {
    throw new Error(`the program would not load: ${loaded.diagnostic.code}`);
  }
  return loaded.engine;
}

interface Dataset {
  readonly bars: readonly HostBar[];
  readonly states: readonly BarState[];
}

const datasets = new Map<number, Dataset>();

function dataset(count: number): Dataset {
  const held = datasets.get(count);
  if (held !== undefined) return held;
  const made: Dataset = { bars: bars(count), states: states(count) };
  datasets.set(count, made);
  return made;
}

/** A fresh engine over the whole history, which is what opening a study does. */
function fullCompute(script: string, needsDrawings: boolean): Run {
  const compiled = compile(script, sourceOf(script));
  const data = dataset(HISTORY);
  const engine = engineFor(compiled);
  return {
    proof: 'bars executed',
    atLeast: HISTORY,
    once: () => {
      const result = engine.run(data.bars, data.states);
      if (result.diagnostic !== undefined) return 0;
      if (needsDrawings && engine.drawings().length === 0) return 0;
      return result.bars.length;
    },
  };
}

/** A warmed engine whose newest bar is then updated over and over. */
function liveUpdate(script: string, batch: number): Run {
  const compiled = compile(script, sourceOf(script));
  const data = dataset(WARM);
  const engine = engineFor(compiled);
  const warmed = engine.run(data.bars, data.states);
  if (warmed.diagnostic !== undefined) {
    throw new Error(`${script} failed while filling history: ${warmed.diagnostic.code}`);
  }
  const newest = data.bars[WARM - 1] as HostBar;
  const moving = { isConfirmed: false, isRealtime: true };
  return {
    proof: 'updates applied without a diagnostic',
    atLeast: batch,
    once: () => {
      let clean = 0;
      for (let i = 0; i < batch; i += 1) {
        const result = engine.update(moved(newest, i), moving);
        if (result.diagnostic === undefined) clean += 1;
      }
      return clean;
    },
  };
}

/** Source text to compiled program, which is the editor's apply. */
function compilation(script: string, batch: number): Run {
  const text = sourceOf(script);
  return {
    proof: 'programs emitted with instructions in them',
    atLeast: batch,
    once: () => {
      let emitted = 0;
      for (let i = 0; i < batch; i += 1) {
        if (compile(script, text).program.code.length > 0) emitted += 1;
      }
      return emitted;
    },
  };
}

/**
 * The six measurements, in the order the report prints them.
 *
 * Repetition counts are odd, so the median is a repetition that happened rather
 * than a midpoint between two. The full computes get fewer because each one is
 * around a second of work and the whole gate has to stay short enough that
 * nobody is tempted to skip it; their spread is narrow enough that five is
 * plenty, and the runner confirms a breach with a second round before failing.
 */
export const MEASUREMENTS: readonly Measurement[] = [
  {
    name: 'history-light',
    what: 'fifty thousand bars through a two-average study',
    unit: 'ms',
    warmups: 1,
    reps: 5,
    batch: 1,
    prepare: () => fullCompute(LIGHT, false),
  },
  {
    name: 'history-heavy',
    what: 'fifty thousand bars through a drawing-and-array study',
    unit: 'ms',
    warmups: 1,
    reps: 5,
    batch: 1,
    prepare: () => fullCompute(HEAVY, true),
  },
  {
    name: 'update-light',
    what: 'one update of the newest bar, two-average study, five thousand bars behind it',
    unit: 'us',
    warmups: 2,
    reps: 7,
    batch: UPDATE_BATCH,
    prepare: () => liveUpdate(LIGHT, UPDATE_BATCH),
  },
  {
    name: 'update-heavy',
    what: 'one update of the newest bar, drawing-and-array study, five thousand bars behind it',
    unit: 'us',
    warmups: 2,
    reps: 7,
    batch: UPDATE_BATCH,
    prepare: () => liveUpdate(HEAVY, UPDATE_BATCH),
  },
  {
    name: 'compile-light',
    what: 'source to compiled program, forty-five lines',
    unit: 'ms',
    warmups: 5,
    reps: 9,
    batch: COMPILE_BATCH,
    prepare: () => compilation(LIGHT, COMPILE_BATCH),
  },
  {
    name: 'compile-heavy',
    what: 'source to compiled program, ninety lines',
    unit: 'ms',
    warmups: 5,
    reps: 9,
    batch: COMPILE_BATCH,
    prepare: () => compilation(HEAVY, COMPILE_BATCH),
  },
];

export function measurementNamed(name: string): Measurement | undefined {
  return MEASUREMENTS.find((one) => one.name === name);
}
