/**
 * User functions, the two loop forms and drawing objects.
 *
 * These are the parts of the instruction set the smaller tests do not reach:
 * `CALL_FN` with its per call path bases, `HISTP` reading the register a call
 * site bound, the `for x in` form the compiler builds out of a `while`, and the
 * object lifetime OS4005 protects.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { Value } from '../../src/core/engine/index.js';
import { flat, running } from './support.js';

/** Runs a script over a run of closes and returns the first plot's column. */
function column(source: string, closes: readonly number[]): readonly Value[] {
  const engine = running(source);
  for (const close of closes) {
    const result = engine.append(flat(close), { isConfirmed: true }, closes.length);
    assert.equal(
      result.diagnostic,
      undefined,
      `${result.diagnostic?.code ?? ''} at line ${result.diagnostic?.span.line ?? 0}`,
    );
  }
  return engine.column(0);
}

test('a function reads the history of a series argument through its call site', () => {
  // 4.10: a series argument is always given a fresh register, even when the
  // argument is a bare series name whose register already exists. Catches an
  // engine that binds the existing one, which would give the body history on
  // bars where the call did not execute.
  const seen = column(
    [
      'version 1',
      '',
      'study("Change")',
      '',
      'fn delta(src) => src - src[1]',
      '',
      'plot(delta(close), "d", aqua)',
    ].join('\n'),
    [10, 12, 15, 11],
  );
  assert.deepEqual(seen, [null, 2, 3, -4]);
});

test('one function called from two places keeps two pieces of state', () => {
  // `language.md` 11.4: state is allocated per call path. Catches an engine
  // that ignores the call site's `stateBase`, where both counters would share
  // one region and neither would count what its caller asked for.
  const seen = column(
    [
      'version 1',
      '',
      'study("Two counters")',
      '',
      'fn runLength(cond) => barsSince(cond)',
      '',
      'up   = runLength(close > close[1])',
      'down = runLength(close < close[1])',
      '',
      'plot(up, "up", aqua)',
      'plot(down, "down", red)',
    ].join('\n'),
    [10, 11, 12, 9, 8, 13],
  );
  assert.deepEqual(seen, [null, 0, 0, 1, 2, 0]);
});

test('a numeric for loop runs the iterations its bounds describe', () => {
  const seen = column(
    [
      'version 1',
      '',
      'study("Sum")',
      '',
      'var total = 0.0',
      'total = 0',
      'for i = 0 to 3',
      '    total += i',
      '',
      'plot(total, "total", aqua)',
    ].join('\n'),
    [10, 11],
  );
  assert.deepEqual(seen, [6, 6]);
});

test('a for over an array reads the element count once, when the loop is entered', () => {
  // 4.8: the `for x in` form has no instructions of its own and compiles to a
  // `while` over a hidden cursor, so elements appended during the loop are not
  // visited. Catches an engine that re-reads the count at the top and loops
  // forever over an array the body is appending to.
  const seen = column(
    [
      'version 1',
      '',
      'study("Walk")',
      'limits(loops = 100)',
      '',
      'var prices = [1.0, 2.0, 3.0]',
      'var total = 0.0',
      'total = 0',
      '',
      'for price in prices',
      '    total += price',
      '    push(prices, price)',
      '',
      'plot(total, "total", aqua)',
    ].join('\n'),
    [10],
  );
  assert.deepEqual(seen, [6]);
});

test('changing an object a script deleted is OS4005 naming the bar it went on', () => {
  // Catches an engine that answers absence for a stale handle: the drawing
  // would quietly stop moving and the script would look correct.
  const engine = running(
    [
      'version 1',
      '',
      'study("Stale")',
      '',
      'var held = none',
      'if bar.isFirst',
      '    held = draw.line(time, low, time, high)',
      'if bar.index == 1',
      '    draw.delete(held)',
      'if bar.index == 2',
      '    draw.setTo(held, time, high)',
      '',
      'plot(close, "c", aqua)',
    ].join('\n'),
  );
  engine.append(flat(10), { isConfirmed: true });
  engine.append(flat(11), { isConfirmed: true });
  const result = engine.append(flat(12), { isConfirmed: true });
  assert.equal(result.diagnostic?.code, 'OS4005');
  assert.equal(result.diagnostic?.span.line, 11);
  assert.equal(result.diagnostic?.values['bar'], 1);
});

test('a drawing object a script never named is still drawn', () => {
  // 4.11: an object lives in the heap and the surface holds it, so a script
  // that draws a box and keeps no name for it still gets a box. Catches an
  // engine that reclaims what its cells cannot reach.
  const engine = running(
    [
      'version 1',
      '',
      'study("Anonymous")',
      '',
      'if bar.isFirst',
      '    draw.label(time, close, "here")',
      'plot(close, "c", aqua)',
    ].join('\n'),
  );
  for (const close of [10, 11, 12]) engine.append(flat(close), { isConfirmed: true });
  assert.equal(engine.drawings().length, 1);
  assert.equal(engine.drawings()[0]?.kind, 'label');
});
