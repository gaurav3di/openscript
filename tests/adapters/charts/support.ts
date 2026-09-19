/**
 * What the chart adapter's tests compile and draw.
 *
 * A test here goes through the whole pipeline, source to descriptor to columns,
 * because the adapter's contract is with a compiled program and a hand written
 * one would be a program no compiler emits.
 *
 * The bars are generated from a fixed formula and are not market data. Two waves
 * at different periods so that a crossing, a pivot and a range each occur several
 * times, which is what makes a study under test produce something other than
 * absence, and the same numbers on every machine and every run.
 *
 * **Their times are in seconds**, because that is what a chart holds, and the
 * conversion into the milliseconds an engine reads is one of the things these
 * tests exist to pin.
 */
import { readFileSync } from 'node:fs';

import { DiagnosticBag, check, lex, parseTokens, sourceFile } from '../../../src/core/index.js';
import { emit } from '../../../src/core/emit/index.js';
import type { CompiledProgram } from '../../../src/core/emit/index.js';
import { descriptorFor } from '../../../src/adapters/charts/index.js';
import type {
  ChartAdapterOptions,
  ChartBar,
  ChartCalcContext,
  ChartDescriptor,
} from '../../../src/adapters/charts/index.js';

const TARGETS = new URL('../../../../examples/', import.meta.url);

export function compile(name: string, text: string): CompiledProgram {
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
  return result.program;
}

export function target(name: string): CompiledProgram {
  return compile(name, readFileSync(new URL(name, TARGETS), 'utf8'));
}

/** A descriptor for a target script, which is what a host would register. */
export function descriptorOf(name: string, options: ChartAdapterOptions = {}): ChartDescriptor {
  return descriptorFor(target(name), options);
}

/** A descriptor for a script written inside a test. */
export function descriptorOfSource(
  text: string,
  options: ChartAdapterOptions = {},
): ChartDescriptor {
  return descriptorFor(compile('test.oscript', text), options);
}

/** The first bar's time, in the seconds a chart counts in. */
export const BASE_TIME = 1_748_736_000;

/** One bar a minute, from a fixed formula. */
export function bars(count: number): readonly ChartBar[] {
  const out: ChartBar[] = [];
  let price = 100;
  for (let i = 0; i < count; i += 1) {
    price = price + Math.sin(i / 3) * 1.5 + Math.cos(i / 7);
    out.push({
      open: price,
      high: price + 1.2,
      low: price - 1.1,
      close: price + Math.sin(i / 5) * 0.6,
      volume: 1000 + (i % 37) * 11,
      time: BASE_TIME + i * 60,
    });
  }
  return out;
}

/** The calculation context a chart hands a descriptor for a settled history. */
export function context(count: number, moving = false): ChartCalcContext {
  return {
    barState: {
      isNew: false,
      isConfirmed: !moving,
      isRealtime: moving,
      lastIndex: count - 1,
    },
    timezone: 'Etc/UTC',
    now: () => BASE_TIME + count * 60,
  };
}

/** The error an adapter call raised, for a test about a refusal. */
export function refusalOf(run: () => unknown): { code: string; line: number; name: string } {
  try {
    run();
  } catch (thrown) {
    const held = thrown as { diagnostic?: { code: string; span: { line: number } }; name: string };
    if (held.diagnostic === undefined) throw thrown;
    return { code: held.diagnostic.code, line: held.diagnostic.span.line, name: held.name };
  }
  throw new Error('the call succeeded and the test expected a refusal');
}
