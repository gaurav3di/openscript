/**
 * What a load refuses about a read, before a bar has run.
 *
 * Three things are settled before bar 0 and are refusals rather than absences:
 * a timeframe that is a fact about the program and the chart rather than about
 * the data, a ceiling the host stated, and a body that is not a program. Each
 * one drawn as a gap instead would be a study a user has to explain to
 * themselves, which is the whole argument for a load refusal in
 * `host-interface.md` section 1: better than a failure halfway through a bar
 * with half a chart already drawn.
 *
 * The fold itself is `requests.test.ts` and the hand-over to a host is
 * `requests-host.test.ts`. This file never runs a bar.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { load } from '../../src/core/engine/index.js';
import type { EngineHost } from '../../src/core/engine/index.js';
import { asWire, compile } from './support.js';

/** A chart of five minute bars, which is what a request is compared against. */
const CHART: EngineHost = {
  instrument: { symbol: 'AAA', exchange: 'XX', interval: '5', timezone: 'UTC' },
};

/** A read of another instrument, which is the tag a host may not provide. */
const OTHER = `version 1
study("Other", overlay = true)
o = req.symbol("BBB", "1h", close)
plot(o, "O")
`;

/**
 * Compiles, and refuses to go on if the script itself was wrong.
 *
 * A test script with a name that does not exist still produces a program, and
 * the refusal under test is then a refusal about something else.
 */
function clean(source: string): ReturnType<typeof compile> {
  const compiled = compile('request.oscript', source);
  assert.deepEqual(
    compiled.diagnostics.filter((one) => one.severity === 'error').map((one) => one.code),
    [],
    'the test script itself did not compile',
  );
  return compiled;
}

function refusal(source: string, host: EngineHost = CHART): { code: string; values: unknown } {
  const compiled = clean(source);
  const loaded = load(asWire(compiled.program), { source: compiled.file, host });
  if (loaded.ok) throw new Error('the program loaded and the test expected a refusal');
  return { code: loaded.diagnostic.code, values: loaded.diagnostic.values };
}

/**
 * The two refusals the engine makes at load rather than during a bar.
 *
 * Both are facts about the program and the chart, known before a bar runs, so a
 * study that cannot be folded says so instead of drawing a gap nobody can
 * explain.
 */
test('a request finer than the chart is refused at load with OS6002', () => {
  const found = refusal(`version 1
study("Finer", overlay = true)
plot(req.timeframe("1m", close), "F")
`);
  assert.equal(found.code, 'OS6002');
});

test('an intraday request that is not a whole multiple of the chart is OS6015', () => {
  const found = refusal(`version 1
study("Odd", overlay = true)
plot(req.timeframe("7m", close), "F")
`);
  assert.equal(found.code, 'OS6015');
});

/**
 * The host's ceiling on how many series it will keep in step with the chart.
 *
 * Named rather than quietly applied. Dropping the reads past a ceiling is a plot
 * that turns absent with nothing on the chart to say which one went, which is
 * the reasoning OS5006 gives and the reason it is a load refusal.
 */
test('more reads than the host will serve is OS5006, with the count named', () => {
  const compiled = clean(`version 1
study("Many", overlay = true)
plot(req.timeframe("1h", close), "A")
plot(req.timeframe("4h", close), "B")
plot(req.timeframe("2h", close), "C")
`);
  const loaded = load(asWire(compiled.program), {
    source: compiled.file,
    host: CHART,
    limits: { requests: 2 },
  });
  assert.equal(loaded.ok, false);
  if (loaded.ok) return;
  assert.equal(loaded.diagnostic.code, 'OS5006');
  assert.equal(loaded.diagnostic.values['found'], 3);
  assert.equal(loaded.diagnostic.values['max'], 2);
});

test('a timeframe a setting supplied that is not a timeframe is OS6001', () => {
  const compiled = compile('request.oscript', `version 1
study("Setting", overlay = true)
tf = input("1h", "Interval", kind = "interval")
plot(req.timeframe(tf, close), "F")
`);
  const loaded = load(asWire(compiled.program), {
    source: compiled.file,
    host: CHART,
    settings: { tf: 'hourly' },
  });
  assert.equal(loaded.ok, false);
  if (loaded.ok) return;
  assert.equal(loaded.diagnostic.code, 'OS6001');
  assert.equal(loaded.diagnostic.values['value'], 'hourly');
});

/**
 * A body is verified on the same terms as the program, 3.5.
 *
 * The same interpreter walks it, over another instrument's history. A body that
 * was not verified could jump out of its own instruction list, and the failure
 * would look like a wrong number rather than a broken program.
 */
test('a malformed request body is refused at load, naming where it is', () => {
  const compiled = compile('request.oscript', `version 1
study("Body", overlay = true)
plot(req.timeframe("1h", close), "C")
`);
  const program = asWire(compiled.program) as Record<string, unknown>;
  const requests = program['requests'] as Record<string, unknown>[];
  const body = requests[0]?.['body'] as Record<string, unknown>;
  body['code'] = [['JUMP', 99], ['RET']];
  const loaded = load(program, { source: compiled.file, host: CHART });
  assert.equal(loaded.ok, false);
  if (loaded.ok) return;
  assert.equal(loaded.diagnostic.code, 'OS6018');
  assert.equal(
    String(loaded.diagnostic.values['location']).startsWith('requests[0].body.code'),
    true,
    'the refusal must name the body, not the program',
  );
});

test('two reads sharing one handle are refused, because the handle is what names one', () => {
  const compiled = compile('request.oscript', `version 1
study("Two", overlay = true)
plot(req.timeframe("1h", close), "A")
plot(req.timeframe("4h", close), "B")
`);
  const program = asWire(compiled.program) as Record<string, unknown>;
  const requests = program['requests'] as Record<string, unknown>[];
  if (requests[1] !== undefined) requests[1]['id'] = requests[0]?.['id'];
  const loaded = load(program, { source: compiled.file, host: CHART });
  assert.equal(loaded.ok, false);
  if (loaded.ok) return;
  assert.equal(loaded.diagnostic.code, 'OS6018');
});

/**
 * The tag stays a tag.
 *
 * `req.timeframe` is folded from the bars the engine already holds, so this
 * engine always has it; `req.symbol` needs a host that can serve bars, so it is
 * the tag a host without one does not give its engine. Both are still declared
 * by the program, which is what lets an engine say what it lacks by name.
 */
test('a read declares its capability whether or not this engine has it', () => {
  const folded = compile('request.oscript', `version 1
study("Folded", overlay = true)
plot(req.timeframe("1h", close), "C")
`);
  assert.equal(folded.program.requires.includes('req.timeframe'), true);
  assert.equal(folded.program.requires.includes('req.symbol'), false);

  const other = compile('request.oscript', OTHER);
  assert.equal(other.program.requires.includes('req.symbol'), true);
});
