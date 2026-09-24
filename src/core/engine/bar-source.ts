/**
 * Where the bars a run reads come from: an array of records, or columns.
 *
 * The bar cycle reads one bar at a time and does not care where its fields come
 * from, so the representation is decided at the door and nowhere else. Two are
 * accepted (issue 0005):
 *
 * - **Records**, one `HostBar` per bar, which is the live path: one bar arrives
 *   at a time and an array of one is absurd.
 * - **Columns**, one array per field, owned by the host. A long history held as
 *   columns costs about a third of the memory of one object per bar and no
 *   allocation per bar at rest, and a store that already holds bars as columns
 *   can hand over typed array views with no parse at all. The engine reads
 *   `open[i]` when bar `i` executes and builds the one record that execution
 *   needs, which is gone by the next bar.
 *
 * **In a column, absence is `null` or `NaN`.** A typed array cannot hold `null`,
 * and a price the host does not have is absent, never zero (`host-interface.md`
 * 3.1), so `NaN` is the typed array's spelling of it. A time that is `NaN` is a
 * bar with no time, which the hand-over refuses with OS6025 exactly as it
 * refuses a record with none.
 *
 * **The number of bars is the length of `time`.** A shorter price, volume or
 * interest column reads as absent past its end, which is the same thing a hole in
 * a record is, and nothing is invented to fill it.
 */
import type { HostBar } from './bars.js';

/** Numbers by bar index, absent written as `null` or `NaN`. */
export type BarColumn = ArrayLike<number | null>;

/** A history as columns, one per field of `host-interface.md` 3.1. */
export interface BarColumns {
  readonly time: BarColumn;
  readonly open: BarColumn;
  readonly high: BarColumn;
  readonly low: BarColumn;
  readonly close: BarColumn;
  readonly volume?: BarColumn;
  readonly oi?: BarColumn;
}

/** What the bar cycle and the fold read: how many bars, and bar `i`. */
export interface BarSource {
  readonly length: number;
  at(index: number): HostBar | undefined;
}

export function isColumns(bars: readonly HostBar[] | BarColumns): bars is BarColumns {
  return !Array.isArray(bars);
}

/** Either form, as the bar cycle and the fold read it. */
export function sourceOf(bars: readonly HostBar[] | BarColumns): BarSource {
  return isColumns(bars) ? columnSource(bars) : recordSource(bars);
}

export function recordSource(bars: readonly HostBar[]): BarSource {
  return { get length() { return bars.length; }, at: (index) => bars[index] };
}

function cell(column: BarColumn | undefined, index: number): number | null {
  const value = column === undefined || index >= column.length ? null : column[index];
  return value === null || value === undefined || Number.isNaN(value) ? null : value;
}

export function columnSource(columns: BarColumns): BarSource {
  const length = columns.time.length;
  return {
    length,
    at(index: number): HostBar | undefined {
      if (index < 0 || index >= length) return undefined;
      return {
        time: cell(columns.time, index),
        open: cell(columns.open, index),
        high: cell(columns.high, index),
        low: cell(columns.low, index),
        close: cell(columns.close, index),
        volume: cell(columns.volume, index),
        oi: cell(columns.oi, index),
      };
    },
  };
}

/**
 * The bars a run has been handed: a whole history, then whatever arrives live.
 *
 * `run` replaces the history; `append` and `update` write one bar over it. A
 * bar written live is held as the record it arrived as, which is the only form
 * a live bar has.
 */
export class KnownBars implements BarSource {
  private base: BarSource = recordSource([]);
  private readonly live: HostBar[] = [];

  get length(): number {
    return Math.max(this.base.length, this.live.length);
  }

  at(index: number): HostBar | undefined {
    return this.live[index] ?? this.base.at(index);
  }

  set(index: number, bar: HostBar): void {
    this.live[index] = bar;
  }

  reset(base: BarSource): void {
    this.base = base;
    this.live.length = 0;
  }
}
