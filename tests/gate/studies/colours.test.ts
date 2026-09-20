/**
 * Studies whose reading reaches the chart as a colour, a shape or a bar rather
 * than as a line.
 *
 * The four surfaces here are the ones a column comparison cannot see. Candles
 * built from a recurrence, which are four columns behind one declaration and
 * where a wrong seed on bar 0 walks through the whole series. A region shaded
 * between two flat columns, which is how a study shades a zone of its own pane.
 * The price candles recoloured from a reading in another pane. And a plate
 * anchored back at the bar an event happened on, which is the only honest place
 * for a signal that was confirmed several bars later.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertWarmup } from '../../stdlib/support.js';

import {
  asSeries,
  blank,
  changeBy,
  fromFirst,
  has,
  meanDeviation,
  pivotHighAt,
  pivotLowAt,
  seededMean,
  shiftBy,
  shiftFlags,
  sinceTrue,
  strength,
  valueAtTrue,
  windowMean,
} from './arithmetic.js';
import type { RefSeries } from './arithmetic.js';
import {
  CLOSE,
  HIGH,
  LOW,
  OPEN,
  VOLUME,
  anchorText,
  assertColumn,
  assertFirstAt,
  column,
  levelColumn,
  paint,
  runStudy,
  spellDrawings,
} from './harness.js';

/**
 * The typical price, which the deviation reading is taken over.
 *
 * Summed high, low, close, in that order. Any other order is a different
 * binary64 number, and this one is the order `stdlib.md` section 3.1 writes the
 * definition in.
 */
const TYPICAL = HIGH.map((high, bar) => (high + (LOW[bar] as number) + (CLOSE[bar] as number)) / 3);

/** Every bar of a column carries the same constant, which is what a flat edge is. */
function flat(value: number): (number | null)[] {
  return CLOSE.map(() => value);
}

/**
 * Catches: a blended open seeded from the raw open on every bar rather than
 * only on the first, which is a different candle on all eighty bars; and a
 * blended high taken from the raw high alone, which cuts the top off every
 * candle whose blended body reaches past it.
 */
test('candles built from the bar average and the previous blended midpoint', () => {
  const run = runStudy('blended-candles');
  const opens = blank(CLOSE.length);
  const closes = blank(CLOSE.length);
  const highs = blank(CLOSE.length);
  const lows = blank(CLOSE.length);
  let previousOpen = Number.NaN;
  let previousClose = Number.NaN;
  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    const open = OPEN[bar] as number;
    const high = HIGH[bar] as number;
    const low = LOW[bar] as number;
    const close = CLOSE[bar] as number;
    const blendClose = (open + high + low + close) * 0.25;
    const blendOpen =
      Number.isFinite(previousOpen) && Number.isFinite(previousClose)
        ? (previousOpen + previousClose) / 2
        : (open + close) / 2;
    opens[bar] = blendOpen;
    closes[bar] = blendClose;
    highs[bar] = Math.max(high, Math.max(blendOpen, blendClose));
    lows[bar] = Math.min(low, Math.min(blendOpen, blendClose));
    previousOpen = blendOpen;
    previousClose = blendClose;
  }

  assertColumn(column(run, 'Blended.open'), asSeries(opens), 'blended open');
  assertColumn(column(run, 'Blended.high'), asSeries(highs), 'blended high');
  assertColumn(column(run, 'Blended.low'), asSeries(lows), 'blended low');
  assertColumn(column(run, 'Blended'), asSeries(closes), 'blended close');
  assertFirstAt(asSeries(opens), 0, 'a blended candle exists from bar 0');
  assertColumn(
    run.barColor,
    closes.map((one, bar) => (one >= (opens[bar] as number) ? paint('lime') : paint('red'))),
    'candle colour',
  );
});

/**
 * Catches: a deviation reading divided by a standard deviation instead of by
 * the mean absolute deviation, which is the substitution that still draws a
 * plausible line; and a shaded region drawn between the reading and a level
 * rather than between the two flat edges, which has nothing to shade on the
 * bars the reading is absent.
 */
test('how far the typical price has strayed, with a shaded zone behind it', () => {
  const len = 20;
  const run = runStudy('commodity-channel', { settings: { len } });
  const mean = windowMean(TYPICAL, len);
  const spread = meanDeviation(TYPICAL, len);
  const expected = blank(CLOSE.length);
  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    if (!has(mean[bar]) || !has(spread[bar]) || spread[bar] === 0) continue;
    expected[bar] = ((TYPICAL[bar] as number) - (mean[bar] as number)) / (0.015 * (spread[bar] as number));
  }

  assertColumn(column(run, 'Index'), asSeries(expected), 'deviation index');
  assertWarmup(column(run, 'Index'), len - 1, 'deviation index');
  assertColumn(column(run, 'Upper edge'), flat(100), 'the upper edge of the zone');
  assertColumn(column(run, 'Lower edge'), flat(-100), 'the lower edge of the zone');
  assert.deepEqual(
    (run.bands[0] as { between: readonly [string, string] }).between,
    ['p0', 'p1'],
    'the zone is shaded between the two flat edges',
  );
  assertColumn(
    run.barColor,
    expected.map((one) => {
      if (!Number.isFinite(one)) return 'none';
      return one > 100 ? paint('lime') : one < -100 ? paint('red') : 'none';
    }),
    'candle colour from another pane',
  );
});

/**
 * Catches: a smoothing seeded from bar 0 of a series whose bar 0 is absent,
 * which either blanks the whole column or seeds it from a hole; the correct
 * reading starts at the first complete window of real values, one bar later
 * than the length alone gives.
 */
test('price change weighted by the volume behind it, smoothed', () => {
  const len = 13;
  const run = runStudy('force-flow', { settings: { len } });
  const moved = changeBy(CLOSE, 1);
  const force = moved.map((one, bar) => one * (VOLUME[bar] as number));
  const expected = fromFirst(force, (tail) => seededMean(tail, len));

  assertColumn(column(run, 'Force'), asSeries(expected), 'force');
  assertWarmup(column(run, 'Force'), len, 'force');
  assertColumn(levelColumn(run, 'Zero'), flat(0), 'the zero line');
});

/**
 * Catches: a window that averages across the absent first bar by skipping it,
 * which prints the reading one bar early and from one term short.
 */
test('how far the midpoint travelled for the volume it took', () => {
  const len = 14;
  const divisor = 10000;
  const run = runStudy('ease-of-move', { settings: { len, divisor } });
  const midpoint = HIGH.map((high, bar) => (high + (LOW[bar] as number)) / 2);
  const travel = changeBy(midpoint, 1);
  const term = travel.map((one, bar) => {
    const traded = VOLUME[bar] as number;
    if (traded === 0) return Number.NaN;
    return (divisor * one * ((HIGH[bar] as number) - (LOW[bar] as number))) / traded;
  });

  assertColumn(column(run, 'Ease'), asSeries(windowMean(term, len)), 'ease of movement');
  assertWarmup(column(run, 'Ease'), len, 'ease of movement');
});

/**
 * Catches: a third state painted as one of the other two, which is what an
 * unguarded ternary does during the warmup and for every bar the two readings
 * disagree.
 */
test('candles coloured by whether the trend and the force agree', () => {
  const meanLen = 13;
  const forceLen = 13;
  const run = runStudy('impulse-colour', { settings: { meanLen, forceLen } });
  const trendMean = seededMean(CLOSE, meanLen);
  const moved = changeBy(CLOSE, 1);
  const force = fromFirst(
    moved.map((one, bar) => one * (VOLUME[bar] as number)),
    (tail) => seededMean(tail, forceLen),
  );

  assertColumn(column(run, 'Trend mean'), asSeries(trendMean), 'trend mean');
  assertColumn(
    run.barColor,
    CLOSE.map((_, bar) => {
      const meanUp =
        has(trendMean[bar]) &&
        has(trendMean[bar - 1]) &&
        (trendMean[bar] as number) > (trendMean[bar - 1] as number);
      const meanDown =
        has(trendMean[bar]) &&
        has(trendMean[bar - 1]) &&
        (trendMean[bar] as number) < (trendMean[bar - 1] as number);
      const forceUp =
        has(force[bar]) && has(force[bar - 1]) && (force[bar] as number) > (force[bar - 1] as number);
      const forceDown =
        has(force[bar]) && has(force[bar - 1]) && (force[bar] as number) < (force[bar - 1] as number);
      if (meanUp && forceUp) return paint('lime');
      if (meanDown && forceDown) return paint('red');
      return paint('blue');
    }),
    'impulse colour',
  );
});

interface RefDivergence {
  readonly bull: boolean[];
  readonly bear: boolean[];
  readonly hiddenBull: boolean[];
  readonly hiddenBear: boolean[];
  readonly oscAt: RefSeries;
}

/**
 * The four bookkeeping terms the divergence rests on, each of which is "the
 * previous pivot" said a different way.
 */
function divergences(
  len: number,
  left: number,
  right: number,
  lower: number,
  upper: number,
): RefDivergence {
  const osc = strength(CLOSE, len);
  const foundLow = pivotLowAt(osc, left, right).map((one) => Number.isFinite(one));
  const foundHigh = pivotHighAt(osc, left, right).map((one) => Number.isFinite(one));
  const oscAt = shiftBy(osc, right);
  const lowAt = shiftBy(LOW, right);
  const highAt = shiftBy(HIGH, right);
  const sinceLow = sinceTrue(shiftFlags(foundLow, 1));
  const sinceHigh = sinceTrue(shiftFlags(foundHigh, 1));
  const prevOscLow = valueAtTrue(foundLow, oscAt, 1);
  const prevLowAt = valueAtTrue(foundLow, lowAt, 1);
  const prevOscHigh = valueAtTrue(foundHigh, oscAt, 1);
  const prevHighAt = valueAtTrue(foundHigh, highAt, 1);

  const bull = new Array<boolean>(CLOSE.length).fill(false);
  const bear = new Array<boolean>(CLOSE.length).fill(false);
  const hiddenBull = new Array<boolean>(CLOSE.length).fill(false);
  const hiddenBear = new Array<boolean>(CLOSE.length).fill(false);
  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    const lowInRange = lower <= (sinceLow[bar] as number) && (sinceLow[bar] as number) <= upper;
    const highInRange = lower <= (sinceHigh[bar] as number) && (sinceHigh[bar] as number) <= upper;
    bull[bar] =
      foundLow[bar] === true &&
      lowInRange &&
      (oscAt[bar] as number) > (prevOscLow[bar] as number) &&
      (lowAt[bar] as number) < (prevLowAt[bar] as number);
    bear[bar] =
      foundHigh[bar] === true &&
      highInRange &&
      (oscAt[bar] as number) < (prevOscHigh[bar] as number) &&
      (highAt[bar] as number) > (prevHighAt[bar] as number);
    hiddenBull[bar] =
      foundLow[bar] === true &&
      lowInRange &&
      (oscAt[bar] as number) < (prevOscLow[bar] as number) &&
      (lowAt[bar] as number) > (prevLowAt[bar] as number);
    hiddenBear[bar] =
      foundHigh[bar] === true &&
      highInRange &&
      (oscAt[bar] as number) > (prevOscHigh[bar] as number) &&
      (highAt[bar] as number) < (prevHighAt[bar] as number);
  }
  return { bull, bear, hiddenBull, hiddenBear, oscAt };
}

/**
 * Catches: a divergence measured against the pivot being confirmed right now
 * rather than against the one before it, which fires on every pivot; a range
 * gate counted from the undelayed flag, which makes the newest pivot its own
 * predecessor; and a plate drawn at the confirming bar, which puts every plate
 * five bars to the right of the turn it names.
 */
test('a turn in the reading that disagrees with the turn in price beside it', () => {
  const len = 14;
  const left = 3;
  const right = 3;
  const lower = 1;
  const upper = 60;
  const run = runStudy('divergence-plates', {
    settings: {
      len,
      leftBars: left,
      rightBars: right,
      rangeLower: lower,
      rangeUpper: upper,
      showHidden: true,
    },
  });
  const expected = divergences(len, left, right, lower, upper);

  assertColumn(column(run, 'Strength'), asSeries(strength(CLOSE, len)), 'the strength reading');
  assertColumn(
    column(run, 'Bull'),
    expected.bull.map((one, bar) => (one ? (expected.oscAt[bar] as number) : null)),
    'bullish divergences',
  );
  assertColumn(
    column(run, 'Bear'),
    expected.bear.map((one, bar) => (one ? (expected.oscAt[bar] as number) : null)),
    'bearish divergences',
  );
  assertColumn(
    column(run, 'Hidden bull'),
    expected.hiddenBull.map((one, bar) => (one ? (expected.oscAt[bar] as number) : null)),
    'hidden bullish divergences',
  );
  assertColumn(
    column(run, 'Hidden bear'),
    expected.hiddenBear.map((one, bar) => (one ? (expected.oscAt[bar] as number) : null)),
    'hidden bearish divergences',
  );

  const plates: string[] = [];
  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    if (expected.bull[bar] === true) {
      plates.push(
        `label[${anchorText(bar - right, expected.oscAt[bar] as number)}] text=Bull` +
          ` color=${paint('lime')} textColor=${paint('black')}`,
      );
    }
    if (expected.bear[bar] === true) {
      plates.push(
        `label[${anchorText(bar - right, expected.oscAt[bar] as number)}] text=Bear` +
          ` color=${paint('red')} textColor=${paint('white')}`,
      );
    }
    if (expected.hiddenBull[bar] === true) {
      plates.push(
        `label[${anchorText(bar - right, expected.oscAt[bar] as number)}] text=H bull` +
          ` color=${paint('lime')} textColor=${paint('black')}`,
      );
    }
    if (expected.hiddenBear[bar] === true) {
      plates.push(
        `label[${anchorText(bar - right, expected.oscAt[bar] as number)}] text=H bear` +
          ` color=${paint('red')} textColor=${paint('white')}`,
      );
    }
    assertColumn(
      spellDrawings(run.drawings[bar] ?? [], ['text', 'color', 'textColor']),
      plates,
      `plates on bar ${bar}`,
    );
  }
  // The fixture turns price and reading together on every regular pivot, so the
  // two classes that fire on it are the hidden pair. That is a fact about the
  // fixture rather than about the study, and it is asserted rather than assumed
  // so a fixture change that silenced this study would fail here.
  assert.equal(plates.length > 0, true, 'the fixture should produce at least one divergence');
  assert.equal(
    expected.hiddenBull.filter(Boolean).length + expected.hiddenBear.filter(Boolean).length > 0,
    true,
    'and the hidden classes are the ones it produces',
  );
});
