/**
 * The arrangement of the arithmetic, which is part of the contract rather than
 * an implementation detail.
 *
 * `compiled-program.md` section 8.3 says it plainly: a library function's result
 * is defined by its reference accumulation order, and an incremental rolling sum
 * that subtracts the outgoing value and adds the incoming one is not
 * bit-identical to a fresh sum over the window, so it is not permitted unless
 * the specification defines the incremental form as the reference.
 *
 * Every test here compares exactly. A tolerance would pass an implementation
 * that reassociated a sum, which is the thing this file exists to forbid.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Value } from '../../src/core/stdlib/index.js';
import * as lib from '../../src/core/stdlib/index.js';

import { BARS } from './vectors.js';
import { assertSame, assertTailAgrees } from './support.js';

const CLOSE = BARS.map((bar) => bar.close);
const VOLUME = BARS.map((bar) => bar.volume);

/**
 * Catches: a running total that subtracts the bar leaving the window.
 *
 * With one enormous value followed by ones, the ones vanish into the total
 * while the big value is in it, and subtracting the big value back out leaves
 * zero rather than restoring them. The window here reads 1, and a running total
 * reads 0.25: not a difference in the last bits but a different answer
 * entirely, and one that would appear only after a large value had passed
 * through, which is to say on the day it mattered.
 */
test('a window is summed fresh, so a large value leaving it restores the rest', () => {
  const spike: Value[] = [1e16, 1, 1, 1, 1, 1, 1];
  assertSame(
    lib.sma(spike, 4),
    [null, null, null, 2500000000000000, 1, 1, 1],
    'sma across a spike',
  );
});

// Catches: the sample divisor used where the population one is specified. The
// two differ on every bar, and `stdlib.md` section 6 fixes the population form
// because that is what the band study a chart has to reproduce uses.
test('stdev and variance divide by len, and by len - 1 only when asked', () => {
  const sample: Value[] = [2, 4, 4, 4, 5, 5, 7, 9];
  assert.equal(lib.variance(sample, 8)[7], 4);
  assert.equal(lib.stdev(sample, 8)[7], 2);
  assert.equal(lib.variance(sample, 8, true)[7], 4.571428571428571);
  assert.equal(lib.stdev(sample, 8, true)[7], 2.138089935299395);
});

// Catches: the two smoothings written as one. They are the same function in
// exact arithmetic and two different numbers in binary64, and the classic
// oscillators are defined against the second of them.
test('ema and rma are different arrangements and give different numbers', () => {
  const exponential = lib.ema(CLOSE, 14);
  const smoothed = lib.rma(CLOSE, 14);
  assert.equal(exponential[13], smoothed[13], 'both seed with the same mean');
  assert.notEqual(exponential[20], smoothed[20], 'and then diverge');
});

/**
 * Catches: a second implementation of the whole-series path.
 *
 * The two are one implementation by construction, so what this checks is the
 * construction. A whole-series form that grew its own loop would pass every
 * value test written against it and disagree with the live chart.
 */
const PAIRS: readonly { what: string; run: () => void }[] = [
  {
    what: 'sma',
    run: () => assertTailAgrees(() => lib.smaTail(9), (x) => lib.sma(x, 9), CLOSE, 'sma'),
  },
  {
    what: 'wma',
    run: () => assertTailAgrees(() => lib.wmaTail(9), (x) => lib.wma(x, 9), CLOSE, 'wma'),
  },
  {
    what: 'rma',
    run: () => assertTailAgrees(() => lib.rmaTail(9), (x) => lib.rma(x, 9), CLOSE, 'rma'),
  },
  {
    what: 'hma',
    run: () => assertTailAgrees(() => lib.hmaTail(9), (x) => lib.hma(x, 9), CLOSE, 'hma'),
  },
  {
    what: 'dema',
    run: () => assertTailAgrees(() => lib.demaTail(9), (x) => lib.dema(x, 9), CLOSE, 'dema'),
  },
  {
    what: 'tema',
    run: () => assertTailAgrees(() => lib.temaTail(9), (x) => lib.tema(x, 9), CLOSE, 'tema'),
  },
  {
    what: 'alma',
    run: () => assertTailAgrees(() => lib.almaTail(9), (x) => lib.alma(x, 9), CLOSE, 'alma'),
  },
  {
    what: 'linreg',
    run: () =>
      assertTailAgrees(() => lib.linregTail(9), (x) => lib.linreg(x, 9), CLOSE, 'linreg'),
  },
  {
    what: 'stdev',
    run: () => assertTailAgrees(() => lib.stdevTail(9), (x) => lib.stdev(x, 9), CLOSE, 'stdev'),
  },
  {
    what: 'rsi',
    run: () => assertTailAgrees(() => lib.rsiTail(9), (x) => lib.rsi(x, 9), CLOSE, 'rsi'),
  },
  {
    what: 'trix',
    run: () => assertTailAgrees(() => lib.trixTail(5), (x) => lib.trix(x, 5), CLOSE, 'trix'),
  },
  {
    what: 'tsi',
    run: () => assertTailAgrees(() => lib.tsiTail(9, 5), (x) => lib.tsi(x, 9, 5), CLOSE, 'tsi'),
  },
  {
    what: 'dpo',
    run: () => assertTailAgrees(() => lib.dpoTail(9), (x) => lib.dpo(x, 9), CLOSE, 'dpo'),
  },
  {
    what: 'cmo',
    run: () => assertTailAgrees(() => lib.cmoTail(9), (x) => lib.cmo(x, 9), CLOSE, 'cmo'),
  },
  {
    what: 'highest',
    run: () =>
      assertTailAgrees(() => lib.highestTail(9), (x) => lib.highest(x, 9), CLOSE, 'highest'),
  },
  {
    what: 'percentile',
    run: () =>
      assertTailAgrees(
        () => lib.percentileTail(9, 30),
        (x) => lib.percentile(x, 9, 30),
        CLOSE,
        'percentile',
      ),
  },
  {
    what: 'atr',
    run: () => assertTailAgrees(() => lib.atrTail(9), (x) => lib.atr(x, 9), BARS, 'atr'),
  },
  {
    what: 'cci',
    run: () => assertTailAgrees(() => lib.cciTail(9), (x) => lib.cci(x, 9), BARS, 'cci'),
  },
  {
    what: 'chop',
    run: () => assertTailAgrees(() => lib.chopTail(9), (x) => lib.chop(x, 9), BARS, 'chop'),
  },
  {
    what: 'obv',
    run: () => assertTailAgrees(() => lib.obvTail(), (x) => lib.obv(x), BARS, 'obv'),
  },
  {
    what: 'mfi',
    run: () => assertTailAgrees(() => lib.mfiTail(9), (x) => lib.mfi(x, 9), BARS, 'mfi'),
  },
  {
    what: 'williamsR',
    run: () =>
      assertTailAgrees(
        () => lib.williamsRTail(9),
        (x) => lib.williamsR(x, 9),
        BARS,
        'williamsR',
      ),
  },
];

for (const pair of PAIRS) {
  test(`${pair.what}: the tail path and the whole series path are the same numbers`, pair.run);
}

test('vwma taken from the totals, not from two means, on the tail path too', () => {
  const inputs = CLOSE.map((value, index) => ({ src: value, volume: VOLUME[index] ?? null }));
  const tail = lib.vwmaTail(9);
  const whole = lib.vwma(CLOSE, VOLUME, 9);
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    assert.ok(input !== undefined);
    assert.equal(tail.next(input), whole[index]);
  }
});

// Catches: a tail whose state leaks between uses, which would make the second
// chart on a page disagree with the first.
test('two tails of the same function do not share state', () => {
  const one = lib.emaTail(9);
  const two = lib.emaTail(9);
  for (const value of CLOSE) one.next(value);
  const fresh: Value[] = [];
  for (const value of CLOSE) fresh.push(two.next(value));
  assertSame(fresh, lib.ema(CLOSE, 9), 'a second tail');
});
