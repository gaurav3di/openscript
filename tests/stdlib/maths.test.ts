/**
 * The bare arithmetic of `stdlib.md` section 8, where the interesting cases are
 * all at the boundaries.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as lib from '../../src/core/stdlib/index.js';

import { differing, figuresIn } from './section-20.js';

// Catches: rounding halves to even, which is what most platform libraries do by
// default and what a trader reading a price does not expect. It also catches
// the usual shortcut of adding a half and taking the floor, which rounds the
// value just below a half upward because the addition rounds first.
test('round sends halves away from zero, at every half and not near one', () => {
  assert.equal(lib.round(2.5), 3);
  assert.equal(lib.round(3.5), 4, 'not 4 because 4 is even: because 3.5 is a half');
  assert.equal(lib.round(-2.5), -3);
  assert.equal(lib.round(-0.5), -1);
  assert.equal(lib.round(0.5), 1);
  assert.equal(lib.round(0.49999999999999994), 0, 'the value just below a half');
});

test('round to a number of decimals follows the same rule', () => {
  assert.equal(lib.roundTo(2.675, 2), 2.68);
  assert.equal(lib.roundTo(-2.675, 2), -2.68);
  assert.equal(lib.roundTo(1.23456, 3), 1.235);
  assert.equal(lib.roundTo(5, 0), 5);
  assert.equal(lib.roundTo(1, -1), null, 'a digit count is not negative');
  assert.equal(lib.roundTo(1.5, 1.5), null, 'a digit count is a whole number');
});

test('floor, ceil and trunc go where their names say', () => {
  assert.equal(lib.floor(-1.5), -2);
  assert.equal(lib.ceil(-1.5), -1);
  assert.equal(lib.trunc(-1.5), -1);
  assert.equal(lib.trunc(1.5), 1);
});

// Catches: the truncated remainder in place of the floored one. "The modulo"
// names two different functions in common use, and they disagree at every
// negative argument.
test('mod is the floored remainder, whose sign follows its second argument', () => {
  assert.equal(lib.mod(-7, 3), 2);
  assert.equal(lib.mod(7, -3), -2);
  assert.equal(lib.mod(7, 3), 1);
  assert.equal(lib.mod(-7, -3), -1);
  assert.equal(lib.mod(7, 0), null, 'no finite answer, so absence');
});

test('rounding to a step lands on a multiple of it', () => {
  assert.equal(lib.roundToStep(101.27, 0.05), 101.25);
  assert.equal(lib.roundToStep(7, 5), 5);
  assert.equal(lib.roundToStep(7.5, 5), 10, 'a half goes away from zero here too');
  assert.equal(lib.roundToStep(5, 0), null, 'a step of zero has no multiples');
});

// Catches: returning the price unrounded when the host has supplied no tick
// size. That produces an order price that looks rounded and is not, and nothing
// downstream can see the difference.
test('rounding to the tick is absent when there is no tick', () => {
  // 100.35000000000001 and not 100.35: the multiple is round(x / step) * step,
  // and that product is the nearest binary64 value to it. Writing the prettier
  // number here would be asserting decimal arithmetic the language does not
  // have, and the specification fixes the recipe rather than the spelling.
  assert.equal(lib.roundToTick(100.37, 0.05), 100.35000000000001);
  assert.equal(lib.roundToTick(100.37, null), null);
  assert.equal(lib.roundToTick(100.37, 0), null);
});

test('a function with no finite real answer returns absence rather than raising', () => {
  assert.equal(lib.sqrt(-1), null);
  assert.equal(lib.log(0), null);
  assert.equal(lib.log(-1), null);
  assert.equal(lib.log10(0), null);
  assert.equal(lib.pow(1e308, 2), null, 'an overflow is not a number');
  assert.equal(lib.asin(2), null);
  assert.equal(lib.acos(-2), null);
});

test('sqrt of a perfect square is exact, which is what makes the band studies portable', () => {
  assert.equal(lib.sqrt(4), 2);
  assert.equal(lib.sqrt(0.25), 0.5);
  assert.equal(lib.sqrt(0), 0);
});

test('every bare function is absent when any argument is absent', () => {
  assert.equal(lib.abs(null), null);
  assert.equal(lib.sign(null), null);
  assert.equal(lib.min(1, null), null);
  assert.equal(lib.max(null, 1), null);
  assert.equal(lib.clamp(1, null, 2), null);
  assert.equal(lib.mod(null, 2), null);
  assert.equal(lib.pow(2, null), null);
});

test('sign is -1, 0 or 1, and zero is one of the three', () => {
  assert.equal(lib.sign(-4), -1);
  assert.equal(lib.sign(0), 0);
  assert.equal(lib.sign(4), 1);
});

test('clamp holds a value inside its range and leaves one inside it alone', () => {
  assert.equal(lib.clamp(5, 1, 3), 3);
  assert.equal(lib.clamp(-5, 1, 3), 1);
  assert.equal(lib.clamp(2, 1, 3), 2);
});

test('the absence tests read absence, and orElse replaces it', () => {
  assert.equal(lib.isNone(null), true);
  assert.equal(lib.isNone(0), false, 'zero is a value');
  assert.equal(lib.orElse(null, 7), 7);
  assert.equal(lib.orElse(0, 7), 0, 'zero is a value here too');
  assert.equal(lib.boolOf(null), false);
  assert.equal(lib.boolOf(true), true);
});

test('a result of negative zero is normalised, everywhere it can arise', () => {
  assert.ok(Object.is(lib.abs(-0), 0));
  assert.ok(Object.is(lib.roundToStep(-0.01, 1), 0));
  assert.ok(Object.is(lib.round(-0.4), 0));
});

/**
 * The three arrangement figures `stdlib.md` section 20 prints beside a refusal.
 *
 * Section 20 is the manifest a second engine implements from, and a refusal in
 * it is worth what the number beside it is worth. Two of those numbers were
 * "most arguments" and "most percentages" when they were measured for the first
 * time, and neither was: one is about a quarter and one is two in five. A third
 * sentence fixed a grouping that cannot differ at all.
 *
 * These are facts about `compiled-program.md` 8.1's arithmetic rather than about
 * this library, which is why they are asserted as counts rather than compared
 * against a column. What they catch is the page drifting away from them: a
 * figure quoted there and nowhere measured is the shape this round found three
 * of.
 */
test('20.9: the alpha arrangement fade refuses differs at the count 20.9 prints', () => {
  const [differed, total] = figuresIn(/(\d+) of the (\d+) whole percentages, 33 among them/, 2);
  assert.equal(total, 101, 'the population the page names');
  assert.equal(
    differing(total, (p) => (100 - p) / 100, (p) => 1 - p / 100, (i) => i),
    differed,
  );
  assert.notEqual((100 - 33) / 100, 1 - 33 / 100, 'the percentage 20.9 names by number');
});

test('20.7: folding the constant into one factor differs at the rate 20.7 prints', () => {
  const [degrees, radians] = figuresIn(
    /measured over forty thousand values spread across nine decades, (\d+) in every hundred for the first and (\d+) for the second/,
    2,
  );
  const across = (i: number): number => (i % 2 === 0 ? 1 : -1) * (i / 1013) * 10 ** ((i % 9) - 4);
  const rate = (found: number): number => Math.round((100 * found) / 40_000);
  assert.equal(
    rate(differing(40_000, (x) => (x * 180) / Math.PI, (x) => x * (180 / Math.PI), across)),
    degrees,
    'toDegrees',
  );
  assert.equal(
    rate(differing(40_000, (x) => (x * Math.PI) / 180, (x) => x * (Math.PI / 180), across)),
    radians,
    'toRadians',
  );
});

test("20.3: alma's exponent is one division, and the grouping of its product fixes nothing", () => {
  let chained = 0;
  let regrouped = 0;
  let weights = 0;
  for (const len of [5, 9, 14, 20, 21, 50, 100, 200]) {
    for (const sigma of [2, 3, 4, 5, 6, 8, 10]) {
      for (const offset of [0, 0.25, 0.5, 0.75, 0.85, 1]) {
        const peak = offset * (len - 1);
        const spread = len / sigma;
        for (let position = 0; position < len; position += 1) {
          const gap = position - peak;
          const written = -(gap * gap) / (2 * spread * spread);
          weights += 1;
          if (!Object.is(written, -(gap * gap) / 2 / spread / spread)) chained += 1;
          if (!Object.is(written, -(gap * gap) / (2 * (spread * spread)))) regrouped += 1;
        }
      }
    }
  }
  const [differed, total] = figuresIn(/it differs on (\d+) of the (\d+) exponents/, 2);
  assert.equal(weights, total, 'the kernels the page counts over');
  assert.equal(chained, differed, 'the chain of divisions 20.3 refuses');
  assert.equal(regrouped, 0, 'the grouping 20.3 no longer fixes');
});

/**
 * 20.1's one edge, pinned where it actually is.
 *
 * The rule is that regrouping across a factor of two changes nothing, and the
 * first draft of the sentence said that held "wherever the result is a normal
 * number". It does not. What decides it is whether the other product underflows,
 * because that rounding loses bits the scaling cannot put back, and the doubled
 * answer can be an ordinary normal number while the two groupings still differ.
 * The alma entry names the edge in terms of the square for that reason.
 */
test('20.1: the power of two rule parts company when the other product underflows', () => {
  const smallestNormal = 2.2250738585072014e-308;
  const root = Math.sqrt(smallestNormal);
  let differed = 0;
  let bothNormal = 0;
  for (let i = 0; i < 20_000; i += 1) {
    const s = root * (0.72 + (0.28 * i) / 20_000);
    const grouped = (2 * s) * s;
    const other = 2 * (s * s);
    if (Object.is(grouped, other)) continue;
    differed += 1;
    if (grouped >= smallestNormal && other >= smallestNormal) bothNormal += 1;
  }
  assert.ok(differed > 0, 'the edge exists');
  assert.equal(bothNormal, differed, 'and every one of them has a normal answer');
  // And above the edge it holds, which is the half the rule is about.
  for (let i = 0; i < 20_000; i += 1) {
    const s = root * (1 + i / 100);
    assert.ok(Object.is((2 * s) * s, 2 * (s * s)));
  }
});
