/**
 * Studies that put a frame, a rail or a plate on the chart and keep it there.
 *
 * Three things are under test that no column comparison reaches. An object
 * **mutated** on every bar against an object **replaced** on every bar: the two
 * draw the same picture and only one of them leaves the chart holding three
 * objects instead of two hundred and forty. A reading anchored to one bar
 * rather than to a window, whose value on bar forty depends on every bar before
 * it. And a windowed extreme taken over a reading that is itself still warming
 * up, which is where this suite records its second disagreement with the
 * sibling packages.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertWarmup } from '../../stdlib/support.js';

import {
  asSeries,
  averageRange,
  blank,
  fixedText,
  has,
  windowHigh,
  windowLow,
  windowMean,
  windowStdev,
} from './arithmetic.js';
import {
  CLOSE,
  HIGH,
  LOW,
  REF_BARS,
  OPEN,
  VOLUME,
  anchorText,
  assertColumn,
  assertFirstAt,
  column,
  faded,
  marker,
  paint,
  runStudy,
  spellDrawings,
} from './harness.js';

const BOX_STYLE = ['color', 'fillColor', 'opacity', 'width', 'text', 'textColor', 'tooltip'];
const LABEL_STYLE = ['text', 'color', 'textColor', 'align', 'tooltip'];

/**
 * Catches: an anchored mean restarted on a bar it should not be, which is
 * invisible on a chart because the line still looks like a mean; and a rail or
 * a plate created again on every bar instead of moved.
 */
test('a mean anchored to the first bar, with a rail and a plate following it', () => {
  const run = runStudy('anchored-mean');
  const typical = HIGH.map(
    (high, bar) => (high + (LOW[bar] as number) + (CLOSE[bar] as number)) / 3,
  );
  const expected = blank(CLOSE.length);
  let flow = 0;
  let traded = 0;
  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    flow += (typical[bar] as number) * (VOLUME[bar] as number);
    traded += VOLUME[bar] as number;
    if (traded !== 0) expected[bar] = flow / traded;
  }

  assertColumn(column(run, 'Anchored mean'), asSeries(expected), 'anchored mean');
  assertFirstAt(asSeries(expected), 0, 'an anchored mean starts on the bar it is anchored to');

  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    const level = expected[bar] as number;
    const drawn = run.drawings[bar] ?? [];
    assert.equal(drawn.length, 2, `bar ${bar}: one rail and one plate, however many bars have run`);
    assertColumn(
      spellDrawings(drawn.slice(0, 1), ['color', 'width']),
      [
        `line[${anchorText(0, expected[0] as number)} ${anchorText(bar, level)}]` +
          ` color=${paint('aqua')} width=2`,
      ],
      `the rail on bar ${bar}`,
    );
    assertColumn(
      spellDrawings(drawn.slice(1), ['text', 'color', 'textColor']),
      [
        `label[${anchorText(bar, level)}] text=${fixedText((CLOSE[bar] as number) - level, 2)}` +
          ` color=${paint('aqua')} textColor=${paint('black')}`,
      ],
      `the plate on bar ${bar}`,
    );
  }
});

/**
 * Catches: a band whose width is measured against its own rails rather than
 * against its middle, which is not comparable across price levels; and a marker
 * on every bar the reading sits at its window's low, where the window itself
 * has not filled.
 *
 * **This study records a disagreement with the sibling.** The sibling's windowed
 * extreme skips the bars a series has no value on and answers from whichever of
 * the window is finite; this library refuses a window that is not complete,
 * which is `stdlib.md` section 2.4's absence propagation. Both answer the same
 * numbers once the window is clear of the warmup, and the gate asserts exactly
 * that: equality from the first bar the whole window is real, and absence
 * before it where the sibling would have drawn.
 */
test('how wide the rails are as a share of their middle, and its own extremes', () => {
  const len = 20;
  const mult = 2;
  const reach = 20;
  const run = runStudy('bandwidth-squeeze', { settings: { len, mult, reach } });
  const basis = windowMean(CLOSE, len);
  const spread = windowStdev(CLOSE, len);
  const width = blank(CLOSE.length);
  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    if (!has(basis[bar]) || !has(spread[bar]) || basis[bar] === 0) continue;
    const upper = (basis[bar] as number) + mult * (spread[bar] as number);
    const lower = (basis[bar] as number) - mult * (spread[bar] as number);
    width[bar] = ((upper - lower) / (basis[bar] as number)) * 100;
  }

  assertColumn(column(run, 'Bandwidth'), asSeries(width), 'bandwidth');
  assertWarmup(column(run, 'Bandwidth'), len - 1, 'bandwidth');

  // The strict reading: a window holding one absent bar has no extreme.
  const widest = windowHigh(width, reach);
  const narrowest = windowLow(width, reach);
  assertColumn(column(run, 'Widest'), asSeries(widest), 'widest');
  assertColumn(column(run, 'Narrowest'), asSeries(narrowest), 'narrowest');
  assertWarmup(column(run, 'Widest'), len - 1 + reach - 1, 'widest');

  // The sibling's reading, which answers as soon as the window holds anything
  // finite. The two agree from the bar the whole window is real, and the bars
  // between are where they do not.
  const skipping = blank(CLOSE.length);
  for (let bar = reach - 1; bar < CLOSE.length; bar += 1) {
    let best = Number.NEGATIVE_INFINITY;
    for (let back = bar - reach + 1; back <= bar; back += 1) {
      const value = width[back] as number;
      if (Number.isFinite(value) && value > best) best = value;
    }
    if (Number.isFinite(best)) skipping[bar] = best;
  }
  const disagreed: number[] = [];
  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    const ours = widest[bar];
    const theirs = skipping[bar];
    if (Number.isFinite(ours) && Number.isFinite(theirs)) {
      assert.equal(ours, theirs, `bar ${bar}: the two extremes should agree once the window is real`);
      continue;
    }
    if (Number.isFinite(theirs)) disagreed.push(bar);
  }
  assert.deepEqual(
    [disagreed[0], disagreed[disagreed.length - 1], disagreed.length],
    [reach - 1, len - 1 + reach - 2, len - 1],
    'the two part exactly over the bars whose window still holds a warmup bar',
  );

  const squeezed = width.map(
    (one, bar) => Number.isFinite(narrowest[bar]) && one === (narrowest[bar] as number),
  );
  assertColumn(
    marker(run, 0).text,
    squeezed.map((one) => (one ? 'SQUEEZE' : null)),
    'the squeeze marks',
  );
});

/**
 * Catches: a band drawn between the wrong pair of plots, which is the mistake a
 * four column ribbon makes visible and a two column one cannot.
 */
test('four means with the region between each neighbouring pair shaded', () => {
  const lengths = [5, 10, 20, 40] as const;
  const run = runStudy('mean-ribbon', {
    settings: {
      firstLen: lengths[0],
      secondLen: lengths[1],
      thirdLen: lengths[2],
      fourthLen: lengths[3],
    },
  });
  const titles = ['First', 'Second', 'Third', 'Fourth'] as const;
  for (let index = 0; index < titles.length; index += 1) {
    const len = lengths[index] as number;
    assertColumn(
      column(run, titles[index] as string),
      asSeries(windowMean(CLOSE, len)),
      `${titles[index]} mean`,
    );
    assertWarmup(column(run, titles[index] as string), len - 1, `${titles[index]} mean`);
  }

  assert.equal(run.bands.length, 3, 'three bands over four columns');
  assert.deepEqual(
    run.bands.map((one) => one.between),
    [
      ['p0', 'p1'],
      ['p1', 'p2'],
      ['p2', 'p3'],
    ],
    'each band joins its own neighbouring pair',
  );
});

/**
 * Catches: a gap measured against this bar's own close rather than the previous
 * one, which marks nothing and reads as a study that never fires; and a pane
 * shaded during the warmup, before there is a range to measure the gap against.
 */
test('the bars that opened away from the previous close', () => {
  const rangeLen = 14;
  const share = 0.5;
  const run = runStudy('gap-plates', { settings: { rangeLen, share } });
  const range = averageRange(REF_BARS, rangeLen);
  const step = OPEN.map((open, bar) => (bar === 0 ? Number.NaN : open - (CLOSE[bar - 1] as number)));
  const up = step.map(
    (one, bar) => has(range[bar]) && Number.isFinite(one) && one > share * (range[bar] as number),
  );
  const down = step.map(
    (one, bar) => has(range[bar]) && Number.isFinite(one) && one < -share * (range[bar] as number),
  );

  assertColumn(
    column(run, 'Gap threshold'),
    asSeries(range.map((one) => one * share)),
    'the gap threshold',
  );
  assertColumn(
    marker(run, 0).text,
    up.map((one) => (one ? 'GAP UP' : null)),
    'gaps upward',
  );
  assertColumn(
    marker(run, 1).text,
    down.map((one) => (one ? 'GAP DOWN' : null)),
    'gaps downward',
  );
  assertColumn(
    run.background,
    up.map((one, bar) => (one ? faded('lime', 85) : down[bar] === true ? faded('red', 85) : 'none')),
    'the shading behind the gap bars',
  );
  assert.equal(
    up.filter(Boolean).length + down.filter(Boolean).length > 0,
    true,
    'the fixture has a gap in it, which is what makes this a test',
  );
});

/**
 * Catches: objects replaced without the old ones being deleted, which leaves a
 * chart holding three per bar rather than three; and a plate whose caption was
 * spelled once at creation.
 */
test('a frame and two plates, all three replaced on every bar', () => {
  const len = 15;
  const run = runStudy('lookback-box', { settings: { len } });
  const top = windowHigh(HIGH, len);
  const bottom = windowLow(LOW, len);

  for (let bar = 0; bar < CLOSE.length; bar += 1) {
    const drawn = run.drawings[bar] ?? [];
    if (!has(top[bar]) || !has(bottom[bar])) {
      assert.equal(drawn.length, 0, `bar ${bar}: nothing drawn before the window fills`);
      continue;
    }
    const high = top[bar] as number;
    const low = bottom[bar] as number;
    assert.equal(drawn.length, 3, `bar ${bar}: three objects at a time, not three per bar`);
    assertColumn(
      spellDrawings(drawn.slice(0, 1), BOX_STYLE),
      [
        `box[${anchorText(bar - (len - 1), high)} ${anchorText(bar, low)}]` +
          ` color=${paint('teal')} fillColor=${faded('teal', 94)} opacity=0.12 width=1` +
          ` text= textColor=${paint('white')} tooltip=`,
      ],
      `frame on bar ${bar}`,
    );
    assertColumn(
      spellDrawings(drawn.slice(1), LABEL_STYLE),
      [
        `label[${anchorText(bar, high)}] text=${fixedText(high, 2)} color=${paint('teal')}` +
          ` textColor=${paint('black')} align=center tooltip=`,
        `label[${anchorText(bar, low)}] text=${fixedText(low, 2)} color=${paint('teal')}` +
          ` textColor=${paint('black')} align=center tooltip=`,
      ],
      `plates on bar ${bar}`,
    );
  }
});
