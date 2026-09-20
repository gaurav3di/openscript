/**
 * Drawing objects reaching a chart.
 *
 * The engine already proves that a script's object set is what the script asked
 * for, bar by bar. What is left for this boundary is everything the two worlds
 * spell differently, and each of them is a defect that draws something:
 *
 * - An anchor in the language's milliseconds handed to a chart that counts
 *   seconds lands fifty thousand years past the newest bar. The shape is real,
 *   the chart is willing, and nothing anywhere reports it.
 * - A list built up rather than replaced leaves a deleted object on the pane,
 *   and a moving bar one more copy of its line per tick.
 * - A path with a hole in it, joined across the hole, draws a line the script
 *   never described, through prices it never named.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ChartBar,
  ChartCalcContext,
  ChartDescriptor,
  ChartDrawing,
  ChartSettings,
  ChartStore,
} from '../../../src/adapters/charts/index.js';
import { BASE_TIME, descriptorOfSource } from './support.js';

/** A script with its declaration, so each case below is only its own lines. */
function study(...lines: readonly string[]): string {
  return [
    'version 1',
    '',
    'study("Shapes", overlay = true)',
    '',
    ...lines,
    '',
    'plot(close, "Close", aqua)',
  ].join('\n');
}

/** One bar a minute at a fixed price, so a test's numbers are its own. */
function bars(count: number): readonly ChartBar[] {
  const out: ChartBar[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({ open: 100, high: 110, low: 90, close: 100 + i, time: BASE_TIME + i * 60 });
  }
  return out;
}

function contextOf(count: number, moving = false): ChartCalcContext {
  return {
    barState: { isNew: true, isConfirmed: !moving, isRealtime: moving, lastIndex: count - 1 },
    timezone: 'Etc/UTC',
    now: () => BASE_TIME + count * 60,
  };
}

/** Every shape the run left, read the way a chart reads them. */
function drawnBy(
  source: string,
  count: number,
  moving = false,
): { readonly shapes: readonly ChartDrawing[]; readonly descriptor: ChartDescriptor } {
  const descriptor = descriptorOfSource(source);
  const settings: ChartSettings = {};
  const store: ChartStore = {};
  const data = bars(count);
  const values = descriptor.calc(data, settings, store, contextOf(count, moving));
  return { descriptor, shapes: descriptor.draws?.({ bars: data, values, settings }) ?? [] };
}

// Catches: an anchor handed over in the engine's milliseconds. It is the one
// conversion on this boundary that draws a perfectly plausible shape when it is
// missed, because the chart places it without complaint.
test('an anchor crosses as a time in the seconds a chart counts', () => {
  const { shapes } = drawnBy(
    study('if bar.isFirst', '    draw.line(time, low, time + 120000, high)'),
    4,
  );
  assert.deepEqual(shapes[0], {
    kind: 'line',
    from: { time: BASE_TIME, price: 90 },
    to: { time: BASE_TIME + 120, price: 110 },
    color: 'rgba(128, 128, 128, 1)',
    lineWidth: 1,
    lineStyle: 'solid',
    extendLeft: false,
    extendRight: false,
  });
});

// Catches: an anchor clamped to the newest bar. A projection reaches into the
// margin where no bar exists, which is most of what a projection is for.
test('an anchor past the newest bar crosses as the number it was written as', () => {
  const { shapes } = drawnBy(
    study('if bar.isFirst', '    draw.label(time + 864000000, close, "ten days out")'),
    5,
  );
  const label = shapes[0] as { readonly at: { readonly time: number } };
  assert.equal(label.at.time, BASE_TIME + 864_000, 'ten days of seconds past the first bar');
});

// Catches: a style dropped on the way across. Each of these is an argument a
// script wrote and a field the chart has, so a missing one is a shape drawn in
// the chart's defaults instead of the script's.
test('a box and a label carry their own styling', () => {
  const { shapes } = drawnBy(
    study(
      'if bar.isFirst',
      '    draw.box(time, low, time + 60000, high, color = red, fillColor = aqua,',
      '             opacity = 0.5, width = 3, text = "zone", tooltip = "why")',
      '    draw.label(time, close, "here", color = lime, align = "left", tooltip = "what")',
    ),
    3,
  );
  assert.deepEqual(shapes[0], {
    kind: 'box',
    from: { time: BASE_TIME, price: 90 },
    to: { time: BASE_TIME + 60, price: 110 },
    color: 'rgba(255, 0, 0, 1)',
    fillColor: 'rgba(0, 255, 255, 1)',
    textColor: 'rgba(255, 255, 255, 1)',
    opacity: 0.5,
    lineWidth: 3,
    text: 'zone',
    tooltip: 'why',
  });
  assert.deepEqual(shapes[1], {
    kind: 'label',
    at: { time: BASE_TIME, price: 100 },
    text: 'here',
    color: 'rgba(0, 255, 0, 1)',
    textColor: 'rgba(255, 255, 255, 1)',
    align: 'left',
    tooltip: 'what',
  });
});

// Catches: an absent colour left out, which a chart reads as "you choose" and
// draws in its own ink. `none` in this language means nothing is drawn there.
test('a colour the script cleared is transparent rather than the chart\'s own', () => {
  const { shapes } = drawnBy(
    study(
      'var l = none',
      'if bar.isFirst',
      '    l = draw.line(time, low, time + 60000, high)',
      '    draw.setColor(l, none)',
    ),
    3,
  );
  const line = shapes[0] as { readonly color: string };
  assert.equal(line.color, 'rgba(0, 0, 0, 0)');
});

// Catches: an anchor with one half missing drawn at a price of zero. A gap on a
// drawing surface is nothing drawn, and a zero would be a price.
test('a shape whose anchor is half absent is not drawn at all', () => {
  const { shapes } = drawnBy(
    study('if bar.isFirst', '    draw.line(time, sma(close, 50), time + 60000, high)'),
    3,
  );
  assert.deepEqual([...shapes], [], 'the average has not warmed up, so there is no price');
});

// Catches: a path joined across its hole. The two points either side of a gap
// are not adjacent, and a line between them is a claim the script never made.
test('a path with a gap in it becomes one shape per stretch that has none', () => {
  const { shapes } = drawnBy(
    study(
      'if bar.isFirst',
      '    times  = [time, time + 60000, none, time + 180000, time + 240000]',
      '    prices = [90, 91, 92, 93, 94]',
      '    draw.polyline(times, prices, closed = true, fillColor = aqua)',
    ),
    3,
  );
  assert.equal(shapes.length, 2, 'two stretches, either side of the hole');
  const first = shapes[0] as { readonly points: readonly { readonly time: number }[] };
  assert.deepEqual(
    first.points.map((one) => one.time),
    [BASE_TIME, BASE_TIME + 60],
  );
  assert.equal(
    (shapes[0] as { readonly closed?: boolean }).closed,
    undefined,
    'a path that was cut is not closed, since closing each stretch draws shapes nobody described',
  );
});

// Catches: a list built up rather than replaced. A deleted object left on the
// pane is a study that looks right until it does not.
test('an object the script deleted is not handed over', () => {
  const { shapes } = drawnBy(
    study(
      'var b = none',
      'if bar.isFirst',
      '    b = draw.box(time, low, time + 60000, high)',
      'if bar.index == 2',
      '    draw.delete(b)',
    ),
    4,
  );
  assert.deepEqual([...shapes], []);
});

// Catches: a moving bar accumulating one object per tick. A live chart and a
// backtest of the same bars have to hand a host the same set, and a count would
// pass an engine that kept every copy of a shape it moved.
test('a bar that runs again hands over the set it had, not one copy per tick', () => {
  const source = study('draw.line(time, low, time + 60000, high)');
  const settled = descriptorOfSource(source);
  const ticking = descriptorOfSource(source);
  const data = bars(4);

  const settledSettings: ChartSettings = {};
  const once = settled.calc(data, settledSettings, {}, contextOf(4));

  const tickingSettings: ChartSettings = {};
  const store: ChartStore = {};
  ticking.calc(data.slice(0, 3), tickingSettings, store, contextOf(3, true));
  for (let tick = 0; tick < 5; tick += 1) {
    ticking.calcTail?.(data, tickingSettings, 2, {}, store, contextOf(4, true));
  }
  const again = ticking.calcTail?.(data, tickingSettings, 3, {}, store, contextOf(4));

  assert.deepEqual(
    ticking.draws?.({ bars: data, values: again ?? {}, settings: tickingSettings }),
    settled.draws?.({ bars: data, values: once, settings: settledSettings }),
    'five updates to the newest bar leave what one execution of it leaves',
  );
});

// Catches: a lifecycle or a drawing layer offered by a study that draws none.
test('a study that creates no object declares no drawing hook', () => {
  const { descriptor } = drawnBy(study('level(100, "Hundred")'), 2);
  assert.equal(descriptor.draws, undefined);
});
