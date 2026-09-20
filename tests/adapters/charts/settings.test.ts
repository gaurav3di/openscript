/**
 * What a settings dialog stores, and what the engine is given for it.
 *
 * The two vocabularies meet here and neither is the other's. A dialog stores
 * strings and numbers a layout can be written to a file; the engine takes the
 * values the language has. The conversions are one file's worth of code and each
 * one has a way of being quietly wrong: a colour losing its transparency, a
 * choice arriving as the text of a number rather than the number, a stored value
 * silently replaced by the default when it should have been refused.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { bars, context, descriptorOfSource, refusalOf } from './support.js';

/** The line break a script is written with, spelled once. */
const NEWLINE = '\n';

/** A script whose plotted colour is an input, read per bar so it reaches a channel. */
const TINTED = [
  'version 1',
  'study("Tinted", overlay = true)',
  'c = input(fade(aqua, 50), "Line colour")',
  'plot(close, "Close", color = close > open ? c : c)',
  '',
].join('\n');

/** The colour the plot painted on its first bar with a value. */
function painted(settings: Record<string, unknown>): string | undefined {
  const descriptor = descriptorOfSource(TINTED);
  const data = bars(10);
  const values = descriptor.calc(data, settings, {}, context(10));
  const plot = descriptor.plots[0];
  const value = values['p0']?.[0];
  if (plot?.colorBy === undefined || typeof value !== 'number') return undefined;
  return plot.colorBy({ value, index: 0, values, settings });
}

test('a colour the script faded arrives at the engine with its alpha', () => {
  assert.equal(painted({}), 'rgba(0, 255, 255, 0.5)');
});

test('a colour a swatch stored keeps the transparency the script declared', () => {
  // A chart's colour control is six digits and has no alpha channel, so every
  // translucent input would turn opaque the first time somebody opened the
  // dialog. The stored digits replace the channels and leave the alpha alone.
  assert.equal(painted({ c: '#ff0000' }), 'rgba(255, 0, 0, 0.5)');
});

test('a colour that states its own alpha replaces the declared one', () => {
  assert.equal(painted({ c: '#ff000040' }), 'rgba(255, 0, 0, 0.25098039215686274)');
  assert.equal(painted({ c: 'rgba(255, 0, 0, 0.8)' }), 'rgba(255, 0, 0, 0.8)');
});

test('a choice a dialog stored reaches the engine as the option the script wrote', () => {
  // `options` is a string input's argument and nothing else's (`stdlib.md`
  // 13.3), so a select's stored value and its declared option are both strings
  // and the match is on the spelling. What the conversion has to get right is
  // the one it is asked for and the one it is not: a stored choice selects the
  // option, and a stored value that names no option is not quietly the default.
  const descriptor = descriptorOfSource(
    [
      'version 1',
      'study("Choice", overlay = true)',
      'mode = input("fast", "Mode", options = ["fast", "slow"])',
      'plot(sma(close, mode == "fast" ? 5 : 20), "SMA")',
      '',
    ].join(NEWLINE),
  );
  const data = bars(40);
  const declared = descriptor.calc(data, {}, {}, context(40));
  const chosen = descriptor.calc(data, { mode: 'slow' }, {}, context(40));

  assert.equal(declared['p0']?.findIndex((one) => one !== null), 4, 'the declared default');
  assert.equal(chosen['p0']?.findIndex((one) => one !== null), 19, 'the option the user picked');

  // Replacing it with the default here would be a settings dialog that ignores
  // what it was given, one layer further down than the engine reports it.
  const refusal = refusalOf(() => descriptor.calc(data, { mode: 'sideways' }, {}, context(40)));
  assert.equal(refusal.code, 'OS6019');
});

test('a source input selects the series the engine reads each bar', () => {
  const descriptor = descriptorOfSource(
    'version 1\nstudy("Source", overlay = true)\ns = input(close, "Source")\nplot(s, "Picked")\n',
  );
  const data = bars(5);
  const closes = descriptor.calc(data, {}, {}, context(5));
  const highs = descriptor.calc(data, { s: 'high' }, {}, context(5));
  assert.deepEqual(closes['p0'], data.map((one) => one.close));
  assert.deepEqual(highs['p0'], data.map((one) => one.high));
});

/**
 * The documented example, end to end.
 *
 * `docs/inputs.md` teaches `study("S", precision = input(2, "Places"))` as how a
 * reader gets to change something the declaration decides, and for the life of
 * this module the descriptor read the declared default whatever the host had
 * stored: the number a user typed reached the engine and reached nothing the
 * chart drew it with. The wrong implementation these catch is the one that was
 * there, `lookupFor(program, {})`, which is bit for bit the same descriptor for
 * every settings map in the world.
 */
const PLACES = [
  'version 1',
  'study("S", precision = input(2, "Places"))',
  'plot(close, "C")',
  '',
].join(NEWLINE);

test('a declaration option written as an input reads the declared default when nothing is stored', () => {
  assert.deepEqual(descriptorOfSource(PLACES).plots[0]?.priceFormat, {
    type: 'price',
    precision: 2,
  });
});

test('a declaration option written as an input reads the value the host stored', () => {
  const tuned = descriptorOfSource(PLACES, { settings: { Places: 7 } });
  assert.deepEqual(tuned.plots[0]?.priceFormat, { type: 'price', precision: 7 });
});

test('the descriptor and the engine agree on the value, not only on the key', () => {
  // The two resolve the same field from the same settings, so a host that hands
  // one map to both gets a pane formatted to the number the column is computed
  // at. They disagreed here: the engine resolved 7 and the chart formatted at 2.
  const stored = { places: 7 };
  const source = [
    'version 1',
    'places = input(2, "Places")',
    'study("S", precision = places)',
    'plot(round(close, places), "C")',
    '',
  ].join(NEWLINE);
  const descriptor = descriptorOfSource(source, { settings: stored });
  const data = bars(3);
  const column = descriptor.calc(data, stored, {}, context(3));
  const drawn = descriptor.plots[0]?.priceFormat;

  assert.equal(drawn?.type === 'price' ? drawn.precision : undefined, 7);
  assert.deepEqual(
    column['p0'],
    data.map((one) => Number(one.close.toFixed(7))),
  );
});

test('a settings map the descriptor was not built with does not move the declared shape', () => {
  // The honest half of the same fact. The declared shape is a value rather than
  // a call, so it answers the settings the descriptor was built with and a host
  // that keeps one descriptor per study instance builds again on a change.
  // `spec/chart-narrowings.json` records which members do follow a later map.
  const descriptor = descriptorOfSource(PLACES, { settings: { Places: 7 } });
  descriptor.calc(bars(3), { Places: 3 }, {}, context(3));
  assert.deepEqual(descriptor.plots[0]?.priceFormat, { type: 'price', precision: 7 });
});

/**
 * A stored value that is not a value, in both directions.
 *
 * The declared shape is built before anything is calculated, so the descriptor
 * is the one thing a host holds while a settings map that cannot run is stored.
 * Two ways of being wrong met here. The shape handed out a precision of 99
 * against an input declared `max = 8`, which is a number the language will not
 * produce and a host may put in a legend; and the adapter had its own idea of
 * an unusable value, so a stored `null` read as the default while the engine
 * refused the same map, and a stored `"7"` read as neither, landing on the
 * chart's own fallback of 4.
 *
 * One rule settles both: the engine's own check decides, a value it will not
 * take reads as the declared default, and the value still travels to the engine
 * so the run stops. The wrong implementations these catch are the two that were
 * there, and a third that a reader would reach for: refusing to build the
 * descriptor at all, which takes away the dialog the value is corrected in.
 */
const BOUNDED = [
  'version 1',
  'study("S", precision = input(2, "Places", min = 0, max = 8))',
  'plot(close, "C")',
  '',
].join(NEWLINE);

/** What the declared shape says, and what the run says, for one stored value. */
function bothAnswers(stored: unknown): { shape: number | undefined; code: string } {
  const settings = { Places: stored } as Record<string, unknown>;
  const descriptor = descriptorOfSource(BOUNDED, { settings });
  const format = descriptor.plots[0]?.priceFormat;
  return {
    shape: format?.type === 'price' ? format.precision : undefined,
    code: refusalOf(() => descriptor.calc(bars(3), settings, {}, context(3))).code,
  };
}

test('a stored value outside the input\'s own bounds does not reach the declared shape', () => {
  assert.deepEqual(bothAnswers(99), { shape: 2, code: 'OS6019' });
  assert.deepEqual(bothAnswers(-4), { shape: 2, code: 'OS6019' });
  // And the bound itself still runs, so this is a refusal and not a ceiling.
  const allowed = descriptorOfSource(BOUNDED, { settings: { Places: 8 } });
  assert.deepEqual(allowed.plots[0]?.priceFormat, { type: 'price', precision: 8 });
});

test('the declared shape and the engine agree on every unusable stored value', () => {
  // The adapter used to answer this list for itself: null and an object were
  // nothing stored, a number out of range was a value, and a string was passed
  // to a field that did not want one. Four different answers to one question.
  for (const stored of [99, -4, null, { a: 1 }, '7', true, [], Number.NaN]) {
    assert.deepEqual(bothAnswers(stored), { shape: 2, code: 'OS6019' }, JSON.stringify(stored));
  }
});

test('a stored colour the adapter cannot read is the declared colour and refuses', () => {
  // The same rule on a kind whose stored spelling is converted on the way in,
  // and where the old answer was a third thing again: the string reached a
  // field that wanted a colour, so the plot carried no colour at all and a host
  // drew it in whatever it uses for a plot that declared none.
  const source = [
    'version 1',
    'study("Tinted", overlay = true)',
    'plot(close, "Close", color = input(fade(aqua, 50), "Line colour"))',
    '',
  ].join(NEWLINE);
  const stored = { 'Line colour': 'not a colour' };
  const descriptor = descriptorOfSource(source, { settings: stored });
  assert.equal(descriptor.plots[0]?.style?.color, 'rgba(0, 255, 255, 0.5)');
  const refusal = refusalOf(() => descriptor.calc(bars(10), stored, {}, context(10)));
  assert.equal(refusal.code, 'OS6019');
});

/**
 * What the held engine is compared against, on the path that reuses it.
 *
 * `calc` reloads every time, so a settings map it cannot run is refused there
 * whatever any signature says. `calcTail` is where the question is: it hands
 * back the bars from `from` onwards out of the engine it is holding, and it
 * gives up and returns nothing when that engine was not loaded from these
 * settings. Each test below reads both answers, because "it returned nothing"
 * proves the change was noticed only if the same call returns something when
 * nothing changed.
 */
function tailAfter(first: unknown, second: unknown): { same: unknown; changed: unknown } {
  // A store each. A tail run that serves the bars moves the held engine forward,
  // so asking the same store twice answers the second question with the first
  // one's leftovers: the count no longer matches and the answer is nothing
  // whatever the settings say. That is how the first draft of this test passed
  // against a signature that could not see the change.
  const run = (held: unknown): unknown => {
    const descriptor = descriptorOfSource(BOUNDED, { settings: { Places: first } });
    const store = {};
    const data = bars(6);
    const last = data[data.length - 1]!;
    const next = [...data, { ...last, time: last.time + 60 }];
    const values = descriptor.calc(data, { Places: first }, store, context(6));
    return descriptor.calcTail?.(
      next,
      { Places: held } as Record<string, unknown>,
      data.length - 1,
      values,
      store,
      context(7),
    );
  };
  return { same: run(first), changed: run(second) };
}

test('the incremental path sees a change the declared shape cannot show', () => {
  // Both maps below describe one shape, because a refused value shows the
  // declared default, and one of them cannot run. A signature taken from the
  // shape reads them as one map, keeps the engine it holds and goes on drawing,
  // so the study reports numbers for a setting that was refused. It is taken
  // from what the engine is handed for that reason.
  const { same, changed } = tailAfter(2, 99);
  assert.notEqual(same, null, 'the same settings reuse the engine, or this proves nothing');
  assert.equal(changed, null, 'and a value the engine refuses does not');
});

test('the incremental path sees a stored number replaced by its own spelling', () => {
  // `7` and `"7"` spell one string and the engine takes one of them.
  const { same, changed } = tailAfter(7, '7');
  assert.notEqual(same, null, 'the same settings reuse the engine, or this proves nothing');
  assert.equal(changed, null, 'and the same number written as text does not');
});
