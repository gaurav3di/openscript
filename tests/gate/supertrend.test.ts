/**
 * The trailing band, end to end, at three parameter sets.
 *
 * The only study in the gate that carries state of its own across bars, and
 * therefore the only one where an engine that re-executed a bar without
 * restoring its checkpoint would produce a plausible wrong line rather than an
 * obvious one. Three things are pinned here.
 *
 * **The carry-forward.** The upper rail may only fall while price stays below
 * it and the lower may only rise while price stays above it. An implementation
 * that recomputed both outright every bar draws a line that wanders back and
 * forth and flips on bars this one does not.
 *
 * **The warmup, one bar after the average range has a value.** The carry and
 * the flip test both read the previous bar's close and the previous bar's
 * rails, and on the bar the average range is first complete there is neither.
 * A value reported there would come from the implementation's seeding rule
 * rather than from the data. The reference does report it, and that one bar is
 * the whole of the disagreement between them.
 *
 * **The direction, read off the chart rather than off a number.** The script
 * draws the band in the colour of the side it is protecting, so which of the
 * two coloured columns carries a value on a bar is the direction. Asserting it
 * that way tests what a trader actually sees.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertWarmup } from '../stdlib/support.js';

import { bandsOf, directionsOf, trailingBand } from './reference.js';
import { REF_BARS, deviation, plot, plotsOf } from './support.js';

const SETS = [
  { factor: 3, atrLen: 10 },
  { factor: 2, atrLen: 7 },
  { factor: 4, atrLen: 14 },
] as const;

for (const set of SETS) {
  const named = `${set.factor} times the range over ${set.atrLen} bars`;

  // Catches: a band that does not carry forward, which disagrees with the
  // reference from the first bar price fails to break the rail it is following,
  // and a flip test taken against the rail this bar just produced rather than
  // against the one that stood on the previous bar, which makes every bar its
  // own trigger.
  test(`the trailing band at ${named} matches the reference from bar atrLen`, () => {
    const columns = plotsOf('supertrend', { ...set });
    const trail = trailingBand(REF_BARS, set.factor, set.atrLen);
    const expected = bandsOf(trail);

    const band = plot(columns, 'Band');
    assertWarmup(band, set.atrLen, `trailing band at ${named}`);

    // The reference reports its own seed bar and the specification does not, so
    // that one bar is compared as a difference and the rest as numbers.
    assert.notEqual(
      expected[set.atrLen - 1],
      null,
      `${named}: the reference should report its seed bar`,
    );
    assert.deepEqual(
      band.slice(set.atrLen),
      expected.slice(set.atrLen),
      `trailing band at ${named}, from bar ${set.atrLen}`,
    );
    assert.equal(
      deviation(band.slice(set.atrLen), expected.slice(set.atrLen)).firstAt,
      -1,
      `${named}: nothing should differ after the seed bar`,
    );
  });

  // Catches: a direction reported with the signs the other way round, and a
  // coloured column that carries the band on the bars of the other trend. Both
  // draw a line of the right shape in the wrong colour, which is the one defect
  // in this study that a comparison of the band alone cannot see.
  test(`the coloured columns at ${named} carry the band on the reference's own side`, () => {
    const columns = plotsOf('supertrend', { ...set });
    const trail = trailingBand(REF_BARS, set.factor, set.atrLen);
    const direction = directionsOf(trail);
    const band = bandsOf(trail);

    const long = plot(columns, 'Band, long');
    const short = plot(columns, 'Band, short');

    let flips = 0;
    for (let bar = 0; bar < long.length; bar += 1) {
      if (bar < set.atrLen) {
        assert.equal(long[bar], null, `bar ${bar} is before the warmup and should be absent`);
        assert.equal(short[bar], null, `bar ${bar} is before the warmup and should be absent`);
        continue;
      }
      const side = direction[bar];
      assert.equal(long[bar], side === -1 ? band[bar] : null, `the long column on bar ${bar}`);
      assert.equal(short[bar], side === 1 ? band[bar] : null, `the short column on bar ${bar}`);
      if (bar > set.atrLen && side !== direction[bar - 1]) flips += 1;
    }
    assert.ok(flips > 0, `${named}: the fixture should contain at least one flip`);
  });
}

/**
 * Exactly one of the two coloured columns has a value on every bar from the
 * warmup onward.
 *
 * Catches a ternary that returned the band on both branches, or absence on
 * both. The first draws two lines on top of each other and a fill between them
 * that is never empty; the second draws nothing at all from a study whose band
 * column is perfectly correct, so every comparison above still passes.
 */
test('the band is drawn in exactly one colour on every bar it exists', () => {
  for (const set of SETS) {
    const columns = plotsOf('supertrend', { ...set });
    const band = plot(columns, 'Band');
    const long = plot(columns, 'Band, long');
    const short = plot(columns, 'Band, short');

    for (let bar = 0; bar < band.length; bar += 1) {
      const drawn = (long[bar] === null ? 0 : 1) + (short[bar] === null ? 0 : 1);
      assert.equal(
        drawn,
        band[bar] === null ? 0 : 1,
        `length ${set.atrLen}: bar ${bar} drew ${drawn} coloured segments`,
      );
    }
  }
});
