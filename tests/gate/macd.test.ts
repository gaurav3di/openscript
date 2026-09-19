/**
 * The convergence study, end to end, at three parameter sets.
 *
 * Three columns out of one call, and three warmups rather than one. The gap
 * exists as soon as the slow mean does, at bar `slow - 1`. The signal average
 * is fed the gap series and its window has to start counting at the gap's own
 * first value, so it lands `signal - 1` bars later, at bar `slow + signal - 2`.
 * The histogram is the difference of the two and therefore starts with the
 * later of them.
 *
 * That composition is the thing three parameter sets are here to pin: a single
 * set cannot tell a warmup derived from the parameters apart from one that
 * happens to be right at 12, 26 and 9.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertWarmup } from '../stdlib/support.js';

import type { HostBar } from '../../src/core/engine/index.js';

import { asSeries, convergence } from './reference.js';
import { CLOSE, GATE_BARS, loadGate, plot, plotsOf } from './support.js';

const SETS = [
  { fastLen: 12, slowLen: 26, signalLen: 9 },
  { fastLen: 5, slowLen: 13, signalLen: 5 },
  { fastLen: 8, slowLen: 21, signalLen: 5 },
] as const;

for (const set of SETS) {
  const named = `${set.fastLen}, ${set.slowLen} and ${set.signalLen}`;

  // Catches: a signal average started at bar 0 of the gap series rather than at
  // the gap's own first value. That implementation seeds the signal from
  // `signal - 1` absent bars and one real one, which either makes the signal
  // absent for the whole dataset or, if absence is read as zero, produces a
  // signal at bar `slow - 1` that is a long way from the gap it is meant to
  // follow. Either way its first value is at the wrong bar and the numbers
  // after it never recover.
  test(`the convergence at ${named} matches the reference to the last decimal`, () => {
    const columns = plotsOf('macd', { ...set });
    const expected = convergence(CLOSE, set.fastLen, set.slowLen, set.signalLen);

    const gapAt = set.slowLen - 1;
    const signalAt = set.slowLen + set.signalLen - 2;

    const line = plot(columns, 'Convergence');
    const signal = plot(columns, 'Signal');
    const histogram = plot(columns, 'Histogram');

    assertWarmup(line, gapAt, `convergence line at ${named}`);
    assertWarmup(signal, signalAt, `convergence signal at ${named}`);
    assertWarmup(histogram, signalAt, `convergence histogram at ${named}`);

    assert.deepEqual(line, asSeries(expected.line), `convergence line at ${named}`);
    assert.deepEqual(signal, asSeries(expected.signal), `convergence signal at ${named}`);
    assert.deepEqual(histogram, asSeries(expected.histogram), `convergence histogram at ${named}`);
  });
}

/**
 * Indexing into the returned array during warmup is absence, never a failure.
 *
 * `stdlib.md` section 2.3 requires the array itself to be present and of a
 * fixed length on every bar, with each element carrying its own warmup, and the
 * reason is this study: elements 1 and 2 do not exist for eight bars after
 * element 0 does.
 *
 * Catches an implementation whose array grows as warmup completes. `m[1]` would
 * then be an index past the end on exactly the bars at the left edge of the
 * chart, so the study would stop with a diagnostic on bar 0 and work perfectly
 * from bar 33 onward, which is a failure that never appears once a chart has
 * scrolled. The assertion is on the bar result rather than on the finished
 * column, because a stopped script publishes nothing and an assertion about
 * absence would be satisfied by it.
 */
test('the early bars of a three output call publish absence rather than stopping', () => {
  const engine = loadGate('macd', { fastLen: 12, slowLen: 26, signalLen: 9 });
  const gapAt = 25;
  const signalAt = 33;

  for (let bar = 0; bar < GATE_BARS.length; bar += 1) {
    const result = engine.append(GATE_BARS[bar] as HostBar, { isConfirmed: true }, GATE_BARS.length);
    assert.equal(result.diagnostic, undefined, `bar ${bar} stopped the script`);
    assert.equal(result.columns.length, 3, `bar ${bar} published a different number of columns`);
    assert.equal(result.columns[0] === null, bar < gapAt, `the gap on bar ${bar}`);
    assert.equal(result.columns[1] === null, bar < signalAt, `the signal on bar ${bar}`);
    assert.equal(result.columns[2] === null, bar < signalAt, `the histogram on bar ${bar}`);
  }
});
