/**
 * Cells and library state, and the checkpoint that rolls them back.
 *
 * `compiled-program.md` section 6 is one mechanism serving three purposes:
 * making a moving bar idempotent, letting a debugger step backwards, and making
 * a chart replay exact. They are the same problem, and an engine that
 * implements the checkpoint gets all three.
 *
 * **The representation is an undo journal, and the specification allows it.**
 * 6.2 is explicit that an engine may implement a checkpoint as a full copy,
 * copy on write, an undo journal, or nothing at all when it can prove the state
 * is unchanged, because the requirement is the semantics and not the shape. A
 * full copy of every cell and every state region at every bar is a cost
 * proportional to the program on a bar that changed one number, and a live
 * chart pays it on every tick. So a cell's previous value is recorded the first
 * time a bar writes it and a state region is copied the first time a bar
 * touches it, and a bar that changes nothing costs nothing at all.
 *
 * **`live var` is the one exception, and it is the whole of 6.3.** Everything
 * else rolls back, so executing a moving bar ten times gives the same answer as
 * executing it once. A `"live"` cell keeps its current value, which is what
 * makes a script using one not reproducible by design. Its previous value is
 * still recorded, because a debugger stepping backwards has to be able to show
 * what the value actually was rather than what a replay would recompute.
 */
import type { StateRecord } from './library/index.js';
import { copyState } from './library/index.js';
import type { Cell, StateRegion } from './types.js';
import type { Value } from './values/index.js';
import { ABSENT } from './values/index.js';

interface CellSnapshot {
  readonly value: Value;
  readonly initialised: boolean;
}

export class Memory {
  private readonly values: Value[];
  private readonly initialised: boolean[];
  private readonly live: boolean[];
  private readonly regions: (StateRecord | undefined)[];

  private readonly undoCells = new Map<number, CellSnapshot>();
  private readonly undoRegions = new Map<number, StateRecord | undefined>();

  constructor(cells: readonly Cell[], states: readonly StateRegion[]) {
    this.values = new Array<Value>(cells.length).fill(ABSENT);
    this.initialised = new Array<boolean>(cells.length).fill(false);
    this.live = cells.map((one) => one.kind === 'live');
    this.regions = new Array<StateRecord | undefined>(states.length).fill(undefined);
  }

  /**
   * `CELL_INIT`: whether the cell is already initialised.
   *
   * The cell is marked before the initialiser runs, not after. The two differ
   * only if the initialiser could reach the same `CELL_INIT` again, which needs
   * recursion, which is an error; marking first means the flag is set by one
   * instruction rather than by a pair that must stay together across a jump.
   */
  initialise(cell: number): boolean {
    if (this.initialised[cell] === true) return true;
    this.recordCell(cell);
    this.initialised[cell] = true;
    return false;
  }

  load(cell: number): Value {
    return this.values[cell] ?? ABSENT;
  }

  store(cell: number, value: Value): void {
    this.recordCell(cell);
    this.values[cell] = value;
  }

  /** The region a `CALL_LIB` names, created on first use and kept across bars. */
  region(index: number): StateRecord {
    const known = this.regions[index];
    if (known !== undefined) {
      if (!this.undoRegions.has(index)) this.undoRegions.set(index, copyState(known));
      return known;
    }
    if (!this.undoRegions.has(index)) this.undoRegions.set(index, undefined);
    const made: StateRecord = {};
    this.regions[index] = made;
    return made;
  }

  private recordCell(cell: number): void {
    if (this.undoCells.has(cell)) return;
    this.undoCells.set(cell, {
      value: this.values[cell] ?? ABSENT,
      initialised: this.initialised[cell] === true,
    });
  }

  /** What each cell held when this bar began, which is what a debugger shows. */
  previousCells(): ReadonlyMap<number, Value> {
    const out = new Map<number, Value>();
    for (const [cell, snapshot] of this.undoCells) out.set(cell, snapshot.value);
    return out;
  }

  /** 6.3: restore the checkpoint, except that `"live"` cells keep their value. */
  rollback(): void {
    for (const [cell, snapshot] of this.undoCells) {
      if (this.live[cell] === true) continue;
      this.values[cell] = snapshot.value;
      this.initialised[cell] = snapshot.initialised;
    }
    this.undoCells.clear();
    for (const [index, region] of this.undoRegions) {
      this.regions[index] = region;
    }
    this.undoRegions.clear();
  }

  /** The checkpoint at the end of this bar: everything since is accepted. */
  commit(): void {
    this.undoCells.clear();
    this.undoRegions.clear();
  }

  /** Every value a cell holds, for the heap's reachability walk. */
  walk(visit: (value: Value) => void): void {
    for (const value of this.values) visit(value);
  }
}
