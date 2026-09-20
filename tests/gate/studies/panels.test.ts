/**
 * The studies that publish something other than a line: a panel of cells, a set
 * of session levels, and two reads of a coarser interval.
 *
 * These are the part of this phase a column comparison cannot reach. A grid's
 * cells are a buffer the engine empties at the start of every execution, so
 * what a host reads is the last executed bar's panel; a session level steps
 * once per session and is flat in between; and a coarse read is a value from a
 * bar that closed before this one, held across every bar inside the one now
 * forming. Each of those is a statement about *when* a value appears, and each
 * is asserted here as a bar number rather than left to a reader to infer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { RefBar } from './primitives.js';
import { averageTrueRange, highestOf, lowestOf, mean } from './primitives.js';
import {
  CLOSE,
  COARSE_BARS,
  COARSE_TIMEFRAME,
  HIGH,
  HOST_WITH_READS,
  LOW,
  REF_BARS,
  SESSION_OF,
  VOLUME,
  cellText,
  firedOn,
  marker,
  paintNames,
  plot,
  runStudy,
} from './surface.js';
import { asSeries, matchesWithGaps } from './verdict.js';

/**
 * The session frame levels, transcribed from the published pivot study with the
 * frame taken from the session flags rather than from a calendar date.
 */
interface Frame {
  readonly pivot: number[];
  readonly width: number[];
  readonly bottom: number[];
}

function sessionFrames(bars: readonly RefBar[], sessionOf: readonly number[]): Frame {
  const n = bars.length;
  const pivot = new Array<number>(n).fill(NaN);
  const width = new Array<number>(n).fill(NaN);
  const bottom = new Array<number>(n).fill(NaN);
  let lastHigh = NaN;
  let lastLow = NaN;
  let lastClose = NaN;
  let runHigh = NaN;
  let runLow = NaN;
  let runClose = NaN;

  for (let i = 0; i < n; i += 1) {
    const opens = i === 0 || sessionOf[i] !== sessionOf[i - 1];
    if (opens) {
      lastHigh = runHigh;
      lastLow = runLow;
      lastClose = runClose;
      runHigh = NaN;
      runLow = NaN;
    }
    const bar = bars[i] as RefBar;
    runHigh = Number.isFinite(runHigh) ? Math.max(runHigh, bar.high) : bar.high;
    runLow = Number.isFinite(runLow) ? Math.min(runLow, bar.low) : bar.low;
    runClose = bar.close;
    if (!Number.isFinite(lastHigh) || !Number.isFinite(lastLow) || !Number.isFinite(lastClose)) {
      continue;
    }
    pivot[i] = (lastHigh + lastLow + lastClose) / 3;
    width[i] = lastHigh - lastLow;
    bottom[i] = (lastHigh + lastLow) / 2;
  }
  return { pivot, width, bottom };
}

// Catches: a rollover that reads the running extremes after resetting them,
// which hands each session its own first bar as the whole of the session before
// it. That produces a level on every bar including the first session's, which
// is exactly one bar's worth of difference from the right answer and looks
// perfectly plausible on a chart.
test('the session pivot levels match the reference and step once per session', () => {
  const surface = runStudy('session-pivots');
  const frame = sessionFrames(REF_BARS, SESSION_OF);

  const pivot = plot(surface, 'Pivot');
  matchesWithGaps(pivot, asSeries(frame.pivot), 'session pivot');
  matchesWithGaps(
    plot(surface, 'Support two'),
    asSeries(frame.pivot.map((value, i) => value - (frame.width[i] as number))),
    'session support two',
  );
  matchesWithGaps(
    plot(surface, 'Resistance two'),
    asSeries(frame.pivot.map((value, i) => value + (frame.width[i] as number))),
    'session resistance two',
  );
  matchesWithGaps(
    plot(surface, 'Central top'),
    asSeries(frame.pivot.map((value, i) => 2 * value - (frame.bottom[i] as number))),
    'session central top',
  );

  // The first session has nothing before it, so it draws nothing, and every
  // later session draws one value held flat across it.
  const changes: number[] = [];
  for (let bar = 1; bar < pivot.length; bar += 1) {
    if (pivot[bar] !== pivot[bar - 1]) changes.push(bar);
  }
  assert.deepEqual(
    changes,
    [COARSE_BARS, COARSE_BARS * 2, COARSE_BARS * 3, COARSE_BARS * 4, COARSE_BARS * 5,
      COARSE_BARS * 6, COARSE_BARS * 7],
    'the level steps on the first bar of each session after the first',
  );
});

const RANGE_LOOKBACK = 20;
const AVERAGE_LENGTH = 14;

// Catches: a grid that accumulates rather than being rebuilt. Eighty bars of
// history cost a host exactly one panel to draw, and an engine that appended
// would hand it eighty times as many cells with the oldest first.
test('the readings panel holds the last bar, and holds it once', () => {
  const surface = runStudy('readings-panel', {
    rangeLen: RANGE_LOOKBACK,
    atrLen: AVERAGE_LENGTH,
    corner: 'topRight',
  });

  assert.equal(surface.tables.length, 1, 'one grid');
  const grid = surface.tables[0];
  assert.notEqual(grid, undefined, 'the grid should exist');
  assert.equal(grid?.rows, 5);
  assert.equal(grid?.cols, 2);
  assert.equal(grid?.cells.length, 10, 'five rows of two cells, written once');
});

// Catches: a panel whose numbers are not the study's numbers. Every cell is
// checked against the same reference arithmetic a plot would be checked
// against, so a panel cannot quietly show a rounded or a stale reading.
test('every cell of the readings panel carries the reference reading for the last bar', () => {
  const surface = runStudy('readings-panel', {
    rangeLen: RANGE_LOOKBACK,
    atrLen: AVERAGE_LENGTH,
    corner: 'topRight',
  });
  const last = CLOSE.length - 1;

  const top = highestOf(HIGH, RANGE_LOOKBACK);
  const bottom = lowestOf(LOW, RANGE_LOOKBACK);
  const span = (top[last] as number) - (bottom[last] as number);
  const place = span > 0 ? (((CLOSE[last] as number) - (bottom[last] as number)) / span) * 100 : NaN;
  const band = averageTrueRange(REF_BARS, AVERAGE_LENGTH);
  const share = (band[last] as number) / (CLOSE[last] as number) * 100;
  const flow = (VOLUME[last] as number) / (mean(VOLUME, RANGE_LOOKBACK)[last] as number);

  assert.deepEqual(cellText(surface.tables[0] as never), [
    ['Instrument', 'AAA 1'],
    ['Close', (CLOSE[last] as number).toFixed(2)],
    ['Place in range, percent', place.toFixed(0)],
    ['Average range, percent of price', share.toFixed(2)],
    ['Volume against its average', flow.toFixed(2)],
  ]);
});

// Catches: a cell colour that answers on a reading the study does not have.
// The panel's own rule is that an absent reading reads as words rather than as
// a number, and a study that printed a zero there would pass a colour check and
// fail a reader.
test('the readings panel says it is warming up rather than inventing a number', () => {
  const surface = runStudy('readings-panel', {
    rangeLen: CLOSE.length + 10,
    atrLen: AVERAGE_LENGTH,
    corner: 'bottomLeft',
  });
  const rows = cellText(surface.tables[0] as never);

  assert.equal(rows[2]?.[1], 'warming up', 'a lookback longer than the history has no reading');
  assert.equal(rows[4]?.[1], 'warming up', 'and neither has the flow taken over it');
});

/**
 * What a confirmed read of a coarser interval answers on each chart bar.
 *
 * The bucket a chart bar is inside has not closed, so the answer is the value
 * of the last bucket that did. It steps on the first chart bar of a new bucket
 * and is flat across every bar inside it, which means the bars of the first
 * bucket have no answer at all.
 */
function coarseFold<T>(fold: (from: number, to: number) => T): (T | null)[] {
  const out: (T | null)[] = [];
  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    const bucket = Math.floor(bar / COARSE_BARS);
    if (bucket === 0) {
      out.push(null);
      continue;
    }
    const from = (bucket - 1) * COARSE_BARS;
    out.push(fold(from, from + COARSE_BARS - 1));
  }
  return out;
}

const BIAS_LENGTH = 3;

// Catches: a read that steps a bar late or a bar early. Both produce a plot
// that looks exactly like a coarse reading and both are wrong about which bars
// knew it, which is the difference between a study and a study that repaints.
test('a confirmed coarse read holds the last closed bucket across the forming one', () => {
  const surface = runStudy('wider-bias', { wideTf: COARSE_TIMEFRAME, biasLen: BIAS_LENGTH },
    { host: HOST_WITH_READS });

  const expected = coarseFold((_from, to) => CLOSE[to] as number);
  matchesWithGaps(plot(surface, 'Wider close'), expected, 'wider close');
});

// Catches: an average computed on the chart's bars and then sampled, which is a
// different series from an average of the coarse closes and is the mistake a
// higher timeframe read exists to prevent.
test('an average inside a coarse read is taken over the coarse bars', () => {
  const surface = runStudy('wider-bias', { wideTf: COARSE_TIMEFRAME, biasLen: BIAS_LENGTH },
    { host: HOST_WITH_READS });

  const coarseCloses: number[] = [];
  for (let bucket = 0; bucket * COARSE_BARS < CLOSE.length; bucket += 1) {
    coarseCloses.push(CLOSE[bucket * COARSE_BARS + COARSE_BARS - 1] as number);
  }
  const coarseMean = mean(coarseCloses, BIAS_LENGTH);
  const expected = coarseFold((from) => {
    const bucket = from / COARSE_BARS;
    const value = coarseMean[bucket];
    return value === undefined || !Number.isFinite(value) ? null : value;
  });

  matchesWithGaps(plot(surface, 'Wider average'), expected as (number | null)[], 'wider average');
  const fineMean = mean(CLOSE, BIAS_LENGTH);
  assert.notDeepEqual(
    plot(surface, 'Wider average'),
    asSeries(fineMean),
    'a coarse average is not the fine average',
  );
});

// Catches: bar colouring and a marker driven by a read that is still absent.
// An absent coarse average is neither above nor below, so the bars of the first
// bucket are painted nothing at all, and the first marker cannot fire there.
test('the bias paints and marks only once the coarse read has an answer', () => {
  const surface = runStudy('wider-bias', { wideTf: COARSE_TIMEFRAME, biasLen: BIAS_LENGTH },
    { host: HOST_WITH_READS });
  const value = plot(surface, 'Wider close');
  const average = plot(surface, 'Wider average');

  const up = value.map((one, bar) => {
    const level = average[bar] ?? null;
    return one !== null && level !== null && one > level;
  });
  const down = value.map((one, bar) => {
    const level = average[bar] ?? null;
    return one !== null && level !== null && one < level;
  });

  assert.deepEqual(
    paintNames(surface.barColors, ['lime', 'red']),
    up.map((one, bar) => (one ? 'lime' : down[bar] ? 'red' : null)),
    'bias bar colours',
  );

  const turnedUp: number[] = [];
  const turnedDown: number[] = [];
  for (let bar = 0; bar < up.length; bar += 1) {
    if (up[bar] === true && (bar === 0 || up[bar - 1] !== true)) turnedUp.push(bar);
    if (down[bar] === true && (bar === 0 || down[bar - 1] !== true)) turnedDown.push(bar);
  }
  assert.deepEqual(firedOn(marker(surface, 'm0')), turnedUp, 'bias turning up');
  assert.deepEqual(firedOn(marker(surface, 'm1')), turnedDown, 'bias turning down');
});

// Catches: three reads of one interval sharing one fold. Each read carries its
// own expression, and an engine that folded the first and reused it for the
// other two would draw the close three times.
test('three coarse reads in one study each answer for their own expression', () => {
  const surface = runStudy('wider-range', { wideTf: COARSE_TIMEFRAME }, { host: HOST_WITH_READS });

  const top = coarseFold((from, to) => Math.max(...HIGH.slice(from, to + 1)));
  const bottom = coarseFold((from, to) => Math.min(...LOW.slice(from, to + 1)));
  matchesWithGaps(plot(surface, 'Wider high'), top, 'wider high');
  matchesWithGaps(plot(surface, 'Wider low'), bottom, 'wider low');

  // The middle is the coarse bar's own midpoint, which is the mean of that
  // bar's high and low and not the mean of the two columns above it on a fine
  // bar. On a fold they happen to agree, and the assertion is here so that the
  // day they do not, this says which one the study reads.
  matchesWithGaps(
    plot(surface, 'Wider middle'),
    top.map((value, bar) => (value === null ? null : (value + (bottom[bar] as number)) / 2)),
    'wider middle',
  );
});
