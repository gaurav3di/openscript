import assert from 'node:assert/strict';
import { test } from 'node:test';

import { manifestEntry } from '../../src/core/engine/library/index.js';
import type { CallContext } from '../../src/core/engine/library/index.js';
import { colour, reference } from '../../src/core/engine/values/index.js';
import type { Value } from '../../src/core/engine/values/index.js';
import { orElse } from '../../src/core/stdlib/index.js';

test('numeric orElse normalizes either selected zero and preserves absence', () => {
  for (const [value, fallback] of [[-0, 1], [null, -0], [-0, -0], [0, -0]] as const) {
    assert.equal(Object.is(orElse(value, fallback), 0), true);
  }
  assert.equal(orElse(null, null), null);
  assert.equal(orElse(3, -0), 3);
});

test('generic orElse normalizes zero without changing any other value or reference', () => {
  const entry = manifestEntry('orElse', 2);
  assert.ok(entry);
  const context = {} as CallContext;
  for (const args of [[-0, 1], [null, -0], [-0, -0]]) {
    assert.equal(Object.is(entry.call(context, args), 0), true);
  }
  const values: Value[] = [false, true, '', 'zero', null, 3, colour(1, 2, 3, 0.5), reference(1)];
  for (const value of values) {
    assert.equal(entry.call(context, [value, null]), value);
    assert.equal(entry.call(context, [null, value]), value);
  }
});
