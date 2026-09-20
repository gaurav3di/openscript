/**
 * The drawing studies of this half of the gate.
 *
 * Five studies whose output is objects rather than columns: lines joining
 * turning points, boxes created and deleted over many bars, an outline whose
 * shape is two arrays, a label that is moved rather than redrawn, and a box per
 * session that grows with the session.
 *
 * A drawing is compared here the way a column is: every anchor is a time and a
 * price, and both are asserted against the reference. Counting the objects is
 * not enough on its own, because the two commonest mistakes in this part of the
 * language both keep the count right: an object drawn on the bar a turning
 * point happened rather than on the bar it became knowable, and an object
 * recreated every bar rather than moved.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Ref } from './primitives.js';
import { highestOf } from './primitives.js';
import {
  BAR_TIMES,
  CLOSE,
  COARSE_BARS,
  HIGH,
  LOW,
  OPEN,
  SESSION_OF,
  plot,
  runStudy,
} from './surface.js';
import { asSeries, matchesWithGaps } from './verdict.js';

/**
 * A turning point, answered on the bar it becomes knowable.
 *
 * Comparisons are strict on both sides, so a run of equal highs has no single
 * highest bar and reports no turning point. The answer lands `right` bars after
 * the bar it describes, which is the first bar on which it could honestly be
 * known; reporting it earlier would put a value on history at a bar where no
 * script could have had it.
 */
function turningPoints(values: readonly number[], left: number, right: number, wantHigh: boolean): Ref {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  for (let i = left + right; i < n; i += 1) {
    const at = i - right;
    const here = values[at] as number;
    if (!Number.isFinite(here)) continue;
    let ok = true;
    for (let k = 1; k <= left && ok; k += 1) {
      const other = values[at - k] as number;
      if (!Number.isFinite(other) || (wantHigh ? other >= here : other <= here)) ok = false;
    }
    for (let k = 1; k <= right && ok; k += 1) {
      const other = values[at + k] as number;
      if (!Number.isFinite(other) || (wantHigh ? other >= here : other <= here)) ok = false;
    }
    if (ok) out[i] = here;
  }
  return out;
}

const LEFT = 3;
const RIGHT = 3;

// Catches: a line anchored to the bar the turning point was confirmed on rather
// than to the bar it happened on. Both draw a line between two plausible
// points, and the difference is the length of the confirmation lag.
test('the swing lines join consecutive turning points at the bars they happened on', () => {
  const surface = runStudy('swing-lines', { leftBars: LEFT, rightBars: RIGHT });

  const highs = turningPoints(HIGH, LEFT, RIGHT, true);
  const lows = turningPoints(LOW, LEFT, RIGHT, false);
  matchesWithGaps(plot(surface, 'Turning high'), asSeries(highs), 'turning highs');
  matchesWithGaps(plot(surface, 'Turning low'), asSeries(lows), 'turning lows');

  interface Anchor {
    readonly time: number;
    readonly price: number;
  }
  const segments: { from: Anchor; to: Anchor }[] = [];
  const labels: Anchor[] = [];
  const track = (found: Ref): void => {
    let last: Anchor | null = null;
    for (let bar = 0; bar < found.length; bar += 1) {
      const value = found[bar] as number;
      if (!Number.isFinite(value)) continue;
      const here = { time: BAR_TIMES[bar - RIGHT] as number, price: value };
      if (last !== null) {
        segments.push({ from: last, to: here });
        labels.push(here);
      }
      last = here;
    }
  };
  track(highs);
  track(lows);

  const lines = surface.drawings.filter((one) => one.kind === 'line');
  const plates = surface.drawings.filter((one) => one.kind === 'label');
  assert.equal(lines.length, segments.length, 'one line per pair of turning points');
  assert.notEqual(segments.length, 0, 'the fixture should turn more than once on each side');
  assert.equal(plates.length, labels.length, 'one label per line');

  // Creation order is the order the script drew them, and the script draws the
  // highs before the lows on any bar that has both, so the two sets are
  // compared as one sequence sorted the way a reader would read a chart.
  const drawn = lines
    .map((one) => ({
      from: { time: one.anchors[0]?.time ?? 0, price: one.anchors[0]?.price ?? 0 },
      to: { time: one.anchors[1]?.time ?? 0, price: one.anchors[1]?.price ?? 0 },
    }))
    .sort((a, b) => a.to.time - b.to.time || a.to.price - b.to.price);
  const wanted = [...segments].sort((a, b) => a.to.time - b.to.time || a.to.price - b.to.price);
  assert.deepEqual(drawn, wanted, 'swing line anchors');
});

const ZONE_AGE = 30;

// Catches: a zone deleted on a touch rather than on a close through it, and a
// list walked upwards while elements are removed from it, which skips every
// second deletion and leaves zones on the chart that the study says are gone.
test('the zone boxes are created, extended and deleted exactly as the reference says', () => {
  const surface = runStudy('zone-boxes', {
    leftBars: LEFT,
    rightBars: RIGHT,
    maxAge: ZONE_AGE,
  });

  interface Zone {
    readonly startTime: number;
    top: number;
    base: number;
    side: number;
    born: number;
  }
  const live: Zone[] = [];
  const highs = turningPoints(HIGH, LEFT, RIGHT, true);
  const lows = turningPoints(LOW, LEFT, RIGHT, false);
  const counts: (number | null)[] = [];

  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const zone = live[i] as Zone;
      const age = bar - zone.born;
      const broken =
        zone.side > 0 ? (CLOSE[bar] as number) > zone.top : (CLOSE[bar] as number) < zone.base;
      if (broken || age > ZONE_AGE) live.splice(i, 1);
    }
    const up = highs[bar] as number;
    if (Number.isFinite(up)) {
      live.push({
        startTime: BAR_TIMES[bar - RIGHT] as number,
        top: HIGH[bar - RIGHT] as number,
        base: Math.max(OPEN[bar - RIGHT] as number, CLOSE[bar - RIGHT] as number),
        side: 1,
        born: bar - RIGHT,
      });
    }
    const down = lows[bar] as number;
    if (Number.isFinite(down)) {
      live.push({
        startTime: BAR_TIMES[bar - RIGHT] as number,
        top: Math.min(OPEN[bar - RIGHT] as number, CLOSE[bar - RIGHT] as number),
        base: LOW[bar - RIGHT] as number,
        side: -1,
        born: bar - RIGHT,
      });
    }
    counts.push(live.length);
  }

  matchesWithGaps(plot(surface, 'Live zones'), counts, 'live zone count');
  assert.notEqual(live.length, 0, 'the fixture should leave zones alive at the end');

  const boxes = surface.drawings.filter((one) => one.kind === 'box');
  assert.equal(boxes.length, live.length, 'one box per live zone and none for a deleted one');

  const last = BAR_TIMES[BAR_TIMES.length - 1] as number;
  assert.deepEqual(
    boxes.map((one) => [
      one.anchors[0]?.time ?? null,
      one.anchors[0]?.price ?? null,
      one.anchors[1]?.time ?? null,
      one.anchors[1]?.price ?? null,
    ]),
    live.map((zone) => [zone.startTime, zone.top, last, zone.base]),
    'zone box anchors, each extended to the newest bar',
  );
});

const PATH_SPAN = 20;

// Catches: an outline rebuilt on every bar rather than on the newest one, which
// leaves eighty outlines stacked on a chart that should carry one, and an
// outline filled newest bar first, which draws the same shape backwards.
test('the price path is one outline over the last span of closes, oldest bar first', () => {
  const surface = runStudy('price-path', { span: PATH_SPAN });

  const outlines = surface.drawings.filter((one) => one.kind === 'polyline');
  assert.equal(outlines.length, 1, 'one outline after eighty bars');

  const last = CLOSE.length - 1;
  const expected: { time: number; price: number }[] = [];
  for (let k = PATH_SPAN - 1; k >= 0; k -= 1) {
    expected.push({ time: BAR_TIMES[last - k] as number, price: CLOSE[last - k] as number });
  }
  assert.deepEqual(
    (outlines[0]?.anchors ?? []).map((one) => ({ time: one.time, price: one.price })),
    expected,
    'outline points',
  );
});

const LABEL_SPAN = 20;

// Catches: a label created on every bar rather than moved. That study draws the
// same picture on the newest bar and leaves sixty invisible objects behind it,
// which is the shape of leak a chart only notices after an hour of ticks.
test('the value label is one object, moved and rewritten rather than redrawn', () => {
  const surface = runStudy('value-labels', { span: LABEL_SPAN });

  const plates = surface.drawings.filter((one) => one.kind === 'label');
  assert.equal(plates.length, 1, 'one label after eighty bars');

  const top = highestOf(CLOSE, LABEL_SPAN);
  const last = CLOSE.length - 1;
  assert.deepEqual(plates[0]?.anchors, [
    { time: BAR_TIMES[last] as number, price: top[last] as number },
  ]);
  assert.equal(plates[0]?.style['text'], (top[last] as number).toFixed(2));
  matchesWithGaps(plot(surface, 'Window high'), asSeries(top), 'window high');
});

// Catches: a box per bar rather than per session, and a box that keeps growing
// after its session ended. The fixture holds eight sessions, so a study that
// created one object per bar is out by a factor of ten and one that never
// stopped growing is out on every box but the last.
test('one session outline per session, each bounded by its own session', () => {
  const surface = runStudy('session-outline');

  const sessions = SESSION_OF[SESSION_OF.length - 1] as number;
  const boxes = surface.drawings.filter((one) => one.kind === 'box');
  assert.equal(boxes.length, sessions + 1, 'one box per session');

  const expected: (readonly [number, number, number, number])[] = [];
  for (let session = 0; session <= sessions; session += 1) {
    const from = session * COARSE_BARS;
    const to = Math.min(from + COARSE_BARS - 1, CLOSE.length - 1);
    expected.push([
      BAR_TIMES[from] as number,
      Math.max(...HIGH.slice(from, to + 1)),
      BAR_TIMES[to] as number,
      Math.min(...LOW.slice(from, to + 1)),
    ]);
  }

  assert.deepEqual(
    boxes.map((one) => [
      one.anchors[0]?.time ?? null,
      one.anchors[0]?.price ?? null,
      one.anchors[1]?.time ?? null,
      one.anchors[1]?.price ?? null,
    ]),
    expected.map((one) => [...one]),
    'session outline bounds',
  );
});
