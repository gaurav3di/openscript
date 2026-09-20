/**
 * The figures `stdlib.md` section 20 prints about a constant of the length, and
 * about a sum taken over a history rather than over a window.
 *
 * These are the sentences three readers in a row walked past. Each of them said
 * something was "formed as written" or "computed as written", which reads like
 * a constraint and names no second arrangement, so half of each was a real
 * refusal and half could not be failed by anybody. The halves are separated in
 * the page now, and both are measured here: the refusal against its count, and
 * the zero against the population it was measured over, so that a zero written
 * down as a fact stays a fact.
 *
 * Every figure is read out of the page rather than typed twice. Reword a claim
 * or move a figure and this fails, which is what `scripts/check-section-20.mjs`
 * exists to keep true of every count in the section.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { figuresIn, walk } from './section-20.js';

/** The sum of squares over `x` of 0 to `len - 1`, as 20.3 writes it. */
const sumXSquared = (len: number): number => ((len - 1) * len * (2 * len - 1)) / 6;

/** The same quantity with the 6 split into the 2 and the 3, which 20.3 refuses. */
const splitDivisor = (len: number): number => (((len - 1) * len) / 2) * ((2 * len - 1) / 3);

/**
 * 20.3's `linreg`, both halves.
 *
 * The refusal is real: splitting the divisor divides each half of the product
 * by a factor of its own, and one of those factors is 3, which is not a power
 * of two and does not scale exactly. The grouping of the products is the
 * opposite case and had been covered by the same blanket sentence.
 *
 * The wrong implementation this catches is an engine that keeps the product
 * small by dividing as it goes, which is the reason anybody writes the split
 * form, and a page that says so without the figures being true.
 */
test('20.3: linreg refuses the split divisor and fixes nothing about the products', () => {
  const [population, differed, firstLength, split, written] = figuresIn(
    /over every whole length from 1 to (\d+) the two part\s+company on (\d+), the first at a length of (\d+), where the split gives\s+(\d+(?:\.\d+)?) against (\d+(?:\.\d+)?)/,
    5,
  ) as [number, number, number, number, number];
  const [samePopulation, regroupedPrinted] = figuresIn(
    /over those same (\d+) lengths the regrouped sum of squares differs on (\d+)/,
    2,
  );
  assert.equal(samePopulation, population, 'both halves are measured over the same lengths');

  let parted = 0;
  let first: number | null = null;
  let regrouped = 0;
  let halvingMoved = 0;
  for (let len = 1; len <= population; len += 1) {
    if (!Object.is(sumXSquared(len), splitDivisor(len))) {
      parted += 1;
      if (first === null) first = len;
    }
    // The same three factors, with each of the other two pairs multiplied first.
    if (!Object.is(sumXSquared(len), ((len - 1) * (len * (2 * len - 1))) / 6)) regrouped += 1;
    if (!Object.is(sumXSquared(len), (len * ((len - 1) * (2 * len - 1))) / 6)) regrouped += 1;
    const sumX = ((len - 1) * len) / 2;
    if (!Object.is(sumX, (len - 1) * (len / 2))) halvingMoved += 1;
    if (!Object.is(sumX, ((len - 1) / 2) * len)) halvingMoved += 1;
  }

  assert.equal(parted, differed, 'the arrangement 20.3 refuses');
  assert.equal(first, firstLength, 'the first length the two part company on');
  assert.equal(sumXSquared(firstLength), written, 'what the entry gives at that length');
  assert.equal(splitDivisor(firstLength), split, 'what the split gives there');
  assert.equal(regrouped, regroupedPrinted, 'the grouping of the product, which 20.3 fixes nothing about');
  assert.equal(halvingMoved, regroupedPrinted, "and sumX's halving, which is 20.1's third rule");

  // A zero is worth what the comparison behind it is worth, so the edge the
  // page names is checked as well: past it a pairwise product stops being
  // exact and the two groupings do part company, which is what makes the zero
  // above a fact about the lengths rather than about the comparison.
  const [edge] = figuresIn(/which for the sum of squares is first at a\s+length of (\d+)/, 1) as [number];
  assert.notEqual(sumXSquared(edge), ((edge - 1) * (edge * (2 * edge - 1))) / 6, 'the edge differs');
  for (let len = edge - 200; len < edge; len += 1) {
    assert.ok(Object.is(sumXSquared(len), ((len - 1) * (len * (2 * len - 1))) / 6), `below the edge at ${len}`);
  }
});

/**
 * 20.3's `wma` divisor, which fixes nothing at all.
 *
 * The entry used to say the divisor was "computed as written". Every way of
 * writing it is the same value: the three products differ only in where a
 * halving falls, which is exact, and adding the weights up is whole number
 * addition below 2 to the 53rd, which is exact as well. What the entry does
 * fix, and still says, is that the divisor meets the finished total rather than
 * each term as it is added.
 */
test('20.3: every spelling of the wma divisor is one value', () => {
  const [population, scaled] = figuresIn(
    /over every whole\s+length from 1 to (\d+) they differ on (\d+)\. Adding the weights/,
    2,
  ) as [number, number];
  const [added, summed] = figuresIn(
    /over\s+the first (\d+) lengths it differs on (\d+) as well/,
    2,
  ) as [number, number];

  let differed = 0;
  for (let len = 1; len <= population; len += 1) {
    const written = (len * (len + 1)) / 2;
    if (!Object.is(written, len * ((len + 1) / 2))) differed += 1;
    if (!Object.is(written, (len / 2) * (len + 1))) differed += 1;
  }
  assert.equal(differed, scaled, 'the three products the page names');

  let apart = 0;
  for (let len = 1; len <= added; len += 1) {
    let total = 0;
    for (let weight = 1; weight <= len; weight += 1) total += weight;
    if (!Object.is((len * (len + 1)) / 2, total)) apart += 1;
  }
  assert.equal(apart, summed, 'the weights added up instead');

  // And the half that can be failed, which is the sentence above it.
  const len = 20;
  const divisor = (len * (len + 1)) / 2;
  const held = walk(len);
  let total = 0;
  let perTerm = 0;
  for (let k = len - 1; k >= 0; k -= 1) {
    const term = (held[len - 1 - k] as number) * (len - k);
    total += term;
    perTerm += term / divisor;
  }
  assert.notEqual(total / divisor, perTerm, 'dividing each term as it is added is a different number');
});

/**
 * 20.2.1's carried total, which the page said differed on every bar.
 *
 * It does not. It agrees wherever the roundings happen to cancel, which is a
 * couple of hundred windows in twenty thousand, and a reader who checked the
 * claim on one of those would have concluded the two arrangements were the same
 * one. What is true is the shape of the disagreement: it is most windows, and
 * the gap grows with the history rather than staying where it started.
 *
 * The wrong implementation this catches is the carried total itself, which
 * `compiled-program.md` 8.3 refuses outright, and a page that overstates how it
 * fails.
 */
test('20.2.1: a carried total differs from a fresh sum at the counts 20.2.1 prints', () => {
  const printed = figuresIn(
    /it differs from the fresh sum on (\d+) of\s+the (\d+) windows at length (\d+), on (\d+) of the (\d+) at length (\d+) and on (\d+)\s+of the (\d+) at length (\d+)/,
    9,
  );
  const [agreed, agreedOf] = figuresIn(/happen to cancel, (\d+) of the (\d+) at length 20/, 2);
  const [early, late] = figuresIn(/at most ([\d.]+) ulps apart over the first thousand windows\s+and ([\d.]+) ulps apart over the last thousand/, 2);

  const bars = walk(20_000);
  const measure = (len: number): { differed: number; windows: number; early: number; late: number } => {
    let carried = 0;
    let differed = 0;
    let windows = 0;
    let worstEarly = 0;
    let worstLate = 0;
    for (let bar = 0; bar < bars.length; bar += 1) {
      carried += bars[bar] as number;
      if (bar >= len) carried -= bars[bar - len] as number;
      if (bar < len - 1) continue;
      let fresh = 0;
      for (let back = bar - len + 1; back <= bar; back += 1) fresh += bars[back] as number;
      windows += 1;
      if (!Object.is(fresh, carried)) differed += 1;
      const ulps = Math.abs(carried - fresh) / (Math.abs(fresh) * Number.EPSILON);
      if (windows <= 1000) worstEarly = Math.max(worstEarly, ulps);
      if (windows > 19_000) worstLate = Math.max(worstLate, ulps);
    }
    return { differed, windows, early: worstEarly, late: worstLate };
  };

  for (let which = 0; which < 3; which += 1) {
    const [differed, windows, len] = printed.slice(which * 3, which * 3 + 3) as [number, number, number];
    const found = measure(len);
    assert.equal(found.windows, windows, `the windows the page counts at length ${len}`);
    assert.equal(found.differed, differed, `the windows that differ at length ${len}`);
    if (len === 20) {
      assert.equal(windows - differed, agreed, 'the windows the two agree on');
      assert.equal(windows, agreedOf, 'counted over the same windows');
      assert.equal(Number(found.early.toFixed(1)), early, 'the gap over the first thousand windows');
      assert.equal(Number(found.late.toFixed(1)), late, 'the gap over the last thousand');
    }
  }
});
