/**
 * The bars a benchmark runs over.
 *
 * They are generated, not loaded, and that is the point: a benchmark compares a
 * number today against a number recorded weeks ago, so the input has to be the
 * same on every machine, every run and every checkout. A file of recorded bars
 * would drift the moment anyone regenerated it, and the gate would then fail for
 * a reason that has nothing to do with the engine.
 *
 * The generator is its own, deliberately not the engine suite's. A fixture in
 * `tests/engine` exists to make a study produce something a test can assert, and
 * whoever tunes it next is thinking about that test, not about a budget recorded
 * against the data it used to produce. A benchmark's input is part of the
 * recorded measurement, so it lives with the measurement.
 *
 * Two properties are load bearing:
 *
 * - **Identical everywhere.** The generator is a thirty-two bit shift register
 *   using only integer operations, so every step is exact on every platform.
 *   A multiply-and-mask generator loses its low bits past two to the fifty-third
 *   and is reproducible only by accident.
 * - **It turns often.** Price is pulled back towards its starting level, so it
 *   wanders inside a band instead of trending away over fifty thousand bars.
 *   A study that hunts for turning points has to find them, or a benchmark of it
 *   measures an engine doing nothing quickly.
 */
import type { BarState, HostBar } from '../../src/core/engine/index.js';

/** A fixed instant, so a bar's time is the same on every run. */
const BASE_TIME = 1_748_736_000_000;

const MINUTE = 60_000;

/** Bars between one session flag and the next. Any fixed number would do. */
const SESSION_BARS = 375;

/** The starting price, and the level the walk is pulled back towards. */
const LEVEL = 100;

/** How hard each bar is pulled back towards the level. */
const PULL = 0.01;

/** The widest one bar can move the price. */
const STEP = 1.4;

const SEED = 20_240_917;

/**
 * A thirty-two bit shift register, in the unit interval.
 *
 * Every operation stays inside a thirty-two bit integer, which JavaScript
 * defines exactly, so the sequence is identical on every engine and every
 * platform rather than identical in practice.
 */
function generator(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state ^= state << 13;
    state |= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state |= 0;
    return (state >>> 0) / 4_294_967_296;
  };
}

/** A price path with its bars, the same every time. */
export function bars(count: number): readonly HostBar[] {
  const next = generator(SEED);
  const out: HostBar[] = [];
  let price = LEVEL;
  for (let i = 0; i < count; i += 1) {
    price += (next() - 0.5) * STEP + (LEVEL - price) * PULL;
    const open = price;
    const close = price + (next() - 0.5) * (STEP * 0.85);
    const wick = next() * 0.6;
    out.push({
      open,
      high: Math.max(open, close) + wick,
      low: Math.min(open, close) - wick,
      close,
      volume: 1000 + (i % 37) * 11,
      time: BASE_TIME + i * MINUTE,
    });
  }
  return out;
}

/**
 * The host's word on each bar.
 *
 * Every bar is confirmed, because this is history. A session boundary is placed
 * on a fixed cycle so a study that resets on one is exercised rather than
 * skipped; which bars they fall on does not matter, only that they fall.
 */
export function states(count: number): readonly BarState[] {
  const out: BarState[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      isConfirmed: true,
      isSessionStart: i % SESSION_BARS === 0,
      isSessionEnd: i % SESSION_BARS === SESSION_BARS - 1,
    });
  }
  return out;
}

/**
 * A bar that is still moving, built from a confirmed one.
 *
 * A live update is not the same bar handed back unchanged: the close moves, and
 * the high or low moves with it. Feeding the identical object every time would
 * let an engine that cached on identity look fast at the one thing this
 * measurement exists to time.
 */
export function moved(bar: HostBar, tick: number): HostBar {
  const close = (bar.close ?? 0) + (tick % 5) * 0.01;
  return {
    open: bar.open,
    high: Math.max(bar.high ?? close, close),
    low: Math.min(bar.low ?? close, close),
    close,
    volume: (bar.volume ?? 0) + tick,
    time: bar.time,
  };
}
