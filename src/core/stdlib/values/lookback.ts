/**
 * The rolling lookback and the seeded recurrence: the two pieces every length
 * taking function in this library is built from.
 *
 * "Lookback" rather than the other word for the same thing: that one names a
 * browser global, and the layering check refuses it anywhere in the text of a
 * file under `src/core`, which is what keeps this tier runnable in a worker and
 * on a server rather than only in a page.
 *
 * Both are held in a state region (`region.ts`) rather than in local variables,
 * so one implementation serves a library call folded over a series and an
 * engine advancing a chart a bar at a time.
 *
 * **The accumulation order is part of the contract.** Binary64 addition is not
 * associative, so a sum has a value and an order, and two engines that add the
 * same lookback two ways disagree in the last bits. This library fixes one
 * order and uses it everywhere:
 *
 *   **oldest bar first, newest bar last, in index order.**
 *
 * That is the order `compiled-program.md` section 8.2 gives for iteration, and
 * it is the order a reader assumes when they see a lookback written down.
 *
 * **The sum is taken fresh over the lookback on every bar.** The tempting
 * alternative, carrying a running total and subtracting the value that leaves,
 * is O(1) instead of O(len) but it is a different number: the error in a
 * running total accumulates without bound over forty thousand bars, and it is
 * not bit-identical to a fresh sum, which `compiled-program.md` section 8.3
 * refuses outright. A lookback costs `len` additions per bar, which is bounded by
 * the length the script asked for rather than by how much history is loaded,
 * and that is the property a live chart actually needs.
 */
import type { StateField, StateRecord } from './region.js';
import { newState } from './region.js';
import { ContributionHistory } from './history.js';
import type { Value } from './value.js';
import { NONE, isLength, isPresent, result } from './value.js';

/** A fixed length view of the most recent bars. */
export interface Lookback {
  /** Advance by one bar. */
  push(value: Value): void;
  /** True after the largest observed length's contributions, present or not. */
  filled(): boolean;
  /** True when the lookback is filled and every bar in it has a value. */
  complete(): boolean;
  /** The value `back` bars ago, 0 being the bar just pushed. */
  at(back: number): Value;
  /** How many bars of the lookback have a value. */
  presentCount(): number;
  /** The sum over the lookback, oldest first, absent unless the lookback is complete. */
  sum(): Value;
  /** The sum over the lookback with absent bars left out, absent when it is not filled. */
  sumPresent(): Value;
  /** The arithmetic mean over the lookback, absent unless the lookback is complete. */
  mean(): Value;
}

/**
 * A lookback of `len` bars, held in a region under `key`.
 *
 * A length outside its contract yields a lookback that never fills, so every
 * function built on it returns absence rather than a number computed from a
 * nonsense length. See `isLength` for why that is absence and not a diagnostic.
 */
export function ring(record: StateRecord, key: string, len: number | null): Lookback {
  const size = len !== null && isLength(len) ? len : 0;
  const bars = `${key}:h`;
  const maximumKey = `${key}:m`;
  const held = record[bars];
  let history = held instanceof ContributionHistory ? held : new ContributionHistory();
  const before = record[maximumKey];
  const maximum = Math.max(typeof before === 'number' ? before : 0, size);
  record[maximumKey] = maximum;
  let view = history.view(size);
  return lookback(size, (value) => {
    history = history.append(value);
    record[bars] = history;
    view = history.view(size);
  }, () => size > 0 && history.count >= maximum, (back) => view.at(back));
}

/** Recursive seeding retains its established length-change policy separately. */
function seedRing(record: StateRecord, key: string, len: number | null): Lookback {
  const size = len !== null && isLength(len) ? len : 0;
  const bars = `${key}:q`;
  const nextKey = `${key}:n`;
  const seenKey = `${key}:s`;
  const held = record[bars];
  let items: StateField[];
  if (Array.isArray(held) && held.length === size) {
    items = held;
  } else {
    items = new Array<StateField>(size).fill(NONE);
    record[bars] = items;
    record[nextKey] = 0;
    record[seenKey] = 0;
  }

  const count = (name: string): number => {
    const value = record[name];
    return typeof value === 'number' ? value : 0;
  };
  const index = (back: number): number => {
    const from = count(nextKey) - 1 - back;
    return ((from % size) + size) % size;
  };

  return lookback(size, (value) => {
    if (size === 0) return;
    items[count(nextKey)] = value;
    const next = count(nextKey) + 1;
    record[nextKey] = next === size ? 0 : next;
    if (count(seenKey) < size) record[seenKey] = count(seenKey) + 1;
  }, () => size > 0 && count(seenKey) === size, (back) => {
    if (size === 0 || back < 0 || back >= size) return NONE;
    const value = items[index(back)];
    return typeof value === 'number' ? value : NONE;
  });
}

/** The arithmetic is shared so fixed-length accumulation keeps its exact order. */
function lookback(
  size: number, push: (value: Value) => void, filled: () => boolean,
  at: (back: number) => Value,
): Lookback {
  const lookback: Lookback = {
    push, filled, at,
    presentCount(): number {
      let counted = 0;
      for (let back = size - 1; back >= 0; back -= 1) {
        if (isPresent(lookback.at(back))) counted += 1;
      }
      return counted;
    },

    complete(): boolean {
      return lookback.filled() && lookback.presentCount() === size;
    },

    sum(): Value {
      if (!lookback.complete()) return NONE;
      let total = 0;
      // Oldest first: `back` counts down to the bar just pushed.
      for (let back = size - 1; back >= 0; back -= 1) {
        total += lookback.at(back) as number;
      }
      return result(total);
    },

    sumPresent(): Value {
      if (!lookback.filled()) return NONE;
      let total = 0;
      for (let back = size - 1; back >= 0; back -= 1) {
        const value = lookback.at(back);
        if (isPresent(value)) total += value;
      }
      return result(total);
    },

    mean(): Value {
      const total = lookback.sum();
      return isPresent(total) ? result(total / size) : NONE;
    },
  };

  return lookback;
}

/** A lookback of `len` bars in a region of its own, for a caller that has none. */
export function makeLookback(len: number): Lookback {
  return ring(newState(), 'q', len);
}

/** One step of a recurrence, from the previous running value and this bar's. */
export type Recurrence = (previous: number, value: number) => number;

/**
 * Seeded smoothing: the mean of the first complete lookback, then one step per
 * bar.
 *
 * The seed lookback is complete only when it holds `len` present values, so an
 * average taken over another study's output starts counting at that study's
 * first value rather than at bar 0. That is what makes the warmups of
 * `stdlib.md` compose, and it is why `ema(sma(close, 10), 10)` is absent until
 * bar 18 rather than bar 9.
 *
 * A hole in the input freezes the recurrence: an absent bar after seeding
 * produces an absent bar out and leaves the running value untouched, so the
 * next present bar continues from where the last one left off. The alternatives
 * are worse: consuming absence as zero would drag the average toward nothing,
 * and re-seeding would let one missing bar restart a two hundred bar average.
 */
export function smoothed(
  record: StateRecord,
  key: string,
  len: number | null,
  value: Value,
  step: Recurrence,
): Value {
  const seed = seedRing(record, `${key}~`, len);
  const runningKey = `${key}:r`;
  const startedKey = `${key}:o`;
  if (record[startedKey] !== true) {
    seed.push(value);
    const mean = seed.mean();
    if (!isPresent(mean)) return NONE;
    record[startedKey] = true;
    record[runningKey] = mean;
    return result(mean);
  }
  if (!isPresent(value)) return NONE;
  const previous = record[runningKey];
  if (typeof previous !== 'number') return NONE;
  const next = step(previous, value);
  record[runningKey] = next;
  return result(next);
}
