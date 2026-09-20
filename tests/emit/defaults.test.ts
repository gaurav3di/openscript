/**
 * A call written the way the library reference prints it, against the same call
 * with its documented arguments written out.
 *
 * `stdlib.md` prints `atr(len = 14)`, so `atr()` and `atr(14)` are the same
 * call and must be the same program. They were not. The surface recorded which
 * parameters were optional and not what each one defaulted to, an omitted
 * argument was emitted as absent, and a lookback of an absent length answers
 * absence on every bar for ever. Twenty-nine of the thirty-one calls a reviewer
 * compiled in the reference's own printed form produced a column with no value
 * on any bar, with nothing reported at compile, at load or at run.
 *
 * `scripts/check-defaults.mjs` holds the surface to the specification. This
 * holds the other half: that the compiler actually fills what the surface
 * carries, and fills it with the same thing writing the argument out would
 * have. Comparing the emitted program rather than a column of values is the
 * stronger assertion of the two, because two identical programs cannot disagree
 * on any dataset, and it fails on the instruction rather than on bar 13.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { compile } from './support.js';
import type { Emitted } from './support.js';

/**
 * Each call twice: bare, then with the arguments `stdlib.md` says it defaults
 * to. Written out here rather than read from the surface, because a test that
 * asked the compiler what the defaults were would pass for whatever the
 * compiler thought they were, which is the defect.
 */
const PAIRS: readonly (readonly [string, string, string])[] = [
  ['atr', 'atr()', 'atr(14)'],
  ['rsi', 'rsi(close)', 'rsi(close, 14)'],
  ['bollinger', 'bollinger(close)[0]', 'bollinger(close, 20, 2)[0]'],
  ['macd', 'macd(close)[0]', 'macd(close, 12, 26, 9)[0]'],
  ['stoch', 'stoch()[0]', 'stoch(14, 1, 3)[0]'],
  ['donchian', 'donchian()[0]', 'donchian(20)[0]'],
  ['cci', 'cci()', 'cci(20)'],
  ['psar', 'psar()[0]', 'psar(0.02, 0.02, 0.2)[0]'],
  ['supertrend', 'supertrend()[0]', 'supertrend(3, 10)[0]'],
  ['adx', 'adx()[0]', 'adx(14, 14)[0]'],
  ['keltner', 'keltner()[0]', 'keltner(20, 2, 10, "ema")[0]'],
  ['williamsR', 'williamsR()', 'williamsR(14)'],
  ['stochRsi', 'stochRsi(close)[0]', 'stochRsi(close, 14, 14, 3, 3)[0]'],
  ['ma', 'ma(close, 10)', 'ma(close, 10, "sma")'],
  ['stdev', 'stdev(close, 10)', 'stdev(close, 10, false)'],
  ['hv', 'hv(close)', 'hv(close, 20, 252)'],
  ['ultimateOsc', 'ultimateOsc()', 'ultimateOsc(7, 14, 28)'],
  ['ichimoku', 'ichimoku()[0]', 'ichimoku(9, 26, 52)[0]'],
  // The one default in the calculating library that is a name rather than a
  // literal. 4.10 compiles an expression default into the call site, so this
  // has to be the same read, not a value close to it.
  ['vwap', 'vwap()', 'vwap(hlc3)'],
  // A string default, and one of the four the reference gives a calendar call.
  ['date.hour', 'date.hour(time)', 'date.hour(time, chart.timezone)'],
  ['str.padLeft', 'str.length(str.padLeft("7", 4))', 'str.length(str.padLeft("7", 4, " "))'],
];

function study(body: string): Emitted {
  return compile(
    'defaults.oscript',
    ['version 1', 'study("Defaults", overlay = false)', `plot(${body}, "c", aqua)`, ''].join('\n'),
  );
}

/**
 * The parts of a program two sources can be expected to share.
 *
 * Not the whole program: a source hash and the spans in `debug` are about the
 * text, and the two texts differ by definition here. Everything an engine
 * executes is in this.
 */
function executable(emitted: Emitted): string {
  const program = emitted.program;
  assert.notEqual(program, undefined, `${emitted.name} produced no program`);
  const { code, consts, lib, series, states, frame, cells, functions, callSites, requests } =
    program as NonNullable<typeof program>;
  return JSON.stringify({
    code,
    consts,
    lib,
    series,
    states,
    frame,
    cells,
    functions,
    callSites,
    requests,
  });
}

for (const [name, bare, written] of PAIRS) {
  test(`${name} written as the reference prints it is the program with its arguments written out`, () => {
    const left = study(bare);
    const right = study(written);

    assert.deepEqual(
      left.diagnostics.map((one) => one.code),
      [],
      `${bare} reported something`,
    );
    assert.deepEqual(
      right.diagnostics.map((one) => one.code),
      [],
      `${written} reported something`,
    );
    assert.equal(
      executable(left),
      executable(right),
      `${bare} and ${written} compile to different programs, so they cannot draw the same column`,
    );
  });
}

test('a call with every default recorded leaves the emitter nothing to report', () => {
  const emitted = study('atr()');
  assert.deepEqual(
    emitted.gaps.map((one) => one.what),
    [],
    'a gap on a path a reader reaches every day is a silent wrong answer',
  );
});

test('a grid cell written with no alignment carries the alignment 14.3 gives it', () => {
  const emitted = compile(
    'cell.oscript',
    [
      'version 1',
      'study("Cell", overlay = false)',
      'grid = table("T", 1, 1)',
      'cell(grid, 0, 0, "x")',
      '',
    ].join('\n'),
  );
  assert.deepEqual(
    emitted.diagnostics.map((one) => one.code),
    [],
  );
  const consts = emitted.program?.consts ?? [];
  assert.equal(
    consts.some((one) => one[0] === 's' && one[1] === 'left'),
    true,
    'the cell reached the engine with no alignment, where stdlib.md 14.3 says it is "left"',
  );
});

/**
 * The warmup a default carries is in the program too, not only in a diagnostic.
 *
 * A higher timeframe read tells the host how many bars of history to extend the
 * request by (`host-interface.md` 5.2). An omitted length used to weaken that to
 * a floor of nothing, so the host fetched no extra bars and the read stayed
 * absent for thirteen buckets longer than the study written out.
 */
test('a read whose body omits a length asks for the bars that length needs', () => {
  const bare = compile(
    'request.oscript',
    [
      'version 1',
      'study("Read", overlay = false)',
      'higher = req.timeframe("60", atr())',
      'plot(higher, "c", aqua)',
      '',
    ].join('\n'),
  );
  const written = compile(
    'request.oscript',
    [
      'version 1',
      'study("Read", overlay = false)',
      'higher = req.timeframe("60", atr(14))',
      'plot(higher, "c", aqua)',
      '',
    ].join('\n'),
  );
  assert.deepEqual(
    bare.diagnostics.map((one) => one.code),
    [],
  );
  assert.equal(bare.program?.requests[0]?.warmup, 13);
  assert.equal(bare.program?.requests[0]?.warmup, written.program?.requests[0]?.warmup);
});
