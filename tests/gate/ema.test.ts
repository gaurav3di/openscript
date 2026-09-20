/**
 * The exponential mean, end to end, at three lengths.
 *
 * The plainest study in the language and the one the rest of the gate rests on:
 * the strength reading, the convergence and the trailing band are all built out
 * of a seeded recurrence, so a mean that starts one bar early makes every one
 * of them start early too, and each would then look like its own separate
 * defect.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Series } from '../../src/core/stdlib/index.js';
import { assertWarmup } from '../stdlib/support.js';

import { figuresIn } from '../stdlib/section-20.js';

import { asSeries, seededMean } from './reference.js';
import { CLOSE, plot, plotsOf } from './support.js';

/**
 * Three lengths, not one, and one of them long enough that the warmup takes up
 * most of the fixture.
 *
 * Catches a warmup written as a constant rather than derived from the length,
 * which a single parameter set cannot see: an implementation hard coded to bar
 * 19 passes at length 20 and fails at both of the others.
 */
const LENGTHS = [9, 20, 50] as const;

for (const len of LENGTHS) {
  // Catches: an average seeded from bar 0 rather than from the mean of the
  // first `len` values. That implementation has a value at bar 0, so it fails
  // on the warmup line before the comparison is reached, and it stays
  // materially wrong for many bars after the seed as well.
  test(`the mean at length ${len} matches the reference to the last decimal`, () => {
    const drawn = plot(plotsOf('ema', { len }), 'Mean');
    const expected = asSeries(seededMean(CLOSE, len));

    assertWarmup(drawn, len - 1, `mean at length ${len}`);
    assert.deepEqual(drawn, expected, `mean at length ${len}`);
  });
}

/**
 * The same study over a different source, driven from the settings a dialog
 * holds rather than from the script.
 *
 * Catches an engine that reads the input's declared default instead of the
 * value the host stored: the column would be the close reading whatever the
 * dialog said, and every assertion above would still pass because all of them
 * leave the source alone.
 */
test('a source chosen in the settings is the series the mean is taken over', () => {
  const overHigh = plot(plotsOf('ema', { len: 20, src: 'high' }), 'Mean');
  const overClose = plot(plotsOf('ema', { len: 20 }), 'Mean');

  assertWarmup(overHigh, 19, 'mean over the high');
  assert.notDeepEqual(overHigh, overClose, 'the two sources should give different lines');
});

/**
 * What `stdlib.md` 20.3's arrangement paragraph actually constrains.
 *
 * That paragraph used to end: "The new value is multiplied first and the
 * running value second, and the two products are added in that order." Binary64
 * multiplication and addition are both commutative, so the sentence forbade
 * nothing at all: writing the step the other way round gives the same eighty
 * values, and an implementer reading it was sent to check the half that cannot
 * differ. Section 20 is the manifest a second engine implements from, and a
 * sentence that cannot bite costs that reader the time the whole section exists
 * to save them.
 *
 * Both halves are measured here rather than argued, and both are run every
 * release, because this is the kind of claim that is checked once and then
 * believed forever.
 */
const STEPS = {
  /** The arrangement 20.3 fixes. */
  written: (len: number) => {
    const weight = 2 / (len + 1);
    const rest = 1 - weight;
    return (running: number, value: number): number => value * weight + running * rest;
  },
  /** The same two products, written in the other order. */
  swapped: (len: number) => {
    const weight = 2 / (len + 1);
    const rest = 1 - weight;
    return (running: number, value: number): number => running * rest + value * weight;
  },
  /** The arrangement 20.3 now names and refuses. */
  incremental: (len: number) => {
    const weight = 2 / (len + 1);
    return (running: number, value: number): number => running + (value - running) * weight;
  },
} as const;

/** The seeded recurrence of 20.2.2 over the fixture, with one step of the three. */
function steppedMean(values: readonly number[], len: number, step: (p: number, n: number) => number): Series {
  const out: (number | null)[] = [];
  let running: number | null = null;
  for (let bar = 0; bar < values.length; bar += 1) {
    if (bar < len - 1) {
      out.push(null);
      continue;
    }
    if (running === null) {
      let total = 0;
      for (let back = len - 1; back >= 0; back -= 1) total = total + (values[bar - back] as number);
      running = total / len;
    } else {
      running = step(running, values[bar] as number);
    }
    out.push(running);
  }
  return out;
}

/** How many bars two lines disagree on, absence counted as a value. */
function differences(one: Series, other: Series): number {
  let found = 0;
  for (let bar = 0; bar < one.length; bar += 1) if (one[bar] !== other[bar]) found += 1;
  return found;
}

/**
 * Catches an engine that steps with `running + (value - running) * weight`,
 * which is the same algebra and a different set of last bits.
 *
 * The counts are the ones 20.3 prints, read out of the page rather than typed
 * here, which is the shape the strength reading beside this already uses: a
 * figure the page quotes and nothing measures is how three sentences in that
 * section went wrong. An assertion that only asked for one differing bar would
 * pass on a page that had drifted to any other number.
 */
test('the arrangement 20.3 refuses gives different numbers on this fixture', () => {
  const printed = figuresIn(
    /one multiplication rather than two\.[\s\S]*?it differs from these lines on\s+(\d+) of the (\d+) values at length (\d+), (\d+) of the (\d+) at length (\d+) and (\d+) of the (\d+) at\s+length (\d+)/,
    9,
  );
  for (let which = 0; which < 3; which += 1) {
    const [differed, total, len] = printed.slice(which * 3, which * 3 + 3) as [
      number,
      number,
      number,
    ];
    const drawn = plot(plotsOf('ema', { len }), 'Mean');
    const refused = steppedMean(CLOSE, len, STEPS.incremental(len));
    assert.equal(
      drawn.filter((one) => one !== null).length,
      total,
      `the values the page counts at length ${len}`,
    );
    assert.equal(differences(drawn, refused), differed, `at length ${len}`);
  }
});

/**
 * And the other half: the order the two products are written in changes
 * nothing, which is why 20.3 no longer says anything about it.
 *
 * This is a statement about `compiled-program.md` 8.1's arithmetic rather than
 * about this library: on a platform that reassociated, distributed or fused a
 * multiply and an add, the two arrangements could part company and this would
 * fail. That is the right thing for it to do, because such a platform is not
 * one a conforming engine runs on.
 */
test('writing the two products in the other order changes no value', () => {
  for (const len of LENGTHS) {
    const written = steppedMean(CLOSE, len, STEPS.written(len));
    const swapped = steppedMean(CLOSE, len, STEPS.swapped(len));
    assert.equal(differences(written, swapped), 0, `the order mattered at length ${len}`);
    assert.deepEqual(plot(plotsOf('ema', { len }), 'Mean'), written);
  }
});
