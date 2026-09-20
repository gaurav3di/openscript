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

// Catches a checker that lets both colour forms through, where reconciling one
// colour for the band with one per side would need a rule nobody agrees on.
test('one colour for the band and one per side cannot both be given', () => {
  const body = 'a = plot(high, "H")\nb = plot(low, "L")\nfill(a, b, color = aqua, colorUp = lime)';
  assert.deepEqual(codes(body), ['OS3010']);
  assert.deepEqual(valuesFor(body, 'OS3010'), { first: 'color', second: 'colorUp' });
});

// Catches a checker that lets an absolute price and a distance from the entry
// state the same level, where the two would have to be reconciled.
test('an absolute exit price and a distance cannot both be given', () => {
  const body = 'if close > open\n    exit(tag = "e", limit = close, profit = 10)';
  assert.deepEqual(strategyCodes(body), ['OS3010']);
});

// Catches a checker that lets a menu open on a value it does not offer.
test('an input default outside its options is refused', () => {
  const body = 'mode = input("quick", "Mode", options = ["fast", "slow"])\nplot(close, mode)';
  assert.deepEqual(codes(body), ['OS3018']);
  assert.deepEqual(valuesFor(body, 'OS3018'), {
    default: '"quick"',
    values: '["fast", "slow"]',
  });
});

// Catches a checker that accepts an alert on every update in a file that never
// runs on a moving bar, where the alert could not fire at all.
test('an alert on every update needs the declaration to allow it', () => {
  const body = 'if close > open\n    alert("up", id = "u", frequency = "everyUpdate")';
  assert.deepEqual(codes(body), ['OS3009']);
  assert.deepEqual(valuesFor(body, 'OS3009'), {
    option: 'frequency',
    value: 'everyUpdate',
    required: 'onUnconfirmed = true',
  });
  assert.deepEqual(
    rawCodes(
      'version 1\nstudy("T", onUnconfirmed = true)\nif close > open\n    alert("up", id = "u", frequency = "everyUpdate")\n',
    ),
    [],
  );
});

// Catches a checker that reports a call's placement under the whole statement.
test('a misplaced call is reported under the call itself', () => {
  assert.equal(spanFor('if close > open\n    plot(close, "C")', 'OS3006'), '4:5+16');
});

// Catches the parameter that took whatever it was given. A setter written
// `obj: any` accepted a label where a line belongs, the engine wrote an anchor
// the label has no field for, and the script drew nothing and was told nothing.
// The kinds a setter takes are the kinds whose creation call takes that
// property, which is `stdlib.md` 14.4 read down its own table.
test('a setter given an object of the wrong kind is refused, naming the kinds it takes', () => {
  const body = 'tag = draw.label(time, close, "x")\ndraw.setFrom(tag, time, close)';
  assert.deepEqual(codes(body), ['OS3011']);
  assert.deepEqual(valuesFor(body, 'OS3011'), {
    name: 'draw.setFrom',
    argument: 'obj',
    expected: 'line or box',
    found: 'label',
  });
  // The caret sits on the argument, not on the call: the call is right and one
  // of its arguments is wrong.
  assert.equal(spanFor(body, 'OS3011'), '4:14+3');
});

// Catches the worse half of the same defect: a value that is not an object at
// all reached the engine, which did nothing with it, on every bar, in silence.
test('a setter given something that is not an object is refused', () => {
  const body = 'draw.setColor(5, red)';
  assert.deepEqual(codes(body), ['OS3011']);
  assert.deepEqual(valuesFor(body, 'OS3011'), {
    name: 'draw.setColor',
    argument: 'obj',
    expected: 'line, label, box or polyline',
    found: 'number',
  });
});

// Catches a set that lets everything through, which is the same as `any` with
// more words. Each of these is the kind that carries the property being written.
test('a setter takes every kind that carries the property, and no others', () => {
  const held =
    'seg = draw.line(time, close, time, open)\n' +
    'tag = draw.label(time, close, "x")\n' +
    'zone = draw.box(time, high, time, low)\n' +
    'path = draw.polyline([time], [close])\n';
  // The three handles a case does not mutate are never read, which is its own
  // warning and not what this test is about.
  const typing = (call: string): readonly string[] =>
    codes(`${held}${call}`).filter((one) => one !== 'OS8010');

  assert.deepEqual(typing('draw.setFrom(zone, time, close)'), [], 'a box has two anchors');
  assert.deepEqual(typing('draw.setText(zone, "x")'), [], 'a box carries text');
  assert.deepEqual(typing('draw.setFillColor(path, red)'), [], 'a polyline has a fill');
  assert.deepEqual(typing('draw.setWidth(path, 2)'), [], 'a polyline has a width');
  assert.deepEqual(typing('draw.setColor(tag, red)'), [], 'every kind has a colour');
  assert.deepEqual(typing('draw.setTooltip(tag, "why")'), [], 'a label has a tooltip');

  assert.deepEqual(typing('draw.setFillColor(seg, red)'), ['OS3011'], 'a line has no fill');
  assert.deepEqual(typing('draw.setWidth(tag, 2)'), ['OS3011'], 'a label has no width');
  assert.deepEqual(typing('draw.setStyle(zone, "dashed")'), ['OS3011'], 'a box has no style');
  assert.deepEqual(typing('draw.setTooltip(seg, "why")'), ['OS3011'], 'a line has no tooltip');
  assert.deepEqual(typing('draw.setPoints(zone, [time], [close])'), ['OS3011']);
  assert.deepEqual(typing('draw.setAt(seg, time, close)'), ['OS3011']);
});

// Catches a set that answers OS3011 for a declaration handle. A handle has no
// value on a bar at all, which is a different mistake with a different fix, and
// OS3019's own example in the catalogue is this call.
test('a declaration handle given to a setter keeps its own code', () => {
  const body = 'upper = plot(close, "U")\ndraw.setColor(upper, red)';
  assert.deepEqual(codes(body), ['OS3019']);
  assert.deepEqual(valuesFor(body, 'OS3019'), {
    name: 'draw.setColor',
    argument: 'obj',
    expected: 'line, label, box or polyline',
    found: 'plot',
  });
});

// Catches a set that refuses absence. An absent handle is a gap like every other
// absence reaching a drawing surface, and it is what the fix for OS4005 asks a
// script to produce.
test('a setter given an absent handle is not a type error', () => {
  assert.deepEqual(codes('var seg = none\ndraw.setColor(seg, red)'), []);
});
