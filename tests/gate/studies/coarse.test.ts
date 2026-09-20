/**
 * Studies that read a coarser timeframe than the chart they are drawn on.
 *
 * This is the surface where a study is most easily wrong in a way that looks
 * right. The expression runs over folded bars, so its warmup is counted in
 * coarse bars and lands on the chart many bars later than the same call written
 * against the chart's own bars. The value steps once per coarse bar rather than
 * once per bar. And the boundary decides whether the study could have been
 * traded: a confirmed read takes the last bucket that **closed**, so the chart
 * steps on the first bar of the next bucket and holds that value across every
 * bar inside it.
 *
 * Every expectation here comes from `folding.ts`, which builds the buckets and
 * the boundary from `stdlib.md` section 15 rather than from the engine.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { asSeries, blank, has, seededMean, windowMean, windowStdev } from './arithmetic.js';
import { coarseBars, coarseColumn, confirmedIndex, foldConfirmed } from './folding.js';
import {
  CLOSE,
  assertColumn,
  assertFirstAt,
  column,
  faded,
  marker,
  paint,
  runStudy,
} from './harness.js';

/** The coarse timeframe every study here reads, in minutes of the fixture's bars. */
const COARSE = 5;

/**
 * Catches: a read that hands the chart the bucket it is inside, which is a
 * value taken from bars that had not happened, and reads perfectly on history;
 * a read that steps a bar late; and a bias painted before any bucket has closed,
 * which colours the first bars of every chart with an opinion nobody had.
 */
test('a coarse mean, the regime it puts the chart in, and the bars that flipped it', () => {
  const run = runStudy('coarse-bias', { settings: { biasTf: String(COARSE), biasLen: 3 } });
  const buckets = coarseBars(COARSE);
  const coarseClose = buckets.map((one) => one.close);
  const coarseMean = seededMean(coarseClose, 3);

  const mean = foldConfirmed(COARSE, coarseMean);
  const closeOf = foldConfirmed(COARSE, coarseClose);

  assertColumn(column(run, 'Coarse mean'), asSeries(mean), 'coarse mean');
  // Three coarse bars of warmup, and the value is only readable once the third
  // has closed, which is the first chart bar of the fourth bucket.
  assertFirstAt(asSeries(mean), (buckets[3] as { from: number }).from, 'coarse mean');

  const up = mean.map((one, bar) => has(one) && (closeOf[bar] as number) > one);
  const down = mean.map((one, bar) => has(one) && (closeOf[bar] as number) < one);

  assertColumn(
    run.barColor,
    up.map((one, bar) => (one ? paint('lime') : down[bar] === true ? paint('red') : 'none')),
    'candle colour',
  );
  assertColumn(
    run.background,
    up.map((one, bar) =>
      one ? faded('lime', 95) : down[bar] === true ? faded('red', 95) : 'none',
    ),
    'pane background',
  );

  const flips = (state: boolean[]): (string | null)[] =>
    state.map((one, bar) => (one && state[bar - 1] !== true ? 'flip' : null));
  assertColumn(
    marker(run, 0).text.map((one) => (one === null ? null : 'flip')),
    flips(up),
    'upward flips',
  );
  assertColumn(
    marker(run, 1).text.map((one) => (one === null ? null : 'flip')),
    flips(down),
    'downward flips',
  );
});

/**
 * Catches: rails computed on the chart's bars and merely drawn as steps, which
 * is a different series with the same shape; and a deviation whose warmup is
 * counted in chart bars.
 */
test('deviation rails computed on the coarse bars and sampled onto the chart', () => {
  const railLen = 4;
  const mult = 2;
  const run = runStudy('coarse-rails', {
    settings: { railTf: String(COARSE), railLen, mult },
  });
  const coarseClose = coarseColumn(COARSE, 'close');
  const basis = foldConfirmed(COARSE, windowMean(coarseClose, railLen));
  const spread = foldConfirmed(COARSE, windowStdev(coarseClose, railLen));

  assertColumn(column(run, 'Basis'), asSeries(basis), 'coarse basis');
  assertColumn(
    column(run, 'Upper'),
    asSeries(basis.map((one, bar) => one + mult * (spread[bar] as number))),
    'coarse upper',
  );
  assertColumn(
    column(run, 'Lower'),
    asSeries(basis.map((one, bar) => one - mult * (spread[bar] as number))),
    'coarse lower',
  );
  assert.equal(run.bands.length, 1, 'one band between the two rails');
});

/**
 * Catches: a coarse bar whose open is taken from the chart bar rather than from
 * the first bar of its bucket, and a high or low taken from the closes.
 */
test('the coarse bars themselves, drawn as bars', () => {
  const run = runStudy('coarse-candles', { settings: { candleTf: String(COARSE) } });
  for (const field of ['open', 'high', 'low', 'close'] as const) {
    const key = field === 'close' ? 'Coarse candles' : `Coarse candles.${field}`;
    assertColumn(
      column(run, key),
      asSeries(foldConfirmed(COARSE, coarseColumn(COARSE, field))),
      `coarse ${field}`,
    );
  }
});

/**
 * Catches: a panel that spells a number while the coarse bar it came from has
 * not closed, which is the one thing a panel of coarse readings must not do.
 */
test('a panel of coarse readings, and what it says before one exists', () => {
  const run = runStudy('coarse-panel', { settings: { panelTf: String(COARSE), meanLen: 3 } });
  const coarseClose = coarseColumn(COARSE, 'close');
  const closeOf = foldConfirmed(COARSE, coarseClose);
  const mean = foldConfirmed(COARSE, seededMean(coarseClose, 3));

  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    const cells = (run.grids[bar] ?? [])[0]?.cells ?? [];
    const state = !has(mean[bar])
      ? 'waiting'
      : (closeOf[bar] as number) > (mean[bar] as number)
        ? 'above'
        : (closeOf[bar] as number) < (mean[bar] as number)
          ? 'below'
          : 'level';
    const colour =
      state === 'above' ? paint('lime') : state === 'below' ? paint('red') : paint('silver');
    assert.equal(cells.length, 6, `bar ${bar}: six cells`);
    assert.equal(
      cells[5],
      `2,1=${state}|${colour}|none|right`,
      `bar ${bar}: the state cell reads ${String(cells[5])}`,
    );
    if (!has(mean[bar])) {
      assert.equal(cells[3], '1,1=waiting|none|none|right', `bar ${bar}: the mean cell waits`);
    }
  }
});

/**
 * Catches: the two means collapsed into one, which is the mistake this study
 * exists to make visible. A twenty period mean of coarse closes and a twenty
 * period mean of the chart's closes are not the same series, and a study that
 * reads one where it meant the other agrees with itself on most bars.
 */
test('where the chart trend and the coarse trend agree, and where they part', () => {
  const meanLen = 4;
  const run = runStudy('agreement-marks', {
    settings: { coarseTf: String(COARSE), meanLen },
  });
  const fine = windowMean(CLOSE, meanLen);
  const coarse = foldConfirmed(COARSE, windowMean(coarseColumn(COARSE, 'close'), meanLen));

  assertColumn(column(run, 'Fine mean'), asSeries(fine), 'fine mean');
  assertColumn(column(run, 'Coarse mean'), asSeries(coarse), 'coarse mean');

  const agree = blank(CLOSE.length).map((_, bar) => {
    if (!has(fine[bar]) || !has(coarse[bar])) return false;
    return (CLOSE[bar] as number) > (fine[bar] as number) ===
      ((CLOSE[bar] as number) > (coarse[bar] as number));
  });
  const fineUp = CLOSE.map((one, bar) => has(fine[bar]) && one > (fine[bar] as number));

  assertColumn(
    run.barColor,
    agree.map((one, bar) => (one ? (fineUp[bar] === true ? paint('lime') : paint('red')) : 'none')),
    'agreement colour',
  );

  const split = agree.map((one, bar) => {
    const differs = has(fine[bar]) && has(coarse[bar]) && !one;
    return differs && agree[bar - 1] === true ? 'SPLIT' : null;
  });
  assertColumn(marker(run, 0).text, split, 'the bars where they part');
});

/** The fold itself has to be worth comparing against, so it is checked here. */
test('the fixture folds into whole coarse bars with a boundary in the middle', () => {
  const buckets = coarseBars(COARSE);
  assert.equal(buckets.length, CLOSE.length / COARSE, 'the fixture divides evenly');
  assert.equal((buckets[0] as { from: number }).from, 0, 'the first bucket opens on bar 0');
  assert.equal((buckets[0] as { to: number }).to, COARSE - 1, 'and closes on the fifth bar');
  const index = confirmedIndex(COARSE);
  assert.equal(index[COARSE - 1], -1, 'nothing has closed on the last bar of the first bucket');
  assert.equal(index[COARSE], 0, 'and the first bucket is readable on the next bar');
});
