import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codes, spanFor, typeOfName, valuesFor } from './check-support.js';

/**
 * Types, language.md sections 5, 6 and 10.1.
 *
 * The rules that cost the most to get wrong are the ones about `none`, because
 * a checker that treats absence as an ordinary type either refuses correct
 * scripts or lets a gap through as a number. Most of what is below is about
 * that one word.
 */

// Catches a checker with any implicit conversion at all: the rule is that there
// is none, and a zero is not a false anywhere in this language.
test('a number and a bool do not mix', () => {
  assert.deepEqual(codes('plot(1 + true, "X")'), ['OS2003']);
  assert.deepEqual(valuesFor('plot(1 + true, "X")', 'OS2003'), {
    leftType: 'number',
    rightType: 'bool',
  });
});

// Catches a checker that makes `+` universal, which would turn a missing
// text() into a silently concatenated number.
test('a string and a number do not mix under plus', () => {
  assert.deepEqual(codes('label = "count: " + 5\nplot(close, "C")\nprint(label)'), ['OS2003']);
});

// Catches a checker with truthiness, which would take a branch on a count.
test('a condition must be a bool', () => {
  const body = 'if volume\n    signal("V")';
  assert.deepEqual(codes(body), ['OS2011']);
  assert.deepEqual(valuesFor(body, 'OS2011'), { type: 'series number', name: 'volume' });
});

// Catches a checker that fixes a name's type on any first assignment, which
// would make every `var x = none` a name of type none for the rest of the file.
test('none does not fix a type, and the next definite value does', () => {
  assert.equal(typeOfName('var stop = none\nstop = low\nplot(stop, "S")', 'stop'), 'series number');
  assert.deepEqual(codes('var stop = none\nstop = low\nplot(stop, "S")'), []);
});

// Catches a checker that lets a second definite type through, which is the
// mistake the rule exists for.
test('a second definite type on one name is refused', () => {
  const body = 'len = 14\nlen = "fourteen"\nplot(sma(close, 9), "C")\nprint(len)';
  assert.deepEqual(codes(body), ['OS2003']);
  assert.deepEqual(valuesFor(body, 'OS2003'), { leftType: 'number', rightType: 'string' });
});

// Catches a checker that refuses a none arm, which would make the standard way
// of hiding a plot on some bars an error.
test('one arm of a ternary may be none', () => {
  assert.deepEqual(codes('plot(close > open ? close : none, "C")'), []);
});

// Catches a checker that accepts any two arms, which would leave the generator
// with a column holding two kinds of value.
test('two arms of different types are refused', () => {
  const body = 'plot(close > open ? 1 : "up", "C")';
  assert.deepEqual(codes(body), ['OS2012']);
  assert.deepEqual(valuesFor(body, 'OS2012'), { leftType: 'number', rightType: 'string' });
});

// Catches a checker that takes the first element's type and stops looking.
test('an array literal that mixes types is refused, naming the index', () => {
  const body = 'values = [1, 2, "three"]\nplot(element(values, 0), "V")';
  assert.deepEqual(codes(body), ['OS2013']);
  assert.deepEqual(valuesFor(body, 'OS2013'), {
    firstType: 'number',
    otherType: 'string',
    index: 2,
  });
});

// Catches a checker that leaves an empty literal untyped forever, which would
// hand the generator an array whose element width nothing knows.
test('an empty array with no annotation and no insertion is refused', () => {
  assert.deepEqual(codes('var hits = []\nplot(size(hits), "H")'), ['OS2015']);
});

// Catches a checker that ignores the insertion rule, which would refuse the
// ordinary way a study collects values.
test('an empty array takes its element type from the first insertion', () => {
  const body = 'var hits = []\npush(hits, close)\nplot(size(hits), "H")';
  assert.deepEqual(codes(body), []);
  assert.equal(typeOfName(body, 'hits'), 'array<number>');
});

// Catches a checker that accepts any word in a type position.
test('an unknown type in an annotation is refused', () => {
  const body = 'var tally: whole = 0\nplot(tally, "C")';
  assert.deepEqual(codes(body), ['OS2016']);
  assert.deepEqual(valuesFor(body, 'OS2016'), { type: 'whole' });
});

// Catches a checker that lets a declaration handle into an array, which cannot
// hold one because a handle has no run-time representation at all.
test('a plot cannot be an array element', () => {
  const body = 'var pens: array<plot> = []\nplot(close, "C")\nprint(pens)';
  assert.deepEqual(codes(body), ['OS2019']);
  assert.deepEqual(valuesFor(body, 'OS2019'), { type: 'plot' });
});

// Catches a checker that lets `[]` read the past of anything, which would cost
// memory per bar for every temporary in every loop body.
test('history is refused on a value that has none', () => {
  const body = 'if close > open\n    inner = close - open\n    plot(inner[1], "I")';
  assert.equal(codes(body).includes('OS2004'), true);
  assert.deepEqual(valuesFor(body, 'OS2004'), { expr: 'inner' });
});

// Catches a checker that refuses history on a top-level name, which is the one
// place the language promises it.
test('history is allowed on a name declared at the top level', () => {
  assert.deepEqual(codes('diff = close - open\nplot(diff[1], "D")'), []);
});

// Catches a checker that dispatches `[]` at run time: an array index and a
// history read are told apart by the target's type, at compile time.
test('an index into an array is element access, not history', () => {
  const body = 'levels = [20.0, 50.0, 80.0]\nplot(levels[1], "L")';
  assert.deepEqual(codes(body), []);
});

// Catches a checker that lets a call returning nothing stand as a value.
test('a call that draws rather than computing has no value', () => {
  const body = 'plot(signal("X"), "S")';
  assert.equal(codes(body).includes('OS2003'), true);
  assert.deepEqual(valuesFor(body, 'OS2003'), {
    leftType: 'series number',
    rightType: 'nothing',
  });
});

// Catches a checker that reports the whole statement, which would put a caret
// under a correct line and leave the reader looking for the wrong thing.
test('a type mismatch is reported under the name being assigned', () => {
  assert.equal(spanFor('len = 14\nlen = "x"\nplot(len, "L")', 'OS2003'), '4:1+3');
});
