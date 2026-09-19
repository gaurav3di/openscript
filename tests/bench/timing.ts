/**
 * How a number is taken, which matters more than what is timed.
 *
 * A continuous integration runner is a shared machine. It is descheduled by
 * whatever else is on the box, its clock speed moves, and its first run of any
 * code is its slowest because nothing has been optimised yet. Three things here
 * answer that, and each of them exists because the alternative was tried:
 *
 * - **Warm-up repetitions are thrown away.** The first compile measured here was
 *   five times the cost of the ninth. Timing the first run measures the runtime
 *   warming up, not the code.
 * - **The median, never the mean.** One repetition that lands inside somebody
 *   else's disk flush moves a mean by however long that flush took. It moves a
 *   median by nothing, which is the whole reason to use one.
 * - **A batch, when one iteration is short.** A single live update is a few
 *   microseconds. Timing one of those measures the clock. Timing two thousand
 *   and dividing measures the update.
 *
 * And one refusal: a repetition reports how much work it did, and a sample that
 * did less than the measurement declared is an error rather than a fast number.
 * A benchmark of a script that stopped on its third bar is the most dangerous
 * output this file could produce, because it is a large improvement.
 */

/** The unit a measurement's number is quoted in. */
export type Unit = 'ms' | 'us';

/** One batch of work, built by a measurement's `prepare`. */
export interface Run {
  /**
   * Runs one batch and returns what it did: bars executed, updates applied,
   * scripts compiled. Anything less than `atLeast` means the workload
   * degenerated and the timing is worthless.
   */
  readonly once: () => number;
  /** What the count is, for the message when it comes up short. */
  readonly proof: string;
  readonly atLeast: number;
}

export interface Measurement {
  readonly name: string;
  /** One line for the report: what a single iteration is. */
  readonly what: string;
  readonly unit: Unit;
  /** Repetitions run and discarded before any are kept. */
  readonly warmups: number;
  /** Repetitions kept, and taken the median of. An odd count has a middle. */
  readonly reps: number;
  /** Iterations inside one repetition, so a short one is timed above the clock. */
  readonly batch: number;
  /**
   * Everything that is not being timed: compiling, loading, filling history.
   * Called once per repetition, and its cost is not counted.
   */
  readonly prepare: () => Run;
}

/** What one measurement produced. */
export interface Reading {
  readonly name: string;
  readonly unit: Unit;
  /** One kept repetition each, per iteration, in the measurement's unit. */
  readonly values: readonly number[];
  readonly median: number;
  readonly low: number;
  readonly high: number;
  /** What the last repetition did, so the report can show the work was real. */
  readonly work: number;
  readonly proof: string;
}

/**
 * Fewer repetitions than the measurement asks for, which a test uses to run a
 * real workload once without waiting for the gate's full sample.
 *
 * There is deliberately no override for the batch. The batch is baked into the
 * closure `prepare` returns, so changing only the divisor here would report a
 * number that is wrong by exactly that factor while looking entirely ordinary.
 */
export interface Rounds {
  readonly warmups?: number;
  readonly reps?: number;
}

/**
 * The middle value, or the midpoint of the two middle ones.
 *
 * Averaging the middle pair rather than picking one of them keeps the function
 * honest for an even count. Every measurement here asks for an odd number of
 * repetitions anyway, so the middle is a value that was actually observed.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('a median of no values is not a number');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * The elapsed milliseconds of one batch, as one iteration in the wanted unit.
 *
 * Exported because it is the one piece of arithmetic here that a clock cannot
 * be used to check. Forgetting the division, or the thousand, moves a number by
 * three orders of magnitude and a budget would then be comparing two different
 * quantities while looking entirely reasonable.
 */
export function perIteration(elapsedMs: number, batch: number, unit: Unit): number {
  const each = elapsedMs / batch;
  return unit === 'us' ? each * 1000 : each;
}

/**
 * Runs a measurement and returns its reading.
 *
 * `prepare` is called again for every repetition, warm-up included, because a
 * full compute over a long history leaves an engine that has already consumed
 * its dataset. Its cost sits outside the timed region, so a measurement of the
 * engine is not partly a measurement of the compiler.
 */
export function sample(measurement: Measurement, rounds: Rounds = {}): Reading {
  const warmups = rounds.warmups ?? measurement.warmups;
  const reps = rounds.reps ?? measurement.reps;
  const batch = measurement.batch;
  if (reps < 1) throw new Error(`${measurement.name}: a reading needs at least one repetition`);

  const values: number[] = [];
  let work = 0;
  let proof = '';
  for (let i = 0; i < warmups + reps; i += 1) {
    const run = measurement.prepare();
    const started = performance.now();
    const did = run.once();
    const elapsed = performance.now() - started;
    if (did < run.atLeast) {
      throw new Error(
        `${measurement.name} did not do the work it was timing: ` +
          `${run.proof} came to ${did}, and the measurement needs at least ${run.atLeast}. ` +
          'A number taken from this run would report the failure as an improvement.',
      );
    }
    if (i >= warmups) {
      values.push(perIteration(elapsed, batch, measurement.unit));
      work = did;
      proof = run.proof;
    }
  }

  return {
    name: measurement.name,
    unit: measurement.unit,
    values,
    median: median(values),
    low: Math.min(...values),
    high: Math.max(...values),
    work,
    proof,
  };
}

/** How far apart the fastest and slowest kept repetitions were, as a fraction. */
export function spread(reading: Reading): number {
  return reading.low === 0 ? 0 : reading.high / reading.low - 1;
}
