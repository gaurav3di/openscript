import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkRaw, codes, rawCodes } from './check-support.js';

/**
 * The options a plot carries that reach past the plot itself. `language.md`
 * 13.2 and 15.3.
 */

// Catches a checker that lets a plot over the price pane set the pane's own
// precision, which reformats the axis every other series there is read on.
test('precision on a plot drawn over the price pane is OS8007 at the plot', () => {
  const text = 'version 1\nstudy("Bands", overlay = true)\nupper = close\nplot(upper, "Upper", aqua, precision = 0)\n';
  assert.deepEqual(rawCodes(text), ['OS8007']);
});

// Catches the overreach in both directions the entry's fix offers: the
// declaration is where the setting belongs, and a plot in a pane of its own
// has a scale of its own to format.
test('the same precision on the declaration, or off the price pane, is not OS8007', () => {
  const declared = 'version 1\nstudy("Bands", overlay = true, precision = 0)\nupper = close\nplot(upper, "Upper", aqua)\n';
  assert.deepEqual(rawCodes(declared), []);
  assert.ok(!codes('upper = close\nplot(upper, "Upper", aqua, precision = 0)').includes('OS8007'));
});

// Catches a report filed against the declaration rather than the plot, or one
// that names a different option than the one written.
test('OS8007 is at the plot and names its title and the option it set', () => {
  const text = 'version 1\nstudy("Bands", overlay = true)\nupper = close\nplot(upper, "Upper", aqua, precision = 0)\n';
  const found = checkRaw(text).diagnostics.find((one) => one.code === 'OS8007');
  assert.equal(found === undefined ? undefined : `${found.span.line}:${found.span.column}+${found.span.length}`, '4:1+41');
  assert.deepEqual(found?.values, { title: '"Upper"', option: 'precision' });
});
