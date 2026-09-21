/**
 * How a number becomes text, held to the vectors and to the host.
 *
 * `language.md` 5.5 is one rule for every number that becomes text, and
 * `canonicalNumber` is the one function that writes it. What can be wrong is
 * the layout: which side of a threshold a value falls on, how an exponent is
 * spelled, what a zero is. So the writer is held to three things, each of
 * which catches a different wrong implementation.
 *
 * **The vectors.** `spec/vectors/number-text.json` is the file a second engine
 * checks itself against, so this engine is checked against the same file, both
 * directions: writing the value gives the text and reading the text gives the
 * value. A writer that used a sixteen digit threshold, a four place threshold
 * or a `+` on the exponent fails a row. And the file itself is checked: every
 * boundary the rule turns on has to be a row in it, so a row cannot be dropped
 * to make a broken writer pass, and its two spellings of a value have to be
 * one value.
 *
 * **The host.** The rule is the layout the first host follows natively, minus
 * the `+`, so over the whole double range the writer and the host's own form
 * have to agree. A threshold moved by one, in either direction, fails here on
 * the first value that lands between the two.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { canonicalNumber, canonicalise } from '../../src/core/emit/index.js';

const VECTORS = new URL('../../../spec/vectors/number-text.json', import.meta.url);

interface Vector {
  readonly bits: string;
  readonly value: number;
  readonly text: string;
  readonly note: string;
}

function vectors(): readonly Vector[] {
  const file = JSON.parse(readFileSync(VECTORS, 'utf8')) as { vectors: Vector[] };
  assert.ok(file.vectors.length > 0, 'the vector file holds rows');
  return file.vectors;
}

const view = new DataView(new ArrayBuffer(8));

function bitsOf(value: number): string {
  view.setFloat64(0, value);
  return view.getBigUint64(0).toString(16).padStart(16, '0');
}

function fromBits(bits: string): number {
  view.setBigUint64(0, BigInt(`0x${bits}`));
  return view.getFloat64(0);
}

/** The host's own shortest form, with the one sign the rule does not write. */
function hostForm(value: number): string {
  return value === 0 ? '0' : String(value).replace('e+', 'e');
}

/**
 * The values the rule turns on, each of which the vector file has to carry.
 *
 * Listed as values rather than as texts so that a row that spells one of them
 * wrongly is caught by the vector test and a row that is missing is caught
 * here, and the two cannot be confused.
 */
const BOUNDARIES: readonly (readonly [number, string])[] = [
  [0, 'zero'],
  [-0, 'negative zero'],
  [100, 'a whole number'],
  [0.1 + 0.2, 'the sum of 0.1 and 0.2'],
  [128 / 255, 'the alpha of a colour byte'],
  [1e15, 'ten to the fifteenth'],
  [1e16, 'ten to the sixteenth, a host threshold this rule does not have'],
  [1e20, 'the last positional decade'],
  [1e21, 'the first exponent'],
  [1e-4, 'four places, a host threshold this rule does not have'],
  [1e-5, 'five places'],
  [1e-6, 'the last positional place'],
  [1e-7, 'the first exponent below one'],
  [5e-324, 'the smallest subnormal'],
  [2.2250738585072014e-308, 'the smallest normal'],
  [Number.MAX_VALUE, 'the largest double'],
  [2 ** 53, 'the last exact whole number'],
  [2 ** 60, 'a whole number whose shortest digits are not its expansion'],
  [1e23, 'the first power of ten a binary64 cannot hold'],
];

// Catches: a vector row whose decimal spelling reads as a different double
// than its bit pattern, which would hand a second engine two values and call
// them one. Also a bit pattern that is not sixteen hex digits, and a value
// stated twice.
test('every vector spells one value two ways, once', () => {
  const seen = new Set<string>();
  for (const one of vectors()) {
    assert.match(one.bits, /^[0-9a-f]{16}$/, `${one.note}: the bits are sixteen lowercase hex digits`);
    assert.equal(bitsOf(one.value), one.bits, `${one.note}: the decimal reads as the bit pattern`);
    assert.ok(!seen.has(one.bits), `${one.note}: stated twice`);
    seen.add(one.bits);
  }
});

// Catches: a writer with a threshold in the wrong place, a `+` on the exponent,
// a `-0`, or a `.0` on a whole number. The value is taken from the bits so the
// test does not depend on how the JSON reader parses the decimal.
test('the writer gives every vector its text', () => {
  for (const one of vectors()) {
    assert.equal(canonicalNumber(fromBits(one.bits)), one.text, one.note);
  }
});

// Catches: a text that does not read back as its value, which would be a row
// that is not a round trip and therefore not shortest, and a writer that is
// not a fixed point of its own output.
test('every vector text reads back as its value, and writes back as itself', () => {
  for (const one of vectors()) {
    const value = fromBits(one.bits);
    const read = Number(one.text);
    assert.equal(bitsOf(read), bitsOf(value === 0 ? 0 : value), `${one.note}: reads back`);
    assert.equal(canonicalNumber(read), one.text, `${one.note}: writes back`);
  }
});

// Catches: a vector file that has lost a boundary. Every value the rule turns
// on is a row, so a second engine that passes the file has been tested at each
// threshold and not only between them.
test('the vector file carries every boundary the rule turns on', () => {
  const held = new Set(vectors().map((one) => one.bits));
  for (const [value, what] of BOUNDARIES) {
    assert.ok(held.has(bitsOf(value)), `${what} (${hostForm(value)}) is not in the vector file`);
  }
});

// Catches: a layout that agrees with the vectors and disagrees with the host
// somewhere else in the range. Two sweeps: every decade at three mantissas,
// which lands on both thresholds from both sides, and pseudo-random bit
// patterns, which land everywhere else.
test('the layout agrees with the host over the whole double range', () => {
  for (let exponent = -330; exponent <= 310; exponent += 1) {
    for (const mantissa of ['1', '1.5', '9.999999', '1.2345678901234567']) {
      const value = Number(`${mantissa}e${exponent}`);
      if (!Number.isFinite(value) || value === 0) continue;
      assert.equal(canonicalNumber(value), hostForm(value), `${mantissa}e${exponent}`);
      assert.equal(canonicalNumber(-value), hostForm(-value), `-${mantissa}e${exponent}`);
    }
  }
  let state = 0x9e3779b9n;
  let checked = 0;
  for (let draw = 0; draw < 200_000; draw += 1) {
    state ^= (state << 13n) & 0xffffffffffffffffn;
    state ^= state >> 7n;
    state ^= (state << 17n) & 0xffffffffffffffffn;
    view.setBigUint64(0, state);
    const value = view.getFloat64(0);
    if (!Number.isFinite(value)) continue;
    checked += 1;
    assert.equal(canonicalNumber(value), hostForm(value), `bits ${state.toString(16)}`);
  }
  assert.ok(checked > 100_000, 'the random sweep reached the range');
});

// Catches: a canonical encoding that writes a number by another rule than the
// writer, which would give a program two hashes.
test('the canonical encoding writes a number by the same rule', () => {
  assert.equal(canonicalise([1e21, 1e-7, 0.1 + 0.2, -0, 100]), '[1e21,1e-7,0.30000000000000004,0,100]');
  assert.equal(canonicalise({ a: 5e-324 }), '{"a":5e-324}');
});

// Catches: a writer that spells an infinity or a NaN, which the language does
// not hold and a case file must never carry.
test('a number that is not finite is refused, not spelled', () => {
  assert.throws(() => canonicalNumber(Infinity));
  assert.throws(() => canonicalNumber(-Infinity));
  assert.throws(() => canonicalNumber(NaN));
});
