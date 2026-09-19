import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codes, rawCodes, spanFor, strategyCodes, valuesFor } from './check-support.js';

/**
 * Call sites: arity, argument names, argument types, placement, and the options
 * of the declaration. `language.md` 11.2, 13 and 15.3, and `stdlib.md` 2.2.
 */

// Catches a checker that matches on arity alone and stops, which would take
// whichever signature was written first in the library.
test('an overload is chosen by arity', () => {
  assert.deepEqual(codes('plot(change(close), "C")'), []);
  assert.deepEqual(codes('plot(change(close, 5), "C")'), []);
});

// Catches a checker that counts parameters instead of required parameters,
// which would refuse every call that leaves a default alone.
test('a call may leave an optional argument out', () => {
  assert.deepEqual(codes('plot(rsi(close), "R")'), []);
});

// Catches a checker with no arity test at all.
test('too many arguments is refused, with the signature', () => {
  const body = 'plot(sma(close, 9, 3), "S")';
  assert.deepEqual(codes(body), ['OS3001']);
  assert.deepEqual(valuesFor(body, 'OS3001'), {
    name: 'sma',
    expected: '2',
    found: 3,
    signature: 'sma(src, len)',
  });
});

// Catches a checker that fills defaults silently, which would leave the
// generator to discover the hole.
test('a required argument left out is refused, with an example', () => {
  const body = 'plot(close)';
  assert.deepEqual(codes(body), ['OS3012']);
  assert.deepEqual(valuesFor(body, 'OS3012'), {
    name: 'plot',
    argument: 'title',
    example: 'plot(value, title)',
  });
});

// Catches a checker that ignores labels, which would bind a named argument
// positionally and quietly plot the wrong thing.
test('an unknown named argument is refused, and the names are listed', () => {
  const body = 'plot(close, "C", colour = aqua)';
  assert.deepEqual(codes(body), ['OS3002']);
  assert.equal(valuesFor(body, 'OS3002')?.suggestion, 'color');
});

// Catches a checker that lets a label repeat a positional argument.
test('an argument given twice is refused', () => {
  assert.deepEqual(codes('plot(close, "C", aqua, color = red)'), ['OS3013']);
});

// Catches a checker that sorts arguments before reading them, which would
// accept an order the grammar does not allow.
test('a positional argument after a named one is refused', () => {
  assert.equal(codes('plot(close, title = "C", aqua)').includes('OS3005'), true);
});

// Catches a checker that checks nothing about argument types.
test('an argument of the wrong type is refused, naming the parameter', () => {
  const body = 'plot(close, 9)';
  assert.deepEqual(codes(body), ['OS3011']);
  assert.deepEqual(valuesFor(body, 'OS3011'), {
    name: 'plot',
    argument: 'title',
    expected: 'string',
    found: 'number',
  });
});

// Catches a checker that accepts any string where a closed set is wanted, which
// would leave the host with a style it cannot draw.
test('a value outside a closed set is refused, with the nearest member', () => {
  const body = 'plot(close, "C", style = "steps")';
  assert.deepEqual(codes(body), ['OS3008']);
  assert.equal(valuesFor(body, 'OS3008')?.suggestion, 'step');
});

// Catches a checker that truncates a fractional length, which would hide the
// bug that produced it.
test('a fractional whole-number argument is refused', () => {
  const body = 'plot(close, "C", precision = 2.5)';
  assert.deepEqual(codes(body), ['OS3004']);
  assert.deepEqual(valuesFor(body, 'OS3004'), {
    name: 'plot',
    argument: 'precision',
    range: '0 to 10',
    found: 2.5,
  });
});

// Catches a checker that lets a declaration field depend on a bar, which the
// host cannot honour because the dialog is built before bar 0.
test('a declaration field computed from bar data is refused', () => {
  const body = 'plot(close, "C", width = close)';
  assert.deepEqual(codes(body), ['OS3003']);
  assert.deepEqual(valuesFor(body, 'OS3003'), { option: 'width' });
});

// Catches a checker with no placement rule, which would let a column exist on
// some bars and not others.
test('plot inside a block is refused, naming the construct', () => {
  const body = 'if close > open\n    plot(close, "C")';
  assert.deepEqual(codes(body), ['OS3006']);
  assert.deepEqual(valuesFor(body, 'OS3006'), { name: 'plot', construct: 'an if block' });
});

// Catches a checker that gives `input` the same code as `plot`: the fix is
// different, so the code is different.
test('input inside a block is its own refusal', () => {
  // The input is also never read, and an unused input is its own warning,
  // because a dialog row nothing consults is a row that misleads.
  assert.deepEqual(codes('if close > open\n    len = input(9, "L")'), ['OS8018', 'OS3007']);
});

// Catches a checker that treats fill's first two arguments as series, which
// would ask the contract to shade between a column that was never declared.
test('fill takes two declared plots and not two expressions', () => {
  const body = 'fill(close, open)';
  assert.deepEqual(codes(body), ['OS3020', 'OS3020']);
  assert.deepEqual(valuesFor(body, 'OS3020'), { argument: 'plotA', found: 'series number' });
});

// Catches a checker that accepts a handle where a runtime object belongs: a
// handle has no run-time representation at all.
test('a declaration handle given to a cell is refused', () => {
  const body = 'grid = plot(close, "C")\ncell(grid, 0, 0, "x")';
  assert.deepEqual(codes(body), ['OS3019']);
  assert.deepEqual(valuesFor(body, 'OS3019'), {
    name: 'cell',
    argument: 't',
    expected: 'table',
    found: 'plot',
  });
});

// Catches a checker that lets two columns share a legend entry, where nothing
// anywhere decides which of the two wins.
test('two plots with one title are refused', () => {
  const body = 'plot(close, "Line")\nplot(open, "Line")';
  assert.deepEqual(codes(body), ['OS3017']);
  assert.deepEqual(valuesFor(body, 'OS3017'), { kind: 'plot', name: '"Line"', line: 3 });
});

// Catches a checker that accepts a range whose ends are the wrong way round,
// which would give the pane a scale it cannot draw.
test('a study range must be a low and a high', () => {
  assert.equal(rawCodes('version 1\nstudy("T", range = [100, 0])\nplot(close, "C")\n').includes('OS3016'), true);
});

// Catches a checker that checks the declaration's options against nothing.
test('an unknown declaration option is refused', () => {
  assert.equal(
    rawCodes('version 1\nstudy("T", overlays = true)\nplot(close, "C")\n').includes('OS3002'),
    true,
  );
});

// Catches a checker that never notices a missing declaration, which would leave
// the host with a file it cannot register.
test('a file with no declaration is refused', () => {
  assert.equal(rawCodes('version 1\nplot(close, "C")\n').includes('OS2007'), true);
});

// Catches a checker that takes the first declaration and ignores the rest,
// leaving two sets of options and no rule for which wins.
test('a second declaration is refused, naming the first', () => {
  const codesFound = rawCodes('version 1\nstudy("A")\nstudy("B")\nplot(close, "C")\n');
  assert.equal(codesFound.includes('OS2008'), true);
});

// Catches a checker that lets limits() sit anywhere, where the host reads it
// before the program is loaded and would not find it.
test('limits away from the declaration is refused', () => {
  const codesFound = rawCodes('version 1\nstudy("T")\nplot(close, "C")\nlimits(loops = 100)\n');
  assert.equal(codesFound.includes('OS3014'), true);
});

// Catches a checker that accepts an input() in limits(), which is resolved too
// late for a budget the host has to agree to up front.
test('limits takes literal numbers only', () => {
  const codesFound = rawCodes(
    'version 1\nstudy("T")\nlimits(loops = input(10, "L"))\nplot(close, "C")\n',
  );
  assert.equal(codesFound.includes('OS3015'), true);
});

// Catches a checker that runs the order rules off the call's own name rather
// than the file's declaration.
test('an order function in a study is refused and in a strategy is not', () => {
  assert.equal(codes('if close > open\n    buy(qty = 1)').includes('OS7001'), true);
  assert.deepEqual(strategyCodes('if close > open\n    buy(qty = 1)'), []);
});

// Catches a checker that reports a call's placement under the whole statement.
test('a misplaced call is reported under the call itself', () => {
  assert.equal(spanFor('if close > open\n    plot(close, "C")', 'OS3006'), '4:5+16');
});
