/**
 * The flow and pressure studies of this half of the gate.
 *
 * Five studies about what happened behind the price rather than to it: a
 * running total of signed volume with a band around itself, a change weighted
 * by the volume behind it, a count of how many of the last bars closed up, the
 * share of a window's money flow that arrived on rising bars, and this bar's
 * volume against its recent normal.
 *
 * Three of the five turn on the rule that an absent condition is a condition
 * that did not hold. Bar 0 has no bar before it, so its comparison is absent,
 * and every one of these studies has to say what that means rather than let it
 * decide by accident.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Ref } from './primitives.js';
import { changeOf, deviation, expMean, mean, windowSum } from './primitives.js';
import {
  CLOSE,
  HIGH,
  LOW,
  VOLUME,
  firedOn,
  marker,
  paintNames,
  plot,
  runStudy,
} from './surface.js';
import { asSeries, matches, matchesWithGaps } from './verdict.js';

const BALANCE_LENGTH = 9;
const BALANCE_MULT = 2;

/** The running total of signed volume, transcribed as the published study runs it. */
function balance(): Ref {
  const out = new Array<number>(CLOSE.length).fill(NaN);
  let total = 0;
  for (let i = 0; i < CLOSE.length; i += 1) {
    if (i > 0) {
      const here = VOLUME[i] as number;
      if ((CLOSE[i] as number) > (CLOSE[i - 1] as number)) total += here;
      else if ((CLOSE[i] as number) < (CLOSE[i - 1] as number)) total -= here;
    }
    out[i] = total;
  }
  return out;
}

// Catches: a running total that weights the contribution by how far price
// moved. That is a different study with the same shape, and only the numbers
// separate them: this one adds the whole bar's volume on any up close, so a
// drift of one tick and a gap of five percent count the same.
test('the balance total, its mean and its band match the reference', () => {
  const surface = runStudy('on-balance-volume', { maLen: BALANCE_LENGTH, mult: BALANCE_MULT });
  const value = balance();
  const middle = mean(value, BALANCE_LENGTH);
  const width = deviation(value, BALANCE_LENGTH).map((one) => one * BALANCE_MULT);

  matches(plot(surface, 'Balance'), asSeries(value), 0, 'balance total');
  matches(plot(surface, 'Mean'), asSeries(middle), BALANCE_LENGTH - 1, 'balance mean');
  matches(
    plot(surface, 'Upper band'),
    asSeries(middle.map((one, i) => one + (width[i] as number))),
    BALANCE_LENGTH - 1,
    'balance upper band',
  );
  matches(
    plot(surface, 'Lower band'),
    asSeries(middle.map((one, i) => one - (width[i] as number))),
    BALANCE_LENGTH - 1,
    'balance lower band',
  );
});

// Catches: a crossing marked on the bar the two series touch rather than on the
// bar one passes the other. A total and its own mean touch often, so this is a
// study where the difference is many bars rather than one.
test('the balance total marks each crossing of its own mean once', () => {
  const surface = runStudy('on-balance-volume', { maLen: BALANCE_LENGTH, mult: BALANCE_MULT });
  const value = plot(surface, 'Balance');
  const middle = plot(surface, 'Mean');

  const up: number[] = [];
  const down: number[] = [];
  for (let bar = 1; bar < value.length; bar += 1) {
    const now = value[bar] ?? null;
    const level = middle[bar] ?? null;
    const was = value[bar - 1] ?? null;
    const before = middle[bar - 1] ?? null;
    if (now === null || level === null || was === null || before === null) continue;
    if (was <= before && now > level) up.push(bar);
    if (was >= before && now < level) down.push(bar);
  }
  assert.notEqual(up.length + down.length, 0, 'the fixture should cross the mean');
  assert.deepEqual(firedOn(marker(surface, 'm0')), up, 'crossings above the mean');
  assert.deepEqual(firedOn(marker(surface, 'm1')), down, 'crossings below the mean');
});

const FORCE_LENGTH = 13;

// Catches: an average started at bar 0 over a series that is absent there. The
// change is absent on the first bar, so the average seeds from bar 1 and its
// first value lands one bar past the length rather than one before it.
test('the volume force matches the reference', () => {
  const surface = runStudy('volume-force', { len: FORCE_LENGTH });

  const force = changeOf(CLOSE).map((one, i) => one * (VOLUME[i] as number));
  const start = force.findIndex((one) => Number.isFinite(one));
  const tail = expMean(force.slice(start), FORCE_LENGTH);
  const expected = new Array<number>(force.length).fill(NaN);
  for (let i = 0; i < tail.length; i += 1) expected[start + i] = tail[i] as number;

  matches(plot(surface, 'Force'), asSeries(expected), FORCE_LENGTH, 'volume force');
});

const SHARE_LENGTH = 14;

// Catches: a count that propagates an absent condition instead of treating it
// as false. Bar 0 has no bar before it, so the window ending on bar 13 holds
// thirteen comparisons and fourteen bars, and a study that waited for fourteen
// comparisons would start a bar later than this one does.
test('the up bar share matches the reference and shades its own extremes', () => {
  const surface = runStudy('up-bar-share', { len: SHARE_LENGTH });

  const rose = CLOSE.map((one, i) => (i > 0 && one > (CLOSE[i - 1] as number) ? 1 : 0));
  const expected = windowSum(rose, SHARE_LENGTH).map((one) => (one / SHARE_LENGTH) * 100);
  const drawn = plot(surface, 'Share');

  matches(drawn, asSeries(expected), SHARE_LENGTH - 1, 'up bar share');
  assert.deepEqual(
    surface.background.map((one) => one !== null),
    drawn.map((one) => one !== null && (one > 80 || one < 20)),
    'up bar share shading',
  );
});

const FLOW_LENGTH = 14;

// Catches: a window reported one bar early. Bar 0 contributes to neither side,
// so the window ending on bar `len - 1` is one comparison short, and the study
// waits rather than reporting over an incomplete set. It also catches the
// reading that divides by zero instead of pinning at a hundred when a window
// has no flow the other way.
test('the typical price flow matches the reference at the bar it starts on', () => {
  const surface = runStudy('typical-price-flow', { len: FLOW_LENGTH });

  const typical = CLOSE.map(
    (one, i) => ((HIGH[i] as number) + (LOW[i] as number) + one) / 3,
  );
  const up = new Array<number>(CLOSE.length).fill(0);
  const down = new Array<number>(CLOSE.length).fill(0);
  for (let i = 1; i < CLOSE.length; i += 1) {
    const flow = (typical[i] as number) * (VOLUME[i] as number);
    if ((typical[i] as number) > (typical[i - 1] as number)) up[i] = flow;
    else if ((typical[i] as number) < (typical[i - 1] as number)) down[i] = flow;
  }
  const upTotal = windowSum(up, FLOW_LENGTH);
  const downTotal = windowSum(down, FLOW_LENGTH);
  const expected = new Array<number>(CLOSE.length).fill(NaN);
  for (let i = FLOW_LENGTH; i < CLOSE.length; i += 1) {
    expected[i] =
      (downTotal[i] as number) === 0
        ? 100
        : 100 - 100 / (1 + (upTotal[i] as number) / (downTotal[i] as number));
  }

  matches(plot(surface, 'Flow'), asSeries(expected), FLOW_LENGTH, 'typical price flow');
});

const VOLUME_LENGTH = 20;
const VOLUME_SPIKE = 1.7;

// Catches: a ratio against the mean of the window before this bar rather than
// the window ending on it, and a marker that fires on every bar of a heavy
// stretch rather than on the bar it began.
test('the volume share matches the reference, and marks the bar a heavy stretch begins', () => {
  const surface = runStudy('volume-share', { len: VOLUME_LENGTH, spike: VOLUME_SPIKE });

  const average = mean(VOLUME, VOLUME_LENGTH);
  const expected = VOLUME.map((one, i) =>
    (average[i] as number) === 0 ? NaN : one / (average[i] as number),
  );
  const drawn = plot(surface, 'Share');
  matches(drawn, asSeries(expected), VOLUME_LENGTH - 1, 'volume share');

  const heavy = drawn.map((one) => one !== null && one > VOLUME_SPIKE);
  const started: number[] = [];
  for (let bar = 0; bar < heavy.length; bar += 1) {
    if (heavy[bar] === true && (bar === 0 || heavy[bar - 1] !== true)) started.push(bar);
  }
  assert.notEqual(started.length, 0, 'the fixture should hold a heavy bar');
  assert.deepEqual(firedOn(marker(surface, 'm0')), started, 'heavy bars');

  matchesWithGaps(
    paintNames(surface.barColors, ['orange']).map((one) => (one === null ? null : 1)),
    drawn.map((one) => (one !== null && one > 1 ? 1 : null)),
    'volume share bar colours',
  );
});
