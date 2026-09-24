import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bodyOf, codesOf, imported, pointsOf, v5 } from './support.js';

/**
 * The calls that trade, and the declaration that decides what they may do.
 *
 * The two order models are close and not the same, so every order call warns
 * once with OS9010. What is asserted beyond the warning is the part of the
 * source dialect's behaviour the translation does keep: an entry closes the
 * opposite side first and is not repeated on its own side, an exit's levels do
 * not replace another side's, and a distance in ticks becomes a price distance.
 */

// Without the warning a reader would take a translated strategy's trades as
// the original's; with one per call a script with ten orders would drown.
test('OS9010: each order call warns once, at its first use', () => {
  const text = v5(
    'strategy("S")',
    'if close > open',
    '    strategy.entry("L", strategy.long)',
    'if close < open',
    '    strategy.entry("S", strategy.short)',
    'if high > high[1]',
    '    strategy.close("L")',
    'strategy.exit("X", "L", stop = low)',
  );
  const result = imported(text);
  assert.deepEqual(pointsOf(text, result, 'OS9010'), [
    { code: 'OS9010', covers: 'strategy.entry', line: 4, column: 5 },
    { code: 'OS9010', covers: 'strategy.close', line: 8, column: 5 },
    { code: 'OS9010', covers: 'strategy.exit', line: 9, column: 1 },
  ]);
  assert.equal(result.findings[0]?.values.call, 'strategy.entry');
});

// An entry that did not close the opposite side would leave both open; one
// that was not guarded on its own side would be refused by pyramiding in
// OpenScript where the source dialect ignores it.
test('an entry closes the opposite side and is guarded on its own', () => {
  const text = v5('strategy("S")', 'if close > open', '    strategy.entry("L", strategy.long, qty = 3)', 'if close < open', '    strategy.entry("S", strategy.short)');
  assert.deepEqual(bodyOf(imported(text)).slice(1), [
    'if close > open',
    '    if pos.size < 0',
    '        close()',
    '    if pos.size <= 0',
    '        buy(qty = 3, tag = "L")',
    'if close < open',
    '    if pos.size > 0',
    '        close()',
    '    if pos.size >= 0',
    '        sell(tag = "S")',
  ]);
});

// With pyramiding above one the own-side guard would refuse entries the source
// allows, so it is dropped, and the limit it cannot match is reported.
test('pyramiding above one drops the own-side guard and reports the difference', () => {
  const text = v5('strategy("S", pyramiding = 3)', 'strategy.entry("L", strategy.long)');
  const result = imported(text);
  assert.deepEqual(pointsOf(text, result, 'OS9006').map((one) => one.covers), ['pyramiding = 3']);
  assert.deepEqual(bodyOf(result).slice(1), ['if pos.size < 0', '    close()', 'buy(tag = "L")']);
  assert.match(result.source, /^strategy\("S", pyramiding = 3, capital = 1000000\)$/m);
});

// A long exit and a short exit called on every bar would replace each other's
// levels in OpenScript, where a leg has one stop; each is guarded by its side.
test('an exit is guarded by the side of the entry it names, and ticks become a price distance', () => {
  const text = v5(
    'strategy("S")',
    'strategy.entry("L", strategy.long)',
    'strategy.entry("S", strategy.short)',
    'strategy.exit("XL", "L", stop = low, limit = high)',
    'strategy.exit("XS", from_entry = "S", profit = 20, loss = 10)',
    'strategy.exit("All", stop = low - 1)',
  );
  assert.deepEqual(bodyOf(imported(text)).slice(-5), [
    'if pos.size >= 0',
    '    exit(tag = "XL", stop = low, limit = high)',
    'if pos.size <= 0',
    '    exit(tag = "XS", profit = 20 * chart.tickSize, loss = 10 * chart.tickSize)',
    'exit(tag = "All", stop = low - 1)',
  ]);
});

// The source dialect counts a quantity written on an entry in contracts, and
// OpenScript counts it in the declaration's unit: in a strategy sized as a
// percentage of equity, qty = 2 would become two percent.
test('OS9006: an entry quantity is refused where the declaration does not size in units', () => {
  const sized = v5('strategy("S", default_qty_type = strategy.percent_of_equity, default_qty_value = 10)', 'strategy.entry("L", strategy.long, qty = 2)');
  assert.deepEqual(pointsOf(sized, imported(sized), 'OS9006').map((one) => one.covers), ['qty = 2']);
  const units = v5('strategy("S", default_qty_type = strategy.fixed)', 'strategy.entry("L", strategy.long, qty = 2)');
  assert.deepEqual(codesOf(imported(units)), ['OS9010']);
  const unstated = v5('strategy("S", default_qty_type = strategy.percent_of_equity)', 'strategy.entry("L", strategy.long)');
  assert.deepEqual(codesOf(imported(unstated)), ['OS9010']);
});

// An exit naming an entry nothing places has no side to be guarded by.
test('OS9006: an exit naming an entry the script never places is refused', () => {
  const text = v5('strategy("S")', 'strategy.exit("X", "Missing", stop = low)');
  assert.deepEqual(pointsOf(text, imported(text), 'OS9006').map((one) => one.covers), ['"Missing"']);
});

// A close by id, a close of everything, and the position read back.
test('closes and the position facts translate one to one', () => {
  const text = v5(
    'strategy("S")',
    'strategy.entry("L", strategy.long)',
    'if strategy.position_size > 0 and close < strategy.position_avg_price',
    '    strategy.close("L")',
    'if bar_index > 100',
    '    strategy.close_all()',
  );
  const body = bodyOf(imported(text));
  for (const line of ['if pos.size > 0 and close < pos.avgPrice', '    close(tag = "L")', 'if bar.index > 100', '    close()']) {
    assert.ok(body.includes(line), `${line} is not in:\n${body.join('\n')}`);
  }
});

// The source dialect starts a strategy with a million and OpenScript with a
// hundred thousand: a declaration that left it out would size every
// percentage order to a tenth.
test('the declaration writes out every default the two languages disagree about', () => {
  const plain = imported(v5('strategy("S")', 'plot(close)'));
  assert.match(plain.source, /^strategy\("S", capital = 1000000\)$/m);
  const full = imported(
    v5(
      'strategy("S", overlay = true, initial_capital = 5000, default_qty_type = strategy.cash, default_qty_value = 100, commission_value = 0.1, slippage = 3, process_orders_on_close = true, currency = currency.EUR)',
      'plot(close)',
    ),
  );
  assert.match(
    full.source,
    /^strategy\("S", overlay = true, capital = 5000, qtyType = "cash", qty = 100, commission = 0\.1, slippage = 3, fillOn = "close", currency = "EUR", commissionType = "percent"\)$/m,
  );
  assert.deepEqual(codesOf(full), []);
});

// A study that places an order is refused by OpenScript's own checker; the
// importer hands that on rather than turning the study into a strategy.
test('an order in a study is refused by the compiler and kept as a comment', () => {
  const text = v5('indicator("X")', 'if close > open', '    strategy.entry("L", strategy.long)');
  const result = imported(text);
  assert.deepEqual(codesOf(result), ['OS9012']);
  assert.equal(result.findings[0]?.values.code, 'OS7001');
});
