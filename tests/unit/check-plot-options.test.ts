import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkBody, checkRaw, codes, rawCodes } from './check-support.js';

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

// Catches a checker that treats arithmetic over a setting as a constant. The
// compiled program has no form for it, so the emitter met it with nothing to
// write and blamed itself with OS6018 (issue 0003).
test('arithmetic over an input in a fixed field is OS3025 at the argument', () => {
  const body = 'w = input(1, "Width")\nplot(close, "Close", aqua, width = w + 1)';
  assert.deepEqual(codes(body), ['OS3025']);
  const found = checkBody(body).diagnostics.find((one) => one.code === 'OS3025');
  assert.equal(found?.span.line, 4);
  assert.deepEqual(found?.values, { option: 'width' });
});

// The shape the issue was filed over, and a colour computed from a setting,
// which reached the same emitter gap through a foldable call.
test('a ternary or a colour call over an input in a fixed field is OS3025 as well', () => {
  const band = 'shade = input(true, "Shade")\nh = plot(high, "H")\nl = plot(low, "L")\nfill(h, l, aqua, opacity = shade ? 1 : 0)';
  assert.deepEqual(codes(band), ['OS3025']);
  assert.deepEqual(codes('t = input(80, "T")\nlevel(100, "L", fade(aqua, t))'), ['OS3025']);
});

// Catches the overreach: one setting as the whole of the value is the form the
// program carries, and arithmetic over literals is folded.
test('an input as the whole value, or arithmetic over literals, is not OS3025', () => {
  assert.deepEqual(codes('w = input(2, "Width")\nplot(close, "Close", aqua, width = w)'), []);
  assert.deepEqual(codes('plot(close, "Close", aqua, width = input(2, "Width"))'), []);
  assert.deepEqual(codes('plot(close, "Close", aqua, width = 1 + 1)'), []);
});

// Catches an input whose default is another setting, which the emitter wrote
// out as an absent default with nothing said.
test("an input's default or bound read from another input is OS3025", () => {
  assert.deepEqual(codes('n = input(2, "N")\nm = input(n, "M")\nplot(close, "C", width = m)'), ['OS3025']);
  assert.deepEqual(codes('n = input(9, "N")\nm = input(2, "M", max = n)\nplot(close, "C", width = m)'), ['OS3025']);
});

// Bar data is still OS3003, whose message is about bar data and true of it.
test('a value that depends on bar data is still OS3003, not OS3025', () => {
  assert.deepEqual(codes('w = input(1, "Width")\nplot(close, "Close", aqua, width = w + close)'), ['OS3003']);
});

// Catches the silent fold issue 0018 found: the compiled format carries a
// plot's style as a plain string, so the emitter wrote the input's default and
// the settings row it declared moved nothing.
test('a plot style written from an input is OS3026 at the argument', () => {
  const body = 'st = input("line", "Style", options = ["line", "step", "area"])\nplot(close, "Close", aqua, style = st)';
  const found = checkBody(body).diagnostics.filter((one) => one.code !== 'OS8018');
  assert.deepEqual(found.map((one) => one.code), ['OS3026']);
  assert.equal(found[0]?.span.line, 4);
  assert.deepEqual(found[0]?.values, { option: 'style' });
});

// The sharper reading: a select whose options are not styles at all was
// accepted, because the set check reads a value written out.
test('a style input offering values style does not take is refused as well', () => {
  const body = 'st = input("dashed", "Style", options = ["solid", "dashed"])\nplot(close, "C", aqua, style = st)';
  assert.ok(codes(body).includes('OS3026'));
});

// Catches the refusal reaching past the one field the format cannot carry:
// every other plot option keeps its reference, and the written style is fine.
test('a written style, and an input in any other plot option, are not OS3026', () => {
  assert.deepEqual(codes('plot(close, "Close", aqua, style = "step")'), []);
  assert.deepEqual(codes('w = input(2, "W")\nplot(close, "Close", aqua, width = w)'), []);
});
