import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trigonometric } from '../../src/core/stdlib/maths/trigonometric.js';

// A separate test process gives the internal constant cache its initial state.
test('a fresh trigonometric cache clamps undersized refinement starts', () => {
  assert.equal(trigonometric('asin',1,undefined,0),Math.PI/2);
  assert.equal(trigonometric('atan2',1,0,-100),Math.PI/2);
});
