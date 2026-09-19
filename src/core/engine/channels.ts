/**
 * Channels and the two things step 8 and step 9 do with them.
 *
 * A channel holds at most one value per bar and `EMIT` is the only way to write
 * one. One instruction and one flat table cover plots, levels, markers, alert
 * conditions, alert messages, bar colouring and pane background; a surface is a
 * declaration in `outputs` that points at a channel, and is not machinery.
 *
 * **Publishing and applying are two different steps, and the split is the whole
 * of what a script may do on a moving bar.** Step 8 writes every channel into
 * the bar's output column, absence included, so the drawing is recomputed from
 * scratch on every update and published every time. Step 9 applies the channels
 * declared `defer` and the pending effects, and only when the bar is confirmed
 * or `meta.onUnconfirmed` is true: a signal, an alert or an order waits for the
 * bar to close.
 *
 * A second write on the same bar replaces the first, so the last write wins and
 * no surface needs a rule of its own.
 */
import type { Effect } from './library/index.js';
import type { Channel } from './types.js';
import type { Value } from './values/index.js';
import { ABSENT } from './values/index.js';

/** A library call with an effect, held until the bar is decided. */
export interface PendingEffect {
  /** The index into `lib.functions`, which is what 5.4 says a record holds. */
  readonly fn: number;
  readonly name: string;
  readonly effect: Effect;
  /** The argument values as they stood when the call executed. */
  readonly args: readonly Value[];
}

export class Channels {
  private readonly current: Value[];
  private readonly deferred: boolean[];
  /** One column per channel: the value published for each bar. */
  private readonly columns: Value[][];
  private pending: PendingEffect[] = [];

  constructor(channels: readonly Channel[]) {
    this.current = new Array<Value>(channels.length).fill(ABSENT);
    this.deferred = channels.map((one) => one.defer);
    this.columns = channels.map(() => []);
  }

  count(): number {
    return this.current.length;
  }

  /** Step 3: every channel and the pending effect list start empty. */
  clear(): void {
    this.current.fill(ABSENT);
    this.pending = [];
  }

  /** `EMIT`: the last write on a bar is the one that counts. */
  write(channel: number, value: Value): void {
    this.current[channel] = value;
  }

  read(channel: number): Value {
    return this.current[channel] ?? ABSENT;
  }

  /** 5.4: a call with an effect records itself and pushes absent. */
  defer(record: PendingEffect): void {
    this.pending.push(record);
  }

  /** Step 8: the columns, absence included, whatever the bar's state. */
  publish(bar: number): void {
    for (let c = 0; c < this.columns.length; c += 1) {
      const column = this.columns[c];
      if (column === undefined) continue;
      column[bar] = this.current[c] ?? ABSENT;
    }
  }

  /**
   * Step 9: the deferred channels and the effects, or neither.
   *
   * Returns the effects to apply, and nothing when the bar is still moving. The
   * consequence is the one `language.md` 7.5 promises: a condition that was
   * true halfway through a bar and false when it closed never places an order,
   * because the execution that produced the record was thrown away.
   */
  decide(apply: boolean): readonly PendingEffect[] {
    if (!apply) {
      this.pending = [];
      return [];
    }
    const effects = this.pending;
    this.pending = [];
    return effects;
  }

  /** Whether a channel's value is held back on a bar that is still moving. */
  isDeferred(channel: number): boolean {
    return this.deferred[channel] === true;
  }

  /** The value published for one channel on one bar, absent where nothing wrote. */
  at(channel: number, bar: number): Value {
    return this.columns[channel]?.[bar] ?? ABSENT;
  }

  /** One channel's whole column, for a host building a plotted series. */
  column(channel: number, bars: number): readonly Value[] {
    const held = this.columns[channel] ?? [];
    const out: Value[] = [];
    for (let bar = 0; bar < bars; bar += 1) out.push(held[bar] ?? ABSENT);
    return out;
  }

  /** Every channel's value on one bar, which is what a bar's result carries. */
  row(bar: number): readonly Value[] {
    return this.columns.map((column) => column[bar] ?? ABSENT);
  }
}
