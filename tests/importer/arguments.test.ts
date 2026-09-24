import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bodyOf, codesOf, imported, pointsOf, v5 } from './support.js';

/**
 * Arguments the importer cannot carry: OS9006 where leaving one out changes
 * what the script computes or trades, OS9009 where it changes only the picture.
 */

// Dropping the timeframe silently would compute the whole study on the chart's
// bars and draw a plausible line; keeping the declaration out would leave a
// file that is not a program.
test('OS9006: a declaration option with no equivalent is left out of the declaration, and said', () => {
  const text = v5('indicator("Daily", timeframe = "D")', 'plot(close)');
  const result = imported(text);
  assert.deepEqual(pointsOf(text, result, 'OS9006'), [{ code: 'OS9006', covers: 'timeframe = "D"', line: 2, column: 20 }]);
  assert.equal(result.findings[0]?.values.argument, 'timeframe');
  assert.equal(result.findings[0]?.values.call, 'indicator');
  assert.match(result.source, /^study\("Daily"\)$/m);
});

// The same option written at the value that changes nothing is not a finding:
// an importer that refused on the name alone would bury real refusals in noise.
test('OS9006: an option written at its inert value raises nothing', () => {
  const text = v5('indicator("Chart", timeframe = "", overlay = true)', 'plot(close)');
  assert.deepEqual(codesOf(imported(text)), []);
});

// A strategy's intrabar recalculation and margin change its trades.
test('OS9006: strategy options that change trading are reported one by one', () => {
  const text = v5('strategy("S", calc_on_every_tick = true, margin_long = 50)', 'plot(close)');
  const result = imported(text);
  assert.deepEqual(
    pointsOf(text, result, 'OS9006').map((one) => one.covers),
    ['calc_on_every_tick = true', 'margin_long = 50'],
  );
});

// An entry with a limit price is a resting order in the source dialect and a
// fresh order on every bar in a translation that called buy() each time.
test('OS9006: an order argument with no equivalent keeps the order call as a comment', () => {
  const text = v5('strategy("S")', 'if close > open', '    strategy.entry("L", strategy.long, limit = close - 1)', 'plot(close)');
  const result = imported(text);
  assert.deepEqual(pointsOf(text, result, 'OS9006'), [{ code: 'OS9006', covers: 'limit = close - 1', line: 4, column: 40 }]);
  assert.match(result.source, /^\/\/ not translated \(OS9006\):     strategy\.entry/m);
  assert.ok(!/buy\(/.test(result.source));
});

// An input's menu of numbers has no OpenScript spelling, and the input itself
// is read by the rest of the script, so the input stays and the menu goes.
test('OS9006: an input keeps its value and loses the argument it cannot carry', () => {
  const text = v5('indicator("X")', 'len = input.int(14, "Length", options = [7, 14, 21])', 'plot(ta.sma(close, len))');
  const result = imported(text);
  assert.deepEqual(pointsOf(text, result, 'OS9006').map((one) => one.covers), ['options = [7, 14, 21]']);
  assert.ok(bodyOf(result).includes('len = input(14, "Length")'));
  assert.ok(bodyOf(result).includes('plot(sma(close, len), "Plot")'));
});

// A trailing exit is a rule evaluated every bar, and a quantity on a close is a
// claim about the position; neither has a translation that keeps its meaning.
test('OS9006: trailing exits and stated close quantities are refused', () => {
  const text = v5('strategy("S")', 'strategy.exit("X", trail_points = 50)', 'strategy.close("L", qty = 2)', 'strategy.entry("L", strategy.long)');
  const result = imported(text);
  assert.deepEqual(pointsOf(text, result, 'OS9006').map((one) => one.covers), ['trail_points = 50', 'qty = 2']);
});

// A presentation argument dropped without a word is the silent approximation
// the importer exists to refuse, even where it only changes the picture.
test('OS9009: a presentation argument is left out of the call and reported', () => {
  const text = v5(
    'indicator("X", max_bars_back = 500)',
    'plot(close, "Close", trackprice = true, display = display.none)',
    'bgcolor(color.new(color.red, 90), title = "Shade")',
    'plotshape(close > open, text = "Up", title = "Rise", size = size.small)',
  );
  const result = imported(text);
  assert.deepEqual(
    pointsOf(text, result, 'OS9009').map((one) => [one.covers, one.line]),
    [
      ['max_bars_back = 500', 2],
      ['trackprice = true', 3],
      ['display = display.none', 3],
      ['title = "Shade"', 4],
      ['title = "Rise"', 5],
      ['size = size.small', 5],
    ],
  );
  assert.deepEqual(bodyOf(result).slice(1), [
    'plot(close, "Close")',
    'background(fade(red, 90))',
    'if close > open',
    '    signal("Up")',
  ]);
});

// A style OpenScript's plot does offer must not be reported as left out, and
// one it does not must be.
test('OS9009: a plot style is carried where OpenScript has it and reported where it does not', () => {
  const text = v5('indicator("X")', 'plot(close, "A", style = plot.style_histogram)', 'plot(open, "B", style = plot.style_circles)');
  const result = imported(text);
  assert.deepEqual(pointsOf(text, result, 'OS9009').map((one) => one.covers), ['style = plot.style_circles']);
  assert.ok(bodyOf(result).includes('plot(close, "A", style = "histogram")'));
  assert.ok(bodyOf(result).includes('plot(open, "B")'));
});
