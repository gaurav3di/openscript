/**
 * A setting read inside a read's expression, `stdlib.md` 15.4.
 *
 * The expression argument of `req.timeframe` and `req.symbol` is compiled as a
 * program of its own over another instrument's bars, so a name computed on this
 * chart's bars has no meaning inside it and is OS6003. A setting does: it
 * resolves before bar 0 and holds for the run, which is why 15.4 lets the
 * expression read one and why `compiled-program.md` 2.16 gives a body an
 * `inputs` list at all, naming the settings the engine fills into registers of
 * the body's own table before it runs.
 *
 * What is new here is the `input()` written in the expression itself rather
 * than behind a name. It is the same setting, resolved in the same enclosing
 * frame, filled into the same kind of register, and it was refused with OS6018
 * until the question of whether the language permits it was settled.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { load } from '../../src/core/engine/index.js';
import { CHART, clean, fiveMinutes, ran } from './request-support.js';
import { asWire } from './support.js';

/**
 * A setting inside a read's expression, written in place rather than behind a
 * name.
 *
 * `stdlib.md` 15.4 has always let the expression read a name bound to an
 * `input()`, because a setting resolves before bar 0 and holds for the run,
 * which is the whole reason a per-bar name cannot be read there and a setting
 * can. 13.4 forbids an `input()` in a block and in a function and says nothing
 * about a read's expression, which is neither. The compiler refused the call
 * anyway, with OS6018, whose message tells the reader their correct script came
 * from a broken compiler.
 *
 * The assertion is the number rather than the absence of that code. A compiler
 * that carried the call but resolved it to the wrong register, or filled the
 * register once and never again, would report nothing and draw a line nobody
 * asked for, so the default and a supplied setting are both read back and the
 * name form is run beside the call form as the answer to compare against.
 */
test('a setting written inside a read expression is the same read as one behind a name', () => {
  const inPlace = `version 1
study("Setting", overlay = true)
plot(req.timeframe("1h", close + input(5, "K"), mode = "developing"), "D")
`;
  const behindName = `version 1
study("Setting", overlay = true)
k = input(5, "K")
plot(req.timeframe("1h", close + k, mode = "developing"), "D")
`;
  assert.deepEqual(ran(inPlace)[0], ran(behindName)[0], 'the two spellings are one read');

  const [byDefault] = ran(inPlace);
  assert.ok(byDefault);
  assert.equal(byDefault[0], 105, 'the declared default of five, on the first bar of the bucket');
  assert.equal(byDefault[12], 117, 'and on the bar that opens the next one');

  const [supplied] = ran(inPlace, 24, CHART, { K: 9 });
  assert.ok(supplied);
  assert.equal(supplied[0], 109, 'the setting the host supplied, on every bar it is read');
  assert.equal(supplied[12], 121);
});

/**
 * Two settings in one expression, and one setting read twice.
 *
 * Catches a compiler that resolves every `input()` in a body to the first
 * register it filled, which would answer correctly for the one-setting script
 * above and wrongly for every other; and one that fills a register per read
 * rather than per setting, which is not wrong on the chart but asks the engine
 * for the same value twice on every requested bar.
 */
test('two settings inside one read expression each reach their own row', () => {
  const source = `version 1
study("Two settings", overlay = true)
k = input(5, "K")
plot(req.timeframe("1h", close + input(100, "J") * 2 + k, mode = "developing"), "D")
`;
  const compiled = clean(source);
  const [body] = compiled.program.requests;
  assert.ok(body);
  assert.deepEqual(
    body.body.inputs.map((one) => one.input),
    ['J', 'k'],
    'each setting the body reads is named once, in the order the expression meets them',
  );
  assert.equal(
    new Set(body.body.inputs.map((one) => one.series)).size,
    2,
    'and each is filled into a register of its own',
  );

  const loaded = load(asWire(compiled.program), {
    source: compiled.file,
    host: CHART,
    settings: { J: 1, k: 7 },
  });
  assert.ok(loaded.ok);
  const bars = fiveMinutes(24);
  loaded.engine.run(bars, bars.map(() => ({ isConfirmed: true })));
  assert.equal(loaded.engine.column(0)[0], 109, 'close 100, plus one twice, plus seven');
});

/** The same setting read twice in one body, which is one register and one fill. */
test('one setting read twice inside a read expression is filled once', () => {
  const source = `version 1
study("Twice", overlay = true)
k = input(5, "K")
plot(req.timeframe("1h", close + k + k, mode = "developing"), "D")
`;
  const compiled = clean(source);
  assert.equal(compiled.program.requests[0]?.body.inputs.length, 1);
  const [values] = ran(source);
  assert.ok(values);
  assert.equal(values[0], 110, 'close 100 plus five twice');
});
