/**
 * What the engine's tests compile, load and run.
 *
 * A test here goes through the whole pipeline, source to columns, because the
 * engine's contract is with a compiled program rather than with a syntax tree
 * and a hand written program would be a program no compiler emits. The one
 * thing built by hand is a mutation of a valid program, which is how the
 * verifier's checks are exercised: every one of them exists for a program the
 * compiler would never produce.
 *
 * The bars are generated from a fixed formula rather than from a file. They are
 * not market data and are not meant to be: what matters is that they are the
 * same on every machine and every run, so a number this suite asserts is a
 * number about the engine.
 */
import { readFileSync } from 'node:fs';

import { DiagnosticBag, check, lex, parseTokens, sourceFile } from '../../src/core/index.js';
import type { Diagnostic, SourceFile } from '../../src/core/index.js';
import { emit } from '../../src/core/emit/index.js';
import type { CompiledProgram } from '../../src/core/emit/index.js';
import { load } from '../../src/core/engine/index.js';
import type { BarState, Engine, EngineHost, HostBar, LoadOptions } from '../../src/core/engine/index.js';

const ROOT = new URL('../../../', import.meta.url);
export const TARGETS = new URL('examples/', ROOT);
export const SPEC = new URL('spec/compiled-program.md', ROOT);

export interface Compiled {
  readonly file: SourceFile;
  readonly program: CompiledProgram;
  readonly diagnostics: readonly Diagnostic[];
}

/** Compiles a source into the program an engine is handed. */
export function compile(name: string, text: string): Compiled {
  const file = sourceFile(name, text);
  const bag = new DiagnosticBag();
  const tokens = lex(file, bag);
  const script = parseTokens(file, tokens, bag);
  const checked = check(file, script, bag);
  const result = emit(file, checked, bag, {});
  if (result.program === undefined) {
    throw new Error(
      `${name} did not compile: ${bag.ordered().map((one) => one.code).join(', ')}` +
        ` ${result.gaps.map((one) => one.what).join('; ')}`,
    );
  }
  return { file, program: result.program, diagnostics: bag.ordered() };
}

export function compileTarget(name: string): Compiled {
  return compile(name, readFileSync(new URL(name, TARGETS), 'utf8'));
}

/**
 * A program as a host receives it: through the canonical encoding and back.
 *
 * Passing the emitter's own object straight to the engine would test the two
 * halves of one process rather than the contract between them. An engine in
 * another language is handed text, and the round trip is what makes this suite
 * exercise the same thing.
 */
export function asWire(program: CompiledProgram): unknown {
  return JSON.parse(JSON.stringify(program)) as unknown;
}

export const HOST: EngineHost = {
  // A zone, because a host states one: a day, a week and a month are dated
  // rather than counted, so a read at one of them is absent without it, and a
  // suite whose host stated none would never exercise the calendar fold.
  instrument: {
    symbol: 'AAA',
    exchange: 'XX',
    interval: '1',
    timezone: 'UTC',
    tickSize: 0.05,
    lotSize: 50,
  },
  now: 1_748_736_000_000,
  position: { size: 0, avgPrice: 0 },
  route: () => {},
};

/** Loads a compiled program, failing the test rather than the engine. */
export function engineFor(compiled: Compiled, options: LoadOptions = {}): Engine {
  const loaded = load(asWire(compiled.program), {
    source: compiled.file,
    host: HOST,
    ...options,
  });
  if (!loaded.ok) {
    throw new Error(`${loaded.diagnostic.code}: ${loaded.diagnostic.message}`);
  }
  return loaded.engine;
}

/** Compiles and loads in one step, for a test that only wants to run something. */
export function running(text: string, options: LoadOptions = {}): Engine {
  return engineFor(compile('test.oscript', text), options);
}

/** The diagnostic a load produced, for a test about a refusal. */
export function refusalOf(program: unknown, options: LoadOptions = {}): Diagnostic {
  const loaded = load(program, options);
  if (loaded.ok) throw new Error('the program loaded and the test expected a refusal');
  return loaded.diagnostic;
}

const BASE_TIME = 1_748_736_000_000;

/**
 * Bars from a fixed formula: the same on every machine and every run.
 *
 * Two waves at different periods so that a crossing, a pivot and a range all
 * occur several times in four hundred bars, which is what makes a study under
 * test produce something other than absence.
 */
export function bars(count: number): readonly HostBar[] {
  const out: HostBar[] = [];
  let price = 100;
  for (let i = 0; i < count; i += 1) {
    price = price + Math.sin(i / 3) * 1.5 + Math.cos(i / 7);
    out.push({
      open: price,
      high: price + 1.2,
      low: price - 1.1,
      close: price + Math.sin(i / 5) * 0.6,
      volume: 1000 + (i % 37) * 11,
      time: BASE_TIME + i * 60_000,
    });
  }
  return out;
}

export function states(count: number): readonly BarState[] {
  const out: BarState[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({ isConfirmed: true, isSessionStart: i % 75 === 0, isSessionEnd: i % 75 === 74 });
  }
  return out;
}

/** A flat bar at one price, for a test that wants to control every number. */
export function flat(close: number, time = BASE_TIME): HostBar {
  return { open: close, high: close, low: close, close, volume: 1, time };
}

/** The names of the target scripts that reach the engine at all. */
export function emittableTargets(): readonly string[] {
  return ['01-ema-cross', '02-supertrend', '03-anchored-vwap', '04-rsi-divergence',
    '05-opening-range', '07-higher-timeframe-bias', '08-dashboard-table',
    '09-supply-demand-zones', '10-strategy-ema-cross',
    '11-strategy-opening-range'].map((one) => `${one}.oscript`);
}

/** A deep copy a test can mutate without disturbing the program it came from. */
export function mutable(program: CompiledProgram): Record<string, unknown> {
  return asWire(program) as Record<string, unknown>;
}
