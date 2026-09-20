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
 * **A bar that was not decided reads back absent on its deferred channels.**
 * Step 9 discards them rather than delivering them (5.1, and 12.7's held
 * marker), and a reader of the columns is where that discarding has to be
 * visible: a marker whose text stayed in the buffer would be drawn on the
 * moving bar by whoever read the column, which is the one thing the deferral
 * exists to prevent. The value is kept rather than erased, because the next
 * execution of that bar may be the one that confirms it.
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
  /** Whether step 9 applied the deferred channels for each bar. */
  private readonly decided: boolean[] = [];
  private pending: PendingEffect[] = [];
  /** Whether any channel at all is deferred, so the common case costs nothing. */
  private readonly anyDeferred: boolean;

  constructor(channels: readonly Channel[]) {
    this.current = new Array<Value>(channels.length).fill(ABSENT);
    this.deferred = channels.map((one) => one.defer);
    this.anyDeferred = this.deferred.some((one) => one);
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
  decide(bar: number, apply: boolean): readonly PendingEffect[] {
    this.decided[bar] = apply;
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
    if (this.withheld(channel, bar)) return ABSENT;
    return this.columns[channel]?.[bar] ?? ABSENT;
  }

  /** One channel's whole column, for a host building a plotted series. */
  column(channel: number, bars: number): readonly Value[] {
    const held = this.columns[channel] ?? [];
    const deferred = this.anyDeferred && this.deferred[channel] === true;
    const out: Value[] = [];
    for (let bar = 0; bar < bars; bar += 1) {
      out.push(deferred && this.decided[bar] !== true ? ABSENT : held[bar] ?? ABSENT);
    }
    return out;
  }

  /** Every channel's value on one bar, which is what a bar's result carries. */
  row(bar: number): readonly Value[] {
    return this.columns.map((column, channel) =>
      this.withheld(channel, bar) ? ABSENT : column[bar] ?? ABSENT,
    );
  }

  /**
   * Whether a channel's value for a bar is one step 9 discarded.
   *
   * A channel that is not deferred is never withheld, and a bar step 9 applied
   * withholds nothing, so this is false for every channel of every confirmed
   * bar and for every plot column ever.
   */
  private withheld(channel: number, bar: number): boolean {
    return this.anyDeferred && this.deferred[channel] === true && this.decided[bar] !== true;
  }
}
