/**
 * Studies whose output is a set of objects the script holds, mutates and
 * deletes, rather than a value per bar.
 *
 * This is the surface with no column anywhere behind it. A plot is one number
 * per bar and a marker is one event on a bar; a drawing is anchored to a time
 * and a price, survives the bars that follow it, and is answerable only by
 * asking the engine what the script is holding **after each bar**. So every
 * test here compares the whole live set on every bar of the run, in creation
 * order, which is the only comparison that can see an object created twice, one
 * that outlived its rule, or one that was moved a bar late.
 *
 * **Where the reference comes from.** Neither sibling package has drawing
 * objects at all: their descriptors reach the chart through columns, markers,
 * levels and bar colours. So the prices and the bars these objects are anchored
 * to come from the reference columns transcribed in `arithmetic.ts`, which are
 * the sibling's own, and the rule that turns a column into an object is the
 * study's, stated in the study and transcribed once here beside it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { asSeries, fixedText, has, pivotHighAt, pivotLowAt, windowHigh, windowLow } from './arithmetic.js';
import {
  CLOSE,
  HIGH,
  LOW,
  OPEN,
  anchorText,
  assertColumn,
  faded,
  paint,
  runStudy,
  spellDrawings,
} from './harness.js';

/** The style fields a box carries, in the order `draw.box` takes them. */
const BOX_STYLE = ['color', 'fillColor', 'opacity', 'width', 'text', 'textColor', 'tooltip'];
const LABEL_STYLE = ['text', 'color', 'textColor', 'align', 'tooltip'];
const LINE_STYLE = ['color', 'width', 'style', 'extendLeft', 'extendRight'];
const PATH_STYLE = ['color', 'width', 'closed'];

/**
 * Catches: a zone deleted on a touch rather than on a close through it, which
 * deletes every zone that ever did its job; a zone that keeps extending after
 * it was retired; and an ascending removal loop, which renumbers the element it
 * is about to visit and leaves every second broken zone on the chart.
 */
test('a zone at every turning low, extended while it holds and deleted when it breaks', () => {
  const wings = 3;
  const maxAge = 40;
  const run = runStudy('demand-boxes', { settings: { wings, maxAge } });
  const turns = pivotLowAt(LOW, wings, wings);

  interface Zone {
    readonly start: number;
    readonly top: number;
    readonly floor: number;
    right: number;
  }
  let live: Zone[] = [];

  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    // The retirement pass runs before anything new is created, so a zone opened
    // on this bar is first tested on the next one.
    live = live.filter((zone) => {
      const broken = (CLOSE[bar] as number) < zone.floor;
      const old = bar - zone.start > maxAge;
      return !(broken || old);
    });
    for (const zone of live) zone.right = bar;

    if (has(turns[bar])) {
      const at = bar - wings;
      live.push({
        start: at,
        top: Math.min(OPEN[at] as number, CLOSE[at] as number),
        floor: turns[bar] as number,
        right: bar,
      });
    }

    assertColumn(
      spellDrawings(run.drawings[bar] ?? [], BOX_STYLE),
      live.map(
        (zone) =>
          `box[${anchorText(zone.start, zone.top)} ${anchorText(zone.right, zone.floor)}]` +
          ` color=${paint('lime')} fillColor=${faded('lime', 85)} opacity=0.12 width=1` +
          ` text=Demand textColor=${paint('white')} tooltip=`,
      ),
      `zones on bar ${bar}`,
    );
  }
});

/**
 * Catches: a plate anchored at the bar that confirmed the turn rather than at
 * the bar that turned, which puts every plate two bars to the right of the
 * price it names; and a plate whose caption was spelled from the unrounded
 * number.
 */
test('a plate of text at every turning point, carrying the price that turned', () => {
  const wings = 2;
  const run = runStudy('high-low-labels', { settings: { wings } });
  const tops = pivotHighAt(HIGH, wings, wings);
  const bottoms = pivotLowAt(LOW, wings, wings);

  const live: string[] = [];
  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    const at = bar - wings;
    if (has(tops[bar])) {
      const price = tops[bar] as number;
      live.push(
        `label[${anchorText(at, price)}] text=${fixedText(price, 2)} color=${paint('red')}` +
          ` textColor=${paint('white')} align=center tooltip=`,
      );
    }
    if (has(bottoms[bar])) {
      const price = bottoms[bar] as number;
      live.push(
        `label[${anchorText(at, price)}] text=${fixedText(price, 2)} color=${paint('green')}` +
          ` textColor=${paint('white')} align=center tooltip=`,
      );
    }
    assertColumn(spellDrawings(run.drawings[bar] ?? [], LABEL_STYLE), live, `plates on bar ${bar}`);
  }
});

/**
 * Catches: a line created again on every new turn, which leaves one line per
 * turn on a chart that should hold exactly one; and a line drawn on the first
 * turn, where there is no second point to join it to and both ends would sit on
 * the same bar.
 */
test('one line, moved to join the last two turning highs', () => {
  const wings = 2;
  const run = runStudy('link-line', { settings: { wings } });
  const tops = pivotHighAt(HIGH, wings, wings);

  let previous: { bar: number; price: number } | undefined;
  let line: string | undefined;

  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    if (has(tops[bar])) {
      const now = { bar: bar - wings, price: tops[bar] as number };
      if (previous !== undefined) {
        line =
          `line[${anchorText(previous.bar, previous.price)} ${anchorText(now.bar, now.price)}]` +
          ` color=${paint('orange')} width=2 style=solid extendLeft=false extendRight=false`;
      }
      previous = now;
    }
    assertColumn(
      spellDrawings(run.drawings[bar] ?? [], LINE_STYLE),
      line === undefined ? [] : [line],
      `link on bar ${bar}`,
    );
  }
});

/**
 * Catches: three lines recreated every bar instead of moved, which is eighty
 * bars times three objects on this fixture alone; and a grid drawn from a
 * window that has not filled.
 */
test('three retracement lines across the window, moved on every bar', () => {
  const len = 20;
  const run = runStudy('fibonacci-grid', { settings: { len } });
  const top = windowHigh(HIGH, len);
  const bottom = windowLow(LOW, len);

  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    const expected: string[] = [];
    if (has(top[bar]) && has(bottom[bar])) {
      const span = (top[bar] as number) - (bottom[bar] as number);
      const from = bar - (len - 1);
      const lines: readonly [number, string, string][] = [
        [0.382, 'silver', 'dotted'],
        [0.5, 'orange', 'dashed'],
        [0.618, 'silver', 'dotted'],
      ];
      for (const [fraction, colour, dash] of lines) {
        const price = (bottom[bar] as number) + span * fraction;
        expected.push(
          `line[${anchorText(from, price)} ${anchorText(bar, price)}]` +
            ` color=${paint(colour)} width=1 style=${dash} extendLeft=false extendRight=true`,
        );
      }
    }
    assertColumn(
      spellDrawings(run.drawings[bar] ?? [], LINE_STYLE),
      expected,
      `grid on bar ${bar}`,
    );
  }
});

/**
 * Catches: a path that keeps growing past the points it was told to keep; and a
 * path rebuilt from the arrays without replacing the object's own copy, which
 * leaves the drawn shape one turn behind the data for ever.
 */
test('a path through the turning lows, rebuilt as each one is confirmed', () => {
  const wings = 2;
  const keep = 4;
  const run = runStudy('drift-polyline', { settings: { wings, keep } });
  const turns = pivotLowAt(LOW, wings, wings);

  const points: { bar: number; price: number }[] = [];
  let path: string | undefined;

  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    if (has(turns[bar])) {
      points.push({ bar: bar - wings, price: turns[bar] as number });
      if (points.length > keep) points.shift();
      if (points.length > 1) {
        path =
          `polyline[${points.map((one) => anchorText(one.bar, one.price)).join(' ')}]` +
          ` color=${paint('teal')} width=2 closed=false`;
      }
    }
    assertColumn(
      spellDrawings(run.drawings[bar] ?? [], PATH_STYLE),
      path === undefined ? [] : [path],
      `path on bar ${bar}`,
    );
  }
});

/**
 * Catches: a caption or a tooltip written once at creation rather than on every
 * bar, which leaves a frame whose label describes a range it no longer spans.
 */
test('one box around the window range, moved and relabelled on every bar', () => {
  const len = 10;
  const run = runStudy('bar-range-box', { settings: { len } });
  const top = windowHigh(HIGH, len);
  const bottom = windowLow(LOW, len);

  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    const expected: string[] = [];
    if (has(top[bar]) && has(bottom[bar])) {
      const high = top[bar] as number;
      const low = bottom[bar] as number;
      expected.push(
        `box[${anchorText(bar - (len - 1), high)} ${anchorText(bar, low)}]` +
          ` color=${paint('navy')} fillColor=${faded('navy', 92)} opacity=0.12 width=1` +
          ` text=${fixedText(high - low, 2)} textColor=${paint('white')}` +
          ` tooltip=Range over ${fixedText(len, 0)} bars`,
      );
    }
    assertColumn(spellDrawings(run.drawings[bar] ?? [], BOX_STYLE), expected, `frame on bar ${bar}`);
  }
});

/** Every study here holds objects, so none of them may quietly hold none. */
test('each drawing study actually put something on the chart', () => {
  for (const name of [
    'demand-boxes',
    'high-low-labels',
    'link-line',
    'fibonacci-grid',
    'drift-polyline',
    'bar-range-box',
  ]) {
    const run = runStudy(name);
    const last = run.drawings[run.drawings.length - 1] ?? [];
    assert.equal(last.length > 0, true, `${name} ended the run holding no drawing at all`);
  }
});

/** Absence is what a turning column has on most bars, and asSeries says so. */
test('the reference turning columns are sparse, which is what makes the above a test', () => {
  const turns = asSeries(pivotLowAt(LOW, 2, 2));
  const found = turns.filter((one) => one !== null).length;
  assert.equal(found > 2, true, 'the fixture should produce several turning lows');
  assert.equal(found < CLOSE.length, true, 'and not one on every bar');
});
