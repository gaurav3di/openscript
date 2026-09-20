/**
 * A host built from the page, and a study run through it.
 *
 * Every other suite in this repository drives the engine with a host this
 * repository wrote, so the one thing the conformance claim rests on is the one
 * thing nothing exercised: that a platform can implement
 * `spec/host-interface.md` and run a study. The gap is not theoretical. The
 * engine asked a host for two per-bar session facts that no section of that
 * document offers, every fixture in the tree supplied them, and `vwap()`, the
 * commonest intraday study there is, drew nothing at all on a host built from
 * the page, with nothing reported at compile, at load or at run.
 *
 * So the host below is **constructed strictly from what the document prints and
 * from nothing else**:
 *
 * - the instrument record is section 4.1's twelve facts, with the session of
 *   4.3 and the value spellings 4.1 fixes;
 * - a bar is section 3.1's seven fields, oldest first, strictly increasing in
 *   `time`, with a volume stated because the instrument has one;
 * - the bar state is the four facts `language.md` 7.2 gives the host, in the
 *   two shapes section 6.4 works out: a history load, and a bar as it forms;
 * - the duties this study does not need are not implemented, which is what
 *   section 2 says an optional duty means.
 *
 * Nothing here reaches for a field this engine happens to accept. That is the
 * whole value of the file: a fact the document does not print cannot be typed
 * into it, so an engine that has come to depend on one fails here rather than
 * in somebody else's product.
 *
 * The reference values are computed in this file from the window the record
 * states, never read back off the engine, so a boundary placed one bar out
 * fails on the number rather than agreeing with itself.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { load } from '../../src/core/engine/index.js';
import type { Engine, Value } from '../../src/core/engine/index.js';

import { PAGE_INSTRUMENT } from './page-host.js';
import type { PageBar, PageState } from './page-host.js';
import { asWire, compile } from './support.js';

/**
 * The instrument record, section 4.1, and the bar and state shapes of 3.1 and
 * 6.4, are `page-host.ts`: the page typed out, shared with the suite that tests
 * the hand-over of duty 3, so the two cannot come to disagree about what the
 * document prints.
 */
const INSTRUMENT = PAGE_INSTRUMENT;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Midnight UTC on a Sunday, so the first day of the fixture is a closed one. */
const SUNDAY = 1_748_736_000_000;

/** The hours a sixty minute bar opens on inside a nine to half five session. */
const OPENS = [9, 10, 11, 12, 13, 14, 15, 16, 17];

/**
 * Four days of bars: a Sunday the record closes, then Monday to Wednesday.
 *
 * The Sunday is the point of the day list. Its bars fall inside the hours and
 * outside the session, so an engine reading the hours and ignoring the days
 * anchors a session on a day the instrument does not trade, and every number
 * after it is wrong by one session.
 */
const BARS: readonly PageBar[] = buildBars();

function buildBars(): readonly PageBar[] {
  const out: PageBar[] = [];
  for (let day = 0; day < 4; day += 1) {
    for (const hour of OPENS) {
      const step = out.length;
      const open = 100 + step * 0.25;
      out.push({
        time: SUNDAY + day * DAY + hour * HOUR,
        open,
        high: open + 0.75,
        low: open - 0.5,
        close: open + 0.25,
        volume: 1000 + step * 100,
        oi: 5000,
      });
    }
  }
  return out;
}

/** A history load, section 6.4's first worked case: every bar, once, confirmed. */
const STATES: readonly PageState[] = BARS.map(() => ({
  isNew: true,
  isConfirmed: true,
  isRealtime: false,
  updates: 1,
}));

const SCRIPT = `version 1

study("Documented host", overlay = true, precision = 4)

plot(vwap(), "Traded average", aqua, width = 2)
plot(session.isFirstBar ? 1 : 0, "Session opens", lime)
plot(session.isLastBar ? 1 : 0, "Session closes", red)
plot(bar.updates, "Updates", silver)
plot(bar.isNew ? 1 : 0, "Appended", silver)
`;

/**
 * The host's own wiring, which is the one thing the document does not fix.
 *
 * Section 1 says the shapes are a set of named facts and not a transport, so a
 * host hands the same facts over however its engine takes them. This is that
 * hand-over and nothing more: every fact above crosses it unchanged, and
 * nothing that is not above crosses it at all.
 */
function runThroughHost(): { engine: Engine; columns: Map<string, readonly Value[]> } {
  const compiled = compile('documented-host.oscript', SCRIPT);
  assert.deepEqual(
    compiled.diagnostics.map((one) => one.code),
    [],
    'the study should compile with nothing reported',
  );

  const loaded = load(asWire(compiled.program), {
    source: compiled.file,
    host: { instrument: INSTRUMENT, now: SUNDAY + 4 * DAY },
  });
  assert.equal(loaded.ok, true, 'a host built from the page should load a study');
  if (!loaded.ok) throw new Error('unreachable');
  const engine = loaded.engine;

  for (let bar = 0; bar < BARS.length; bar += 1) {
    const state = STATES[bar] as PageState;
    const result = engine.append(BARS[bar] as PageBar, {
      isConfirmed: state.isConfirmed,
      isRealtime: state.isRealtime,
    });
    assert.equal(result.diagnostic, undefined, `bar ${bar} reported ${result.diagnostic?.code}`);
  }

  return { engine, columns: columnsOf(engine) };
}

function columnsOf(engine: Engine): Map<string, readonly Value[]> {
  const out = new Map<string, readonly Value[]>();
  for (const plot of engine.program.outputs.plots) {
    const title = typeof plot.title === 'string' ? plot.title : plot.key;
    out.set(title, engine.column(plot.channel));
  }
  return out;
}

function column(columns: Map<string, readonly Value[]>, title: string): readonly Value[] {
  const found = columns.get(title);
  assert.notEqual(found, undefined, `no plot titled ${title}`);
  return found as readonly Value[];
}

/**
 * Which session each bar belongs to, worked out here from the stated window.
 *
 * Bar zero of each trading day opens a session and the last of the nine closes
 * it, and the Sunday belongs to none, which is what the record's day list says.
 */
function sessionOf(bar: number): number | null {
  const day = Math.floor(bar / OPENS.length);
  return day === 0 ? null : day;
}

/** `vwap()` as section 7 defines it, from the session's first bar. */
function tradedAverage(): readonly (number | null)[] {
  const out: (number | null)[] = [];
  let flow = 0;
  let traded = 0;
  let current: number | null = null;
  for (let bar = 0; bar < BARS.length; bar += 1) {
    const one = BARS[bar] as PageBar;
    const session = sessionOf(bar);
    if (session === null) {
      out.push(null);
      continue;
    }
    if (session !== current) {
      flow = 0;
      traded = 0;
      current = session;
    }
    // The order of operations is the contract's: high plus low, close added to
    // that, then divided.
    const price = (one.high + one.low + one.close) / 3;
    flow = flow + price * one.volume;
    traded = traded + one.volume;
    out.push(flow / traded);
  }
  return out;
}

test('a study drawn on a host built from the page produces values', () => {
  const { columns } = runThroughHost();
  const traded = column(columns, 'Traded average');
  const expected = tradedAverage();

  assert.equal(traded.length, BARS.length, 'every bar should carry a column entry');
  const drawn = traded.filter((cell) => cell !== null).length;
  assert.equal(
    drawn,
    BARS.length - OPENS.length,
    'vwap should draw on every bar the instrument traded',
  );
  for (let bar = 0; bar < BARS.length; bar += 1) {
    assert.equal(
      traded[bar],
      expected[bar],
      `traded average: bar ${bar} is ${String(traded[bar])}, expected ${String(expected[bar])}`,
    );
  }
});

test('the session boundaries are the ones the stated window schedules', () => {
  const { columns } = runThroughHost();
  const opens = column(columns, 'Session opens');
  const closes = column(columns, 'Session closes');

  const opened: number[] = [];
  const closed: number[] = [];
  for (let bar = 0; bar < BARS.length; bar += 1) {
    if (opens[bar] === 1) opened.push(bar);
    if (closes[bar] === 1) closed.push(bar);
  }

  // Three trading days after the Sunday, each nine bars long: the session opens
  // on the first of the nine and closes on the last, because the bar that opens
  // at five reaches the scheduled close at half past.
  assert.deepEqual(opened, [9, 18, 27], 'a session opens on the first bar of each trading day');
  assert.deepEqual(closed, [17, 26, 35], 'and closes on the last bar of the schedule');
});

test('a day the record closes opens no session', () => {
  const { columns } = runThroughHost();
  const opens = column(columns, 'Session opens');
  const closes = column(columns, 'Session closes');
  for (let bar = 0; bar < OPENS.length; bar += 1) {
    assert.equal(opens[bar], 0, `bar ${bar} falls on a closed day and opens no session`);
    assert.equal(closes[bar], 0, `bar ${bar} falls on a closed day and closes none`);
  }
  // And the day after it does, which is what makes the two lines above a test
  // of the day list rather than of an engine that answers nothing at all.
  assert.equal(opens[OPENS.length], 1, 'the first trading day after it opens one');
  assert.equal(closes[OPENS.length * 2 - 1], 1, 'and closes it on its last scheduled bar');
});

test('the four facts the page gives the host are the four the engine reports', () => {
  const { engine, columns } = runThroughHost();
  const updates = column(columns, 'Updates');
  const appended = column(columns, 'Appended');

  for (let bar = 0; bar < BARS.length; bar += 1) {
    const state = STATES[bar] as PageState;
    assert.equal(updates[bar], state.updates, `bar ${bar}: the update count the host stated`);
    assert.equal(appended[bar], state.isNew ? 1 : 0, `bar ${bar}: the host appended this bar`);
  }

  // Section 6.4's second worked case: the newest bar handed back as it forms,
  // which is the same bar with a higher count and no longer newly appended.
  const last = BARS.length - 1;
  const moving: PageState = { isNew: false, isConfirmed: false, isRealtime: true, updates: 2 };
  const result = engine.update(BARS[last] as PageBar, {
    isConfirmed: moving.isConfirmed,
    isRealtime: moving.isRealtime,
  });
  assert.equal(result.diagnostic, undefined, 'the moving bar reported nothing');

  const after = columnsOf(engine);
  assert.equal(column(after, 'Updates')[last], moving.updates, 'the count the host stated');
  assert.equal(column(after, 'Appended')[last], moving.isNew ? 1 : 0, 'no longer newly appended');
  assert.equal(
    column(after, 'Traded average')[last],
    tradedAverage()[last],
    're-executing the newest bar gives the number executing it once gave',
  );
});
