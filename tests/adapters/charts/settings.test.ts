/**
 * What a settings dialog stores, and what the engine is given for it.
 *
 * The two vocabularies meet here and neither is the other's. A dialog stores
 * strings and numbers a layout can be written to a file; the engine takes the
 * values the language has. The conversions are one file's worth of code and each
 * one has a way of being quietly wrong: a colour losing its transparency, a
 * choice arriving as the text of a number rather than the number, a stored value
 * silently replaced by the default when it should have been refused.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { bars, context, descriptorOfSource } from './support.js';

/** A script whose plotted colour is an input, read per bar so it reaches a channel. */
const TINTED = [
  'version 1',
  'study("Tinted", overlay = true)',
  'c = input(fade(aqua, 50), "Line colour")',
  'plot(close, "Close", color = close > open ? c : c)',
  '',
].join('\n');

/** The colour the plot painted on its first bar with a value. */
function painted(settings: Record<string, unknown>): string | undefined {
  const descriptor = descriptorOfSource(TINTED);
  const data = bars(10);
  const values = descriptor.calc(data, settings, {}, context(10));
  const plot = descriptor.plots[0];
  const value = values['p0']?.[0];
  if (plot?.colorBy === undefined || typeof value !== 'number') return undefined;
  return plot.colorBy({ value, index: 0, values, settings });
}

test('a colour the script faded arrives at the engine with its alpha', () => {
  assert.equal(painted({}), 'rgba(0, 255, 255, 0.5)');
});

test('a colour a swatch stored keeps the transparency the script declared', () => {
  // A chart's colour control is six digits and has no alpha channel, so every
  // translucent input would turn opaque the first time somebody opened the
  // dialog. The stored digits replace the channels and leave the alpha alone.
  assert.equal(painted({ c: '#ff0000' }), 'rgba(255, 0, 0, 0.5)');
});

test('a colour that states its own alpha replaces the declared one', () => {
  assert.equal(painted({ c: '#ff000040' }), 'rgba(255, 0, 0, 0.25098039215686274)');
  assert.equal(painted({ c: 'rgba(255, 0, 0, 0.8)' }), 'rgba(255, 0, 0, 0.8)');
});

test('a choice stored as text reaches the engine as the value the script wrote', () => {
  // A select control's values are strings even where the declared choices are
  // numbers, so a stored "20" has to become the number 20. Passed through as
  // text the engine refuses it, and the study stops instead of drawing.
  const descriptor = descriptorOfSource(
    'version 1\nstudy("Choice")\nn = input(10, "Length", options = [10, 20])\nplot(sma(close, n), "SMA")\n',
  );
  const data = bars(40);
  const ten = descriptor.calc(data, { n: '10' }, {}, context(40));
  const twenty = descriptor.calc(data, { n: '20' }, {}, context(40));
  const asNumber = descriptor.calc(data, { n: 20 }, {}, context(40));

  assert.equal(ten['p0']?.findIndex((one) => one !== null), 9);
  assert.equal(twenty['p0']?.findIndex((one) => one !== null), 19);
  // The number and its text are the same setting, so a layout saved by a dialog
  // and one written by a host agree.
  assert.deepEqual(twenty['p0'], asNumber['p0']);
});

test('a source input selects the series the engine reads each bar', () => {
  const descriptor = descriptorOfSource(
    'version 1\nstudy("Source", overlay = true)\ns = input(close, "Source")\nplot(s, "Picked")\n',
  );
  const data = bars(5);
  const closes = descriptor.calc(data, {}, {}, context(5));
  const highs = descriptor.calc(data, { s: 'high' }, {}, context(5));
  assert.deepEqual(closes['p0'], data.map((one) => one.close));
  assert.deepEqual(highs['p0'], data.map((one) => one.high));
});
