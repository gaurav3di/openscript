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

/**
 * The documented example, end to end.
 *
 * `docs/inputs.md` teaches `study("S", precision = input(2, "Places"))` as how a
 * reader gets to change something the declaration decides, and for the life of
 * this module the descriptor read the declared default whatever the host had
 * stored: the number a user typed reached the engine and reached nothing the
 * chart drew it with. The wrong implementation these catch is the one that was
 * there, `lookupFor(program, {})`, which is bit for bit the same descriptor for
 * every settings map in the world.
 */
const PLACES = [
  'version 1',
  'study("S", precision = input(2, "Places"))',
  'plot(close, "C")',
  '',
].join(NEWLINE);

test('a declaration option written as an input reads the declared default when nothing is stored', () => {
  assert.deepEqual(descriptorOfSource(PLACES).plots[0]?.priceFormat, {
    type: 'price',
    precision: 2,
  });
});

test('a declaration option written as an input reads the value the host stored', () => {
  const tuned = descriptorOfSource(PLACES, { settings: { Places: 7 } });
  assert.deepEqual(tuned.plots[0]?.priceFormat, { type: 'price', precision: 7 });
});

test('the descriptor and the engine agree on the value, not only on the key', () => {
  // The two resolve the same field from the same settings, so a host that hands
  // one map to both gets a pane formatted to the number the column is computed
  // at. They disagreed here: the engine resolved 7 and the chart formatted at 2.
  const stored = { places: 7 };
  const source = [
    'version 1',
    'places = input(2, "Places")',
    'study("S", precision = places)',
    'plot(round(close, places), "C")',
    '',
  ].join(NEWLINE);
  const descriptor = descriptorOfSource(source, { settings: stored });
  const data = bars(3);
  const column = descriptor.calc(data, stored, {}, context(3));
  const drawn = descriptor.plots[0]?.priceFormat;

  assert.equal(drawn?.type === 'price' ? drawn.precision : undefined, 7);
  assert.deepEqual(
    column['p0'],
    data.map((one) => Number(one.close.toFixed(7))),
  );
});

test('a settings map the descriptor was not built with does not move the declared shape', () => {
  // The honest half of the same fact. The declared shape is a value rather than
  // a call, so it answers the settings the descriptor was built with and a host
  // that keeps one descriptor per study instance builds again on a change.
  // `spec/chart-narrowings.json` records which members do follow a later map.
  const descriptor = descriptorOfSource(PLACES, { settings: { Places: 7 } });
  descriptor.calc(bars(3), { Places: 3 }, {}, context(3));
  assert.deepEqual(descriptor.plots[0]?.priceFormat, { type: 'price', precision: 7 });
});
