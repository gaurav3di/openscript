/**
 * Higher timeframe and other instrument reads: `stdlib.md` 15 and
 * `compiled-program.md` 2.16, as the engine executes them.
 *
 * Almost everything here is about one number: which requested bar a chart bar
 * is allowed to see. An off-by-one in that answer is a study that knows the
 * close of a bar that has not happened, and it is invisible in every way except
 * a test that names the bar it expects the value to appear on. So the bars
 * below are built by hand, at instants a reader can check against a clock, and
 * the assertions name chart bar indices rather than counting values.
 *
 * The prices are the bar index, so a value in a column says which bar produced
 * it. That is what makes an off-by-one legible: an hourly close of 111 on the
 * bar at 10:00 is not a rounding difference, it is the engine reading the
 * eleventh five minute bar an hour early.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { load } from '../../src/core/engine/index.js';
import type { EngineHost, HostBar, Value } from '../../src/core/engine/index.js';
import { asWire, compile } from './support.js';

/** A chart of five minute bars, priced by index so a value names its bar. */
const OPEN = Date.UTC(2025, 0, 6, 10, 0, 0);

function fiveMinutes(count: number): readonly HostBar[] {
  const out: HostBar[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      open: 100 + i,
      high: 100 + i + 0.5,
      low: 100 + i - 0.5,
      close: 100 + i,
      volume: 10,
      time: OPEN + i * 300_000,
    });
  }
  return out;
}

const CHART: EngineHost = {
  instrument: { symbol: 'AAA', exchange: 'XX', interval: '5', timezone: 'UTC' },
};

/**
 * Compiles, and refuses to go on if the script itself was wrong.
 *
 * A test script with a name that does not exist still produces a program, and
 * the plot it was supposed to drive is then absent for a reason that has nothing
 * to do with what is being tested. Asserting here is what turns that into a
 * failure with the code on it rather than a passing test of nothing.
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

function ran(source: string, count = 24, host: EngineHost = CHART): readonly Value[][] {
  const compiled = clean(source);
  const loaded = load(asWire(compiled.program), { source: compiled.file, host });
  if (!loaded.ok) throw new Error(`${loaded.diagnostic.code}: ${loaded.diagnostic.message}`);
  const bars = fiveMinutes(count);
  const result = loaded.engine.run(bars, bars.map(() => ({ isConfirmed: true })));
  assert.equal(result.diagnostic, undefined, result.diagnostic?.message);
  return loaded.engine.program.channels.map((_, channel) => [...loaded.engine.column(channel)]);
}

function refusal(source: string, host: EngineHost = CHART): { code: string; values: unknown } {
  const compiled = clean(source);
  const loaded = load(asWire(compiled.program), { source: compiled.file, host });
  if (loaded.ok) throw new Error('the program loaded and the test expected a refusal');
  return { code: loaded.diagnostic.code, values: loaded.diagnostic.values };
}

const THREE_MODES = `version 1
study("Three readings", overlay = true)
c = req.timeframe("1h", close)
d = req.timeframe("1h", close, mode = "developing")
l = req.timeframe("1h", close, mode = "lookahead")
plot(c, "C")
plot(d, "D")
plot(l, "L")
`;

/**
 * The boundary, bar by bar, on the three bars an off-by-one shows up on.
 *
 * Twenty four five minute bars from 10:00 are two whole hourly buckets. Bar 11
 * is the last of the 10:00 hour, bar 12 the first of the 11:00 hour, bar 13 the
 * one after it. Every wrong implementation this test is written against moves
 * one of those three: a fold that closes a bucket on its last bar rather than on
 * the first bar of the next puts 111 on bar 11, and a fold that dates a bar by
 * its close rather than its open moves the whole column by one.
 */
test('a confirmed read steps on the first bar of the next bucket, and not before', () => {
  const [confirmed] = ran(THREE_MODES);
  assert.ok(confirmed);

  // The first hour has not closed, so there is nothing a confirmed read may say.
  for (let bar = 0; bar <= 11; bar += 1) {
    assert.equal(confirmed[bar], null, `bar ${bar} read a bucket that had not closed`);
  }
  // Bar 12 opens at 11:00, which is the instant the 10:00 hour closed.
  assert.equal(confirmed[12], 111, 'the first bar of a bucket takes the closed one');
  assert.equal(confirmed[13], 111, 'the value holds across the bucket');
  assert.equal(confirmed[23], 111, 'including its last bar');
});

test('a developing read is the bucket so far, and changes on every bar', () => {
  const [, developing] = ran(THREE_MODES);
  assert.ok(developing);
  for (let bar = 0; bar < 24; bar += 1) {
    assert.equal(developing[bar], 100 + bar, `bar ${bar} did not read the bucket so far`);
  }
});

/**
 * Lookahead, which is the only mode allowed to read past the bar it is drawn on.
 *
 * Every bar of the 10:00 hour shows 111, the close the hour went on to make. The
 * gap between this column and the confirmed one is exactly how much a study
 * trading from this line would be cheating.
 */
test('a lookahead read shows the bucket final value from the bucket first bar', () => {
  const [, , lookahead] = ran(THREE_MODES);
  assert.ok(lookahead);
  for (let bar = 0; bar <= 11; bar += 1) {
    assert.equal(lookahead[bar], 111, `bar ${bar} did not read the hour it is inside in full`);
  }
  for (let bar = 12; bar <= 23; bar += 1) {
    assert.equal(lookahead[bar], 123, `bar ${bar} did not read the hour it is inside in full`);
  }
});

/**
 * The property that makes the default worth having.
 *
 * A confirmed and a developing read stop at the bar being executed, so a chart
 * that was given the whole dataset and a chart that was given one bar at a time
 * agree everywhere. A test that only ran the dataset would pass on an engine
 * that read the whole array for every mode, which is the wrong implementation
 * that turns a confirmed read into a lookahead one.
 */
test('a confirmed and a developing read are the same whether bars arrive together or one at a time', () => {
  const source = `version 1
study("Two", overlay = true)
plot(req.timeframe("1h", close), "C")
plot(req.timeframe("1h", close, mode = "developing"), "D")
`;
  const compiled = compile('request.oscript', source);
  const together = load(asWire(compiled.program), { source: compiled.file, host: CHART });
  const oneByOne = load(asWire(compiled.program), { source: compiled.file, host: CHART });
  assert.ok(together.ok && oneByOne.ok);
  const bars = fiveMinutes(24);
  together.engine.run(bars, bars.map(() => ({ isConfirmed: true })));
  for (const bar of bars) oneByOne.engine.append(bar, { isConfirmed: true }, bars.length);

  for (const channel of [0, 1]) {
    assert.deepEqual(
      [...oneByOne.engine.column(channel)],
      [...together.engine.column(channel)],
      `channel ${channel} disagreed between a dataset and a feed`,
    );
  }
});

/**
 * Steps 1 and 2 of the bar cycle, one level down.
 *
 * The newest chart bar is also the newest bar of the bucket it is inside, so a
 * fold that added each execution of it into the bucket would drift: the high
 * would ratchet, the volume would multiply, and a developing read would climb
 * on a bar that never moved. Running every bar four times has to leave the same
 * columns as running it once.
 */
test('a chart bar executed again folds into the same bucket it did the first time', () => {
  const compiled = compile('request.oscript', THREE_MODES);
  const once = load(asWire(compiled.program), { source: compiled.file, host: CHART });
  const again = load(asWire(compiled.program), { source: compiled.file, host: CHART });
  assert.ok(once.ok && again.ok);
  const bars = fiveMinutes(24);
  once.engine.run(bars, bars.map(() => ({ isConfirmed: true })));
  for (const bar of bars) {
    again.engine.append(bar, { isConfirmed: true }, bars.length);
    for (let k = 0; k < 3; k += 1) again.engine.update(bar, { isConfirmed: true });
  }
  for (const channel of [0, 1]) {
    assert.deepEqual(
      [...again.engine.column(channel)],
      [...once.engine.column(channel)],
      `channel ${channel} moved when a bar was executed again`,
    );
  }
});

/**
 * A revision to the newest bar reaches the bucket it is inside.
 *
 * The other half of the rule above, and the one a fold that simply skipped the
 * work on a re-execution would fail: the bucket has to be rebuilt from the
 * reading the host has now, not from the one it replaced.
 */
test('a revised bar changes the developing bucket it is inside', () => {
  const source = `version 1
study("Developing", overlay = true)
plot(req.timeframe("1h", high, mode = "developing"), "H")
`;
  const compiled = compile('request.oscript', source);
  const loaded = load(asWire(compiled.program), { source: compiled.file, host: CHART });
  assert.ok(loaded.ok);
  const bars = fiveMinutes(4);
  for (const bar of bars) loaded.engine.append(bar, { isConfirmed: false }, bars.length);
  assert.equal(loaded.engine.column(0)[3], 103.5, 'the bucket high after four bars');

  const last = bars[3] as HostBar;
  loaded.engine.update({ ...last, high: 200 }, { isConfirmed: false });
  assert.equal(loaded.engine.column(0)[3], 200, 'a revised high did not reach the bucket');
  loaded.engine.update({ ...last, high: 103.5 }, { isConfirmed: false });
  assert.equal(loaded.engine.column(0)[3], 103.5, 'the revision did not roll back');
});

/**
 * Warmup, translated.
 *
 * The expression runs on requested bars, so `sma(close, 3)` inside a read needs
 * three hourly buckets and not three chart bars. With twenty four five minute
 * bars per two hours, the third hourly bucket closes at the start of the fourth
 * hour, and a confirmed read is absent on every chart bar before it. An engine
 * that counted the warmup in chart bars would start the line at bar 3, which is
 * a study drawing before its source has enough history.
 */
test('a warmup inside a read is counted in requested bars, not in chart bars', () => {
  const source = `version 1
study("Warmup", overlay = true)
plot(req.timeframe("1h", sma(close, 3)), "S")
`;
  const compiled = compile('request.oscript', source);
  const loaded = load(asWire(compiled.program), { source: compiled.file, host: CHART });
  assert.ok(loaded.ok);
  const bars = fiveMinutes(60);
  loaded.engine.run(bars, bars.map(() => ({ isConfirmed: true })));
  const column = loaded.engine.column(0);

  // Twelve five minute bars to the hour: buckets are bars 0 to 11, 12 to 23,
  // 24 to 35, 36 to 47, 48 to 59. The third bucket closes at bar 36, which is
  // the first bar a three bucket average can be confirmed on.
  for (let bar = 0; bar < 36; bar += 1) {
    assert.equal(column[bar], null, `bar ${bar} drew before three buckets had closed`);
  }
  assert.equal(column[36], (111 + 123 + 135) / 3, 'the average of the three closed hours');
  assert.equal(column[47], (111 + 123 + 135) / 3, 'held across the bucket');
  assert.equal(column[48], (123 + 135 + 147) / 3, 'and steps on the next bucket');
});

/**
 * 15.4: inside a read, history is counted in requested bars.
 *
 * `close[1]` inside the expression is the previous hour's close; `read[1]` is
 * the read's own value one chart bar ago. The two are different series and the
 * documentation makes a point of it, so the engine has to as well.
 */
test('history inside a read counts requested bars and history outside it counts chart bars', () => {
  const source = `version 1
study("History", overlay = true)
inside = req.timeframe("1h", close[1])
outside = req.timeframe("1h", close, mode = "developing")
plot(inside, "Inside")
plot(orElse(outside[1], 0), "Outside")
`;
  const [inside, outside] = ran(source, 36);
  assert.ok(inside && outside);
  // Bar 24 opens the third hour. The bucket before it closed at 123 and the one
  // before that at 111, so a read of `close[1]` taken on the last closed bucket
  // is the first hour's close.
  assert.equal(inside[24], 111, 'close[1] inside a read is the previous requested bar');
  assert.equal(outside[24], 123, 'a history read outside it is the previous chart bar');
});

/** A read of another instrument, which only a host can answer. */
const OTHER = `version 1
study("Other", overlay = true)
o = req.symbol("BBB", "1h", close)
plot(o, "O")
plot(req.isReady(o) ? 1 : 0, "Ready")
plot(req.error(o) == "" ? 0 : 1, "Failed")
`;

function hourly(count: number, from: number): readonly HostBar[] {
  const out: HostBar[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      open: 200 + i,
      high: 202 + i,
      low: 198 + i,
      close: 200 + i,
      volume: 100,
      time: from + i * 3_600_000,
    });
  }
  return out;
}

test('another instrument is folded onto the chart bars by time', () => {
  const answer = hourly(3, Date.UTC(2025, 0, 6, 9, 0, 0));
  const [values, ready, failed] = ran(OTHER, 24, {
    ...CHART,
    requestBars: () => ({ bars: answer }),
  });
  assert.ok(values && ready && failed);
  // Chart bars 0 to 11 are inside the 10:00 hour, whose last closed predecessor
  // is the 09:00 bar; bars 12 to 23 are inside the 11:00 hour.
  assert.equal(values[0], 200);
  assert.equal(values[11], 200);
  assert.equal(values[12], 201);
  assert.equal(ready[0], 1, 'an answered read is ready');
  assert.equal(failed[0], 0, 'an answered read reports no reason');
});

/**
 * The number a host extends its fetch range backwards by.
 *
 * A read whose expression needs thirty bars of the requested timeframe and asks
 * a host for none gets thirty requested bars of nothing, or, on a host that
 * starts the average at the first bar it fetched, thirty bars of a number
 * computed from too little history. The second is the one nobody sees. So the
 * lengths written inside the expression have to reach the query, whether the
 * entry states its warmup exactly or bounds it.
 */
test('the history a read asks for backwards counts the lengths inside it', () => {
  const asked: { warmup: number | null }[] = [];
  const spy = (source: string): number | null => {
    asked.length = 0;
    ran(source, 4, {
      ...CHART,
      requestBars: (query) => {
        asked.push({ warmup: query.warmup });
        return { bars: hourly(2, Date.UTC(2025, 0, 6, 9, 0, 0)) };
      },
    });
    return asked[0]?.warmup ?? null;
  };
  const exact = `version 1
study("Exact", overlay = true)
o = req.symbol("BBB", "1h", ema(close, 20))
plot(o, "O")
`;
  const bounded = `version 1
study("Bounded", overlay = true)
o = req.symbol("BBB", "1h", hma(close, 20))
plot(o, "O")
`;
  const element = `version 1
study("Element", overlay = true)
o = req.symbol("BBB", "1h", macd(close)[1])
plot(o, "O")
`;
  assert.equal(spy(exact), 19, 'an exact length reaches the host');
  assert.equal(spy(bounded), 18, 'and so does one the entry only bounds');
  assert.equal(spy(element), 33, 'an element asks for the history that element needs');
});

test('the whole set of requests is handed to the host once, before bar 0', () => {
  const asked: unknown[] = [];
  ran(OTHER, 4, {
    ...CHART,
    requestBars: (query) => {
      asked.push({ ...query });
      return { bars: hourly(2, Date.UTC(2025, 0, 6, 9, 0, 0)) };
    },
  });
  assert.equal(asked.length, 1, 'a request must not be discovered during a bar');
  assert.deepEqual(asked[0], {
    id: 0,
    read: 'symbol',
    symbol: 'BBB',
    exchange: null,
    timeframe: '1h',
    mode: 'confirmed',
    warmup: 0,
  });
});

/**
 * A refusal is a state a script observes, and the rest of the study keeps
 * drawing.
 *
 * The host's own words are carried rather than paraphrased, because "the feed is
 * not connected" is actionable and "the request failed" is not.
 */
test('a refused read is absent, reports the host reason, and stops nothing else', () => {
  const source = `version 1
study("Refused", overlay = true)
o = req.symbol("BBB", "1h", close)
plot(o, "O")
plot(req.isReady(o) ? 1 : 0, "Ready")
plot(close, "Close")
`;
  const compiled = compile('request.oscript', source);
  const loaded = load(asWire(compiled.program), {
    source: compiled.file,
    host: {
      ...CHART,
      requestBars: () => ({ refused: { code: 'OS6009', reason: 'the feed is not connected' } }),
    },
  });
  assert.ok(loaded.ok);
  const bars = fiveMinutes(6);
  loaded.engine.run(bars, bars.map(() => ({ isConfirmed: true })));
  assert.equal(loaded.engine.column(0)[5], null, 'a refused read has no value');
  assert.equal(loaded.engine.column(1)[5], 0, 'a refused read is not ready');
  assert.equal(loaded.engine.column(2)[5], 105, 'the rest of the study kept drawing');
});

test('the reason a read failed carries the host own words to the script', () => {
  // 5.4: the host's words are carried and not paraphrased, because "the account
  // subscription does not cover this instrument" is actionable and "the request
  // failed" is not. So the assertion is that the sentence the host wrote reached
  // the script, which is the one thing about this text that is a promise.
  const source = `version 1
study("Reason", overlay = true)
o = req.symbol("BBB", "1h", close)
plot(o, "O")
plot(str.contains(req.error(o), "not connected") ? 1 : 0, "Carried")
plot(str.length(req.error(o)) > 0 ? 1 : 0, "HasReason")
`;
  const [, carried, hasReason] = ran(source, 3, {
    ...CHART,
    requestBars: () => ({ refused: { code: 'OS6009', reason: 'the feed is not connected' } }),
  });
  assert.ok(carried && hasReason);
  assert.equal(hasReason[2], 1, 'a failed read must report a reason');
  assert.equal(carried[2], 1, 'the host own words must reach the script');
});

test('a host still fetching leaves the read absent and not ready', () => {
  const [values, ready, failed] = ran(OTHER, 6, {
    ...CHART,
    requestBars: () => ({ pending: true }),
  });
  assert.ok(values && ready && failed);
  assert.equal(values[5], null);
  assert.equal(ready[5], 0);
  assert.equal(failed[5], 0, 'waiting is not failing, so there is no reason to report');
});

test('a provider that serves no symbol is the same answer as an instrument it does not know', () => {
  const [values, ready, failed] = ran(OTHER, 4, { ...CHART, requestBars: () => undefined });
  assert.ok(values && ready && failed);
  assert.equal(values[3], null);
  assert.equal(ready[3], 0);
  assert.equal(failed[3], 1);
});

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
 * A calendar bucket with no zone.
 *
 * A day is a date rather than a count of minutes, so folding one needs the
 * instrument's timezone. A host that states none leaves the read absent, which
 * is the answer the calendar gives to the same question: an engine that folded
 * days in a zone nobody chose would put the boundary in the middle of a session
 * for most of the world and look right while doing it.
 */
test('a daily read with no instrument timezone is absent rather than folded in a zone nobody chose', () => {
  const source = `version 1
study("Daily", overlay = true)
plot(req.timeframe("1D", close), "D")
plot(close, "Close")
`;
  const [daily, closes] = ran(source, 6, {
    instrument: { symbol: 'AAA', exchange: 'XX', interval: '5' },
  });
  assert.ok(daily && closes);
  assert.equal(daily[5], null);
  assert.equal(closes[5], 105, 'the rest of the study kept drawing');
});

/**
 * The same dead read, through the two calls that exist to explain one.
 *
 * A study that draws nothing while `req.isReady` says it is ready and
 * `req.error` says nothing is wrong is the worst version of this: the trader
 * has looked at the blank pane already and been sent to look somewhere else.
 * Nothing that arrives later supplies a timezone the instrument record does not
 * hold, so the read is not waiting: it is finished, and it says why.
 *
 * The assertion names the fact rather than the sentence. The words are the
 * catalogue's and are allowed to improve; that the reason names the timezone is
 * this engine's answer and is the promise.
 */
test('a daily read with no instrument timezone says why it can never answer', () => {
  const source = `version 1
study("Daily", overlay = true)
d = req.timeframe("1D", close)
plot(d, "D")
plot(req.isReady(d) ? 1 : 0, "Ready")
plot(str.contains(req.error(d), "timezone") ? 1 : 0, "Named")
plot(str.length(req.error(d)), "Length")
`;
  const [daily, ready, named, length] = ran(source, 6, {
    instrument: { symbol: 'AAA', exchange: 'XX', interval: '5' },
  });
  assert.ok(daily && ready && named && length);
  assert.equal(daily[5], null, 'the read is still absent');
  assert.equal(ready[5], 0, 'a read that can never answer is not ready');
  assert.equal(named[5], 1, 'and the reason names the fact the host did not supply');
  assert.ok((length[5] as number) > 0);
});

/** An intraday read is counted rather than dated, so no zone is needed. */
test('an intraday read on a host with no timezone is ready and has no reason', () => {
  const source = `version 1
study("Hourly", overlay = true)
h = req.timeframe("1h", close)
plot(req.isReady(h) ? 1 : 0, "Ready")
plot(str.length(req.error(h)), "Length")
`;
  const [ready, length] = ran(source, 24, {
    instrument: { symbol: 'AAA', exchange: 'XX', interval: '5' },
  });
  assert.ok(ready && length);
  assert.equal(ready[0], 1);
  assert.equal(length[0], 0);
});

test('a daily read with a timezone folds by the calendar', () => {
  const source = `version 1
study("Daily", overlay = true)
plot(req.timeframe("1D", high), "D")
`;
  const compiled = compile('request.oscript', source);
  const loaded = load(asWire(compiled.program), { source: compiled.file, host: CHART });
  assert.ok(loaded.ok);
  // Two days of one bar each, a day apart, so the second day reads the first.
  const bars: readonly HostBar[] = [
    { open: 1, high: 9, low: 1, close: 5, volume: 1, time: Date.UTC(2025, 0, 6, 10, 0, 0) },
    { open: 5, high: 7, low: 2, close: 6, volume: 1, time: Date.UTC(2025, 0, 6, 15, 0, 0) },
    { open: 6, high: 3, low: 1, close: 2, volume: 1, time: Date.UTC(2025, 0, 7, 10, 0, 0) },
  ];
  loaded.engine.run(bars, bars.map(() => ({ isConfirmed: true })));
  const column = loaded.engine.column(0);
  assert.equal(column[0], null, 'the first day has not closed');
  assert.equal(column[1], null, 'and has still not closed on its last bar');
  assert.equal(column[2], 9, 'the second day reads the first day high');
});

/**
 * Absence propagates through the fold, `host-interface.md` 3.1.
 *
 * A bucket whose high is missing from one of its bars has no high. The
 * alternative, the highest of the bars that did report one, is a number with no
 * name: it is not the bucket's high and nothing says how much of the bucket it
 * covers.
 */
test('a hole in a source bar leaves the bucket it is in absent', () => {
  const source = `version 1
study("Hole", overlay = true)
plot(req.timeframe("1h", high), "H")
`;
  const compiled = compile('request.oscript', source);
  const loaded = load(asWire(compiled.program), { source: compiled.file, host: CHART });
  assert.ok(loaded.ok);
  const bars = [...fiveMinutes(24)];
  bars[4] = { ...(bars[4] as HostBar), high: null };
  loaded.engine.run(bars, bars.map(() => ({ isConfirmed: true })));
  assert.equal(loaded.engine.column(0)[12], null, 'a bucket with a hole has no high');
});

/**
 * A read whose value is an object, which two heaps make a trap.
 *
 * A reference is an index into one heap and a body's heap is its own, so handing
 * the index to the chart would name whatever the chart's heap holds at that
 * index: a different array, or nothing. The value is copied across instead, and
 * copied again on every bar that reads it, because the copy lives in a heap whose
 * rollback undoes the bar it was made on.
 */
test('an array a read produces is readable on the chart, element by element', () => {
  const source = `version 1
study("Array", overlay = true)
a = req.timeframe("1h", [high, low])
b = req.timeframe("1h", [high, low], mode = "developing")
plot(isNone(a) ? none : a[0], "Hi")
plot(isNone(a) ? none : a[1], "Lo")
plot(isNone(b) ? none : b[0], "Developing")
`;
  const [hi, lo, developing] = ran(source);
  assert.ok(hi && lo && developing);
  assert.equal(hi[11], null, 'the first hour has not closed');
  assert.equal(hi[12], 111.5, 'the closed hour high');
  assert.equal(lo[12], 99.5, 'the closed hour low');
  assert.equal(developing[5], 105.5, 'the hour high so far');
});

/** A read written inside another read, which the format carries and 2.16 walks. */
test('a read written inside a read runs over the bars the outer one folds', () => {
  const source = `version 1
study("Nested", overlay = true)
plot(req.timeframe("1h", req.timeframe("4h", close, mode = "developing"), mode = "developing"), "N")
`;
  const [values] = ran(source, 24);
  assert.ok(values);
  assert.equal(values[23], 123, 'the inner read folds the outer read own bars');
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
