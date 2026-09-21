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

function roundWith(x: number, scale: number): number {
  return roundHalfAway(x * scale) / scale;
}

test('20.7: the host power misses the nearest binary64 at the count the page prints', () => {
  const [off, counts, at, bars, differed, pairs] = figuresIn(
    /returns a value an ulp from it for (\d+) of the (\d+) counts from 0 to 308, at (\d+), and over the (\d+) bars of a price walk and those counts `round\(x, d\)` differs on (\d+) of the (\d+) pairs/,
    6,
  );
  assert.equal(counts, 309, 'the counts from 0 to 308');

  const missed: number[] = [];
  for (let count = 0; count < (counts ?? 0); count += 1) {
    if (!Object.is(Math.pow(10, count), nearestPowerOfTen(count))) missed.push(count);
  }
  assert.equal(missed.length, off, 'the powers the host gets wrong');
  assert.deepEqual(missed, [at], 'and which one');

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
  assert.equal(changed, differed, 'the roundings the host power changes');
  assert.deepEqual([...where], [at], 'every one of them at that count');
});

// Catches: a `round(x, decimals)` scaling by the host's power, which at this
// value and count lands one unit in the last place from the answer the
// nearest binary64 gives, and a scale table that is not the one 20.7 fixes as
// the value the literal reads as. The guard first: a host whose power is the
// nearest binary64 here would make the two answers agree and prove nothing.
test('round(x, decimals) scales by the nearest binary64, not the host power', () => {
  const x = 3.0627e-8;
  const host = roundWith(x, Math.pow(10, 23));
  assert.equal(Object.is(host, x), false, 'the host power agrees at this value, so this proves nothing');
  assert.equal(Object.is(roundTo(x, 23), x), true, 'round(3.0627e-8, 23) is the value itself');
  assert.equal(Object.is(roundTo(x, 23), host), false, 'and not the host power\'s answer');
  assert.equal(Object.is(scaleOf(23), 1e23), true, 'the scale is what the literal 1e23 reads as');
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
  const x = 3.0627e-8;
  assert.notEqual(roundHalfAway(x * Math.pow(10, 23)), roundHalfAway(x * nearestPowerOfTen(23)));
  assert.equal(of.call(context, [x, 23]), '0.00000003062700000000000');
});
