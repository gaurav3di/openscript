/**
 * The chart every test of a read runs on, and the two helpers that drive it.
 *
 * Shared by `requests.test.ts` and `request-settings.test.ts` rather than
 * written twice, because the numbers each of them asserts are numbers about
 * these bars: five minute bars priced by index, two whole hourly buckets, dated
 * at instants a reader can check against a clock. A second copy of the fixture
 * would be a second set of boundaries to keep in step, and an off-by-one in one
 * of them would look like a disagreement between the two files.
 */
import assert from 'node:assert/strict';

import { load } from '../../src/core/engine/index.js';
import type { EngineHost, HostBar, Value } from '../../src/core/engine/index.js';
import { asWire, compile } from './support.js';

/** A chart of five minute bars, priced by index so a value names its bar. */
const OPEN = Date.UTC(2025, 0, 6, 10, 0, 0);

export function fiveMinutes(count: number): readonly HostBar[] {
  const out: HostBar[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      open: 100 + i,
      high: 100 + i + 0.5,
      low: 100 + i - 0.5,
      close: 100 + i,
      volume: 10,
      time: OPEN + i * 300_000,
    });
  }
  return out;
}

export const CHART: EngineHost = {
  instrument: { symbol: 'AAA', exchange: 'XX', interval: '5', timezone: 'UTC' },
};

/**
 * Compiles, and refuses to go on if the script itself was wrong.
 *
 * A test script with a name that does not exist still produces a program, and
 * the plot it was supposed to drive is then absent for a reason that has nothing
 * to do with what is being tested. Asserting here is what turns that into a
 * failure with the code on it rather than a passing test of nothing.
 */
export function clean(source: string): ReturnType<typeof compile> {
  const compiled = compile('request.oscript', source);
  assert.deepEqual(
    compiled.diagnostics.filter((one) => one.severity === 'error').map((one) => one.code),
    [],
    'the test script itself did not compile',
  );
  return compiled;
}

export function ran(
  source: string,
  count = 24,
  host: EngineHost = CHART,
  settings: Readonly<Record<string, unknown>> = {},
): readonly Value[][] {
  const compiled = clean(source);
  const loaded = load(asWire(compiled.program), { source: compiled.file, host, settings });
  if (!loaded.ok) throw new Error(`${loaded.diagnostic.code}: ${loaded.diagnostic.message}`);
  const bars = fiveMinutes(count);
  const result = loaded.engine.run(bars, bars.map(() => ({ isConfirmed: true })));
  assert.equal(result.diagnostic, undefined, result.diagnostic?.message);
  return loaded.engine.program.channels.map((_, channel) => [...loaded.engine.column(channel)]);
}

