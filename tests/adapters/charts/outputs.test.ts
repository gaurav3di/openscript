/**
 * The rest of the output surface: markers, paint, the grid and the conditions.
 *
 * The properties worth a test here are the ones a screenshot would not show. A
 * marker is an event with a label rather than a column, so it has to appear on
 * exactly the bars the branch was taken and nowhere else. Bar colouring is a
 * statement about somebody else's candles, so which study owns them has to be
 * answerable without running anything. A grid is written per bar and shown once,
 * so its cost must not follow the history. And a watched condition has to be
 * false on a bar that is still moving, which is the difference between an alert
 * worth acting on and one that fires and takes it back.
 *
 * **Every hook is called with the settings object the calculation was given**,
 * because that object is how the adapter tells one study instance from another.
 * A test that passed a fresh `{}` to each would be testing the empty case.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { candleOwner } from '../../../src/adapters/charts/index.js';
import type {
  ChartAlertSpec,
  ChartBar,
  ChartCalcContext,
  ChartDescriptor,
  ChartGrid,
  ChartMarker,
  ChartSettings,
  ChartStore,
  ChartSurfaceContext,
} from '../../../src/adapters/charts/index.js';
import { BASE_TIME, descriptorOfSource } from './support.js';

const MARKED = `version 1

study("Marked", overlay = true, precision = 2)

up = close > open

if up
    signal("UP", shape = "triangleUp", at = "below", color = lime)

barColor(up ? lime : none)
background(up ? fade(aqua, 90) : none)

panel = table("Panel", 1, 2, position = "topLeft")
cell(panel, 0, 0, "close", align = "right")
cell(panel, 0, 1, text(close, 2))

if up
    alert("up at " + text(close, 2), id = "up", title = "Went up")

plot(close, "Close", aqua)
`;

/** Bars that rise on every other one, so half of them meet the condition. */
function alternating(count: number): readonly ChartBar[] {
  const out: ChartBar[] = [];
  for (let i = 0; i < count; i += 1) {
    const open = 100 + i;
    const close = i % 2 === 0 ? open + 1 : open - 1;
    out.push({
      open,
      close,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      volume: 100,
      time: BASE_TIME + i * 60,
    });
  }
  return out;
}

/** A chart's context, with the newest bar's state spelled out. */
function contextOf(count: number, state: Partial<ChartCalcContext['barState']>): ChartCalcContext {
  return {
    barState: { isNew: true, isConfirmed: true, isRealtime: false, lastIndex: count - 1, ...state },
    timezone: 'Etc/UTC',
    now: () => BASE_TIME + count * 60,
  };
}

/** What one instance holds between calls: the settings object and the store. */
interface Instance {
  readonly settings: ChartSettings;
  readonly store: ChartStore;
}

function instance(): Instance {
  return { settings: {}, store: {} };
}

/** A full recompute, and the argument every hook after it is handed. */
function run(
  descriptor: ChartDescriptor,
  data: readonly ChartBar[],
  held: Instance,
  ctx: ChartCalcContext,
): ChartSurfaceContext {
  const values = descriptor.calc(data, held.settings, held.store, ctx);
  return { bars: data, values, settings: held.settings };
}

/**
 * The incremental path, which every descriptor built here offers.
 *
 * A tail run returns the bars from `from` onwards and a chart splices them onto
 * what it already holds, so the splice is done here too: a hook handed the tail
 * alone would be reading a table whose first entry is the newest bar.
 */
function tail(
  descriptor: ChartDescriptor,
  data: readonly ChartBar[],
  from: number,
  held: Instance,
  previous: ChartSurfaceContext,
  ctx: ChartCalcContext,
): ChartSurfaceContext {
  const served = descriptor.calcTail?.(data, held.settings, from, previous.values, held.store, ctx);
  assert.notEqual(served, null, 'the incremental path refused a run it was able to serve');
  const values: Record<string, (number | null)[]> = {};
  for (const key of Object.keys(served ?? {})) {
    const whole = [...(previous.values[key] ?? [])];
    const add = served?.[key] ?? [];
    for (let i = 0; i < add.length; i += 1) whole[from + i] = add[i] ?? null;
    values[key] = whole;
  }
  return { bars: data, values, settings: held.settings };
}

// Catches: a marker built as a column, one entry per bar with a blank on the
// bars that did not fire. A host handed that draws a marker on every bar of the
// history, which is the difference between a study and a mess.
test('a signal marks the bars its branch was taken and no others', () => {
  const descriptor = descriptorOfSource(MARKED);
  const data = alternating(10);
  const surface = run(descriptor, data, instance(), contextOf(10, {}));

  const markers = descriptor.markers?.(surface) ?? [];
  assert.equal(markers.length, 5, 'five of the ten bars rise');
  assert.deepEqual(
    markers.map((one) => one.time),
    [0, 2, 4, 6, 8].map((index) => data[index]?.time),
    'a marker is anchored to a time, not to an index that moves when history loads',
  );
  const first = markers[0] as ChartMarker;
  assert.equal(first.text, 'UP');
  assert.equal(first.shape, 'triangleUp', 'the declared shape, not a nearest guess');
  assert.equal(first.position, 'belowBar', 'the language\'s word in the chart\'s spelling');
  assert.equal(first.color, 'rgba(0, 255, 0, 1)');
  assert.equal(first.size, 'small');
});

// Catches: a marker crossing with the language's own spelling. A chart that
// draws `above` and `label` draws neither, and nothing anywhere says so.
test('a plate takes the side it sits on, and an unnamed colour the host\'s own', () => {
  const descriptor = descriptorOfSource(`version 1

study("Plates", overlay = true)

signal("hi")
plot(close, "Close")
`, { markerColor: 'rgba(1, 2, 3, 1)' });
  const data = alternating(2);
  const surface = run(descriptor, data, instance(), contextOf(2, {}));
  const first = (descriptor.markers?.(surface) ?? [])[0] as ChartMarker;
  assert.equal(first.position, 'aboveBar', 'the default side');
  assert.equal(first.shape, 'labelDown', 'a plate above the bar has its tail pointing down');
  assert.equal(first.color, 'rgba(1, 2, 3, 1)', 'the host\'s default, since the script named none');
});

// Catches: a marker drawn on a bar that is still moving. The adapter reads the
// channel the engine published, so an engine that published a deferred channel
// on an undecided bar would put the marker on the chart and take it off again.
test('a marker appears on the newest bar only once that bar has closed', () => {
  const descriptor = descriptorOfSource(MARKED);
  const data = alternating(9);
  const held = instance();
  const moving = run(descriptor, data, held, contextOf(9, { isConfirmed: false, isRealtime: true }));
  const at = (surface: ChartSurfaceContext): boolean =>
    (descriptor.markers?.(surface) ?? []).some((one) => one.time === data[8]?.time);
  assert.equal(at(moving), false, 'bar 8 rises and is still moving');

  assert.equal(
    at(tail(descriptor, data, 8, held, moving, contextOf(9, { isRealtime: true }))),
    true,
    'the same bar, confirmed',
  );
});

// Catches: a per-bar colour that ignores absence and paints every bar. An absent
// colour reaching a drawing surface is a gap: the bar keeps its own colour.
test('bar colouring and the background are columns of colours, null where none was painted', () => {
  const descriptor = descriptorOfSource(MARKED);
  const data = alternating(6);
  const surface = run(descriptor, data, instance(), contextOf(6, {}));

  const painted = descriptor.barColors?.(surface) ?? [];
  assert.equal(painted.length, 6, 'one entry per bar, which is what the chart indexes by');
  assert.equal(painted[0], 'rgba(0, 255, 0, 1)', 'a rising bar is painted');
  assert.equal(painted[1], null, 'a falling one keeps its own colour');
  const shaded = descriptor.background?.(surface) ?? [];
  assert.equal(
    shaded[0],
    'rgba(0, 255, 255, 0.09999999999999998)',
    'the alpha a fade asked for survives the crossing',
  );
  assert.equal(shaded[1], null);
});

// Catches: a study that paints being given the candles because it recomputed
// last. The candles are one object and the rule has to be answerable from the
// chart's own study order, the order a legend shows and a user reorders.
test('the candles are owned by the last study in the chart order that paints', () => {
  const painter = (): readonly (string | null)[] => [];
  assert.equal(candleOwner([]), undefined);
  assert.equal(candleOwner([{ id: 'a' }, { id: 'b' }]), undefined, 'nobody paints, nobody owns');
  assert.equal(candleOwner([{ id: 'a', barColors: painter }, { id: 'b' }]), 'a');
  assert.equal(
    candleOwner([{ id: 'a', barColors: painter }, { id: 'b', barColors: painter }]),
    'b',
    'the one added on top is the one the user just asked to see',
  );
  // Adding a study that paints nothing changes nothing, which is what makes the
  // answer stable between frames rather than a property of what ran last.
  assert.equal(
    candleOwner([{ id: 'a', barColors: painter }, { id: 'b', barColors: painter }, { id: 'c' }]),
    'b',
  );
});

// Catches: a grid collected per bar. Reading one grid for every bar of a long
// history in order to display the last one is the obvious trap, and it is
// invisible on ten bars.
test('a grid carries the last executed bar, and its size does not follow the history', () => {
  const descriptor = descriptorOfSource(MARKED);
  const short = run(descriptor, alternating(3), instance(), contextOf(3, {}));
  const long = run(descriptor, alternating(300), instance(), contextOf(300, {}));

  const one = descriptor.table?.(short) as ChartGrid;
  const many = descriptor.table?.(long) as ChartGrid;
  assert.equal(one.rows.length, 1, 'the declared row count, whatever the history is');
  assert.equal(many.rows.length, 1);
  assert.equal(one.rows[0]?.length, 2, 'and the declared column count');
  assert.equal(one.options?.position, 'top-left', 'the corner in the chart\'s spelling');
  assert.equal(one.rows[0]?.[0]?.text, 'close');
  assert.equal(one.rows[0]?.[0]?.align, 'right');
  assert.equal(many.rows[0]?.[1]?.text, '398.00', 'the newest bar, not the first');
});

// Catches: a grid handed over as the cells that were written. A chart draws rows
// of cells, so a grid whose second column was never written must still have one.
test('a cell nothing was written into is blank rather than missing', () => {
  const descriptor = descriptorOfSource(`version 1

study("Sparse")

panel = table("Panel", 2, 2)
cell(panel, 1, 1, "corner")
plot(close, "Close")
`);
  const surface = run(descriptor, alternating(3), instance(), contextOf(3, {}));
  const grid = descriptor.table?.(surface) as ChartGrid;
  assert.deepEqual(
    grid.rows.map((row) => row.map((one) => one.text)),
    [['', ''], ['', 'corner']],
  );
});

// Catches: a condition that is true on a bar that is still moving. The channel
// is deferred, so an adapter that read it before step 9 would raise an alert for
// a condition that was true halfway through the bar and false when it closed.
test('a watched condition holds on the bars its guard reached, and not while one moves', () => {
  const descriptor = descriptorOfSource(MARKED);
  const data = alternating(9);
  const held = instance();
  const moving = run(descriptor, data, held, contextOf(9, { isConfirmed: false, isRealtime: true }));
  const watched = (descriptor.alerts ?? [])[0] as ChartAlertSpec;

  assert.deepEqual(
    [0, 1, 2, 7, 8].map((index) => watched.when({ ...moving, index })),
    [true, false, true, false, false],
    'every rising bar but the one still moving',
  );
  const settled = tail(descriptor, data, 8, held, moving, contextOf(9, { isRealtime: true }));
  assert.equal(watched.when({ ...settled, index: 8 }), true, 'the same bar, confirmed');
});

// Catches: a subscription list built per bar, or not at all. The rows are part
// of the study's fixed shape and a user picks one before any bar has run.
test('the conditions a user subscribes to are declared before anything runs', () => {
  const descriptor = descriptorOfSource(MARKED);
  const declared = descriptor.alerts ?? [];
  assert.equal(declared.length, 1);
  assert.equal(declared[0]?.id, 'up', 'the script\'s own id, so a subscription survives an edit');
  assert.equal(declared[0]?.title, 'Went up');
});

// Catches: a hook reading whatever ran last. Two studies of one script recompute
// one after the other, and a single remembered run would give the second one's
// markers to the first.
test('two instances of one study read their own run', () => {
  const descriptor = descriptorOfSource(MARKED);
  const first = run(descriptor, alternating(4), instance(), contextOf(4, {}));
  const second = run(descriptor, alternating(10), instance(), contextOf(10, {}));
  assert.equal((descriptor.markers?.(first) ?? []).length, 2);
  assert.equal((descriptor.markers?.(second) ?? []).length, 5);
});

// Catches: a study with no alerts, no markers and no grid still declaring the
// hooks for them. A host that sees them offers a subscription row for a study
// that has none, and attaches a lifecycle for a transport nothing will use.
test('a study that declares none of them offers none of the hooks', () => {
  const descriptor = descriptorOfSource(`version 1

study("Plain")

plot(close, "Close")
`);
  assert.equal(descriptor.alerts, undefined);
  assert.equal(descriptor.markers, undefined);
  assert.equal(descriptor.table, undefined);
  assert.equal(descriptor.draws, undefined);
  assert.equal(descriptor.attach, undefined);
  assert.equal(descriptor.barColors, undefined);
  assert.equal(descriptor.background, undefined);
});
