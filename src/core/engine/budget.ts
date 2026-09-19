/**
 * The counters that make a runaway script stop.
 *
 * The engine owns the loop, so every one of these is a number it increments
 * rather than something it hopes about. A platform running many customers'
 * scripts in one process needs exactly that: exceeding a budget is a diagnostic
 * on the script that did it, never a hang and never a frozen tab.
 *
 * **Two kinds of budget, and the difference matters.**
 *
 * The *loop budget* is part of the language. `compiled-program.md` 8.5 requires
 * two engines to fail at the same iteration of the same loop on the same bar,
 * so it counts `TICK` executions and nothing else, it comes from the program's
 * own `limits()` line, and it is identical on every engine.
 *
 * The *host budgets* are not part of the language and cannot be, because a
 * wall clock measures the machine rather than the program. They exist so that
 * one script cannot take a process down, and a host that sets one accepts that
 * a program refused here may run elsewhere. That is why the clock is off unless
 * a host asks for it and why the step ceiling is derived from the program
 * rather than chosen: see `stepBound`.
 *
 * The clock is read once every `clockEvery` steps rather than every step. A
 * clock read costs more than an instruction, and reading it per instruction
 * would make the wall clock the thing the wall clock measures.
 */
import type { Span } from '../span/index.js';
import { raise } from './errors.js';
import type { CompiledProgram } from './types.js';

export interface EngineLimits {
  /**
   * Instructions one bar may execute, or null to derive it from the program.
   *
   * A verified program's bar has a bound that can be computed at load, so the
   * derived value is the honest ceiling and a host rarely needs to set one.
   */
  readonly steps: number | null;
  /** Milliseconds one bar may take, or null for no clock at all. */
  readonly ms: number | null;
  /** Elements one array may hold, OS5002. */
  readonly arrayElements: number;
  /** Code points one string may hold, OS5008. */
  readonly stringLength: number;
  /** Call frames, OS5005 at load. */
  readonly frames: number;
  /** The most a program's own `limits(loops = ...)` may ask for, OS5003. */
  readonly loops: number | null;
  /** The most a program's own `limits(history = ...)` may ask for, OS5003. */
  readonly history: number | null;
  /** Instructions in the whole program, OS5009 at load, or null for no ceiling. */
  readonly instructions: number | null;
  /** State regions, OS5004 at load, or null for no ceiling. */
  readonly states: number | null;
  /** Steps between two readings of the clock. */
  readonly clockEvery: number;
}

/**
 * What an engine allows when a host says nothing.
 *
 * The ceilings that have a catalogue code are set; the clock is off, because a
 * default wall clock would make the same script pass on a fast machine and fail
 * on a slow one with nobody having asked for that trade.
 */
export const DEFAULT_LIMITS: EngineLimits = {
  steps: null,
  ms: null,
  arrayElements: 100_000,
  stringLength: 100_000,
  frames: 64,
  loops: null,
  history: null,
  instructions: null,
  states: null,
  clockEvery: 4096,
};

export function limitsWith(given: Partial<EngineLimits> | undefined): EngineLimits {
  return given === undefined ? DEFAULT_LIMITS : { ...DEFAULT_LIMITS, ...given };
}

/**
 * The most instructions one bar of this program can possibly execute.
 *
 * Verification proves three things that together bound a bar: the target of
 * every backward jump is a `TICK` (3.5 check 6), so no cycle runs without
 * charging the loop budget; recursion is an error, so the call graph is acyclic
 * and each call site's body runs at most once per acyclic segment; and the
 * instruction lists are finite. So a segment between two `TICK` executions
 * costs at most the program's whole instruction count once, and there are at
 * most `limits.loops` such segments plus the one that ends at `HALT`.
 *
 * The number is generous by design. It is not a performance budget: it is the
 * proof that a bar terminates, turned into a counter so that a program which
 * somehow exceeds its own static bound stops instead of running forever.
 */
export function stepBound(program: CompiledProgram): number {
  let acyclic = program.code.length;
  for (const site of program.callSites) {
    acyclic += program.functions[site.fn]?.code.length ?? 0;
  }
  const segments = Math.max(program.limits.loops, 0) + 1;
  return Math.max(acyclic, 1) * segments + acyclic;
}

/** A reading of the clock, injected so that a test is not at the mercy of one. */
export type Clock = () => number;

/**
 * The per-bar counters.
 *
 * One object per engine, reset at step 3 of every execution of a bar, so a long
 * dataset is never itself a reason to fail.
 */
export class Budget {
  private loops = 0;
  private steps = 0;
  private started = 0;
  private nextClockAt = 0;
  private bar = 0;

  private readonly limits: EngineLimits;
  private readonly stepCeiling: number;
  private readonly loopCeiling: number;
  private readonly clock: Clock | undefined;

  constructor(
    limits: EngineLimits,
    stepCeiling: number,
    loopCeiling: number,
    clock: Clock | undefined,
  ) {
    this.limits = limits;
    this.stepCeiling = stepCeiling;
    this.loopCeiling = loopCeiling;
    this.clock = clock;
  }

  /** Step 3: the counters start again for this execution of this bar. */
  begin(bar: number): void {
    this.bar = bar;
    this.loops = 0;
    this.steps = 0;
    this.nextClockAt = this.limits.clockEvery;
    this.started = this.limits.ms !== null && this.clock !== undefined ? this.clock() : 0;
  }

  /**
   * One instruction executed.
   *
   * Returns whether a budget is spent, rather than raising, so the dispatch
   * loop does the check inline and the cost is one comparison on the path every
   * instruction takes.
   */
  step(): boolean {
    this.steps += 1;
    if (this.steps > this.stepCeiling) return true;
    if (this.steps >= this.nextClockAt) {
      this.nextClockAt = this.steps + this.limits.clockEvery;
      if (this.clock !== undefined && this.limits.ms !== null) {
        return this.clock() - this.started > this.limits.ms;
      }
    }
    return false;
  }

  /** Which budget the last `step` ran out of, and the diagnostic for it. */
  overrun(span: Span, loopLine: number | undefined): never {
    const max = this.limits.ms;
    if (this.steps <= this.stepCeiling && max !== null && this.clock !== undefined) {
      raise('OS5007', span, { bar: this.bar, ms: this.clock() - this.started, max });
    }
    // The step ceiling is the static bound of `stepBound`, and a loop is the
    // only construct that can approach it, so the loop that was running is the
    // one to name. A bar that passes it with no loop running contradicts what
    // verification proved about the program, which is OS6018's case.
    this.spentLoops(span, loopLine);
  }

  /** Step 5.5: one iteration of loop `l` charged to the per-bar budget. */
  tick(span: Span, line: number): void {
    this.loops += 1;
    if (this.loops > this.loopCeiling) this.spentLoops(span, line);
  }

  private spentLoops(span: Span, line: number | undefined): never {
    if (line === undefined) {
      raise('OS6018', span, {
        location: `step ${this.steps}`,
        reason:
          'the bar executed more instructions than the program can reach without a loop, ' +
          'so the instruction list is not the one verification walked',
      });
    }
    raise('OS5001', span, {
      budget: this.loopCeiling,
      line,
      suggested: suggestBudget(this.loopCeiling),
    });
  }

  /** The array ceiling, OS5002. */
  checkArray(span: Span, name: string, size: number): void {
    if (size > this.limits.arrayElements) {
      raise('OS5002', span, { max: this.limits.arrayElements, name, size });
    }
  }

  /** The string ceiling, OS5008, counted in code points as 3.1 requires. */
  checkString(span: Span, text: string): string {
    this.checkLength(span, [...text].length);
    return text;
  }

  /**
   * The same ceiling against a length that has not been built yet.
   *
   * `str.repeat` is where a string ceiling is actually reached, and building
   * the string first to measure it is how an engine runs out of memory instead
   * of reporting that it would have.
   */
  checkLength(span: Span, length: number): void {
    if (length > this.limits.stringLength) {
      raise('OS5008', span, { max: this.limits.stringLength, found: length });
    }
  }
}

/**
 * A budget with room to spare, for OS5001's fix line.
 *
 * The catalogue asks for a budget that would have completed the bar, and the
 * engine cannot know one: it stopped the loop rather than finishing it. Twice
 * the budget, rounded to one significant figure so the number reads like
 * something a person would type, is the nearest honest thing, and the message
 * beside it says the first fix is the exit condition.
 */
function suggestBudget(budget: number): number {
  const doubled = Math.max(budget * 2, 1000);
  const magnitude = Math.pow(10, Math.floor(Math.log10(doubled)));
  return Math.ceil(doubled / magnitude) * magnitude;
}
