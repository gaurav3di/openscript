/**
 * The benchmark, as the runner and the tests see it.
 *
 * `scripts/bench.mjs` drives everything behind this door and holds no knowledge
 * of what is measured or of what is allowed: it spawns, collects, prints and
 * sets an exit code. What a measurement is, how a number is taken and which
 * number fails the build are decided here, where they are typed and where a test
 * can reach them without timing anything.
 */
export type { Measurement, Reading, Rounds, Run, Unit } from './timing.js';
export { median, perIteration, sample, spread } from './timing.js';

export { MEASUREMENTS, measurementNamed } from './workloads.js';

export type { Budget, Verdict } from './budgets.js';
export {
  BUDGETS,
  HEADROOM,
  breachLine,
  budgetFor,
  quote,
  suggestBudget,
  verdictFor,
} from './budgets.js';

export { bars, moved, states } from './data.js';
