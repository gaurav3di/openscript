/**
 * The volume studies of this half of the gate.
 *
 * Four independently written studies reproduced in OpenScript and compared
 * against a transcription of the published code they came from, column by
 * column and bar by bar.
 *
 * Three of the four are here for what they exercise beyond a column of numbers:
 * a running total that has to open at a base rather than at a gap, a study with
 * no warmup at all whose zero has to stay a zero, and bar colouring driven by
 * the study's own direction. The fourth is the same construction as the first
 * with one comparison reversed, which is the cheapest way to catch a branch
 * condition that was written the wrong way round: an inverted test produces the
 * other study's numbers, and only a comparison against both catches it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Ref, RefBar } from './primitives.js';
import { expMean, runningTotal } from './primitives.js';
import { CLOSE, REF_BARS, paintNames, plot, runStudy } from './surface.js';
import { asSeries, matches, matchesWithGaps } from './verdict.js';

/**
 * The ratcheting index both volume index studies are built from.
 *
 * Both start at a base of one on the first bar and compound the bar's
 * percentage price change into it, but only on the bars where volume moved the
 * right way. Every other bar carries the previous value forward unchanged.
 * There is no warmup: bar 0 is the base.
 */
function volumeIndex(bars: readonly RefBar[], on: 'falling' | 'rising'): Ref {
  const out = new Array<number>(bars.length);
  let index = 1;
  for (let i = 0; i < bars.length; i += 1) {
    if (i > 0) {
      const previous = (bars[i - 1] as RefBar).close;
      const here = (bars[i] as RefBar).volume;
      const before = (bars[i - 1] as RefBar).volume;
      const moved = on === 'falling' ? here < before : here > before;
      if (moved && previous !== 0 && Number.isFinite(previous)) {
        index *= (bars[i] as RefBar).close / previous;
      }
    }
    out[i] = index * 1000;
  }
  return out;
}

const MA_LENGTH = 20;

// Catches: an index that compounds on every bar rather than only on the bars
// volume moved the right way on, and an average taken over the unscaled index
// rather than over the plotted one. The first shows up as a curve where the
// reference is a staircase, the second as a line off by a factor of a thousand.
test('the falling volume index and its average match the reference', () => {
  const surface = runStudy('negative-volume-index', { maLen: MA_LENGTH });
  const index = volumeIndex(REF_BARS, 'falling');

  matches(plot(surface, 'Index'), asSeries(index), 0, 'falling volume index');
  matches(
    plot(surface, 'Index average'),
    asSeries(expMean(index, MA_LENGTH)),
    MA_LENGTH - 1,
    'falling volume index average',
  );
});

// Catches: the comparison written the wrong way round. That study is a real
// study, so it plots a plausible line, and nothing but a comparison against
// both of them says which one is on the chart.
test('the rising volume index and its average match the reference', () => {
  const surface = runStudy('positive-volume-index', { maLen: MA_LENGTH });
  const index = volumeIndex(REF_BARS, 'rising');

  matches(plot(surface, 'Index'), asSeries(index), 0, 'rising volume index');
  matches(
    plot(surface, 'Index average'),
    asSeries(expMean(index, MA_LENGTH)),
    MA_LENGTH - 1,
    'rising volume index average',
  );
});

// Catches: a running total that starts at the first bar it has a term for
// rather than at its base. The two differ by exactly one bar and by nothing
// else, which is the shape of mistake a value comparison alone reports as a
// single bar of noise and a warmup assertion reports as what it is.
test('the price volume trend matches the reference from its base bar', () => {
  const surface = runStudy('price-volume-trend');

  const term = new Array<number>(REF_BARS.length).fill(NaN);
  for (let i = 1; i < REF_BARS.length; i += 1) {
    const previous = (REF_BARS[i - 1] as RefBar).close;
    if (previous === 0 || !Number.isFinite(previous)) continue;
    term[i] = (((REF_BARS[i] as RefBar).close - previous) / previous) * (REF_BARS[i] as RefBar).volume;
  }
  matches(plot(surface, 'Trend'), asSeries(runningTotal(term)), 0, 'price volume trend');
});

// Catches: bar colouring that reads the wrong direction, and a colour left
// painted on a bar the study said nothing about. The comparison is against
// colour names rather than channels, so a failure names the colour a reader
// would see.
test('the price volume trend colours each bar by the direction of its own total', () => {
  const surface = runStudy('price-volume-trend');
  const drawn = plot(surface, 'Trend');

  const expected = drawn.map((value, bar) => {
    const before = bar === 0 ? null : drawn[bar - 1] ?? null;
    if (value === null || before === null) return null;
    if (value > before) return 'lime';
    if (value < before) return 'red';
    return null;
  });
  assert.deepEqual(paintNames(surface.barColors, ['lime', 'red']), expected, 'trend bar colours');
});

// Catches: a study that treats its own zero as absence. Net volume is defined
// on every bar including bar 0 and including an unchanged close, and a warmup
// assertion is the only thing that separates "zero" from "nothing here".
test('net volume matches the reference on every bar, bar 0 included', () => {
  const surface = runStudy('net-volume');

  const expected = new Array<number>(REF_BARS.length).fill(0);
  for (let i = 1; i < REF_BARS.length; i += 1) {
    const moved = (REF_BARS[i] as RefBar).close - (REF_BARS[i - 1] as RefBar).close;
    const here = (REF_BARS[i] as RefBar).volume;
    expected[i] = moved > 0 ? here : moved < 0 ? -here : 0;
  }
  matches(plot(surface, 'Net volume'), asSeries(expected), 0, 'net volume');
});

// Catches: a colour column that answers for a bar the script painted nothing
// on. An unchanged close takes the third arm, which is a real colour rather
// than absence, so every bar of this study is painted and a gap is a defect.
test('net volume paints every bar, and the sign decides which colour', () => {
  const surface = runStudy('net-volume');
  const drawn = plot(surface, 'Net volume');

  const expected = drawn.map((value) => {
    if (value === null) return null;
    return value > 0 ? 'lime' : value < 0 ? 'red' : 'silver';
  });
  assert.deepEqual(
    paintNames(surface.barColors, ['lime', 'red', 'silver']),
    expected,
    'net volume bar colours',
  );
});

// Catches: a close that is compared against the wrong bar. The fixture has a
// flat stretch where six closes repeat, so the zero arm is reached on real bars
// and not only on bar 0, and a study comparing against the wrong neighbour
// would sign those bars instead of zeroing them.
test('the fixture reaches the unchanged arm on bars other than the first', () => {
  const flat: number[] = [];
  for (let i = 1; i < CLOSE.length; i += 1) {
    if (CLOSE[i] === CLOSE[i - 1]) flat.push(i);
  }
  assert.notEqual(flat.length, 0, 'the fixture should hold a flat stretch');
  const surface = runStudy('net-volume');
  const drawn = plot(surface, 'Net volume');
  matchesWithGaps(
    flat.map((bar) => drawn[bar] ?? null),
    flat.map(() => 0),
    'net volume over the flat stretch',
  );
});
