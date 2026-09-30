/**
 * A study the chart computes on bars it does not draw.
 *
 * A chart that transforms its series into elements that are not one per bar,
 * bricks of a fixed size for instance, can run a study on the bars the host fed
 * it rather than on the elements it draws. It then calls the calculation with
 * the host's bars and reads the returned table onto its elements: element `j`
 * takes every column's value at the source bar it was completed on, and a
 * source bar that completed two elements is read twice. Every hook after that
 * is handed the element's index and the sampled table.
 *
 * So a hook that reads a column at the index it was handed reads the right bar
 * by construction, and a hook that reads anything else at that index reads
 * whichever bar of the run happens to share the element's position. The alert
 * message is the one hook that reads something other than a column: the string
 * a bar published lives in the run record, indexed by the run's own bars. The
 * table therefore carries the run's bar index as a column of its own, which the
 * chart samples like any other, and the message is read at the bar it names.
 *
 * The sampling here is the chart's own rule written out, one line of it, so the
 * test hands each hook exactly what such a chart would.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ChartAlertSpec,
  ChartBar,
  ChartCalcContext,
  ChartSettings,
  ChartValues,
} from '../../../src/adapters/charts/index.js';
import { BASE_TIME, descriptorOfSource } from './support.js';

const WATCHED = `version 1

study("Watched", overlay = true, precision = 2)

if close > open
    alert("up at " + text(close, 2), id = "up", title = "Went up")

plot(close, "Close")
`;

/** Bars that rise on every even one, each closing one point away from its open. */
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

function contextOf(count: number): ChartCalcContext {
  return {
    barState: { isNew: true, isConfirmed: true, isRealtime: false, lastIndex: count - 1 },
    timezone: 'Etc/UTC',
    now: () => BASE_TIME + count * 60,
  };
}

/** Every column read at the source bar each element was completed on. */
function sampled(values: ChartValues, sourceIndex: readonly number[]): ChartValues {
  const out: Record<string, readonly (number | null)[]> = {};
  for (const key of Object.keys(values)) {
    const column = values[key] ?? [];
    out[key] = sourceIndex.map((at) => column[at] ?? null);
  }
  return out;
}

/** The message the script computed on one source bar, as the script spells it. */
function upAt(bar: ChartBar | undefined): string {
  return `up at ${(bar?.close ?? Number.NaN).toFixed(2)}`;
}

// Catches a message read from the run record at the index the chart handed the
// hook. On a sampled table that index is an element's, and the run record is
// indexed by source bar, so an element whose position holds a falling source bar
// falls back to the title and one whose position holds another rising bar
// carries that bar's number. Both happen below: elements 3 and 7 sit where
// falling bars 3 and 7 are, and element 6 sits where rising bar 6 is while
// reading source bar 8.
test('an alert message on a table sampled onto elements is the source bar\'s own', () => {
  const descriptor = descriptorOfSource(WATCHED);
  const data = alternating(10);
  const settings: ChartSettings = {};
  const values = descriptor.calc(data, settings, {}, contextOf(data.length));

  // Bar 2 completes two elements and bar 8 two more; bars 3, 5, 6 and 9 none.
  const sourceIndex = [0, 1, 2, 2, 4, 7, 8, 8];
  const elements = sourceIndex.map((at, j) => ({ ...(data[at] as ChartBar), time: BASE_TIME + j }));
  const table = sampled(values, sourceIndex);
  const watched = (descriptor.alerts ?? [])[0] as ChartAlertSpec;

  const fired: number[] = [];
  const messages: string[] = [];
  for (let j = 0; j < elements.length; j += 1) {
    const ctx = { bars: elements, values: table, settings, index: j };
    if (!watched.when(ctx)) continue;
    fired.push(j);
    messages.push(watched.message?.(ctx) ?? '');
  }

  assert.deepEqual(fired, [0, 2, 3, 4, 6, 7], 'the elements whose source bar rose');
  assert.deepEqual(
    messages,
    fired.map((j) => upAt(data[sourceIndex[j] ?? -1])),
    'each element carries the message its own source bar computed',
  );
});

// Catches a bar column that is written relative to the first bar a tail served,
// or not written on the tail at all. A chart splices a tail onto the table it
// holds by position, so a row the tail wrote as 0 would send the next alert to
// the first bar of the history.
test('the bar column is the run\'s own index, over a full run and over a tail', () => {
  const descriptor = descriptorOfSource(WATCHED);
  const data = alternating(11);
  const settings: ChartSettings = {};
  const store = {};
  const history = data.slice(0, 9);
  const full = descriptor.calc(history, settings, store, contextOf(history.length));
  assert.deepEqual(full['openscript:bar'], [0, 1, 2, 3, 4, 5, 6, 7, 8]);

  const served = descriptor.calcTail?.(data, settings, 8, full, store, contextOf(data.length));
  assert.deepEqual(served?.['openscript:bar'], [8, 9, 10], 'the tail writes absolute indices');

  // The spliced table, read the way the chart reads it after a live bar.
  const spliced: ChartValues = Object.fromEntries(
    Object.keys(full).map((key) => [key, [...(full[key] ?? []).slice(0, 8), ...(served?.[key] ?? [])]]),
  );
  const watched = (descriptor.alerts ?? [])[0] as ChartAlertSpec;
  const ctx = { bars: data, values: spliced, settings, index: 10 };
  assert.equal(watched.when(ctx), true);
  assert.equal(watched.message?.(ctx), upAt(data[10]));
});
