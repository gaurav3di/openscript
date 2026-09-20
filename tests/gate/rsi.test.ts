/**
 * The strength reading, end to end, at three lengths.
 *
 * This is the study whose warmup is most often wrong by one bar, and the reason
 * is worth stating: the reading is taken over `len` changes, a change needs two
 * bars, so the first honest value is at bar `len` rather than at bar `len - 1`
 * where a reader counting levels would put it. Every entry in the library that
 * consumes changes rather than levels carries the same extra bar.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertWarmup } from '../stdlib/support.js';

import { asSeries, strength } from './reference.js';
import { figuresIn } from '../stdlib/section-20.js';
import { CLOSE, plot, plotsOf } from './support.js';

const LENGTHS = [7, 14, 21] as const;

for (const len of LENGTHS) {
  // Catches: the off-by-one that puts the first reading at bar `len - 1`. An
  // implementation that smoothed the change series as though it began at bar 0
  // lands one bar early here and the warmup line fails before any number is
  // compared. Three lengths, because an implementation that is early by one bar
  // at every length and an implementation hard coded to bar 14 both pass a
  // single parameter set.
  test(`the strength reading at length ${len} matches the reference to the last decimal`, () => {
    const drawn = plot(plotsOf('rsi', { len }), 'Strength');
    const expected = asSeries(strength(CLOSE, len));

    assertWarmup(drawn, len, `strength at length ${len}`);
    assert.deepEqual(drawn, expected, `strength at length ${len}`);
  });
}

/**
 * The reading stays inside the scale it declares.
 *
 * Catches a smoothing that consumed absence as zero. A zero average fall sends
 * the ratio to infinity and the reading off the top of its scale, which is a
 * number the study's own range in `study(..., range = [0, 100])` says cannot
 * happen, and which a chart would silently rescale around rather than report.
 */
test('the strength reading stays between 0 and 100 on every bar it has a value', () => {
  for (const len of LENGTHS) {
    const drawn = plot(plotsOf('rsi', { len }), 'Strength');
    for (let bar = 0; bar < drawn.length; bar += 1) {
      const value = drawn[bar];
      if (value === null || value === undefined) continue;
      assert.ok(
        value >= 0 && value <= 100,
        `length ${len}: bar ${bar} read ${value}, which is outside the declared range`,
      );
    }
  }
});

/**
 * The fixture reaches both ends of the scale, so the comparison above is a
 * comparison of something.
 *
 * Catches a fixture that drifted into a straight line, where every reading
 * would sit near the middle and an implementation with the rise and the fall
 * the wrong way round would still pass every assertion above.
 */
test('the fixture drives the reading well above and well below the middle', () => {
  const drawn = plot(plotsOf('rsi', { len: 14 }), 'Strength');
  const present = drawn.filter((value): value is number => value !== null && value !== undefined);
  assert.ok(Math.max(...present) > 70, 'the fixture should reach the upper band');
  assert.ok(Math.min(...present) < 40, 'the fixture should fall well below the middle');
});

/**
 * What `stdlib.md` 20.4's arrangement paragraph actually constrains.
 *
 * That paragraph used to say that rounding the ratio into a named intermediate
 * and then writing `100 - (100 / (1 + ratio))` was "the same expression with an
 * extra rounding in it, and is also not this one". There is no extra rounding.
 * Every operation already rounds its result to binary64, and `compiled-program.md`
 * 8.1 leaves no wider register for an unnamed intermediate to be kept in, so the
 * two spellings are the same four operations in the same order. Section 20 is
 * the manifest a second engine implements from, and that sentence gave its
 * reader two ways to be wrong: change correct code to avoid a difference that
 * does not exist, or write a conformance vector separating two arrangements no
 * conforming engine can tell apart.
 *
 * Both halves are measured here rather than argued, because this is exactly the
 * kind of claim that is checked once and believed forever.
 */
const READINGS = {
  /** The arrangement 20.4 fixes, written out as the page writes it. */
  written: (up: number, down: number): number =>
    down === 0 ? 100 : 100 - 100 / (1 + up / down),
  /** The same line with the ratio named first, which 20.4 used to refuse. */
  named: (up: number, down: number): number => {
    if (down === 0) return 100;
    const ratio = up / down;
    return 100 - 100 / (1 + ratio);
  },
  /** The arrangement 20.4 names and refuses. */
  refused: (up: number, down: number): number =>
    up + down === 0 ? 100 : (100 * up) / (up + down),
} as const;

/** The reading over the fixture with one of the three last lines. */
function readings(values: readonly number[], len: number, last: (u: number, d: number) => number): number[] {
  const out: number[] = [];
  let up = 0;
  let down = 0;
  for (let bar = 1; bar <= len; bar += 1) {
    const change = (values[bar] as number) - (values[bar - 1] as number);
    if (change >= 0) up += change;
    else down -= change;
  }
  let averageUp = up / len;
  let averageDown = down / len;
  out.push(last(averageUp, averageDown));
  for (let bar = len + 1; bar < values.length; bar += 1) {
    const change = (values[bar] as number) - (values[bar - 1] as number);
    averageUp = (averageUp * (len - 1) + (change > 0 ? change : 0)) / len;
    averageDown = (averageDown * (len - 1) + (change < 0 ? -change : 0)) / len;
    out.push(last(averageUp, averageDown));
  }
  return out;
}

/** How many of two equal length readings disagree, bit for bit. */
function apart(one: readonly number[], other: readonly number[]): number {
  let found = 0;
  for (let bar = 0; bar < one.length; bar += 1) {
    if (!Object.is(one[bar], other[bar])) found += 1;
  }
  return found;
}

/**
 * Catches an engine that writes the last line as `100 * up / (up + down)`.
 *
 * The counts are the ones 20.4 prints, so a page that drifts from the fixture
 * fails here rather than going on being quoted.
 */
test('the arrangement 20.4 refuses gives different numbers on this fixture', () => {
  const printed = figuresIn(
    /100 \* up \/ \(up \+ down\).*?it differs from these lines on (\d+) of the (\d+) values at length (\d+), (\d+) of the (\d+) at length (\d+) and (\d+) of the (\d+) at length (\d+)/,
    9,
  );
  for (let which = 0; which < 3; which += 1) {
    const [differed, total, len] = printed.slice(which * 3, which * 3 + 3) as [
      number,
      number,
      number,
    ];
    const written = readings(CLOSE, len, READINGS.written);
    const refused = readings(CLOSE, len, READINGS.refused);
    assert.equal(written.length, total, `the values the page counts at length ${len}`);
    assert.equal(apart(written, refused), differed, `at length ${len}`);
  }
});

/**
 * And the other half: naming the ratio changes nothing, which is why 20.4 no
 * longer says it does.
 *
 * This is a statement about `compiled-program.md` 8.1's arithmetic rather than
 * about this library: on a platform that kept an unnamed intermediate in a
 * wider register the two would part company and this would fail, which is the
 * right thing for it to do, because such a platform is not one a conforming
 * engine runs on.
 */
test('naming the ratio first changes no value', () => {
  for (const len of LENGTHS) {
    const written = readings(CLOSE, len, READINGS.written);
    const named = readings(CLOSE, len, READINGS.named);
    assert.equal(apart(written, named), 0, `naming the ratio mattered at length ${len}`);
    assert.deepEqual(
      plot(plotsOf('rsi', { len }), 'Strength').filter((one) => one !== null),
      written,
      `the engine's own column at length ${len}`,
    );
  }
});
