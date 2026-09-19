/**
 * Series registers: the per-bar history of one value, `compiled-program.md`
 * 2.10 and 3.2.
 *
 * Only a register has history, and `HIST` and `HISTP` are the only way to read
 * it. A register holds one entry per bar plus a cell for the bar currently
 * executing; the current cell is set to absent at step 3, `SSTORE` writes it,
 * `HIST` at offset 0 reads it, and at step 7 it becomes the history entry for
 * that bar, **replacing whatever a previous execution of the same bar left
 * there**. That replacement is half of what makes a moving bar idempotent; step
 * 2's truncation is the other half.
 *
 * **Trimming is amortised rather than done per bar.** Step 10 drops entries
 * older than `limits.history`, and dropping from the front of an array every bar
 * is quadratic over a long dataset. The registers share one base index, so a
 * trim is one splice across every register, and it runs only once the stale
 * entries are worth a pass. Retaining a little more than the declared depth
 * cannot be observed, because a read past the depth is OS4002 before it ever
 * reaches the array.
 */
import type { Value } from './values/index.js';
import { ABSENT } from './values/index.js';

export class Registers {
  private readonly histories: Value[][];
  private readonly current: Value[];
  /** The bar index that sits at position 0 of every history. */
  private base = 0;

  constructor(count: number) {
    this.histories = [];
    for (let i = 0; i < count; i += 1) this.histories.push([]);
    this.current = new Array<Value>(count).fill(ABSENT);
  }

  count(): number {
    return this.current.length;
  }

  /** Step 2: discard any entry a previous execution of bar `bar` wrote. */
  truncate(bar: number): void {
    const keep = Math.max(bar - this.base, 0);
    for (const history of this.histories) {
      if (history.length > keep) history.length = keep;
    }
  }

  /** Step 3: every register's current bar cell starts absent. */
  clearCurrent(): void {
    this.current.fill(ABSENT);
  }

  set(register: number, value: Value): void {
    this.current[register] = value;
  }

  /** `SLOAD`: the register's value for the bar being executed. */
  get(register: number): Value {
    return this.current[register] ?? ABSENT;
  }

  /** Step 7: the current bar cell becomes this bar's history entry. */
  close(bar: number): void {
    const at = bar - this.base;
    for (let r = 0; r < this.histories.length; r += 1) {
      const history = this.histories[r];
      if (history === undefined) continue;
      history[at] = this.current[r] ?? ABSENT;
    }
  }

  /**
   * The value a register held `back` bars before `bar`.
   *
   * Offset 0 is the bar being executed and reads the current cell, which is why
   * `close` has not run yet when a script reads `x[0]`.
   */
  at(register: number, bar: number, back: number): Value {
    if (back === 0) return this.current[register] ?? ABSENT;
    const history = this.histories[register];
    if (history === undefined) return ABSENT;
    const at = bar - back - this.base;
    if (at < 0 || at >= history.length) return ABSENT;
    return history[at] ?? ABSENT;
  }

  /** Step 10: drop entries older than the retained depth. */
  trim(bar: number, depth: number | null): void {
    if (depth === null) return;
    const wanted = bar + 1 - depth;
    const drop = wanted - this.base;
    // One pass only when the stale entries have paid for it, so a long run
    // stays linear rather than splicing every register on every bar.
    if (drop < depth || drop <= 0) return;
    for (const history of this.histories) history.splice(0, drop);
    this.base += drop;
  }

  /** Every value a register holds, for the heap's reachability walk. */
  walk(visit: (value: Value) => void): void {
    for (const history of this.histories) for (const value of history) visit(value);
    for (const value of this.current) visit(value);
  }
}
