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

import { bars, context, descriptorOfSource, refusalOf } from './support.js';

/** The line break a script is written with, spelled once. */
const NEWLINE = '\n';

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

test('a choice a dialog stored reaches the engine as the option the script wrote', () => {
  // `options` is a string input's argument and nothing else's (`stdlib.md`
  // 13.3), so a select's stored value and its declared option are both strings
  // and the match is on the spelling. What the conversion has to get right is
  // the one it is asked for and the one it is not: a stored choice selects the
  // option, and a stored value that names no option is not quietly the default.
  const descriptor = descriptorOfSource(
    [
      'version 1',
      'study("Choice", overlay = true)',
      'mode = input("fast", "Mode", options = ["fast", "slow"])',
      'plot(sma(close, mode == "fast" ? 5 : 20), "SMA")',
      '',
    ].join(NEWLINE),
  );
  const data = bars(40);
  const declared = descriptor.calc(data, {}, {}, context(40));
  const chosen = descriptor.calc(data, { mode: 'slow' }, {}, context(40));

  assert.equal(declared['p0']?.findIndex((one) => one !== null), 4, 'the declared default');
  assert.equal(chosen['p0']?.findIndex((one) => one !== null), 19, 'the option the user picked');

  // Replacing it with the default here would be a settings dialog that ignores
  // what it was given, one layer further down than the engine reports it.
  const refusal = refusalOf(() => descriptor.calc(data, { mode: 'sideways' }, {}, context(40)));
  assert.equal(refusal.code, 'OS6019');
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
