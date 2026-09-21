/**
 * One resting order against one bar, which is where a backtest lies if it is
 * going to.
 *
 * **A bar is four prices and no path**, so every rule here is one that does not
 * need to know whether the high came before the low, and every case where
 * knowing would matter is decided against the strategy. The wrong
 * implementations this file is written against are all generous ones: an order
 * filled because its price was touched, a stop filled at its trigger after the
 * market gapped past it, a limit filled at the bar's close rather than at its
 * own price. Each of them reports money the market never offered, and each of
 * them looks like a working backtest.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_FILL, testResting } from '../../src/core/backtest/index.js';
import type { FillPolicy, RecordedBar, RestingOrder } from '../../src/core/backtest/index.js';

/** A bar that opens at 100, trades between 98 and 102 and closes at 101. */
const BAR: RecordedBar = {
  time: 0,
  open: 100,
  high: 102,
  low: 98,
  close: 101,
  volume: null,
  oi: null,
};

const LOOSE: FillPolicy = { ...DEFAULT_FILL, limitNeedsThrough: false };
const AT_TRIGGER: FillPolicy = { ...DEFAULT_FILL, stopFillsAtOpenOnGap: false };

function order(one: Partial<RestingOrder>): RestingOrder {
  return { side: 'buy', type: 'limit', limit: null, trigger: null, ...one };
}

/**
 * A limit inside the bar's range fills at its own price.
 *
 * The test that keeps the rest honest: an implementation that filled nothing
 * would pass every refusal below and fail here.
 */
test('a limit the bar traded through fills at the limit', () => {
  const outcome = testResting(order({ side: 'buy', limit: 99 }), BAR, DEFAULT_FILL);
  assert.equal(outcome.filled, true);
  if (!outcome.filled) return;
  assert.equal(outcome.price, 99);
  assert.equal(outcome.atOpen, false);
  assert.equal(outcome.slips, false);
});

/**
 * A limit at the extreme of a bar is touched and not traded through.
 *
 * Catches the loose comparison, which is the single most flattering defect a
 * fill model can have: every order resting at a turning point is filled, and a
 * strategy that buys the low of the day is reported as having bought the low of
 * the day. The policy can say otherwise, and the second half asserts that the
 * knob is actually read rather than being a field nothing consults.
 */
test('a limit at the bar extreme fills only where the policy says touched is traded', () => {
  const at = order({ side: 'buy', limit: 98 });
  assert.equal(testResting(at, BAR, DEFAULT_FILL).filled, false);
  assert.equal(testResting(at, BAR, LOOSE).filled, true);

  const above = order({ side: 'sell', limit: 102 });
  assert.equal(testResting(above, BAR, DEFAULT_FILL).filled, false);
  assert.equal(testResting(above, BAR, LOOSE).filled, true);
});

/**
 * A limit the bar opened already through fills at the open.
 *
 * The open is the better price and it is the first price the bar had. Catches an
 * implementation that always fills a limit at its limit, which would report a
 * worse fill than the market gave, and one that fills at the close, which is a
 * price the order had nothing to do with.
 */
test('a limit the bar gapped through fills at the open', () => {
  const gapped: RecordedBar = { ...BAR, open: 97, high: 99, low: 96, close: 98 };
  const outcome = testResting(order({ side: 'buy', limit: 99 }), gapped, DEFAULT_FILL);
  assert.equal(outcome.filled, true);
  if (!outcome.filled) return;
  assert.equal(outcome.price, 97);
  assert.equal(outcome.atOpen, true);
  assert.equal(outcome.slips, false);
});

/**
 * A stop the bar reached fills at the trigger, and a stop it gapped past does
 * not.
 *
 * Catches the defect that makes a stop loss look survivable: an implementation
 * that fills every stop at its trigger reports a loss of exactly what the
 * strategy risked, whatever the market did overnight. The second half asserts
 * the policy is read, because a host whose market has no gaps may say so.
 */
test('a stop that gapped is filled at the open and not at its trigger', () => {
  const reached = testResting(order({ side: 'buy', type: 'stop', trigger: 101 }), BAR, DEFAULT_FILL);
  assert.equal(reached.filled, true);
  if (reached.filled) {
    assert.equal(reached.price, 101);
    assert.equal(reached.atOpen, false);
    assert.equal(reached.slips, true);
  }

  const gapped: RecordedBar = { ...BAR, open: 105, high: 107, low: 104, close: 106 };
  const past = testResting(order({ side: 'buy', type: 'stop', trigger: 101 }), gapped, DEFAULT_FILL);
  assert.equal(past.filled, true);
  if (past.filled) {
    assert.equal(past.price, 105);
    assert.equal(past.atOpen, true);
  }

  const held = testResting(order({ side: 'buy', type: 'stop', trigger: 101 }), gapped, AT_TRIGGER);
  assert.equal(held.filled, true);
  if (held.filled) assert.equal(held.price, 101);
});

/**
 * A stop the bar never reached does nothing at all.
 *
 * Catches an implementation that triggers on the wrong side of the comparison,
 * which is a stop that fires on every bar for the whole of a run.
 */
test('a stop the bar never reached is not triggered', () => {
  const outcome = testResting(order({ side: 'buy', type: 'stop', trigger: 110 }), BAR, DEFAULT_FILL);
  assert.equal(outcome.filled, false);
  if (outcome.filled) return;
  assert.equal(outcome.triggered, false);

  const below = testResting(order({ side: 'sell', type: 'stop', trigger: 90 }), BAR, DEFAULT_FILL);
  assert.equal(below.filled, false);
});

/**
 * Slippage applies to a stop and never to a limit.
 *
 * Asserted here as the flag the venue acts on, because a limit that is worsened
 * is not a limit: it fills at its own price or it does not fill. Catches an
 * implementation that applies one slippage rule to every fill, which is the
 * obvious way to write it and is wrong in the strategy's favour on a limit and
 * against it on nothing.
 */
test('a stop slips and a limit does not', () => {
  const stop = testResting(order({ side: 'sell', type: 'stop', trigger: 99 }), BAR, DEFAULT_FILL);
  const limit = testResting(order({ side: 'sell', limit: 101 }), BAR, DEFAULT_FILL);
  assert.equal(stop.filled && stop.slips, true);
  assert.equal(limit.filled && limit.slips, false);
});

/**
 * A stop limit is both, in one order: the trigger first, then the limit.
 *
 * Catches an implementation that treats a stop limit as a stop, which fills it
 * at the trigger whatever the limit said, and one that treats it as a limit,
 * which fills it before the trigger was ever reached. The second half is the
 * whole point of the shape: the order that triggered and did not fill is still
 * live, and it is a limit from that moment on.
 */
test('a stop limit triggers first and fills only through its limit', () => {
  const both = order({ side: 'buy', type: 'stopLimit', trigger: 101, limit: 99 });
  const outcome = testResting(both, BAR, DEFAULT_FILL);
  assert.equal(outcome.filled, true);
  if (outcome.filled) assert.equal(outcome.price, 99);

  const narrow: RecordedBar = { ...BAR, open: 101, high: 103, low: 100.5, close: 102 };
  const waiting = testResting(both, narrow, DEFAULT_FILL);
  assert.equal(waiting.filled, false);
  if (waiting.filled) return;
  assert.equal(waiting.triggered, true);
});

/**
 * An incomplete bar decides nothing.
 *
 * Catches an implementation that compares against an absent price, where
 * absence reads as zero: every buy limit would fill at zero and the report
 * would be a fortune.
 */
test('a bar missing a price decides nothing', () => {
  const partial: RecordedBar = { ...BAR, low: null };
  assert.equal(testResting(order({ side: 'buy', limit: 99 }), partial, DEFAULT_FILL).filled, false);
  const noClose: RecordedBar = { ...BAR, close: null };
  assert.equal(testResting(order({ side: 'buy', limit: 99 }), noClose, DEFAULT_FILL).filled, false);
});
