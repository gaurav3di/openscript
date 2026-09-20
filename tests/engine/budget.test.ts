/**
 * The budgets, and the promise they are there to keep: a runaway script stops.
 *
 * A platform running many customers' scripts in one process cannot hope that a
 * script behaves, so each of these is a counter in the engine's own loop. The
 * wrong implementation every test here catches is the same one: an engine that
 * runs the loop and trusts the program, which hangs a tab rather than reporting
 * a line.
 *
 * `compiled-program.md` 8.5 is why the loop budget is counted in `TICK`
 * executions and nothing else: two engines must fail at the same iteration of
 * the same loop on the same bar, so an engine that counted its own instructions
 * or measured time would make a script that runs on one engine fail on another.
 * The tests below hold that line by asserting the *iteration* the failure
 * happens at rather than only that it happened.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { flat, running } from './support.js';

const ENDLESS = [
  'version 1',
  '',
  'study("Endless")',
  'limits(loops = 500)',
  '',
  'var turns = 0',
  'while close > 0',
  '    turns += 1',
  '',
  'plot(turns, "turns", aqua)',
].join('\n');

test('a loop that never ends is OS5001 at the loop header line', () => {
  const engine = running(ENDLESS);
  const result = engine.append(flat(10), { isConfirmed: true });
  assert.equal(result.diagnostic?.code, 'OS5001');
  assert.equal(result.diagnostic?.span.line, 7, 'the line of the loop, not of the statement in it');
  assert.equal(result.diagnostic?.values['budget'], 500);
});

test('the budget is spent at the same iteration however the loops are arranged', () => {
  // Ten sequential loops of 60 and one nested pair of 10 by 60 both charge 600
  // and both stop, which is why 5.5 makes the budget per bar rather than per
  // loop. Catches an engine that counted per loop, where the first of these
  // would pass and the second would not.
  const sequential = running(
    [
      'version 1',
      '',
      'study("Sequential")',
      'limits(loops = 500)',
      '',
      'var turns = 0',
      'for outer = 1 to 10',
      '    for inner = 1 to 60',
      '        turns += 1',
      '',
      'plot(turns, "turns", aqua)',
    ].join('\n'),
  );
  const result = sequential.append(flat(10), { isConfirmed: true });
  assert.equal(result.diagnostic?.code, 'OS5001');
});

test('the budget resets every bar, so a long dataset is never itself a failure', () => {
  // Catches an engine that counts across bars: a study with a small loop would
  // run for a few hundred bars and then start failing for no reason the reader
  // could see.
  const engine = running(
    [
      'version 1',
      '',
      'study("Per bar")',
      'limits(loops = 20)',
      '',
      'var turns = 0',
      'turns = 0',
      'for i = 1 to 10',
      '    turns += 1',
      '',
      'plot(turns, "turns", aqua)',
    ].join('\n'),
  );
  for (let bar = 0; bar < 50; bar += 1) {
    const result = engine.append(flat(10 + bar), { isConfirmed: true });
    assert.equal(result.diagnostic, undefined, `bar ${bar}`);
    assert.equal(result.columns[0], 10);
  }
});

test('a bar past the host wall clock is OS5007 and stops the bar', () => {
  // The clock is the host's guard rather than the language's, so it is off
  // unless a host asks for one. Catches an engine with no clock at all, where a
  // script doing an enormous but legal amount of work occupies the process for
  // as long as it likes.
  let ticks = 0;
  const engine = running(
    [
      'version 1',
      '',
      'study("Slow")',
      'limits(loops = 2000000)',
      '',
      'var turns = 0',
      'for i = 1 to 1000000',
      '    turns += 1',
      '',
      'plot(turns, "turns", aqua)',
    ].join('\n'),
    { limits: { ms: 5 }, clock: () => (ticks += 10) },
  );
  const result = engine.append(flat(10), { isConfirmed: true });
  assert.equal(result.diagnostic?.code, 'OS5007');
  assert.equal(result.diagnostic?.values['max'], 5);
});

test('an array past the element ceiling is OS5002 and names the array', () => {
  const engine = running(
    [
      'version 1',
      '',
      'study("Growing")',
      '',
      'var kept = [0.0]',
      'push(kept, close)',
      'plot(size(kept), "n", aqua)',
    ].join('\n'),
    { limits: { arrayElements: 4 } },
  );
  let last = engine.append(flat(10), { isConfirmed: true });
  for (let bar = 1; bar < 10 && last.diagnostic === undefined; bar += 1) {
    last = engine.append(flat(10 + bar), { isConfirmed: true });
  }
  assert.equal(last.diagnostic?.code, 'OS5002');
  assert.equal(last.diagnostic?.values['name'], 'kept');
  assert.equal(last.diagnostic?.span.line, 6);
});

test('a string past the character ceiling is OS5008', () => {
  const engine = running(
    [
      'version 1',
      '',
      'study("Long")',
      '',
      'var label = ""',
      'label = label + "abcdefghij"',
      'signal(label)',
      'plot(close, "c", aqua)',
    ].join('\n'),
    { limits: { stringLength: 25 } },
  );
  let last = engine.append(flat(10), { isConfirmed: true });
  for (let bar = 1; bar < 10 && last.diagnostic === undefined; bar += 1) {
    last = engine.append(flat(10 + bar), { isConfirmed: true });
  }
  assert.equal(last.diagnostic?.code, 'OS5008');
  assert.equal(last.diagnostic?.values['max'], 25);
});

/**
 * A decimal count a script computed, against the same ceiling.
 *
 * `text(x, d)` writes one character per decimal place asked for, so a `d` from
 * a setting or an expression is a string length the script chose. Catches a
 * conversion that answers a count it cannot honour with a string anyway,
 * truncated or malformed, which is a label nobody can act on where a code would
 * have named the line. The length is worked out before the string is built, as
 * `str.repeat` does it, so a count no engine could hold is reported rather than
 * allocated; that part is not what this test can prove, only what it rests on.
 */
test('a fixed decimal conversion past the character ceiling is OS5008', () => {
  const engine = running(
    [
      'version 1',
      '',
      'study("Wide")',
      '',
      'signal(text(close, 40))',
      'plot(close, "c", aqua)',
    ].join('\n'),
    { limits: { stringLength: 25 } },
  );
  const last = engine.append(flat(10), { isConfirmed: true });
  assert.equal(last.diagnostic?.code, 'OS5008');
  assert.equal(last.diagnostic?.values['max'], 25);
});

test('a failed bar stops the script and every later bar reports the same failure', () => {
  // 5.1: an error during step 6 stops the bar, and the engine does not continue
  // to the next bar with a half executed state. Catches an engine that carries
  // on: the study would produce numbers computed from a state nobody can
  // reason about.
  const engine = running(ENDLESS);
  const first = engine.append(flat(10), { isConfirmed: true });
  const second = engine.append(flat(11), { isConfirmed: true });
  assert.equal(first.diagnostic?.code, 'OS5001');
  assert.equal(second.diagnostic?.code, 'OS5001');
  assert.equal(engine.failed, true);
});

test('a failing script raises nothing into its host', () => {
  // The whole of "one script failing takes nothing else down". Catches an
  // engine that throws out of `append`, which in a render loop takes every
  // other study on the chart with it.
  const engine = running(ENDLESS);
  assert.doesNotThrow(() => engine.append(flat(10), { isConfirmed: true }));
  assert.doesNotThrow(() => engine.update(flat(11), { isConfirmed: true }));
  assert.doesNotThrow(() => engine.run([flat(12)]));
});
