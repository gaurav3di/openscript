import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkBody, checkRaw, codes, rawCodes, strategyCodes, valuesFor } from './check-support.js';

/**
 * Higher timeframe reads and repainting, `stdlib.md` section 15.
 *
 * The mode argument is the whole mechanism: a script that repaints says so on
 * the line that causes it, and a script that says nothing cannot repaint. Every
 * test here is about keeping that true.
 */

// Catches a checker that treats the two reads as ordinary calls, which would
// leave the compiled study with nothing recorded about what it reads.
test('a higher timeframe read is recorded with its mode', () => {
  const { script, diagnostics } = checkBody('bias = req.timeframe("1D", close)\nplot(bias, "B")');
  assert.deepEqual(
    diagnostics.map((one) => one.code),
    [],
  );
  assert.equal(script.requests.length, 1);
  assert.equal(script.requests[0]?.mode, 'confirmed');
  assert.equal(script.requests[0]?.timeframe, '1D');
  assert.equal(script.repaints, false);
});

// Catches a checker that warns on any read rather than the one mode that shows
// a bar values it could not have known.
test('a lookahead read is warned about and marks the study as repainting', () => {
  const body = 'bias = req.timeframe("1D", close, mode = "lookahead")\nplot(bias, "B")';
  assert.deepEqual(codes(body), ['OS8005']);
  assert.deepEqual(valuesFor(body, 'OS8005'), { mode: 'lookahead' });
  assert.equal(checkBody(body).script.repaints, true);
});

// Catches a checker that warns on developing too, which would make the mode
// word worthless: it is written out precisely so it is its own disclosure.
test('a developing read carries no warning of its own', () => {
  assert.deepEqual(
    codes('bias = req.timeframe("1D", close, mode = "developing")\nplot(bias, "B")'),
    [],
  );
});

// Catches a checker that reads onUnconfirmed off nothing, which would let the
// one combination that repaints the confirmed history through unmarked.
test('a read in a file that acts on a moving bar is warned about', () => {
  const found = rawCodes(
    'version 1\nstudy("T", onUnconfirmed = true)\nbias = req.timeframe("1D", close)\nplot(bias, "B")\n',
  );
  assert.deepEqual(found, ['OS8002']);
});

// Catches a checker that accepts any string as a timeframe, leaving the host to
// fail on something the compiler could have named.
test('a timeframe the language does not have is refused', () => {
  const body = 'bias = req.timeframe("1 day", close)\nplot(bias, "B")';
  assert.deepEqual(codes(body), ['OS6001']);
  assert.deepEqual(valuesFor(body, 'OS6001'), { value: '1 day' });
});

// Catches a checker that folds the unit letters: "1M" is one month and "1m" is
// one minute, and a study that confuses them is wrong by a factor of thousands.
test('the timeframe unit letters are case sensitive', () => {
  assert.deepEqual(codes('a = req.timeframe("1M", close)\nplot(a, "A")'), []);
  assert.deepEqual(codes('b = req.timeframe("1m", close)\nplot(b, "B")'), []);
});

// Catches a checker that compiles the request expression against this chart's
// bars, where a name computed here has no counterpart there.
test('a per-bar name read inside a request expression is refused', () => {
  const body = 'basis = sma(close, 20)\nbias = req.timeframe("1D", basis)\nplot(bias, "B")';
  assert.deepEqual(codes(body), ['OS6003']);
  assert.deepEqual(valuesFor(body, 'OS6003'), { name: 'basis' });
});

// Catches a checker that refuses every file-scope name inside the expression,
// which would make an interval input impossible to use.
test('an input may be read inside a request expression', () => {
  const body = 'len = input(20, "L")\nbias = req.timeframe("1D", ema(close, len))\nplot(bias, "B")';
  assert.deepEqual(codes(body), []);
});

/**
 * The call written in the expression itself, which `stdlib.md` 15.4 permits for
 * the same reason it permits the name: a setting resolves before bar 0 and holds
 * for the run. It was refused at emit with OS6018, a code whose message tells
 * the reader a correct script came from a broken compiler.
 */
test('an input written inside a request expression is read there like one behind a name', () => {
  const nested = 'b = req.timeframe("1D", ema(close, input(20, "L")))\nplot(b, "B")';
  assert.deepEqual(codes(nested), []);
  const whole = 'b = req.timeframe("1D", input(20, "L"))\nplot(b, "B")';
  assert.deepEqual(codes(whole), []);
});

/**
 * A `var` holding a setting is not a setting. The cell is the setting's value on
 * the first bar and whatever the bar puts in it afterwards (`language.md` 8.2),
 * so it is a per-bar name and OS6003 is the code for reading one here. Catches a
 * checker that asks whether a name was given an input rather than whether it is
 * one, which reads `var` as a compile-time constant and lets a value computed on
 * this chart's bars into another instrument's.
 */
test('a var initialised from an input is a per-bar name inside a request expression', () => {
  const body = 'var k = input(1, "K")\nb = req.timeframe("1D", high + k)\nplot(b, "B")';
  assert.deepEqual(codes(body), ['OS6003']);
  assert.deepEqual(valuesFor(body, 'OS6003'), { name: 'k' });
});

// Catches a checker that lets an order be placed from another instrument's
// bars, where the strategy's own ledger has no bar to attach it to.
test('an order function inside a request expression is refused', () => {
  const body = 'x = req.timeframe("1D", close)\nif close > open\n    buy(qty = 1)\nplot(x, "X")';
  assert.deepEqual(strategyCodes(body), []);
  const inside = 'x = req.timeframe("1D", buy(qty = 1))\nplot(x, "X")';
  assert.equal(strategyCodes(inside).includes('OS7003'), true);
});

// Catches a checker that allows drawing inside the expression, which would
// anchor an object to a bar the chart does not have.
test('a drawing call inside a request expression is refused', () => {
  const body = 'x = req.timeframe("1D", signal("S"))\nplot(x, "X")';
  assert.equal(codes(body).includes('OS3006'), true);
});

// Catches a checker that never notices a file with no version line, which is
// the one thing that decides how the file is read in a later version.
test('a file with no version line is warned about', () => {
  const found = checkRaw('study("T")\nplot(close, "C")\n');
  assert.equal(
    found.diagnostics.some((one) => one.code === 'OS8003'),
    true,
  );
});

// Catches a checker that gives every alert a derived id silently, so a line
// inserted above it would quietly break somebody's subscription.
test('an alert with no id is warned about', () => {
  assert.equal(codes('if close > open\n    alert("up")').includes('OS8008'), true);
  assert.deepEqual(codes('if close > open\n    alert("up", id = "up")'), []);
});

// Catches a checker that does not know which calls hold state, which would let
// a moving average advance only on the bars a branch was taken.
test('a stateful call inside a branch is warned about', () => {
  const body = 'if close > open\n    e = ema(close, 20)\n    print(e)';
  assert.deepEqual(codes(body), ['OS8001']);
  assert.deepEqual(valuesFor(body, 'OS8001'), { name: 'ema' });
});

// Catches a checker that warns on any call in a branch rather than a stateful
// one, which would make the warning noise people learn to ignore.
test('a call that holds no state inside a branch is not warned about', () => {
  assert.deepEqual(codes('if close > open\n    signal("up")'), []);
});
