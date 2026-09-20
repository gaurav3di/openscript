/**
 * A strategy run on a host built from the page, which is the test that was
 * missing.
 *
 * `documented-host.test.ts` already runs a study this way. A study needs duties
 * 1, 2 and 4, and those were the duties the page host served, so the duty a
 * strategy needs was the one nothing in the repository exercised through a host
 * a platform would build. The result was a shipped strategy that placed no
 * orders, said nothing, drew its plots as if it were working, and passed 1184
 * tests: the suite structurally could not see it.
 *
 * So everything below goes through `tests/hosts/`, which is the document typed
 * out. The host states an instrument record, hands bars over with the state 6.4
 * says to state, stores a settings map, and wires a destination that reads each
 * intent against the table of 7.1 and answers with the cumulative frames of
 * 7.2 through the intake of 7.4. Nothing else crosses, because there is nothing
 * else on that page to cross.
 *
 * **Both deliveries, because the difference between them is what the rollback
 * rule exists to make invisible.** The same dataset is loaded as history and
 * driven as a live feed, where every bar arrives unconfirmed, is executed three
 * more times while it moves, and closes. The orders have to be the same orders.
 * A strategy that placed one on a tick would place three more per bar here.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { DiagnosticBag, check, lex, parseTokens, sourceFile } from '../../src/core/index.js';
import { emit } from '../../src/core/emit/index.js';
import type { CompiledProgram } from '../../src/core/emit/index.js';
import type { Engine, OrderIntent, Value } from '../../src/core/engine/index.js';

import { FRAME_FIELDS, loadOn, pageHost, runOn } from './index.js';
import type { Delivery, PageBar, PageHost } from './index.js';

const ROOT = new URL('../../../', import.meta.url);

const TARGET = 'examples/10-strategy-ema-cross.oscript';

/** One bar an hour, which is the interval the page's own record states. */
const HOUR = 3_600_000;
const START = 1_748_736_000_000;
const COUNT = 300;

/**
 * Bars that swing, so a fast average crosses a slow one several times.
 *
 * Two waves at different periods, from a fixed formula: not market data and not
 * meant to be. What matters is that they are the same on every machine, and
 * that the crossing the strategy trades actually happens, several times, with
 * enough range for an average range to size an order from.
 */
function swinging(count: number): readonly PageBar[] {
  const out: PageBar[] = [];
  for (let i = 0; i < count; i += 1) {
    const mid = 100 + 18 * Math.sin(i / 23) + 3 * Math.sin(i / 5);
    out.push({
      time: START + i * HOUR,
      open: mid,
      high: mid + 1.4,
      low: mid - 1.3,
      close: mid + 0.6 * Math.sin(i / 3),
      volume: 1000 + (i % 29) * 13,
    });
  }
  return out;
}

const BARS = swinging(COUNT);

function compiled(): { program: unknown; source: CompiledProgram } {
  const file = sourceFile(TARGET, readFileSync(new URL(TARGET, ROOT), 'utf8'));
  const bag = new DiagnosticBag();
  const tokens = lex(file, bag);
  const script = parseTokens(file, tokens, bag);
  const checked = check(file, script, bag);
  const result = emit(file, checked, bag, {});
  assert.deepEqual(
    bag.ordered().map((one) => one.code),
    [],
    'the target strategy should compile with nothing reported',
  );
  const program = result.program as CompiledProgram;
  // Through the canonical encoding and back, because an engine in another
  // language is handed text and the round trip is what makes this a test of the
  // contract rather than of two halves of one process.
  return { program: JSON.parse(JSON.stringify(program)) as unknown, source: program };
}

/** A host serving every duty this strategy needs, and no duty it does not. */
function host(): PageHost {
  return pageHost({
    bars: BARS,
    now: START + COUNT * HOUR,
    // Duty 5. A host that wired none refuses this program at load with OS7015
    // the moment it places an order, which is the case below.
    destination: { bars: BARS },
    // Duty 6, 8.1: a value per input key. Read once, at load.
    settings: { fastLen: 9, slowLen: 21, atrLen: 14 },
  });
}

interface Run {
  readonly engine: Engine;
  readonly host: PageHost;
  readonly intents: readonly OrderIntent[];
}

function ran(delivery: Delivery): Run {
  const page = host();
  const { program } = compiled();
  const loaded = loadOn(program, page);
  assert.equal(loaded.code, undefined, `a page-built host refused the strategy: ${loaded.code}`);
  const engine = loaded.engine as Engine;
  const results = runOn(engine, page, delivery);
  for (const result of results) {
    assert.equal(result.diagnostic, undefined, `bar ${result.index}: ${result.diagnostic?.code}`);
  }
  const destination = page.destination;
  assert.notEqual(destination, undefined, 'the host wired no destination');
  assert.deepEqual(
    destination?.problems ?? [],
    [],
    'an intent did not match the table of section 7.1',
  );
  return { engine, host: page, intents: destination?.intents ?? [] };
}

/**
 * The defect itself, in one assertion.
 *
 * This strategy guards its entry with `flat = pos.size == 0`. When a position
 * came from a row the host interface says a host is never asked for, that read
 * was absent on every host built from the page, `flat` was absent rather than
 * true, the branch was never taken, and the strategy placed nothing at all with
 * nothing reported at compile, at load or at run.
 */
test('a strategy on a host built from the page alone places orders', () => {
  const run = ran('history');
  const placed = run.intents.filter((intent) => intent.kind === 'place');
  assert.equal(placed.length > 0, true, 'the strategy placed nothing at all');
  assert.equal(
    placed.every((intent) => intent.side === 'buy' || intent.side === 'sell'),
    true,
    'an order reached the destination with no side on it',
  );
  assert.equal(
    run.intents.some((intent) => intent.kind === 'bracket'),
    true,
    'the stop and target the script attaches to its entry reached nobody',
  );
});

/**
 * The fold, from the host's side: what the destination said is what the run
 * holds and what the script reads.
 *
 * The ledger is the run's own, so the only way a number gets into it is a frame
 * this host sent through the intake of 7.4. Every row below is held against the
 * last frame the destination sent about that order, which is what "cumulative"
 * means: the frame restates the whole life of the order, and the row is that
 * restatement and nothing added to it.
 */
test('the ledger restates the frames this host sent, and nothing else', () => {
  const run = ran('history');
  const destination = run.host.destination;
  const sent = destination?.sent ?? [];
  assert.equal(sent.length > 0, true, 'the destination said nothing about any order');

  const rows = run.engine.orders();
  assert.equal(rows.length > 0, true, 'the run holds no order at all');
  for (const row of rows) {
    const about = sent.filter((frame) => frame.intentId === row.intentId);
    const last = about[about.length - 1];
    assert.notEqual(last, undefined, `the run holds an order this host never spoke about`);
    assert.equal(row.status, last?.status, `order ${row.intentId}: the status`);
    assert.equal(row.filledQty, last?.filledQty, `order ${row.intentId}: the filled quantity`);
    assert.equal(row.avgFillPrice, last?.avgFillPrice, `order ${row.intentId}: the fill price`);
  }

  // A flattening order states units, because its quantity was folded from
  // filled quantities rather than stated by the script.
  const out = run.intents.filter((intent) => intent.tag === '' && intent.kind === 'place');
  assert.equal(out.length > 0, true, 'the strategy never closed a position it had opened');
  assert.equal(
    out.every((intent) => intent.qtyType === 'units'),
    true,
    'a quantity the engine folded did not say what it was counted in',
  );
});

/**
 * Nothing reaches a running execution, seen from the host's side.
 *
 * The strategy plots its entry price behind `pos.size > 0`, so the bar that
 * column first carries a number is the bar the first fill was folded on. The
 * frame reporting that fill was delivered while the entry bar was still the
 * newest one, and 7.4 says a host must not expect a script to react within the
 * bar it sent the frame in: the fold happens at the boundary, so the column is
 * absent on the entry bar and present on the one after it.
 */
test('a frame this host delivered reaches the script on the bar after it', () => {
  const run = ran('history');
  const entries = column(run.engine, 'Entry');
  const first = run.intents.find((intent) => intent.kind === 'place');
  assert.notEqual(first, undefined, 'the strategy placed nothing');
  const at = first?.bar.index ?? 0;

  for (let bar = 0; bar <= at; bar += 1) {
    assert.equal(entries[bar], null, `bar ${bar}: a position before any fill was folded`);
  }
  assert.equal(
    typeof entries[at + 1],
    'number',
    'the fill this host reported never reached the script',
  );
});

/**
 * The rollback rule, from outside the engine.
 *
 * A live feed executes the newest bar four times where a history load executes
 * it once, and the promise is that the two agree. Orders are the sharpest way
 * to ask: they apply at step 9 of a confirmed bar only, so a strategy that
 * reacted to a moving bar would send four times as many here, and one whose
 * state did not roll back would send them at different prices.
 */
test('a live feed and a history load send the same orders', () => {
  const history = ran('history');
  const feed = ran('feed');
  assert.deepEqual(
    spell(feed.intents),
    spell(history.intents),
    'the orders a live feed sent, against the orders the same bars sent as history',
  );
  assert.equal(history.intents.length > 0, true, 'neither delivery sent anything to compare');
});

/**
 * Duty 5 is optional, and an optional duty is declared at load.
 *
 * A host that wires no destination has no `orders` capability, so a strategy is
 * refused before bar 0 with OS6006 naming the tag. The alternative, discovering
 * the gap when a script places an order on bar four thousand, is a failure with
 * a drawn chart behind it.
 */
test('a host with no destination refuses the strategy at load, naming the tag', () => {
  const page = pageHost({ bars: BARS, settings: {} });
  const loaded = loadOn(compiled().program, page);
  assert.equal(loaded.code, 'OS6006');
});

/**
 * The frames, held against the table of 7.2.
 *
 * The intents are read against 7.1 on their way out, inside the destination, so
 * every run in this file already checks that direction. This checks the other:
 * what the host sends back is the shape the page prints, so a suite cannot
 * quietly answer with a field an engine happens to accept.
 */
test('every frame this host sent carries the fields section 7.2 prints', () => {
  const run = ran('history');
  const sent = run.host.destination?.sent ?? [];
  assert.equal(sent.length > 0, true, 'the destination sent no frame to read');
  for (const frame of sent) {
    assert.deepEqual(
      Object.keys(frame).sort(),
      [...FRAME_FIELDS].sort(),
      `the frame about order ${frame.intentId}, against the table of section 7.2`,
    );
    // Cumulative, from the beginning of the order's life, so a quantity never
    // falls and a price is absent only while nothing has filled.
    assert.equal(frame.filledQty >= 0, true, 'a frame reported a negative filled quantity');
    assert.equal(
      frame.filledQty === 0 ? frame.avgFillPrice === null : typeof frame.avgFillPrice === 'number',
      true,
      'a frame priced a fill that had not happened, or left a fill unpriced',
    );
  }
});

/** One plot column by the title the script gave it. */
function column(engine: Engine, title: string): readonly Value[] {
  for (const plot of engine.program.outputs.plots) {
    const named = typeof plot.title === 'string' ? plot.title : plot.key;
    if (named === title) return engine.column(plot.channel);
  }
  throw new Error(`no plot titled ${title}`);
}

/** An intent as a line of text, so a mismatch reads as an order and not a diff. */
function spell(intents: readonly OrderIntent[]): readonly string[] {
  return intents.map(
    (one) =>
      `${one.kind} ${one.side ?? 'none'} ${one.qty ?? 'none'} ${one.qtyType}` +
      ` ${one.type ?? 'none'} tag=${one.tag} bar=${one.bar.index}` +
      ` stop=${one.stop ?? 'none'} target=${one.target ?? 'none'}`,
  );
}
