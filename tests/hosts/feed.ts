/**
 * Duty 1 and duty 4: a bar, `host-interface.md` 3.1, and the state it arrives
 * in, 6.4.
 *
 * A bar is seven fields and no eighth. The state is the four facts
 * `language.md` 7.2 gives the host and none of the rest, and two of those four
 * are the hand-over itself rather than a field on it: `isNew` says this is a
 * new bar, and `updates` counts how many times the host has asked for this one
 * to be executed. So a host states those two by which call it makes and how
 * often, which is why this file owns the calling as well as the shapes.
 *
 * **The two worked cases of 6.4 are the two ways a host delivers.** A history
 * load hands every bar over once, confirmed, with no live feed behind it. A
 * live feed hands the newest bar over as it forms, unconfirmed, again on each
 * tick, and confirmed when its interval elapses. They are the same bars, and
 * the engine's rollback rule is the promise that they publish the same picture:
 * the newest bar rolls back to the start of itself before it runs again, so a
 * chart watching a feed and a backtest over the same dataset agree.
 *
 * That promise is worth driving from here rather than from one test, because a
 * suite that only ever loads history cannot see a study that leaves an object
 * behind on every tick, and that is a defect this repository has shipped.
 */
import type { BarResult, BarState, Engine, HostBar } from '../../src/core/engine/index.js';

/** One bar, `host-interface.md` 3.1. Seven fields and no eighth. */
export interface PageBar {
  /** The bar's open instant, whole milliseconds since the Unix epoch, UTC. */
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  /** Stated only where the host has one. Absent and zero are different facts. */
  readonly volume?: number;
  /** A level, not a flow. Stated only where the host has one. */
  readonly oi?: number;
}

/** The fields 3.1 prints, in the order it prints them. */
export const HOST_BAR_FIELDS: readonly string[] = [
  'time',
  'open',
  'high',
  'low',
  'close',
  'volume',
  'oi',
];

/**
 * The bar state, 6.4: the four facts a host states about one execution.
 *
 * Spelled as the page prints them rather than as the engine takes them. Two of
 * the four are the call the host makes, and `handOvers` below is where the four
 * become calls.
 */
export interface PageState {
  readonly isNew: boolean;
  readonly isConfirmed: boolean;
  readonly isRealtime: boolean;
  /** Executions of this bar so far, this one included. One per hand-over. */
  readonly updates: number;
}

/** The facts 6.4 names, in the order its worked cases print them. */
export const STATE_FIELDS: readonly string[] = ['isNew', 'isConfirmed', 'isRealtime', 'updates'];

/**
 * How a host hands its bars over, which is 6.4's two worked cases.
 *
 * `"history"` is the first row: every bar new, confirmed, not realtime,
 * executed once. `"feed"` is the second: the newest bar arrives unconfirmed, is
 * executed again while it moves, and is confirmed when its interval elapses.
 */
export type Delivery = 'history' | 'feed';

/** How many times a live host re-executes a bar before its interval elapses. */
const TICKS = 2;

/**
 * One execution, as the host describes it before making the call.
 *
 * `supplied` is duty 1 rather than duty 4: how many bars this host has in hand
 * at this moment, which is what the engine derives `bar.count` and `bar.isLast`
 * from. It is the difference between the two deliveries that the bar state does
 * not carry. A host loading history has the whole dataset and says so; a host
 * watching a feed has what has arrived, so every bar is the newest bar in its
 * turn, and a study is asked to draw the newest bar eighty times rather than
 * once. A driver that left this out would call both deliveries a feed and would
 * be comparing one thing with itself.
 */
export interface HandOver {
  readonly bar: PageBar;
  readonly state: PageState;
  readonly supplied: number;
}

/**
 * The bar as the engine takes it: 3.1's fields, with an absent one left out.
 *
 * `exactOptionalPropertyTypes` is on, so a fact the host does not have is
 * missing from the object rather than present and undefined, which is the same
 * distinction 3.3 draws between an absent volume and a zero one.
 */
export function engineBar(bar: PageBar): HostBar {
  return {
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    ...(bar.volume === undefined ? {} : { volume: bar.volume }),
    ...(bar.oi === undefined ? {} : { oi: bar.oi }),
  };
}

/** The two facts of the four the engine takes as a value rather than as a call. */
export function engineState(state: PageState): BarState {
  return { isConfirmed: state.isConfirmed, isRealtime: state.isRealtime };
}

/**
 * Every hand-over one delivery makes, in order, for one dataset.
 *
 * A history load is one per bar. A live feed is the newest bar arriving
 * unconfirmed, moving `TICKS` times, and then closing: the same bar, executed
 * four times, only the last of them confirmed. Nothing about the bar changes
 * between the four, because a host that revised a price would be handing over
 * different data rather than the same data differently.
 */
export function handOvers(bars: readonly PageBar[], delivery: Delivery): readonly HandOver[] {
  const out: HandOver[] = [];
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index] as PageBar;
    // A host loading history holds the whole dataset; a host watching a feed
    // holds what has arrived.
    const supplied = delivery === 'history' ? bars.length : index + 1;
    if (delivery === 'history') {
      out.push({
        bar,
        supplied,
        state: { isNew: true, isConfirmed: true, isRealtime: false, updates: 1 },
      });
      continue;
    }
    out.push({
      bar,
      supplied,
      state: { isNew: true, isConfirmed: false, isRealtime: true, updates: 1 },
    });
    for (let tick = 1; tick <= TICKS; tick += 1) {
      out.push({
        bar,
        supplied,
        state: { isNew: false, isConfirmed: false, isRealtime: true, updates: tick + 1 },
      });
    }
    out.push({
      bar,
      supplied,
      state: { isNew: false, isConfirmed: true, isRealtime: true, updates: TICKS + 2 },
    });
  }
  return out;
}

/**
 * One hand-over, made the way the state it carries says to make it.
 *
 * A revision names no count, because a host that is revising the newest bar has
 * supplied exactly the bars it had supplied a moment ago.
 */
export function deliverTo(engine: Engine, one: HandOver): BarResult {
  const wire = engineBar(one.bar);
  const facts = engineState(one.state);
  return one.state.isNew
    ? engine.append(wire, facts, one.supplied)
    : engine.update(wire, facts);
}

/**
 * Run a dataset through an engine the way the named delivery hands it over.
 *
 * The results come back one per hand-over rather than one per bar, which is
 * what lets a caller see a bar that failed on its third execution and not on
 * its first. A hand-over the engine refused stops the run, because a host that
 * kept feeding bars past a refusal would be reading columns nothing computed.
 */
export function driveWith(
  engine: Engine,
  bars: readonly PageBar[],
  delivery: Delivery,
): readonly BarResult[] {
  const out: BarResult[] = [];
  for (const one of handOvers(bars, delivery)) {
    const result = deliverTo(engine, one);
    out.push(result);
    if (result.diagnostic !== undefined) return out;
  }
  return out;
}
