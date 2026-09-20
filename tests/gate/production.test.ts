/**
 * The production bar: the part of this phase's gate that is not about numbers.
 *
 * A correct study is half of what a platform is buying. The other half is that
 * a platform which did not write the script can run it next to a hundred others
 * and keep serving everybody when one of them is wrong. Three promises, and
 * each is a counter or a comparison here rather than an intention stated in a
 * document:
 *
 * - **A runaway script stops**, on the bar it runs away on, with a code and a
 *   line rather than a hung process.
 * - **One script failing takes nothing else down.** The others keep producing
 *   the same numbers they produce alone, and the host is handed nothing it did
 *   not ask for.
 * - **The same program on the same bars gives the same answer**, across two
 *   loads, across the bar-at-a-time path and the whole-dataset path, and across
 *   a newest bar that moved before it settled.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { load } from '../../src/core/engine/index.js';
import type { EngineHost, HostBar, Value as MachineValue } from '../../src/core/engine/index.js';
import type { Series } from '../../src/core/stdlib/index.js';
import { engineHostFor, pageHost } from '../hosts/index.js';

import {
  GATE_BARS,
  compileGate,
  gateSource,
  loadGate,
  plot,
  plotsOf,
} from './support.js';

/** The five studies the gate computes, with the settings each is asserted at. */
const STUDIES = [
  { name: 'ema', title: 'Mean', settings: { len: 20 } },
  { name: 'rsi', title: 'Strength', settings: { len: 14 } },
  { name: 'macd', title: 'Convergence', settings: { fastLen: 12, slowLen: 26, signalLen: 9 } },
  { name: 'bollinger', title: 'Basis', settings: { len: 20, mult: 2 } },
  { name: 'supertrend', title: 'Band', settings: { factor: 3, atrLen: 10 } },
] as const;

/**
 * The line of the runaway script's loop, and the budget it declares, read out
 * of the script rather than written here.
 *
 * A copy would go stale the first time somebody added a line to that file, and
 * a stale expectation in a test about line numbers fails in a way that reads
 * like a defect in the engine.
 */
function runawayLoopLine(): number {
  const lines = gateSource('runaway').split('\n');
  const at = lines.findIndex((line) => line.trimStart().startsWith('while '));
  assert.notEqual(at, -1, 'the runaway script should contain a while loop');
  return at + 1;
}

function runawayBudget(): number {
  const found = /limits\(loops\s*=\s*(\d+)\)/.exec(gateSource('runaway'));
  assert.notEqual(found, null, 'the runaway script should declare a loop budget');
  return Number((found as RegExpExecArray)[1]);
}

/**
 * A script whose loop can never end is stopped, on the bar, with a code and the
 * line of the loop.
 *
 * Catches the engine that runs the loop and trusts the program. That engine
 * does not fail a test, it hangs the process running it, which is why this is
 * the first thing the production bar asks. The iteration the budget is spent at
 * is asserted through the budget the script itself declared, because
 * `compiled-program.md` 8.5 makes the count part of the contract: two engines
 * must stop at the same iteration of the same loop on the same bar, and an
 * engine that counted its own instructions or measured elapsed time would make
 * a script that runs on one engine fail on another.
 */
test('a loop that can never end is stopped by the budget, with a diagnostic', () => {
  const engine = loadGate('runaway');
  const result = engine.append(GATE_BARS[0] as HostBar, { isConfirmed: true }, GATE_BARS.length);

  assert.equal(result.diagnostic?.code, 'OS5001');
  assert.equal(
    result.diagnostic?.span.line,
    runawayLoopLine(),
    'the diagnostic names the loop, not the statement inside it',
  );
  assert.equal(result.diagnostic?.values['budget'], runawayBudget());
  assert.equal(engine.failed, true, 'a stopped script stays stopped');
  assert.equal(result.applied, false, 'a bar that raised applies nothing');
  assert.deepEqual(result.effects, [], 'a bar that raised sends the host nothing');
});

/**
 * The failure is returned, never raised.
 *
 * Catches an engine that throws out of `append`. In a render loop that takes
 * every other study on the chart with it, and on a server it takes the request.
 * The promise is that nothing on the engine's surface throws, so all three
 * entry points are tried, twice, after the script has already failed.
 */
test('a failing script raises nothing into the process that called it', () => {
  const engine = loadGate('runaway');
  assert.doesNotThrow(() => engine.append(GATE_BARS[0] as HostBar, { isConfirmed: true }));
  assert.doesNotThrow(() => engine.update(GATE_BARS[0] as HostBar, { isConfirmed: true }));
  assert.doesNotThrow(() => engine.run(GATE_BARS.slice(0, 3), []));
  assert.doesNotThrow(() => engine.column(0));
  assert.doesNotThrow(() => engine.drawings());
  assert.doesNotThrow(() => engine.tables());
});

/**
 * Five studies and one runaway, in one process, bar by bar.
 *
 * This is the shape a platform actually runs: several people's scripts over the
 * same bars, advancing together. The runaway fails on its first bar and every
 * bar after it, and the five studies produce, to the last decimal, the columns
 * they produce when nothing else is running.
 *
 * Catches state that lives anywhere but inside the engine it belongs to: a
 * module-level slot keyed by call site, a cached lookback shared between loads,
 * a budget counted across scripts. Every one of those passes a suite that runs
 * one script at a time and fails the first time two customers share a process,
 * which is the moment nobody is watching a test run.
 */
test('one script failing leaves the others computing exactly what they computed alone', () => {
  const alone = new Map<string, Series>();
  for (const study of STUDIES) {
    alone.set(study.name, plot(plotsOf(study.name, { ...study.settings }), study.title));
  }

  const page = pageHost({
    instrument: Object.freeze({
      symbol: 'AAA',
      exchange: 'XX',
      interval: '1',
      tickSize: 0.05,
      lotSize: 50,
      hasVolume: true,
    }),
    now: 1_748_736_000_000,
    destination: {},
  });
  const host: EngineHost = engineHostFor(page);
  const routed = page.destination?.intents ?? [];
  const before = JSON.stringify({ instrument: host.instrument });

  const together = STUDIES.map((study) => ({
    study,
    engine: loadGate(study.name, { ...study.settings }, { host }),
  }));
  const runaway = loadGate('runaway', {}, { host });

  for (let bar = 0; bar < GATE_BARS.length; bar += 1) {
    const state = { isConfirmed: true };
    const failed = runaway.append(GATE_BARS[bar] as HostBar, state, GATE_BARS.length);
    assert.equal(failed.diagnostic?.code, 'OS5001', `the runaway on bar ${bar}`);

    for (const one of together) {
      const result = one.engine.append(GATE_BARS[bar] as HostBar, state, GATE_BARS.length);
      assert.equal(result.diagnostic, undefined, `${one.study.name} on bar ${bar}`);
    }
  }

  for (const one of together) {
    const columns = new Map<string, Series>();
    for (const drawn of one.engine.program.outputs.plots) {
      const title = typeof drawn.title === 'string' ? drawn.title : drawn.key;
      columns.set(title, one.engine.column(drawn.channel) as Series);
    }
    assert.deepEqual(
      plot(columns, one.study.title),
      alone.get(one.study.name),
      `${one.study.name} computed something different with a failing script beside it`,
    );
  }

  assert.deepEqual(routed, [], 'a run of studies sends the host nothing');
  assert.equal(
    JSON.stringify({ instrument: host.instrument }),
    before,
    'the host is handed back as it was given',
  );
});

/**
 * Two engines, one program, the same bars, the same numbers.
 *
 * The program is encoded once and decoded twice, which is what a host does when
 * it puts the same study on two charts. Catches anything the first load leaves
 * behind for the second: a mutated instruction list, a pooled constant written
 * through, a state region that outlived its engine.
 */
test('the same program run twice produces identical columns, absence included', () => {
  for (const study of STUDIES) {
    const compiled = compileGate(study.name);
    const wire = JSON.stringify(compiled.program);

    const columns = [0, 1].map(() => {
      const loaded = load(JSON.parse(wire) as unknown, {
        source: compiled.file,
        settings: { ...study.settings },
      });
      assert.equal(loaded.ok, true, `${study.name} was refused at load`);
      const result = loaded.engine.run(
        GATE_BARS,
        GATE_BARS.map(() => ({ isConfirmed: true })),
      );
      assert.equal(result.diagnostic, undefined, `${study.name} stopped`);
      return loaded.engine.program.outputs.plots.map(
        (drawn) => loaded.engine.column(drawn.channel) as readonly MachineValue[],
      );
    });

    assert.deepEqual(columns[0], columns[1], `${study.name} differed between two runs`);
  }
});

/**
 * The compiler is deterministic too, so "the same program" is a thing that
 * exists.
 *
 * Catches an emitter that ordered anything by iteration over a map keyed on
 * something that varies: the two programs would differ, the engines would both
 * be right, and the promise that a compiled program can be cached and shipped
 * would be quietly false.
 */
test('compiling the same source twice produces the same program', () => {
  for (const study of STUDIES) {
    assert.equal(
      JSON.stringify(compileGate(study.name).program),
      JSON.stringify(compileGate(study.name).program),
      `${study.name} compiled to two different programs`,
    );
  }
});

/**
 * A newest bar that moved before it settled lands where a confirmed bar lands.
 *
 * This is the promise underneath "a live chart and a backtest of the same data
 * agree". The last bar is published while it is still moving, rewritten twice
 * at prices that never became the close, and then settled at the real one. The
 * column that results has to be the column a straight run produced.
 *
 * Catches an engine that re-executes a moving bar without restoring the
 * checkpoint at the start of it. The trailing band is the study that gives that
 * away: its rails carry forward, so an unrestored rewrite ratchets the rail
 * against a price that never existed and the line stays wrong for the rest of
 * the session, long after the bar that caused it has scrolled away.
 */
test('a bar that moved before it settled leaves the same column as one that did not', () => {
  for (const study of STUDIES) {
    const settled = plot(plotsOf(study.name, { ...study.settings }), study.title);

    const engine = loadGate(study.name, { ...study.settings });
    const last = GATE_BARS.length - 1;
    for (let bar = 0; bar < last; bar += 1) {
      engine.append(GATE_BARS[bar] as HostBar, { isConfirmed: true }, GATE_BARS.length);
    }

    const real = GATE_BARS[last] as HostBar;
    const moving = { isConfirmed: false, isRealtime: true };
    engine.append({ ...real, close: (real.close as number) + 5 }, moving, GATE_BARS.length);
    engine.update({ ...real, close: (real.close as number) - 7 }, moving);
    engine.update({ ...real, high: (real.high as number) + 9 }, moving);
    const final = engine.update(real, { isConfirmed: true });

    assert.equal(final.diagnostic, undefined, `${study.name} stopped on the moving bar`);

    const drawn = engine.program.outputs.plots.find(
      (one) => one.title === study.title,
    );
    assert.notEqual(drawn, undefined, `${study.name} has no plot titled ${study.title}`);
    assert.deepEqual(
      engine.column((drawn as { channel: number }).channel) as Series,
      settled,
      `${study.name} ended somewhere else after the newest bar moved`,
    );
  }
});
