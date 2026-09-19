/**
 * What a stateful library call remembers between bars, and why it is a record
 * rather than a closure.
 *
 * `compiled-program.md` 2.11 requires a state region to be **snapshottable by a
 * mechanical copy**: an engine must be able to copy and restore one without
 * knowing which function owns it, because the rollback and replay rules of
 * section 6 apply to every region at once. A closure holding its own variables
 * cannot be copied by anything that does not know what is inside it, and
 * rebuilding one by replaying its inputs is the thing section 6.2 refuses in as
 * many words: an engine does not re-seed an `ema` from history, it puts back
 * the record it copied.
 *
 * So a region is a flat record of numbers, booleans, strings and fixed length
 * queues, and `copyState` is the mechanical copy. The two pieces every length
 * taking function is built from, a rolling lookback and a seeded recurrence,
 * are written here once against that record, so the functions themselves stay
 * as short as the specification's description of them.
 *
 * **The accumulation order is the contract, not an implementation detail.**
 * Binary64 addition is not associative, so a sum has a value and an order.
 * Every lookback here sums oldest bar first, in index order, and takes the sum
 * fresh rather than carrying a running total: a running total's error grows
 * without bound over forty thousand bars and is not bit-identical to a fresh
 * sum, which section 8.3 refuses outright.
 */

/** One field of a state region. A queue is the one compound form 2.11 allows. */
export type StateField = number | boolean | string | null;
export type StateSlot = StateField | StateField[];

/** A state region: a fixed record, copyable without knowing what owns it. */
export type StateRecord = Record<string, StateSlot | undefined>;

export function copyState(record: StateRecord): StateRecord {
  const out: StateRecord = {};
  for (const key of Object.keys(record)) {
    const value = record[key];
    out[key] = Array.isArray(value) ? [...value] : value;
  }
  return out;
}

/** A number this library computed, made safe to return: 3.1's two rules. */
export function safe(x: number): number | null {
  if (!Number.isFinite(x)) return null;
  return x === 0 ? 0 : x;
}

export function present(value: number | null): value is number {
  return value !== null;
}

/** Whether a length is inside its contract: a whole number of one or more. */
export function isLength(len: number | null): len is number {
  return len !== null && Number.isInteger(len) && len >= 1;
}

/**
 * A fixed length view of the most recent bars, held in a state record.
 *
 * Several lookbacks share one region by taking different key prefixes, which is
 * what lets a function built from three others keep one flat record rather than
 * a tree of them.
 */
export interface Ring {
  push(value: number | null): void;
  /** True once `len` bars have gone by, present or not: this is warmup. */
  filled(): boolean;
  /** True when the lookback is filled and every bar in it has a value. */
  complete(): boolean;
  /** The value `back` bars ago, 0 being the bar just pushed. */
  at(back: number): number | null;
  presentCount(): number;
  /** The sum, oldest first, absent unless every bar in the lookback has a value. */
  sum(): number | null;
  /** The sum with absent bars left out, absent until the lookback is filled. */
  sumPresent(): number | null;
  mean(): number | null;
}

export function ring(record: StateRecord, key: string, len: number | null): Ring {
  const size = isLength(len) ? len : 0;
  const slot = `${key}:q`;
  const nextKey = `${key}:n`;
  const seenKey = `${key}:s`;
  const existing = record[slot];
  let items: StateField[];
  if (Array.isArray(existing) && existing.length === size) {
    items = existing;
  } else {
    items = new Array<StateField>(size).fill(null);
    record[slot] = items;
    record[nextKey] = 0;
    record[seenKey] = 0;
  }
  const read = (name: string): number => {
    const value = record[name];
    return typeof value === 'number' ? value : 0;
  };
  const index = (back: number): number => {
    const from = read(nextKey) - 1 - back;
    return ((from % size) + size) % size;
  };

  const self: Ring = {
    push(value: number | null): void {
      if (size === 0) return;
      items[read(nextKey)] = value;
      const next = read(nextKey) + 1;
      record[nextKey] = next === size ? 0 : next;
      if (read(seenKey) < size) record[seenKey] = read(seenKey) + 1;
    },
    filled(): boolean {
      return size > 0 && read(seenKey) === size;
    },
    at(back: number): number | null {
      if (size === 0 || back < 0 || back >= size) return null;
      const value = items[index(back)];
      return typeof value === 'number' ? value : null;
    },
    presentCount(): number {
      let count = 0;
      for (let back = size - 1; back >= 0; back -= 1) if (present(self.at(back))) count += 1;
      return count;
    },
    complete(): boolean {
      return self.filled() && self.presentCount() === size;
    },
    sum(): number | null {
      if (!self.complete()) return null;
      let total = 0;
      // Oldest first: `back` counts down to the bar just pushed.
      for (let back = size - 1; back >= 0; back -= 1) total += self.at(back) as number;
      return safe(total);
    },
    sumPresent(): number | null {
      if (!self.filled()) return null;
      let total = 0;
      for (let back = size - 1; back >= 0; back -= 1) {
        const value = self.at(back);
        if (present(value)) total += value;
      }
      return safe(total);
    },
    mean(): number | null {
      const total = self.sum();
      return present(total) ? safe(total / size) : null;
    },
  };
  return self;
}

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
 * next present bar continues from where the last one left off.
 */
export function seeded(
  record: StateRecord,
  key: string,
  len: number | null,
  step: (previous: number, value: number) => number,
): (value: number | null) => number | null {
  const lookback = ring(record, `${key}~`, len);
  const runningKey = `${key}:r`;
  const startedKey = `${key}:o`;
  return (value: number | null): number | null => {
    if (record[startedKey] !== true) {
      lookback.push(value);
      const mean = lookback.mean();
      if (!present(mean)) return null;
      record[startedKey] = true;
      record[runningKey] = mean;
      return safe(mean);
    }
    if (!present(value)) return null;
    const previous = record[runningKey];
    if (typeof previous !== 'number') return null;
    const next = step(previous, value);
    record[runningKey] = next;
    return safe(next);
  };
}

/** A number held in a region, with a default for the bar it is first read on. */
export function slot(record: StateRecord, key: string, fallback: number): number {
  const value = record[key];
  return typeof value === 'number' ? value : fallback;
}

export function flag(record: StateRecord, key: string): boolean {
  return record[key] === true;
}
