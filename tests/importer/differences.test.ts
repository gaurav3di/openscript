import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bodyOf, codesOf, imported, pointsOf, v5, v6 } from './support.js';

/**
 * Where the two languages mean different things by the same spelling, and what
 * the importer writes: the source dialect's meaning where it can be written
 * exactly, and a warning saying how the translation differs where it cannot.
 */

// A warning per call would bury a script's real findings; none at all would be
// the silent approximation. Once per built-in, at its first call.
test('OS9007: a windowed built-in warns once, at its first call', () => {
  const text = v5('indicator("X")', 'a = ta.ema(close, 9)', 'b = ta.ema(open, 21)', 'c = ta.sma(close, 5)', 'plot(a + b + c)');
  const result = imported(text);
  assert.deepEqual(pointsOf(text, result, 'OS9007'), [
    { code: 'OS9007', covers: 'ta.ema', line: 3, column: 5 },
    { code: 'OS9007', covers: 'ta.sma', line: 5, column: 5 },
  ]);
  assert.deepEqual(result.findings[0]?.values, { call: 'ta.ema', target: 'ema' });
});

// A row marked exact is one whose translation is the same value on every bar;
// an importer that warned on it would teach readers to ignore the warning.
test('OS9007: an exact built-in raises nothing', () => {
  const text = v5('indicator("X")', 'up = ta.crossover(close, open)', 'd = ta.change(close)', 'm = ta.mom(close, 3)', 'plot(up ? d : m)');
  assert.deepEqual(codesOf(imported(text)), []);
});

// Version 5 truncates only a division of two whole-number constants; an
// importer that warned on every division, or on version 6, would be wrong.
test('OS9008: whole-number constants divided in version 5, and only there', () => {
  const text = v5('indicator("X")', 'bands = 5', 'len = input.int(10, "Len")', 'a = 7 / 2', 'b = bands / 2', 'c = len / 2', 'd = 7.0 / 2', 'plot(a + b + c + d)');
  const result = imported(text);
  assert.deepEqual(pointsOf(text, result, 'OS9008').map((one) => [one.covers, one.line, one.column]), [
    ['/', 5, 7],
    ['/', 6, 11],
  ]);
  assert.deepEqual(codesOf(imported(v6('indicator("X")', 'a = 7 / 2', 'plot(a)'))), []);
  assert.deepEqual(codesOf(imported(v5('indicator("X")', 'bands = 5', 'bands := 6', 'a = bands / 2', 'plot(a)'))), []);
});

// Two averages both absent on a warmup bar are equal in OpenScript. Where one
// side is never absent there is no such bar, and warning there is noise.
test('OS9011: an equality warns where both sides can be absent together', () => {
  const text = v5('indicator("X")', 'f = ta.sma(close, 5)', 's = ta.sma(close, 9)', 'a = f == s', 'b = f == close', 'c = close == open', 'plot(a or b or c ? 1 : 0)');
  const result = imported(text);
  assert.deepEqual(pointsOf(text, result, 'OS9011'), [{ code: 'OS9011', covers: '==', line: 5, column: 7 }]);
  assert.equal(result.findings.find((one) => one.code === 'OS9011')?.values.operator, '==');
});

// The source dialect answers a comparison with an absent side false, so its
// negation is true there. OpenScript's not of none is none, which takes the
// false branch. orElse(x, false) is the source's answer exactly.
test('not over something that can be absent is written over orElse, and only then', () => {
  const text = v5('indicator("X")', 'r = ta.rsi(close, 14)', 'on = input.bool(true, "On")', 'a = not (r > 50)', 'b = not on', 'plot(a and b ? 1 : 0)');
  const body = bodyOf(imported(text));
  assert.ok(body.includes('a = not orElse(r > 50, false)'), body.join('\n'));
  assert.ok(body.includes('b = not on'), body.join('\n'));
});

// The same reasoning for a comparison with a boolean literal and for the
// condition a counting built-in is handed.
test('an absent condition is made false where the source would have been', () => {
  const text = v5('indicator("X")', 'up = close > ta.sma(close, 5)', 'a = up == false', 'n = ta.barssince(up)', 'plot(a ? n : 0)');
  const body = bodyOf(imported(text));
  assert.ok(body.includes('a = orElse(up, false) == false'), body.join('\n'));
  assert.ok(body.includes('n = barsSince(orElse(up, false))'), body.join('\n'));
});

// Version 5 always evaluates the right side of and, so a stateful call there
// advances on every bar. Left in place, OpenScript would skip it on bars where
// the left side decides, and the average would be a different series.
test('version 5: a stateful right operand of and is moved to its own line', () => {
  const text = v5('indicator("X")', 'go = close > open and ta.rsi(close, 14) > 50', 'plot(go ? 1 : 0)');
  const body = bodyOf(imported(text));
  assert.deepEqual(body.slice(1, 3), ['everyBar = rsi(close, 14) > 50', 'go = close > open and everyBar']);
});

// Version 6 evaluates it only when the left side is true, as OpenScript does,
// except that OpenScript also evaluates it when the left side is absent.
test('version 6: the left operand of and is made false where it could be absent', () => {
  const text = v6('indicator("X")', 'go = ta.crossover(close, open) and ta.rsi(close, 14) > 50', 'plot(go ? 1 : 0)');
  const body = bodyOf(imported(text));
  assert.ok(body.includes('go = orElse(crossUp(close, open), false) and rsi(close, 14) > 50'), body.join('\n'));
});

// A ternary arm is lazy in both languages, so nothing may be moved out of one.
test('version 5: a stateful operand inside a ternary arm is not moved out of the arm', () => {
  const text = v5('indicator("X")', 'x = close > open ? (volume > 0 and ta.sma(close, 3) > 1 ? 1 : 0) : 0', 'plot(x)');
  assert.deepEqual(codesOf(imported(text)).filter((code) => code === 'OS9002'), ['OS9002']);
});

// Every row with arguments that do not line up one to one.
test('built-ins whose arguments do not line up are written as the expression that matches', () => {
  const text = v5(
    'indicator("X")',
    'a = ta.tr',
    'b = ta.tr(true)',
    'c = ta.stdev(close, 20, false)',
    'd = ta.stdev(close, 20)',
    'e = ta.highest(10)',
    'f = math.max(high, low, close)',
    'g = nz(ta.sma(close, 3))',
    'h = int(close / 3)',
    'k = color.rgb(1, 2, 3, 40)',
    'plot(a + b + c + d + e + f + g + h, color = k)',
  );
  const body = bodyOf(imported(text));
  for (const line of [
    'a = isNone(close[1]) ? none : trueRange()',
    'b = trueRange()',
    'c = stdev(close, 20, sample = true)',
    'd = stdev(close, 20)',
    'e = highest(high, 10)',
    'f = max(max(high, low), close)',
    'g = orElse(sma(close, 3), 0)',
    'h = trunc(close / 3)',
    'k = fade(rgb(1, 2, 3), 40)',
  ]) {
    assert.ok(body.includes(line), `${line} is not in:\n${body.join('\n')}`);
  }
});

// A declaration inside a block is a new name in the source dialect and an
// update of the outer one in OpenScript, and a library name or reserved word
// is an ordinary name there. Both are renamed; nothing else is.
test('a name that would hide an outer one, or that OpenScript reserves, is renamed', () => {
  const text = v5('indicator("X")', 'rsi = ta.rsi(close, 14)', 'step = 2', 'x = 1', 'if close > open', '    x = 5', '    plot2 = x + step', 'plot(rsi + x)');
  const body = bodyOf(imported(text));
  assert.ok(body.includes('rsiValue = rsi(close, 14)'));
  assert.ok(body.includes('stepValue = 2'));
  assert.ok(body.includes('    x2 = 5'), body.join('\n'));
  assert.ok(body.includes('    plot2 = x2 + stepValue'), body.join('\n'));
  assert.ok(body.includes('plot(rsiValue + x, "Plot")'), body.join('\n'));
});

// The source dialect counts down when a loop's start is above its end, where
// OpenScript runs it zero times without a step.
test('a for loop keeps the direction the source dialect gives it', () => {
  const text = v6('indicator("X")', 'n = input.int(3, "N")', 't = 0', 'for i = 10 to 0', '    t += i', 'for j = 0 to n', '    t += j', 'plot(t)');
  const body = bodyOf(imported(text));
  assert.ok(body.includes('for i = 10 to 0 step -1'), body.join('\n'));
  assert.ok(body.includes('for j = 0 to n step (n >= 0 ? 1 : -1)'), body.join('\n'));
});

// var keeps its value from bar to bar in both; varip also survives the updates
// of a moving bar, which is OpenScript's live var.
test('var and varip keep their persistence', () => {
  const text = v5('indicator("X")', 'var float hi = na', 'varip int ticks = 0', 'ticks += 1', 'hi := math.max(nz(hi, high), high)', 'plot(hi + ticks)');
  const body = bodyOf(imported(text));
  assert.ok(body.includes('var hi = none'));
  assert.ok(body.includes('live var ticks = 0'));
});
