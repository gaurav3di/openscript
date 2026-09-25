import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hypot } from '../../src/core/stdlib/index.js';
import { bits, certified, fromBits, midpointPairs, pairs } from './hypot-cases.js';

test('hypot selects the nearest value by an independent exact squared-distance certificate', () => {
  for (const [x, y] of pairs()) {
    assert.ok(certified(x, y, hypot(x, y)), `hypot(${x}, ${y}) has no valid rounding certificate`);
  }
});

test('hypot does not delegate its final bits to the host', () => {
  const original = Math.hypot;
  Math.hypot = () => assert.fail('the portable hypotenuse must not call host hypot');
  try {
    assert.equal(hypot(3, 4), 5);
    assert.equal(hypot(Number.MIN_VALUE, Number.MIN_VALUE), Number.MIN_VALUE);
  } finally {
    Math.hypot = original;
  }
});

test('hypot uses even rounding at constructed exact midpoints', () => {
  for (const [x, y] of midpointPairs()) {
    assert.notEqual(y, null);
    assert.equal(hypot(x, y), y, 'the exact radius is halfway above the even second leg');
    assert.equal(certified(x, y, fromBits(bits(y as number) + 1n)), false, 'half-up is rejected');
  }
});

test('hypot resolves adjacent inputs on opposite sides of the overflow threshold', () => {
  const below = fromBits(0x7e46a09e667f3bccn);
  const above = fromBits(0x7e46a09e667f3bcdn);
  assert.equal(hypot(Number.MAX_VALUE, below), Number.MAX_VALUE);
  assert.equal(hypot(Number.MAX_VALUE, above), null);
  assert.ok(certified(Number.MAX_VALUE, below, Number.MAX_VALUE));
  assert.ok(certified(Number.MAX_VALUE, above, null));
});

test('hypot preserves absence, signs, subnormal results and the single zero', () => {
  assert.equal(hypot(null, 0), null);
  assert.equal(hypot(0, null), null);
  assert.equal(hypot(-3, -4), 5);
  assert.equal(hypot(4, 3), 5);
  assert.equal(hypot(Number.MIN_VALUE, Number.MIN_VALUE), Number.MIN_VALUE);
  assert.equal(bits(hypot(-0, -0) as number), 0n);
  assert.equal(hypot(Number.MAX_VALUE, Number.MIN_VALUE), Number.MAX_VALUE);
  assert.equal(hypot(Number.MAX_VALUE, Number.MAX_VALUE), null);
});

test('the certificate rejects lost subnormals, overflowing intermediate squares and a wrong last bit', () => {
  assert.equal(certified(Number.MIN_VALUE, Number.MIN_VALUE, 0), false);
  assert.equal(certified(1e200, 1e200, null), false);
  assert.equal(certified(3, 4, fromBits(bits(5) - 1n)), false);
  assert.equal(certified(3, 4, fromBits(bits(5) + 1n)), false);
  assert.equal(certified(0, 0, -0), false);
});
