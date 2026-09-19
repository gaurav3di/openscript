/**
 * The rolling lookback every length-taking function is built on.
 *
 * "Lookback" rather than the other word for the same thing: that one names a
 * browser global, and the layering check refuses it anywhere in the text of a
 * file under `src/core`, which is what keeps this tier runnable in a worker and
 * on a server rather than only in a page.
 *
 * **The accumulation order is part of the contract.** Binary64 addition is not
 * associative, so a sum has a value and an order, and two engines that add the
 * same lookback two ways disagree in the last bits. This library fixes one order
 * and uses it everywhere:
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
import type { Value } from './value.js';
import { NONE, isLength, isPresent, result } from './value.js';

/** A fixed length view of the most recent bars. */
export interface Lookback {
  /** Advance by one bar. */
  push(value: Value): void;
  /** True once `len` bars have gone by, present or not: this is warmup. */
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
 * A lookback of `len` bars.
 *
 * A length outside its contract yields a lookback that never fills, so every
 * function built on it returns absence rather than a number computed from a
 * nonsense length. See `isLength` for why that is absence and not a diagnostic.
 */
export function makeLookback(len: number): Lookback {
  const size = isLength(len) ? len : 0;
  const ring: Value[] = new Array<Value>(size).fill(NONE);
  let next = 0;
  let seen = 0;

  const index = (back: number): number => {
    const from = next - 1 - back;
    return ((from % size) + size) % size;
  };

  const lookback: Lookback = {
    push(value: Value): void {
      if (size === 0) return;
      ring[next] = value;
      next = next + 1 === size ? 0 : next + 1;
      if (seen < size) seen += 1;
    },

    filled(): boolean {
      return size > 0 && seen === size;
    },

    at(back: number): Value {
      if (size === 0 || back < 0 || back >= size) return NONE;
      const value = ring[index(back)];
      return value === undefined ? NONE : value;
    },

    presentCount(): number {
      if (size === 0) return 0;
      let count = 0;
      for (let back = size - 1; back >= 0; back -= 1) {
        if (isPresent(lookback.at(back))) count += 1;
      }
      return count;
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
