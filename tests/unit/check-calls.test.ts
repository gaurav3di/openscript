import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  checkStrategy,
  codes,
  rawCodes,
  spanFor,
  strategyCodes,
  valuesFor,
} from './check-support.js';

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

// Catches a checker that reads the single line form of a body as though it
// stood at the top level, which is what it used to do. `language.md` 13.4 says
// an input() may appear only at the top level, never inside a block or a
// function, and the two spellings of a body are the same construct: the
// indented form was refused and `fn f(x) => x + input(3, "K")` was not.
test('a single line function body is inside a function, like the indented form', () => {
  const body = 'fn f(x) => x + input(3, "K")\nplot(f(close), "C")';
  assert.deepEqual(codes(body), ['OS3007']);
  assert.equal(spanFor(body, 'OS3007'), '3:16+13');
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

/**
 * OS3021. Catches a checker that lets an input be written with no name and no
 * title, which leaves it with nothing to be keyed by: `host-interface.md` 8.1
 * keys a stored value by the name the input was assigned to, and an input
 * written where a value belongs is assigned to none, so the title is the key.
 * A checker that accepted it would put a row with no label in the dialog and a
 * value under the empty string, and the next input written with no title would
 * share it.
 */
test('an input with neither a name nor a title has nothing to key it by', () => {
  const body = 'plot(close + input(2), "C")';
  assert.deepEqual(codes(body), ['OS3021']);
  assert.equal(spanFor(body, 'OS3021'), '3:14+8');

  // The same call on the declaration line, which is the one place a name cannot
  // be put in front of it (issues/0014), so it is where the rule has to hold.
  assert.deepEqual(rawCodes('version 1\nstudy("R", precision = input(2))\nplot(close, "C")\n'), [
    'OS3021',
  ]);

  // A title makes it legal, and so does a name, and neither is reported.
  assert.deepEqual(codes('plot(close + input(2, "Offset"), "C")'), []);
  assert.deepEqual(codes('off = input(2)\nplot(close + off, "C")'), []);

  // A constant expression where the title goes is not a title: the row's label
  // and its key are both read from the line, so the compiler does not fold one
  // and the entry says so rather than leaving the row unlabelled in silence.
  // Catches a check that looks for a written argument instead of a literal.
  assert.deepEqual(codes('plot(close + input(2, "Off" + "set"), "C")'), ['OS3021']);
});

/**
 * OS3024. Catches a checker that answers `input(2, "")` with OS3021, whose
 * message says the input "has no title written as a string literal" and whose
 * fix says to give it one. The reader did. It is empty. A message and a fix
 * that are both already true of the program in front of somebody tell them to
 * change nothing, which CLAUDE.md refuses more firmly than it refuses a missing
 * check, so the empty title is its own code with its own sentence.
 */
test('an input written in place with an empty title is refused in its own words', () => {
  const body = 'plot(close + input(2, ""), "C")';
  assert.deepEqual(codes(body), ['OS3024']);
  assert.equal(spanFor(body, 'OS3024'), '3:14+12');

  // The declaration line, where a name cannot be put in front of the call.
  assert.deepEqual(
    rawCodes(['version 1', 'study("R", precision = input(2, ""))', 'plot(close, "C")', ''].join('\n')),
    ['OS3024'],
  );

  // And the two programs that are still OS3021: no title argument at all, and
  // a title that is not a string literal. Catches a checker that widened the
  // empty case over both instead of separating them.
  assert.deepEqual(codes('plot(close + input(2), "C")'), ['OS3021']);
  assert.deepEqual(codes('plot(close + input(2, "Off" + "set"), "C")'), ['OS3021']);
});

/**
 * The other half of the same decision, `spec/decisions.md` 45.
 *
 * An input assigned to a name already has a key, so an empty title there is no
 * key that is missing: it is a label, and the name is the label a row with no
 * title takes anyway (`language.md` 13.4). It is read as no title rather than
 * refused, and this pins it, because "silently takes its name" is a sentence
 * that is either a decision or an accident and nothing in the tree said which.
 */
test('a named input with an empty title is labelled by its name and refused nothing', () => {
  const drawn = 'plot(sma(close, len), "C")';
  assert.deepEqual(codes(['len = input(14, "")', drawn].join('\n')), []);
  assert.deepEqual(codes(['len = input(14)', drawn].join('\n')), []);
});

/**
 * OS3022. Catches a checker that lets two inputs land on one settings key: the
 * host stores one value per key, so one of the two rows would silently take the
 * other's value. Two equal titles are already OS3017; this is the case that is
 * not equal titles, a title spelling another input's name, which the title
 * check cannot see because it never compares the two spaces.
 */
test('an input keyed by its title cannot take another input name', () => {
  const body = 'width = input(2, "Width")\nplot(close + width * input(3, "width"), "Band")';
  assert.deepEqual(codes(body), ['OS3022']);
  assert.deepEqual(valuesFor(body, 'OS3022'), { name: '"width"', line: 3 });

  // The same two rows with distinct keys, which is what the fix produces.
  assert.deepEqual(
    codes('width = input(2, "Width")\nplot(close + width * input(3, "Multiplier"), "Band")'),
    [],
  );

  // A title equal to the input's own name is one input, not two, so nothing is
  // taken and nothing is reported.
  assert.deepEqual(codes('width = input(2, "width")\nplot(close + width, "Band")'), []);
});

/**
 * A `var` holding a setting is not a compile-time constant, so it cannot be a
 * declaration option. Catches a checker that asks whether a name was given an
 * input rather than whether it is one: the option would pass the check, the
 * emitter would find nothing to fold, and the reader would be handed a lone
 * OS6018 telling them their script came from a broken compiler.
 */
test('a var initialised from an input is not a constant option', () => {
  const body = 'var k = input(3, "K")\nplot(close, "C", width = k)';
  assert.deepEqual(codes(body), ['OS3003']);
  assert.deepEqual(valuesFor(body, 'OS3003'), { option: 'width' });

  // The name without the `var` is the setting itself, and is an option.
  assert.deepEqual(codes('k = input(3, "K")\nplot(close, "C", width = k)'), []);
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

// Catches a checker that reads a leg argument against a set of declared names,
// which is empty in this release: with nothing to compare against, every
// spelling passed and the order was placed on the only leg there is.
// `buy(leg = "a")` then `close(leg = "b")` flattened the position and said
// nothing, and a name the script computed was dropped just as quietly.
test('an order that names a leg is refused while no file declares one', () => {
  const body = 'if close > open\n    buy(qty = 1, leg = "hedge")';
  assert.deepEqual(strategyCodes(body), ['OS3023']);
  assert.deepEqual(checkStrategy(body).diagnostics[0]?.values, {
    name: 'buy',
    argument: 'leg',
  });
});

// Catches a checker that only reads a literal, which is what the set check
// beside this one does: a computed name reached the engine and was ignored.
test('a computed leg is refused as a written one is', () => {
  const body = 'name = "he" + "dge"\nif close > open\n    close(leg = name)';
  assert.deepEqual(strategyCodes(body), ['OS3023']);
});

// Catches a rule keyed on the name `leg` anywhere rather than on the argument
// of an order function, and a rule that refuses the order functions outright.
test('an order that names no leg is not refused, and neither is its tag', () => {
  assert.deepEqual(strategyCodes('if close > open\n    buy(qty = 1, tag = "leg")'), []);
  assert.deepEqual(strategyCodes('if close > open\n    order.reverse()'), []);
});
