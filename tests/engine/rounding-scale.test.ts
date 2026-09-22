/**
 * The scale of `round(x, decimals)` and `text(x, decimals)`, `stdlib.md` 20.7.
 *
 * 20.7 fixes the scale as the binary64 nearest to the power of ten and says
 * that a floating point power is not it, with two figures beside the claim:
 * the count of powers the host's own `pow` gets wrong, and the count of
 * roundings that change because of it. Both are read out of the page and
 * measured again here, in the way `tests/stdlib/section-20.ts` explains, so
 * that the figures cannot go on being quoted after the host that produced
 * them has changed.
 *
 * The population is section 20's price walk rather than every binade, because
 * a claim about `round(x, 2)` is a claim about prices, and because the whole
 * range multiplied by three hundred scales is too slow to run on every build.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { roundHalfAway, roundTo, scaleOf } from '../../src/core/stdlib/index.js';
import { manifestEntry } from '../../src/core/engine/library/index.js';
import type { CallContext } from '../../src/core/engine/library/index.js';
import { Heap } from '../../src/core/engine/values/index.js';
import { figuresIn, walk } from '../stdlib/section-20.js';

/** The nearest binary64 to ten to a whole power, from exact integer arithmetic. */
function nearestPowerOfTen(count: number): number {
  return Number(10n ** BigInt(count));
}

/**
 * A scaled integer written back out with the point put in, exactly.
 *
 * Built from the digits rather than by dividing, because dividing is the step
 * that hides the difference this test is about: two integers one apart can come
 * back as the same double once the scale is taken off again.
 */
function digitsOf(scaled: number, count: number): string {
  const negative = scaled < 0;
  const digits = String(Math.abs(scaled)).padStart(count + 1, '0');
  const whole = digits.slice(0, digits.length - count);
  const part = digits.slice(digits.length - count);
  return `${negative ? '-' : ''}${whole}${count > 0 ? `.${part}` : ''}`;
}

/** Every count from 0 to 308 where this host's power is not the nearest binary64. */
function missedCounts(): number[] {
  const out: number[] = [];
  for (let count = 0; count < 309; count += 1) {
    if (!Object.is(Math.pow(10, count), nearestPowerOfTen(count))) out.push(count);
  }
  return out;
}

function roundWith(x: number, scale: number): number {
  return roundHalfAway(x * scale) / scale;
}

/**
 * A count and a value where the two scales give different DIGITS.
 *
 * Separate from `witness` because the two tests need different things. A
 * rounding differs when the values differ after the scale is taken off again; a
 * written conversion differs when the scaled integers themselves differ, and
 * those are not the same pairs. The price walk supplies the first and not the
 * second: its prices are around a hundred, so scaling one by a large power puts
 * the integer well past where a double counts whole numbers, and the digits
 * stop being exact before the two scales have a chance to disagree about them.
 *
 * So the value is built to put the integer inside the safe range. Nothing is
 * returned where no such pair exists, and the test says so rather than passing
 * on a comparison of two identical strings.
 */
function digitsWitness(): { count: number; x: number } | null {
  for (const count of missedCounts()) {
    const host = Math.pow(10, count);
    const near = nearestPowerOfTen(count);
    for (let mantissa = 10000; mantissa < 99999; mantissa += 7) {
      // Chosen so the scaled integer lands near 1e15, which is inside the range
      // a double holds every whole number of.
      const x = (mantissa / near) * 1e11;
      const written = roundHalfAway(x * near);
      const other = roundHalfAway(x * host);
      if (written !== other && Number.isSafeInteger(written) && Number.isSafeInteger(other)) {
        return { count, x };
      }
    }
  }
  return null;
}

/**
 * A count and a value where the two scales actually give different answers.
 *
 * **Searched rather than written down, because there is no count that works
 * everywhere.** 20.7's claim is that a host's `pow` is not the nearest binary64
 * and that the difference reaches `round`. Which counts differ is the host's:
 * measured on two runtimes of the same virtual machine, one missed a single
 * count and the other missed thirty six, and the two sets do not overlap. A
 * witness written as a literal therefore demonstrates the claim on the machine
 * it was written on and proves nothing on the next one, which is how this test
 * came to pass where it was written and fail where it was run.
 *
 * So the pair is found from this host, over the page's own price walk. Nothing
 * is returned when a host's power is exact everywhere, and the tests say that
 * rather than passing on a comparison of two identical numbers.
 */
function witness(prices: readonly number[]): { count: number; x: number } | null {
  for (const count of missedCounts()) {
    const host = Math.pow(10, count);
    const nearest = nearestPowerOfTen(count);
    for (const x of prices) {
      if (!Object.is(roundWith(x, host), roundWith(x, nearest))) return { count, x };
    }
  }
  return null;
}

test('20.7: a host power is not the nearest binary64, and it changes roundings', () => {
  // **The claim is measured; the size of it is not, and that is the point.**
  //
  // This test used to assert the exact count of powers a host gets wrong, and
  // which one. Both are properties of one `pow` implementation: the same engine
  // measures one count on one runtime of its virtual machine and a different
  // set on another, so the assertion passed where it was written and failed
  // where it was run. A figure in the page would have been a reading from
  // whichever machine happened to take it, quoted afterwards as though it
  // described the language, which is the drift section 20 exists to stop.
  //
  // So what is asserted is what a second engine has to know: the two are not
  // one function, and the difference reaches `round`. The structural figures,
  // how many counts and how many pairs, are the page's and are still checked.
  const [counts, bars, pairs] = figuresIn(
    /over the (\d+) counts from 0 to 308 a host's `pow\(10, d\)` returns a value an ulp from the nearest binary64 for at least one of them, and over the (\d+) bars of a price walk and those counts `round\(x, d\)` then differs on part of the (\d+) pairs/,
    3,
  );
  assert.equal(counts, 309, 'the counts from 0 to 308');

  const missed: number[] = [];
  for (let count = 0; count < (counts ?? 0); count += 1) {
    if (!Object.is(Math.pow(10, count), nearestPowerOfTen(count))) missed.push(count);
  }
  assert.ok(missed.length > 0, 'no host power differs at all, so 20.7 has nothing to refuse');

  const prices = walk(bars ?? 0);
  let seen = 0;
  let changed = 0;
  const where = new Set<number>();
  for (let count = 0; count < (counts ?? 0); count += 1) {
    const host = Math.pow(10, count);
    const nearest = nearestPowerOfTen(count);
    for (const x of prices) {
      seen += 1;
      if (Object.is(roundWith(x, host), roundWith(x, nearest))) continue;
      changed += 1;
      where.add(count);
    }
  }
  assert.equal(seen, pairs, 'the pairs the page counts over');
  assert.ok(changed > 0, 'the host power changes no rounding, so the rule guards nothing');
  // And every count where a rounding changed is one where the power differed:
  // the difference reaches `round` through the scale and by no other route.
  for (const count of where) {
    assert.ok(missed.includes(count), `a rounding changed at ${count} where the power agreed`);
  }
});

// Catches: a `round(x, decimals)` scaling by the host's power, which at this
// value and count lands one unit in the last place from the answer the
// nearest binary64 gives, and a scale table that is not the one 20.7 fixes as
// the value the literal reads as. The guard first: a host whose power is the
// nearest binary64 here would make the two answers agree and prove nothing.
test('round(x, decimals) scales by the nearest binary64, not the host power', () => {
  // Catches a `round(x, decimals)` scaling by the host's power, and a scale
  // table that is not the one 20.7 fixes as the value the literal reads as.
  //
  // The count and the value are found on this host rather than written here:
  // which counts a power gets wrong is the host's, and the two runtimes this
  // engine has been measured on disagree about every one of them. A literal
  // witness demonstrates the claim on one machine and nothing on the next.
  const found = witness(walk(5000));
  assert.ok(found !== null, 'this host power is exact everywhere, so 20.7 refuses nothing here');
  if (found === null) return;

  const { count, x } = found;
  const host = roundWith(x, Math.pow(10, count));

  assert.equal(
    Object.is(roundTo(x, count), roundWith(x, nearestPowerOfTen(count))),
    true,
    'the rounding is the one the nearest binary64 gives',
  );
  assert.equal(Object.is(roundTo(x, count), host), false, "and not the host power's answer");
  assert.equal(
    Object.is(scaleOf(count), nearestPowerOfTen(count)),
    true,
    'the scale is the nearest binary64',
  );
  assert.equal(Object.is(scaleOf(0), 1), true);
  assert.equal(scaleOf(309), Infinity, 'past the last finite power, what the power would have been');
});

// Catches: a fixed decimal conversion scaling by the host's power. At this
// value the two scales round to whole numbers one apart, both below 2 ** 53,
// so the digits written are decided by which scale was used.
test('text(x, decimals) scales by the nearest binary64, not the host power', () => {
  const of = manifestEntry('text', 2);
  assert.ok(of !== undefined);
  const context = {
    heap: new Heap(),
    span: { offset: 0, length: 0, line: 0, column: 0 },
    guard: {
      string: (_span: unknown, text: string) => text,
      chars: () => undefined,
      badArgument: (): never => {
        throw new Error('badArgument');
      },
    },
  } as unknown as CallContext;
  const found = digitsWitness();
  assert.ok(found !== null, 'no pair on this host writes different digits, so this proves nothing');
  if (found === null) return;

  const { count, x } = found;
  // The two scales genuinely disagree at this pair, which is what makes the
  // comparison below mean anything.
  assert.notEqual(
    roundHalfAway(x * Math.pow(10, count)),
    roundHalfAway(x * nearestPowerOfTen(count)),
  );

  // **Compared as digits, not as a number.** A fixed decimal conversion writes
  // the integer the scaling produced; dividing that integer back by the scale
  // can land on the same double either way, so a comparison of the two values
  // is a comparison that passes whichever scale was used. The digits are where
  // the difference is visible and are what a reader sees.
  const written = of.call(context, [x, count]) as string;

  assert.equal(written, digitsOf(roundHalfAway(x * nearestPowerOfTen(count)), count));
  assert.notEqual(written, digitsOf(roundHalfAway(x * Math.pow(10, count)), count));
});
