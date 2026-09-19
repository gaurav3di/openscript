/**
 * The benchmark's own tests.
 *
 * A performance gate has a failure mode ordinary code does not: when it breaks,
 * it goes green. A workload that stops on its third bar is fast. A measurement
 * added without a budget passes unconditionally. A budget raised to make a red
 * build go away looks exactly like a budget that was always that size. None of
 * those announce themselves, and all three end the same way, with a suite that
 * reports a number nobody can act on.
 *
 * So the gate's logic is separated from its timings and tested here, where
 * nothing is timed and nothing can be flaky. Every test below names the wrong
 * implementation it exists to catch.
 *
 * The one thing that is not asserted anywhere here is a duration. A test that
 * says an operation took under so many milliseconds fails on a busy machine and
 * teaches people to rerun the suite until it passes, which costs more than the
 * regression it was watching for. Durations are the gate's business, in
 * `scripts/bench.mjs`, where a breach is confirmed a second time before it
 * fails anything.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BUDGETS,
  HEADROOM,
  MEASUREMENTS,
  bars,
  breachLine,
  budgetFor,
  median,
  moved,
  perIteration,
  quote,
  sample,
  spread,
  suggestBudget,
  verdictFor,
} from './index.js';
import type { Budget, Measurement, Reading, Run } from './index.js';

// ---------------------------------------------------------------------------
// Taking a number
// ---------------------------------------------------------------------------

test('the median is the middle value and not the mean', () => {
  // Catches a harness that averages. One repetition landing inside somebody
  // else's disk flush would then move the reported number by the whole of it,
  // which is the entire reason a median is used on a shared runner.
  assert.equal(median([1, 2, 100]), 2);
  assert.equal(median([100, 1, 2]), 2, 'and the input is not assumed to be sorted');
  assert.equal(median([5]), 5);
});

test('an even count takes the midpoint of the middle pair', () => {
  // Catches `sorted[length / 2]` on an even count, which silently reports the
  // slower of the two middle repetitions.
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test('a median of nothing is an error, not a number', () => {
  // Catches a harness that reports zero for a measurement that produced no
  // repetitions, which would read as an improvement of everything.
  assert.throws(() => median([]));
});

test('a batch is divided out and a microsecond figure is scaled', () => {
  // Catches the arithmetic no clock can check. Dropping the division reports a
  // whole batch as one iteration, and dropping the thousand compares a budget
  // in microseconds against a number in milliseconds. Both are large, quiet and
  // entirely plausible on the page.
  assert.equal(perIteration(10, 4, 'ms'), 2.5);
  assert.equal(perIteration(10, 4, 'us'), 2500);
  assert.equal(perIteration(10, 1, 'ms'), 10);
});

/** A measurement over a closure the test controls, so nothing real is run. */
function fake(prepare: () => Run, over: Partial<Measurement> = {}): Measurement {
  return {
    name: 'fake',
    what: 'a closure the test wrote',
    unit: 'ms',
    warmups: 0,
    reps: 1,
    batch: 1,
    prepare,
    ...over,
  };
}

/** A run that does as much work as it says it does. */
function honest(did: number, atLeast = did): Run {
  return { once: () => did, proof: 'calls', atLeast };
}

test('warm-up repetitions are run and then thrown away', () => {
  // Catches a harness that keeps every repetition. The first run of anything is
  // the slowest, by five times for a compile here, so keeping it would put the
  // runtime's warm-up into the median and hide a real change underneath it.
  let prepared = 0;
  const reading = sample(
    fake(
      () => {
        prepared += 1;
        return honest(1);
      },
      { warmups: 2, reps: 3 },
    ),
  );
  assert.equal(prepared, 5, 'two warm-ups and three kept repetitions were all run');
  assert.equal(reading.values.length, 3, 'and only the kept ones are in the reading');
});

test('a workload that did less than it promised is an error, not a fast number', () => {
  // The most dangerous output this harness could produce. A script that stops
  // on its third bar finishes in no time, and a benchmark without this check
  // reports the failure as the largest improvement anyone has ever seen.
  const measurement = fake(() => ({ once: () => 3, proof: 'bars executed', atLeast: 50_000 }));
  assert.throws(
    () => sample(measurement),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes('bars executed') &&
      error.message.includes('50000'),
  );
});

test('a reading carries what the last kept repetition actually did', () => {
  // Catches a harness that reports the proof without collecting it, which would
  // leave the report saying nothing about whether the work happened.
  const reading = sample(fake(() => ({ once: () => 42, proof: 'widgets', atLeast: 1 })));
  assert.equal(reading.work, 42);
  assert.equal(reading.proof, 'widgets');
});

test('the spread of a reading is the gap between its fastest and slowest', () => {
  // Catches a spread computed against the median, which would understate how
  // noisy a runner was being and remove the one signal that says so.
  const reading: Reading = {
    name: 'fake',
    unit: 'ms',
    values: [2, 2.5, 3],
    median: 2.5,
    low: 2,
    high: 3,
    work: 1,
    proof: 'calls',
  };
  assert.equal(spread(reading), 0.5);
});

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

test('every measurement has a budget and every budget has a measurement', () => {
  // Catches the way a gate quietly stops being one: a measurement added to the
  // table with no budget beside it is timed, printed and never able to fail.
  const measured = MEASUREMENTS.map((one) => one.name).sort();
  const budgeted = BUDGETS.map((one) => one.name).sort();
  assert.deepEqual(measured, budgeted);
  assert.equal(new Set(measured).size, measured.length, 'and no name is used twice');
});

test('a budget is quoted in the unit its measurement reports', () => {
  // Catches a budget in milliseconds sitting against a measurement in
  // microseconds. The gate would then be a thousand times too loose and would
  // still print a tidy table.
  for (const measurement of MEASUREMENTS) {
    assert.equal(budgetFor(measurement.name)?.unit, measurement.unit, measurement.name);
  }
});

test('every budget is its recorded median times the headroom, rounded up', () => {
  // Catches the fix that is always available on a red build: raise the budget
  // and say nothing. Doing that here fails this test, because the budget and
  // the recorded baseline have to move together, and the baseline is the number
  // that says how much was accepted.
  for (const budget of BUDGETS) {
    assert.equal(budget.budget, suggestBudget(budget.recorded), budget.name);
    assert.ok(budget.budget >= budget.recorded * HEADROOM, `${budget.name} keeps its headroom`);
  }
});

test('a suggested budget always clears the headroom it claims', () => {
  // Catches rounding to the nearest step instead of up. A budget rounded down
  // is tighter than the stated headroom, which fails green builds on a slower
  // machine and gets the whole check deleted.
  for (const recorded of [0.001, 0.12, 0.32, 1, 3.3, 25, 99, 185, 1200, 47_000]) {
    assert.ok(
      suggestBudget(recorded) >= recorded * HEADROOM,
      `${recorded} earns ${suggestBudget(recorded)}`,
    );
  }
});

test('a budget cannot be derived from a median of nothing', () => {
  // Catches a recorded baseline left at zero, which would suggest a budget of
  // zero and fail every build, or be silently skipped and gate nothing.
  assert.throws(() => suggestBudget(0));
});

test('a measurement is over only above its budget, not at it', () => {
  // Catches `>=`. A measurement landing exactly on its budget is inside it, and
  // an off-by-one here fails a build for a number the table calls acceptable.
  const budget = BUDGETS[0] as Budget;
  assert.equal(verdictFor(budget.name, budget.budget).over, false);
  assert.equal(verdictFor(budget.name, budget.budget * 0.999).over, false);
  assert.equal(verdictFor(budget.name, budget.budget * 1.001).over, true);
});

test('a verdict says how far over the budget and how far over the baseline', () => {
  // Two different questions, and a failed build needs both: the first decides
  // whether it fails, the second says whether the code changed or the machine
  // did. Catches a report that carries only one of them.
  const budget = BUDGETS[0] as Budget;
  const verdict = verdictFor(budget.name, budget.budget * 2);
  assert.equal(verdict.used, 2);
  assert.equal(verdict.against, (budget.budget * 2) / budget.recorded);
});

test('asking about a measurement with no budget is an error', () => {
  // Catches the silent pass. Returning a benign verdict for an unknown name
  // would let a renamed measurement sail through the gate untested.
  assert.throws(() => verdictFor('no-such-measurement', 1));
});

test('a breach names the measurement, the numbers and what was being protected', () => {
  // The requirement on the failure message. Somebody reading a red build has to
  // know which measurement moved and by how much without opening a file.
  // Catches a message that says only that a benchmark failed.
  const budget = BUDGETS[0] as Budget;
  const line = breachLine(verdictFor(budget.name, budget.budget * 1.5));
  assert.ok(line.includes(budget.name), 'the measurement');
  assert.ok(line.includes(quote(budget.budget * 1.5, budget.unit)), 'what it measured');
  assert.ok(line.includes(quote(budget.budget, budget.unit)), 'what it was allowed');
  assert.ok(line.includes('50 percent over'), 'by how much');
  assert.ok(line.includes(budget.why.slice(0, 30)), 'and what the budget was for');
});

// ---------------------------------------------------------------------------
// The data the workloads run over
// ---------------------------------------------------------------------------

test('the bars are the same on every run', () => {
  // Catches a generator reaching for a clock or a random source. A benchmark
  // compares today's number against one recorded weeks ago, and input that
  // moves makes every such comparison meaningless.
  assert.deepEqual(bars(32), bars(32));
  assert.deepEqual(bars(64).slice(0, 32), bars(32), 'and a longer run starts the same way');
});

test('a bar encloses its own open and close', () => {
  // Catches a high or low on the wrong side of the body. A study that hunts for
  // turning points would still run, so the benchmark would still produce a
  // number, and the heavy workload would quietly stop being heavy.
  for (const bar of bars(500)) {
    const open = bar.open as number;
    const close = bar.close as number;
    assert.ok((bar.high as number) >= Math.max(open, close));
    assert.ok((bar.low as number) <= Math.min(open, close));
    assert.ok(Number.isFinite(close));
  }
});

test('bar times go forwards and never repeat', () => {
  // Catches a fixed or reversed timestamp, which a study anchoring a drawing to
  // a bar time would turn into work that is not the work being measured.
  const made = bars(200);
  for (let i = 1; i < made.length; i += 1) {
    assert.ok((made[i]?.time as number) > (made[i - 1]?.time as number));
  }
});

test('a moving bar actually moves', () => {
  // Catches an update fed the identical bar every time, which would let an
  // engine that skipped unchanged input look fast at the one operation this
  // benchmark exists to time.
  const bar = bars(4)[3];
  assert.ok(bar !== undefined);
  assert.notEqual(moved(bar, 1).close, moved(bar, 2).close);
  assert.equal(moved(bar, 1).time, bar.time, 'and it is still the same bar');
});

// ---------------------------------------------------------------------------
// One real measurement, with the repetitions turned down
// ---------------------------------------------------------------------------

test('a real measurement produces a number and proves it did the work', () => {
  // Catches the benchmark being broken in a way the gate would report as a
  // triumph: a workload whose script no longer compiles, an examples directory
  // that moved, a closure that returns before doing anything. Run at one
  // repetition of one iteration, and asserting nothing about the duration, so
  // this stays a test of the harness rather than of the machine it is on.
  const compileLight = MEASUREMENTS.find((one) => one.name === 'compile-light');
  assert.ok(compileLight !== undefined);
  const reading = sample(compileLight, { warmups: 0, reps: 1 });
  assert.equal(reading.values.length, 1);
  assert.ok(Number.isFinite(reading.median) && reading.median > 0);
  assert.equal(
    reading.work,
    compileLight.batch,
    'every compile in the batch emitted a program with instructions in it',
  );
});
