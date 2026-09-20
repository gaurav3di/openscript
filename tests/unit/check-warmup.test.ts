import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkBody, codes, valuesFor, warmupOfName } from './check-support.js';

/**
 * Warmup: the first bar an expression can honestly produce a value for.
 *
 * `stdlib.md` section 1 calls a warmup a promise rather than a hint, and the
 * numbers below are that document's own. A checker that rounded any of them
 * would draw a line one bar before there was anything to draw it from, which is
 * the difference between a study that matches a reference and one that does not.
 */

// Catches a checker that treats warmup as a constant per function rather than
// reading the length that was written.
test('a moving average warms up at its own length', () => {
  assert.equal(warmupOfName('e = ema(close, 20)\nplot(e, "E")', 'e'), 'at 19');
  assert.equal(warmupOfName('s = sma(close, 5)\nplot(s, "S")', 's'), 'at 4');
});

// Catches a checker that does not compose, which would say bar 9 for a value
// that stdlib.md says is absent until bar 18.
test('warmups compose through a nested call', () => {
  const body = 'x = sma(ema(close, 10), 10)\nplot(x, "X")';
  assert.equal(warmupOfName(body, 'x'), 'at 18');
});

// Catches a checker that gives every oscillator the same shape: rsi consumes
// changes, and a change needs two bars, so it is one bar later than a mean.
test('a function over changes warms up one bar later than one over levels', () => {
  assert.equal(warmupOfName('r = rsi(close, 14)\nplot(r, "R")', 'r'), 'at 14');
  assert.equal(warmupOfName('m = sma(close, 14)\nplot(m, "M")', 'm'), 'at 13');
});

// Catches a checker that adds the two sides of an addition instead of taking
// the later of them: absence propagates, so the sum waits for both.
test('arithmetic waits for the later of its two operands', () => {
  const body = 'x = ema(close, 10) + ema(close, 30)\nplot(x, "X")';
  assert.equal(warmupOfName(body, 'x'), 'at 29');
});

// Catches a checker that treats isNone like every other call, which would make
// the standard warmup guard itself absent during warmup.
test('isNone answers on bar 0 whatever it is given', () => {
  const body = 'ready = not isNone(ema(close, 50))\nplot(ready ? 1 : 0, "R")';
  assert.equal(warmupOfName(body, 'ready'), 'at 0');
});

// Catches a checker that takes the later of orElse's two arguments, which would
// make a fallback useless: the whole point is to have a value sooner.
test('orElse is present as soon as its fallback is', () => {
  const body = 'e = ema(close, 50)\nsafe = orElse(e, 0)\nplot(safe, "S")';
  assert.equal(warmupOfName(body, 'safe'), 'at 0');
});

// Catches a checker that ignores the history operator, which would claim a
// value for a bar where the past it reads does not exist yet.
test('a history read delays a value by the bars it looks back', () => {
  const body = 'e = ema(close, 10)\nback = e[5]\nplot(back, "B")';
  assert.equal(warmupOfName(body, 'back'), 'at 14');
});

// Catches a checker that states an exact bar for a length it cannot know: an
// input is resolved after the compile, so the answer is a floor and says so.
test('a length from an input gives a floor rather than a number', () => {
  const body = 'len = input(20, "L")\ne = ema(close, len)\nplot(e, "E")';
  assert.equal(warmupOfName(body, 'e'), 'at least 0');
});

// Catches a checker that states an exact bar for a warmup the data decides.
test('a session anchored average gives a floor', () => {
  assert.equal(warmupOfName('v = vwap()\nplot(v, "V")', 'v'), 'at least 0');
});

// Catches a checker that lets a plot of a value that is absent on every bar
// through, which is a line a trader waits for and never sees.
test('a plot of a value that is never present is warned about', () => {
  const body = 'var empty = none\nplot(empty, "Empty")';
  assert.deepEqual(codes(body), ['OS8009']);
  assert.deepEqual(valuesFor(body, 'OS8009'), { title: '"Empty"' });
});

// Catches a checker that records the plot's own warmup rather than its value's,
// which would put every column at bar 0.
test('an output carries the first bar its column can draw', () => {
  const { script } = checkBody('plot(ema(close, 20), "E")');
  const output = script.outputs[0];
  assert.equal(output?.form, 'plot');
  assert.equal(output?.title, 'E');
  assert.deepEqual(output?.warmup, { kind: 'at', bar: 19 });
});

// Catches the loop whose result was thrown away: an entry whose length is a
// floor rather than an exact count was worth its `add` bars and nothing else,
// so the lengths written at the call site counted for zero. A floor of bar 0 is
// a request that tells a host to fetch no history at all.
test('an entry that bounds its warmup still counts the lengths it was given', () => {
  assert.equal(warmupOfName('h = hma(close, 20)\nplot(h, "H")', 'h'), 'at least 18');
  assert.equal(warmupOfName('m = ma(close, 30)\nplot(m, "M")', 'm'), 'at least 29');
  assert.equal(warmupOfName('t = tsi(close)\nplot(t, "T")', 't'), 'at least 37');
  assert.equal(warmupOfName('a = adx()\nplot(a[1], "A")', 'a'), 'at least 14');
});

// Catches an element read through the array's warmup. stdlib.md 2.3 gives each
// output of a multi-output call its own, and the array's is the earliest of
// them: a signal line read at the gap's warmup claims a value for eight bars
// where it is absent, and a read built on it fetches eight bars too few.
test('each output of a multi-output call carries its own warmup', () => {
  const macd = 'm = macd(close)\ngap = m[0]\nsmoothed = m[1]\nplot(gap, "G")\nplot(smoothed, "S")';
  assert.equal(warmupOfName(macd, 'gap'), 'at 25');
  assert.equal(warmupOfName(macd, 'smoothed'), 'at 33');
  const written = 'x = adx()[0]\ny = adx()[1]\nplot(x, "X")\nplot(y, "Y")';
  assert.equal(warmupOfName(written, 'x'), 'at 27');
  assert.equal(warmupOfName(written, 'y'), 'at 14');
});

// Catches an element warmup taken from a call the name no longer holds, and an
// index the compiler cannot read: both fall back to the array's warmup, which
// is a floor for every element rather than a number about one of them.
test('an element the compiler cannot name falls back to the array warmup', () => {
  const moved = 'i = input(1, "I")\nm = macd(close)\nv = m[i]\nplot(v, "V")';
  assert.equal(warmupOfName(moved, 'v'), 'at 25');
});
