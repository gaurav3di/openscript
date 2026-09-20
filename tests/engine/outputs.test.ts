/**
 * The output path: what a bar publishes, what it holds back, and what fires.
 *
 * Each test names the wrong implementation it exists to catch, because a test
 * that cannot fail is documentation with a green tick on it. The two rules under
 * test here are the ones that are invisible until they are wrong in production:
 * a deferred channel that reaches a drawing surface on a bar that is still
 * moving draws a marker the bar may take back, and an alert that does not
 * distinguish history from now wakes somebody four hundred times for bars that
 * closed years ago.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { AlertFiring, BarState, HostBar } from '../../src/core/engine/index.js';
import { bars, flat, running } from './support.js';

const MARKED = `version 1

study("Marked", overlay = true)

if close > open
    signal("UP", shape = "triangleUp", at = "below")

plot(close, "Close")
`;

const WATCHED = `version 1

study("Watched", overlay = true)

if close > open
    alert("up at " + text(close, 2), id = "up", title = "Up")

plot(close, "Close")
`;

/** A rising bar, which is what every condition in this file tests for. */
function rising(close: number, time: number): HostBar {
  return { open: close - 1, high: close + 1, low: close - 2, close, time };
}

const HISTORY: BarState = { isConfirmed: true, isRealtime: false };
const MOVING: BarState = { isConfirmed: false, isRealtime: true };
const CLOSING: BarState = { isConfirmed: true, isRealtime: true };

// Catches: an engine that publishes a marker's channel on a bar that is still
// moving. Step 9 discards a deferred channel on a bar it did not decide (5.1,
// and 12.7's held marker), and a host reading the column is where that has to be
// visible: a marker drawn on a tick and taken back on the next one is the exact
// thing the deferral exists to prevent.
test('a marker is held back while the bar is moving and published when it closes', () => {
  const engine = running(MARKED);
  const marker = 1;

  const first = engine.append(rising(101, 1_000), MOVING);
  assert.equal(first.applied, false, 'an unconfirmed bar decides nothing');
  assert.equal(first.columns[marker], null, 'the marker channel reads back absent');
  assert.equal(engine.column(marker)[0], null, 'and so does the column a host draws from');

  const closed = engine.update(rising(101, 1_000), CLOSING);
  assert.equal(closed.applied, true);
  assert.equal(closed.columns[marker], 'UP', 'the same bar publishes the marker once decided');
  assert.equal(engine.column(marker)[0], 'UP');
});

// Catches: a plot column masked along with the deferred channels. Step 8
// publishes every column whatever the bar's state, so the study is drawn on the
// moving bar and only the marker waits.
test('a plot column is published on a moving bar, whatever the marker does', () => {
  const engine = running(MARKED);
  const moving = engine.append(rising(101, 1_000), MOVING);
  assert.equal(moving.columns[0], 101, 'the value is drawn while the bar moves');
  assert.equal(moving.columns[1], null, 'the marker is not');
});

/** Every alert a run raised, in the order the bars raised them. */
function raised(engine: ReturnType<typeof running>, state: BarState, prices: readonly number[]):
  readonly AlertFiring[] {
  const out: AlertFiring[] = [];
  for (let i = 0; i < prices.length; i += 1) {
    const result = engine.append(rising(prices[i] as number, 1_000 + i * 60_000), state);
    assert.equal(result.diagnostic, undefined);
    out.push(...result.alerts);
  }
  return out;
}

// Catches: the alert that fires for history. A study added to a chart that
// already holds two years of bars would raise one for every bar that ever met
// the condition, and the four hundred and first, the one that mattered, would be
// lost in them (stdlib.md 16.2). The fact that separates the two is the host's
// own isRealtime, and an engine that ignores it fails here on the first bar.
test('a history load raises nothing, however many bars met the condition', () => {
  const engine = running(WATCHED);
  assert.deepEqual(raised(engine, HISTORY, [101, 102, 103, 104]), []);
});

// Catches: an alert raised on a bar that is still moving. The condition was true
// halfway through the bar, and a price that pokes through a level for ten
// seconds and comes back has not broken it.
test('a moving bar raises nothing, and the bar it closes on raises once', () => {
  const engine = running(WATCHED);
  const moving = engine.append(rising(101, 1_000), MOVING);
  assert.deepEqual([...moving.alerts], []);

  const closed = engine.update(rising(101, 1_000), CLOSING);
  assert.equal(closed.alerts.length, 1);
  const firing = closed.alerts[0] as AlertFiring;
  assert.equal(firing.key, 'up');
  assert.equal(firing.title, 'Up');
  assert.equal(firing.message, 'up at 101.00', 'the message is the bar that fired, evaluated');
  assert.equal(firing.bar, 0);
  assert.equal(firing.time, 1_000);
});

// Catches: a frequency read as a suggestion. oncePerBar is at most one alert for
// a bar, and a file that acts on a moving bar executes the same bar many times,
// so an engine that raises one per execution wakes somebody on every tick.
test('oncePerBar raises once for a bar however often the bar is executed', () => {
  const engine = running(WATCHED.replace('study("Watched", overlay = true)',
    'study("Watched", overlay = true, onUnconfirmed = true)'));
  const first = engine.append(rising(101, 1_000), MOVING);
  assert.equal(first.alerts.length, 1, 'onUnconfirmed decides the bar, so it raises');
  assert.deepEqual([...engine.update(rising(102, 1_000), MOVING).alerts], []);
  assert.deepEqual([...engine.update(rising(103, 1_000), MOVING).alerts], []);

  const next = engine.append(rising(104, 61_000), MOVING);
  assert.equal(next.alerts.length, 1, 'the next bar is a different bar');
});

// Catches: everyUpdate downgraded to oncePerBar. A script that asked for every
// update and got one per bar is wrong in a way nobody notices until a fast move.
test('everyUpdate raises on every execution of the bar', () => {
  const engine = running(`version 1

study("Watched", overlay = true, onUnconfirmed = true)

if close > open
    alert("up", id = "up", frequency = "everyUpdate")

plot(close, "Close")
`);
  assert.equal(engine.append(rising(101, 1_000), MOVING).alerts.length, 1);
  assert.equal(engine.update(rising(102, 1_000), MOVING).alerts.length, 1);
  assert.equal(engine.update(rising(103, 1_000), MOVING).alerts.length, 1);
});

// Catches: once counted per bar rather than for the life of the study. The
// difference shows only on the second bar that meets the condition, which is
// where a session note or an anchor would fire a second time.
test('once raises for the first bar that meets the condition and no other', () => {
  const engine = running(`version 1

study("Watched", overlay = true)

if close > open
    alert("up", id = "up", frequency = "once")

plot(close, "Close")
`);
  const all = raised(engine, CLOSING, [101, 102, 103]);
  assert.equal(all.length, 1);
  assert.equal((all[0] as AlertFiring).bar, 0);
});

// Catches: an absent condition treated as a firing. An alert inside an if guarded
// by a comparison must not fire during warmup, which is three-valued logic
// reaching a surface (language.md 6.6) and the commonest reason a new alert looks
// dead.
test('an absent condition raises nothing', () => {
  const engine = running(`version 1

study("Watched")

if ema(close, 20) > close
    alert("above", id = "above")

plot(close, "Close")
`);
  const data = bars(5);
  const out: AlertFiring[] = [];
  for (const bar of data) out.push(...engine.append(bar, CLOSING).alerts);
  assert.deepEqual(out, [], 'the average is absent for all five, so the guard is absent');
});

// Catches: a grid that grows with the history. The cell buffer is emptied at
// step 3 of every execution, so what a host reads is the last executed bar's
// grid and nothing else; an engine that accumulated would return five times as
// many cells after five bars and cost the length of the history to draw one row.
test('a grid holds the last executed bar, whatever the history behind it', () => {
  const engine = running(`version 1

study("Panel")

t = table("Panel", 1, 1)
cell(t, 0, 0, text(close, 2))

plot(close, "Close")
`);
  for (let i = 0; i < 20; i += 1) engine.append(flat(100 + i, 1_000 + i * 60_000), CLOSING);
  const grids = engine.tables();
  assert.equal(grids.length, 1);
  assert.equal((grids[0]?.cells ?? []).length, 1, 'one cell after twenty bars, not twenty');
  assert.equal(grids[0]?.cells[0]?.text, '119.00', 'and it is the last bar that wrote it');
});
