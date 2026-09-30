/**
 * A read's mode, written by its label and written in its place.
 *
 * `language.md` 11.2 fills parameters from the left, so `req.timeframe("1D",
 * close, "developing")` and `req.timeframe("1D", close, mode = "developing")`
 * are one call. The compiled request carries the mode, and the mode is what an
 * engine folds by and what a host reads to mark a study as repainting, so the
 * two spellings have to leave the same mode in the program. They did not: the
 * positional one compiled to `"confirmed"` whatever it said, with nothing
 * reported, so a study ran in a mode its own source did not name.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { compile } from './support.js';
import type { Emitted } from './support.js';

function study(read: string): Emitted {
  return compile('mode.oscript', `version 1\nstudy("Mode")\nx = ${read}\nplot(x, "X")\n`);
}

function errorsOf(emitted: Emitted): readonly string[] {
  return emitted.diagnostics.filter((one) => one.severity === 'error').map((one) => one.code);
}

// Catches a mode taken from the label alone. Each pair is one call spelled two
// ways, and the program has to carry the same mode for both.
test('a positional mode compiles to the mode the labelled one does', () => {
  const pairs: readonly (readonly [string, string])[] = [
    ['req.timeframe("1D", close, "confirmed")', 'req.timeframe("1D", close, mode = "confirmed")'],
    ['req.timeframe("1D", close, "developing")', 'req.timeframe("1D", close, mode = "developing")'],
    ['req.timeframe("1D", close, "lookahead")', 'req.timeframe("1D", close, mode = "lookahead")'],
    [
      'req.symbol("AAA", "1D", close, "EXCHANGE", "developing")',
      'req.symbol("AAA", "1D", close, exchange = "EXCHANGE", mode = "developing")',
    ],
    [
      'req.symbol("AAA", "1D", close, "EXCHANGE", "lookahead")',
      'req.symbol("AAA", "1D", close, exchange = "EXCHANGE", mode = "lookahead")',
    ],
  ];
  for (const [positional, labelled] of pairs) {
    const written = study(positional);
    const named = study(labelled);
    assert.deepEqual(errorsOf(written), [], positional);
    assert.equal(written.program?.requests[0]?.mode, named.program?.requests[0]?.mode, positional);
    assert.equal(
      written.diagnostics.some((one) => one.code === 'OS8005'),
      named.diagnostics.some((one) => one.code === 'OS8005'),
      `${positional} is warned about exactly when ${labelled} is`,
    );
  }
  assert.equal(study('req.timeframe("1D", close, "developing")').program?.requests[0]?.mode, 'developing');
});

// Catches a positional mode that is still let through when it is not a word the
// compiler can read. `stdlib.md` 15.3 settles the mode at compile time, so a
// mode taken from a setting is refused with OS3003 however it is written,
// rather than one spelling being refused and the other running confirmed.
test('a mode that is not written out is refused in either spelling', () => {
  const setting = 'input("developing", "Mode")';
  assert.deepEqual(errorsOf(study(`req.timeframe("1D", close, mode = ${setting})`)), ['OS3003']);
  assert.deepEqual(errorsOf(study(`req.timeframe("1D", close, ${setting})`)), ['OS3003']);
});
