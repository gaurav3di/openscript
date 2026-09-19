/**
 * The budgets, and the reasoning that set them.
 *
 * A benchmark that only reports is a benchmark nobody fails, and a benchmark
 * nobody fails is a benchmark nobody reads. These numbers fail the build, which
 * is the only reason they are worth recording.
 *
 * ## How a budget is chosen
 *
 * Every budget is `recorded` multiplied by HEADROOM and rounded up to something
 * a person can hold in their head. `recorded` is the median this measurement
 * produced on the machine the budgets were set on, which is stated in the
 * comment on that constant, so a failure can be read two ways: against the
 * budget, which decides the build, and against `recorded`, which says whether
 * the code changed or the machine did.
 *
 * HEADROOM is three. Not a rounder two, and not a safer ten:
 *
 * - A shared continuous integration runner is slower than a developer's machine
 *   for single threaded work. Twice is the usual figure and it is worse while
 *   the box is busy. Two would leave nothing for that and the gate would fail on
 *   green code, which is how a check gets deleted.
 * - Above three, an honest regression hides. Doubling the cost of a bar is a
 *   serious regression, and a budget at ten times would let four of them land
 *   one after another before anyone was told.
 *
 * So three is the largest factor that still catches the regressions worth
 * catching, and a real one is visible long before it fails: the report prints
 * each measurement against its recorded baseline, so a change that costs fifty
 * percent shows as 1.5 in a column, in the log, on the pull request that caused
 * it.
 *
 * ## When these numbers move
 *
 * A change that is meant to cost more re-records the baseline rather than
 * raising the budget, and `node scripts/bench.mjs --record` prints the table to
 * paste in. Raising a budget on its own hides the size of what was accepted,
 * which is the one thing the next reader needs.
 */
import type { Unit } from './timing.js';

/**
 * The factor between a recorded median and the number that fails the build.
 * The reasoning is in this file's opening comment, because it is the whole of
 * what makes these budgets defensible.
 */
export const HEADROOM = 3;

export interface Budget {
  readonly name: string;
  /** The median this measurement gave on the reference machine. */
  readonly recorded: number;
  /** Over this, the build fails. */
  readonly budget: number;
  readonly unit: Unit;
  /** What this number is worth in the hands of somebody using the language. */
  readonly why: string;
}

/**
 * Recorded on a current eight core desktop processor with nothing else of
 * consequence running, on a recent release of the runtime rather
 * than the oldest this package supports, which is one more reason for headroom.
 * Nothing measured here uses more than one core, so the core count is context
 * rather than a claim: what these numbers depend on is single threaded speed.
 */
export const BUDGETS: readonly Budget[] = [
  {
    name: 'history-light',
    recorded: 185,
    budget: 600,
    unit: 'ms',
    why:
      'opening a plain study on several years of bars. A person waiting for a ' +
      'chart to fill notices anything past about a second, and this leaves the ' +
      'whole of that second to the host: fetching the bars, drawing them, and ' +
      'the other studies on the same pane.',
  },
  {
    name: 'history-heavy',
    recorded: 1200,
    budget: 4000,
    unit: 'ms',
    why:
      'the same history through the dearest thing the language can express: a ' +
      'loop on every bar, arrays that grow, and drawing objects created, ' +
      'mutated and deleted throughout. It is roughly six times the plain study, ' +
      'and that ratio is the number to watch: a change that moves it is a ' +
      'change in the machinery around the arithmetic rather than in the ' +
      'arithmetic. Four seconds is also inside the deployment constraint that ' +
      'anything past five minutes must become a job, with the margin a slower ' +
      'box needs.',
  },
  {
    name: 'update-light',
    recorded: 3.3,
    budget: 10,
    unit: 'us',
    why:
      'one tick on a live chart, which is the operation that happens hundreds ' +
      'of times a minute. Ten microseconds is what lets a pane carry dozens of ' +
      'studies and still redraw inside one frame of sixteen milliseconds, with ' +
      'the frame left over for the drawing itself.',
  },
  {
    name: 'update-heavy',
    recorded: 25,
    budget: 80,
    unit: 'us',
    why:
      'the same tick through a study that rolls a roster of drawing objects ' +
      'and five arrays back to the start of the bar before executing it again. ' +
      'That rollback is what makes a live chart agree with a backtest of the ' +
      'same data, and this is what it costs: eight times the plain study and ' +
      'still under a tenth of a frame.',
  },
  {
    name: 'compile-light',
    recorded: 0.12,
    budget: 0.4,
    unit: 'ms',
    why:
      'the delay between a trader changing a line and seeing it, since the ' +
      'editor compiles on every apply. Well under the ten milliseconds at ' +
      'which a person begins to feel an edit, because this cost is paid on ' +
      'every apply rather than once.',
  },
  {
    name: 'compile-heavy',
    recorded: 0.32,
    budget: 1,
    unit: 'ms',
    why:
      'the same apply for a script twice the size. Held against the light one ' +
      'it says whether compile time grows with the script or with something ' +
      'else: under three times the cost for twice the source is growth in the ' +
      'source, and a jump in this one alone is not.',
  },
];

export function budgetFor(name: string): Budget | undefined {
  return BUDGETS.find((one) => one.name === name);
}

/**
 * The steps a budget is allowed to take, per power of ten.
 *
 * A budget is a number a person has to hold in their head while reading a failed
 * build, so it is one of these times a power of ten rather than whatever came
 * out of a multiplication. The rounding is always upwards, so the stated
 * headroom is a floor and never a number the rounding quietly ate into.
 */
const STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

/**
 * The budget a recorded median earns.
 *
 * This is a function rather than a note in a comment because a test holds every
 * entry in the table to it. A budget raised on its own, without re-recording
 * what the code now costs, fails that test: the size of what was accepted is
 * the one thing the next reader needs and the easiest thing to leave out.
 */
export function suggestBudget(recorded: number): number {
  if (!(recorded > 0)) throw new Error('a budget is derived from a recorded median above zero');
  const target = recorded * HEADROOM;
  const decade = Math.pow(10, Math.floor(Math.log10(target)));
  for (const step of STEPS) {
    const candidate = step * decade;
    if (candidate >= target) return Number(candidate.toPrecision(2));
  }
  return Number((10 * decade).toPrecision(2));
}

/** What a measured number means against what was recorded for it. */
export interface Verdict {
  readonly name: string;
  readonly measured: number;
  readonly budget: Budget;
  /** The measured number over the budget. Above one, the build fails. */
  readonly used: number;
  /** The measured number over the recorded baseline. */
  readonly against: number;
  readonly over: boolean;
}

export function verdictFor(name: string, measured: number): Verdict {
  const budget = budgetFor(name);
  if (budget === undefined) {
    throw new Error(
      `${name} has no budget, so nothing can fail. ` +
        'A measurement without a budget is a report, and this file exists to make it a gate.',
    );
  }
  return {
    name,
    measured,
    budget,
    used: measured / budget.budget,
    against: budget.recorded === 0 ? Number.NaN : measured / budget.recorded,
    over: measured > budget.budget,
  };
}

function round(value: number): string {
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

/** A measured number with its unit, as the report prints it. */
export function quote(value: number, unit: Unit): string {
  return `${round(value)} ${unit}`;
}

/**
 * The sentence a breach prints.
 *
 * It says which measurement, by how much, against what it used to be, and what
 * the budget was protecting. Somebody reading a failed build at the wrong hour
 * has to be able to act on that line alone.
 */
export function breachLine(verdict: Verdict): string {
  const { budget } = verdict;
  const by = `${(verdict.used * 100 - 100).toFixed(0)} percent over`;
  const since = Number.isNaN(verdict.against)
    ? ''
    : ` That is ${verdict.against.toFixed(2)} times the ${quote(budget.recorded, budget.unit)} recorded for it.`;
  return (
    `${verdict.name} regressed: ${quote(verdict.measured, budget.unit)} against a budget of ` +
    `${quote(budget.budget, budget.unit)}, ${by}.${since}` +
    `\n  What the budget is protecting: ${budget.why}`
  );
}
