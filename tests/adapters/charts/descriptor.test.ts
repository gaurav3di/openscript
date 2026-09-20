/**
 * The declared shape: what a chart is told before a single bar is drawn.
 *
 * Everything asserted here is fixed before bar 0, which is the whole reason the
 * compiled program carries it: a legend, a settings dialog and a pane have to
 * exist before the first bar runs. So these are tests of a table, and each one
 * names an entry of it that a wrong table would get backwards.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { descriptorOf, descriptorOfSource } from './support.js';

test('a study that overlays the price pane is placed on it, and one that does not gets a pane', () => {
  // Catches the mapping inverted, which draws every oscillator over the candles
  // and every overlay in a pane of its own, and which no numeric test notices.
  assert.equal(descriptorOf('01-ema-cross.oscript').placement, 'onchart');
  assert.equal(descriptorOf('04-rsi-divergence.oscript').placement, 'pane');
});

test('every declared input becomes one settings row, in source order, with its bounds', () => {
  const rows = descriptorOf('01-ema-cross.oscript').inputs;
  assert.deepEqual(
    rows.map((one) => [one.key, one.type]),
    [
      ['fastLen', 'number'],
      ['slowLen', 'number'],
      ['src', 'source'],
    ],
  );
  const fast = rows[0];
  assert.ok(fast !== undefined && fast.type === 'number');
  // Catches bounds dropped on the way across, which turns a guarded length into
  // a spinner that will happily produce a study of nothing.
  assert.equal(fast.default, 9);
  assert.equal(fast.min, 1);
  assert.equal(fast.max, 500);
  // A row the script left blank carries no group and no help text at all, rather
  // than an empty one a dialog would draw a heading for.
  assert.equal('group' in fast, false);
  assert.equal('tooltip' in fast, false);
});

test('a choice carries its options and its default in the order the script wrote', () => {
  // `options` belongs to a string input and to no other kind (`stdlib.md`
  // 13.3), so every select's values are strings on both sides of this boundary
  // and there is no numeric choice to convert.
  const corner = descriptorOf('08-dashboard-table.oscript').inputs.find(
    (one) => one.key === 'corner',
  );
  assert.ok(corner !== undefined && corner.type === 'select');
  assert.deepEqual(
    corner.options.map((one) => one.value),
    ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'],
  );
  assert.equal(corner.default, 'topRight');
});

test("a plot's declared style reaches the series and its colour keeps its alpha", () => {
  const plot = descriptorOf('01-ema-cross.oscript').plots[0];
  assert.ok(plot !== undefined);
  assert.equal(plot.key, 'p0');
  assert.equal(plot.type, 'line');
  assert.equal(plot.title, 'Fast');
  assert.equal(plot.style?.lineWidth, 2);
  assert.equal(plot.style?.lineStyle, 'solid');
  assert.equal(plot.style?.color, 'rgba(0, 255, 255, 1)');
  assert.equal(plot.priceScaleId, 'right');
});

test('a plot whose colour came from an input names the settings key as well as the value', () => {
  // Catches the plot being given a generated appearance row of its own, which
  // shadows the script's input: the dialog then shows two colours for one line
  // and setting the script's stops doing anything.
  const plot = descriptorOfSource(
    'version 1\nstudy("Tuned", overlay = true)\nc = input(aqua, "Line colour")\nplot(close, "Close", c)\n',
  ).plots[0];
  assert.ok(plot !== undefined);
  assert.equal(plot.colorKey, 'c');
  assert.equal(plot.style?.color, 'rgba(0, 255, 255, 1)');
});

test("a study's own scale formatting reaches its own pane and not the instrument's axis", () => {
  // Catches precision and format applied to every plot: an overlay that did so
  // would reformat the price axis of the instrument itself.
  const pane = descriptorOf('04-rsi-divergence.oscript').plots[0];
  assert.deepEqual(pane?.priceFormat, { type: 'price', precision: 2 });

  const overlay = descriptorOf('01-ema-cross.oscript').plots[0];
  assert.ok(overlay !== undefined);
  assert.equal('priceFormat' in overlay, false);
});

test('a study that fixed its pane range says so, and one that did not offers no range', () => {
  assert.deepEqual(descriptorOf('04-rsi-divergence.oscript').range?.({}), { min: 0, max: 100 });
  assert.equal(descriptorOf('01-ema-cross.oscript').range, undefined);
});

test('a band the script coloured keeps that colour, opacity and all', () => {
  const fills = descriptorOf('01-ema-cross.oscript').fills;
  assert.equal(fills?.length, 1);
  const band = fills?.[0];
  assert.deepEqual(band?.between, ['p0', 'p1']);
  assert.equal(band?.colorUp, 'rgba(0, 255, 255, 0.1)');
  assert.equal(band?.colorDown, 'rgba(0, 255, 255, 0.1)');
  // Opacity multiplies the colour's own alpha and the script named none, so it
  // stays one rather than dimming a colour that is already faded.
  assert.equal(band?.opacity, 1);
});

test("a band with no colour of its own follows the first plot's colour, faded", () => {
  // Catches a band given a fixed fallback colour: the first plot's own colour may
  // be one the host picked from its palette, so the band has to name the key
  // rather than read a value at build time.
  const band = descriptorOfSource(
    'version 1\nstudy("Band", overlay = true)\na = plot(high, "High")\nb = plot(low, "Low")\nfill(a, b)\n',
  ).fills?.[0];
  assert.equal(band?.colorUpKey, 'p0:color');
  assert.equal(band?.colorDownKey, 'p0:color');
  assert.equal(band?.colorUp, undefined);
  assert.equal(band?.opacity, 0.12);
});

test('a candle declaration is one plot naming four columns', () => {
  const plot = descriptorOfSource(
    'version 1\nstudy("Candles", overlay = true)\nplotCandles(open, high, low, close, "Bars")\n',
  ).plots[0];
  assert.ok(plot !== undefined);
  assert.equal(plot.type, 'candlestick');
  assert.deepEqual(plot.ohlc, { open: 'p0:open', high: 'p0:high', low: 'p0:low', close: 'p0:close' });
  // The up and down colours are the series' own style, so a candle whose colours
  // are constants costs nothing per bar.
  assert.equal(plot.style?.upColor, 'rgba(0, 255, 0, 1)');
  assert.equal(plot.style?.downColor, 'rgba(255, 0, 0, 1)');
  // A null override means the part follows the body, so the wick and the border
  // take the body's colour rather than a colour of the host's choosing.
  assert.equal(plot.style?.wickUpColor, 'rgba(0, 255, 0, 1)');
  assert.equal(plot.style?.borderDownColor, 'rgba(255, 0, 0, 1)');
  assert.equal(plot.colorParts, undefined);
});

test('the id is the source, so two studies with one title are two studies', () => {
  // Catches an id taken from the title: a saved layout stores the id, and two
  // scripts sharing a name would restore into each other's settings.
  const one = 'version 1\nstudy("Average")\nplot(sma(close, 10), "A")\n';
  const two = 'version 1\nstudy("Average")\nplot(sma(close, 20), "A")\n';
  assert.notEqual(descriptorOfSource(one).id, descriptorOfSource(two).id);
  assert.equal(descriptorOfSource(one).id, descriptorOfSource(one).id);
  assert.equal(descriptorOfSource(one, { id: 'mine' }).id, 'mine');
});
