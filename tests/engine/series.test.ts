/**
 * Duty 1, checked: the two refusals `host-interface.md` 3.5 requires.
 *
 * Every other duty in that document had a suite. This one did not, and the
 * effect was the shape this project keeps finding: a host handing over zero
 * bars, a swapped pair or the same timestamp twice was accepted in silence, the
 * study computed on it, and the numbers came back looking exactly like numbers.
 * Conformance item 1 names both codes and nothing raised either of them.
 *
 * Each test below asserts the code and the placeholders it carries, never the
 * wording, and each one names the wrong implementation it catches:
 *
 * - an engine that runs a loop over an empty dataset and reports a clean, empty
 *   result, which on a screen is a blank pane and on the page is a study that
 *   drew nothing;
 * - an engine that folds a duplicated bar in twice, or takes a reversed pair in
 *   the order it arrived, either of which makes the history operator, warmup
 *   and every session test mean something other than what they say.
 *
 * The bars are the page's own shape, section 3.1, so a fixture here cannot
 * state a field the document does not print.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { load } from '../../src/core/engine/index.js';
import type { Engine, HostBar } from '../../src/core/engine/index.js';

import { PAGE_INSTRUMENT } from './page-host.js';
import type { PageBar } from './page-host.js';
import { asWire, compile } from './support.js';

const HOUR = 3_600_000;

/** Midnight UTC, and the instant the first bar of every fixture opens at. */
const START = 1_748_736_000_000;

const SCRIPT = `version 1

study("Series", overlay = true)

plot(close, "Close", aqua)
plot(close[1], "Previous close", silver)
`;

/** A bar in the page's shape, at one price, opening at `time`. */
function bar(time: number, close: number): PageBar {
  return { time, open: close, high: close + 1, low: close - 1, close, volume: 100, oi: 0 };
}

/** Bars an hour apart, which is the interval the page's record states. */
function series(count: number): readonly PageBar[] {
  const out: PageBar[] = [];
  for (let i = 0; i < count; i += 1) out.push(bar(START + i * HOUR, 100 + i));
  return out;
}

function engine(): Engine {
  const compiled = compile('series.oscript', SCRIPT);
  assert.deepEqual(compiled.diagnostics.map((one) => one.code), [], 'the fixture must compile');
  const loaded = load(asWire(compiled.program), {
    source: compiled.file,
    host: { instrument: PAGE_INSTRUMENT },
  });
  assert.equal(loaded.ok, true, 'the fixture must load');
  if (!loaded.ok) throw new Error('unreachable');
  return loaded.engine;
}

/** The page's bars as the engine takes them: the same facts, section 1. */
function handedOver(bars: readonly PageBar[]): readonly HostBar[] {
  return bars as readonly HostBar[];
}

test('a run over no bars at all is OS6010 and names the chart it was empty for', () => {
  // Catches an engine whose loop simply runs no iterations: it would return an
  // empty result with no diagnostic, and an empty pane with nothing said is
  // indistinguishable from a study that computed nothing.
  const run = engine().run([]);
  assert.equal(run.bars.length, 0);
  assert.equal(run.diagnostic?.code, 'OS6010');
  assert.equal(run.diagnostic?.values['symbol'], PAGE_INSTRUMENT.symbol);
  assert.equal(run.diagnostic?.values['timeframe'], PAGE_INSTRUMENT.interval);
});

test('a script refused for having no bars stays refused', () => {
  // The refusal is the run's, not one bar's, so an engine that reported it once
  // and then carried on would compute the rest of the chart on a state nobody
  // has accounted for.
  const one = engine();
  assert.equal(one.run([]).diagnostic?.code, 'OS6010');
  assert.equal(one.failed, true);
  assert.equal(one.append(bar(START, 100)).diagnostic?.code, 'OS6010');
});

test('the same timestamp twice is OS6011 on the second of the two', () => {
  // Catches an engine that deduplicates silently and one that folds the bar in
  // twice. Neither is the engine's decision to make: it is handed the bars and
  // does not deduplicate what it is given.
  const bars = [...series(3)];
  bars[2] = bar(START + HOUR, 300);
  const run = engine().run(handedOver(bars));
  assert.equal(run.diagnostic?.code, 'OS6011');
  assert.equal(run.diagnostic?.values['index'], 2);
  assert.equal(run.diagnostic?.values['time'], START + HOUR);
  assert.equal(run.diagnostic?.values['previous'], 1);
});

test('a swapped pair is OS6011 on the first bar that does not follow', () => {
  // Catches an engine that reorders. A study run over a reordered history draws
  // a line that the data it was given does not support, and nothing on the
  // chart says so.
  const bars = [...series(5)];
  const third = bars[2] as PageBar;
  bars[2] = bars[3] as PageBar;
  bars[3] = third;
  const run = engine().run(handedOver(bars));
  assert.equal(run.diagnostic?.code, 'OS6011');
  assert.equal(run.diagnostic?.values['index'], 3, 'the first bar that does not follow, not the swap');
});

test('a refused series stops at the bar that failed and keeps what came before', () => {
  // The bars before the bad one were computed on a history that was still
  // strictly increasing, so they stand. Catches an engine that throws the whole
  // run away, which would lose the part of the answer that is right.
  const bars = [...series(4)];
  bars[3] = bar(START, 400);
  const run = engine().run(handedOver(bars));
  assert.equal(run.diagnostic?.code, 'OS6011');
  assert.equal(run.bars.length, 4, 'three bars ran and the fourth reports the refusal');
  assert.deepEqual(run.bars.slice(0, 3).map((one) => one.diagnostic), [
    undefined,
    undefined,
    undefined,
  ]);
  assert.equal(run.bars[3]?.diagnostic?.code, 'OS6011');
});

test('a bar appended out of order is refused the same way a dataset is', () => {
  // The live path and the whole-dataset path are the same series arriving two
  // ways, so a feed that resends a bar through `append` rather than as an
  // update is the duplicate above, one bar at a time. Catches a check written
  // only where a whole array is handed over, which is the form fewer hosts use.
  const live = engine();
  for (const one of series(3)) {
    assert.equal(live.append(one as HostBar).diagnostic, undefined);
  }
  const repeated = live.append(bar(START + 2 * HOUR, 500));
  assert.equal(repeated.diagnostic?.code, 'OS6011');
  assert.equal(repeated.diagnostic?.values['index'], 3);
});

test('a revision that moves a bar back onto the one before it is refused', () => {
  // An update never changes a bar's time, and one that moves it back past its
  // neighbour is the reversed pair again wearing the name of an update.
  const live = engine();
  for (const one of series(3)) live.append(one as HostBar);
  const moved = live.update(bar(START, 999));
  assert.equal(moved.diagnostic?.code, 'OS6011');
  assert.equal(moved.diagnostic?.values['index'], 2);
});

test('an ordinary series is accepted and the check costs it no value', () => {
  // The test that would catch the opposite mistake: a check that refuses a
  // series it should not. Uneven spacing is ordinary, because real sessions are
  // not uniform and a host that padded a gap would be inventing trades.
  const bars = [bar(START, 100), bar(START + HOUR, 101), bar(START + 5 * HOUR, 102)];
  const one = engine();
  const run = one.run(handedOver(bars));
  assert.equal(run.diagnostic, undefined);
  assert.deepEqual(one.column(0), [100, 101, 102]);
  assert.deepEqual(one.column(1), [null, 100, 101]);
});
