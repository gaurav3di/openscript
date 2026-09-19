/**
 * The rolling window every length-taking function is built on.
 *
 * **The accumulation order is part of the contract.** Binary64 addition is not
 * associative, so a sum has a value and an order, and two engines that add the
 * same window two ways disagree in the last bits. This library fixes one order
 * and uses it everywhere:
 *
 *   **oldest bar first, newest bar last, in index order.**
 *
 * That is the order `compiled-program.md` section 8.2 gives for iteration, and
 * it is the order a reader assumes when they see a window written down.
 *
 * **The sum is taken fresh over the window on every bar.** The tempting
 * alternative, carrying a running total and subtracting the value that leaves,
 * is O(1) instead of O(len) but it is a different number: the error in a
 * running total accumulates without bound over forty thousand bars, and it is
 * not bit-identical to a fresh sum, which `compiled-program.md` section 8.3
 * refuses outright. A window costs `len` additions per bar, which is bounded by
 * the length the script asked for rather than by how much history is loaded,
 * and that is the property a live chart actually needs.
 */
import type { Value } from './value.js';
import { NONE, isPresent, result } from './value.js';

/** A fixed length view of the most recent bars. */
export interface Window {
  /** Advance by one bar. */
  push(value: Value): void;
  /** True once `len` bars have gone by, present or not: this is warmup. */
  filled(): boolean;
  /** True when the window is filled and every bar in it has a value. */
  complete(): boolean;
  /** The value `back` bars ago, 0 being the bar just pushed. */
  at(back: number): Value;
  /** How many bars of the window have a value. */
  presentCount(): number;
  /** The sum over the window, oldest first, absent unless the window is complete. */
  sum(): Value;
  /** The sum over the window with absent bars left out, absent when it is not filled. */
  sumPresent(): Value;
  /** The arithmetic mean over the window, absent unless the window is complete. */
  mean(): Value;
}

/**
 * A window of `len` bars.
 *
 * A length outside its contract yields a window that never fills, so every
 * function built on it returns absence rather than a number computed from a
 * nonsense length. See `isLength` for why that is absence and not a diagnostic.
 */
export function makeWindow(len: number): Window {
  const size = Number.isInteger(len) && len >= 1 ? len : 0;
  const ring: Value[] = new Array<Value>(size).fill(NONE);
  let next = 0;
  let seen = 0;

  const index = (back: number): number => {
    const from = next - 1 - back;
    return ((from % size) + size) % size;
  };

  const window: Window = {
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
        if (isPresent(window.at(back))) count += 1;
      }
      return count;
    },

    complete(): boolean {
      return window.filled() && window.presentCount() === size;
    },

    sum(): Value {
      if (!window.complete()) return NONE;
      let total = 0;
      // Oldest first: `back` counts down to the bar just pushed.
      for (let back = size - 1; back >= 0; back -= 1) {
        total += window.at(back) as number;
      }
      return result(total);
    },

    sumPresent(): Value {
      if (!window.filled()) return NONE;
      let total = 0;
      for (let back = size - 1; back >= 0; back -= 1) {
        const value = window.at(back);
        if (isPresent(value)) total += value;
      }
      return result(total);
    },

    mean(): Value {
      const total = window.sum();
      return isPresent(total) ? result(total / size) : NONE;
    },
  };

  return window;
}
