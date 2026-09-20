/**
 * What a stateful function remembers between bars, and why it is a record
 * rather than a closure.
 *
 * A closure is the obvious way to hold a running average and it is the wrong
 * way here. `compiled-program.md` 2.11 requires a state region to be
 * **snapshottable by a mechanical copy**: an engine copies and restores one
 * without knowing which function owns it, because the rollback and replay rules
 * of section 6 apply to every region at once. Nothing can copy a closure
 * without knowing what is inside it, and rebuilding one by replaying its inputs
 * is what 6.2 refuses in as many words: an engine does not re-seed an average
 * from history, it puts back the record it copied.
 *
 * So a region is a flat record of numbers, booleans, strings and fixed length
 * queues, and `copyState` is the mechanical copy. Every function in this
 * library is written against one, and the tail form in `tail.ts` is the same
 * step over a region nobody else can reach. That is what lets the one
 * implementation serve both a library call folded over a series and an engine
 * advancing a chart one bar at a time.
 *
 * Several functions share one region by taking different key prefixes, which is
 * how a study built from three others keeps one flat record rather than a tree
 * of them.
 */

/** One field of a state region. A queue is the one compound form 2.11 allows. */
export type StateField = number | boolean | string | null;

/** What a single key holds. */
export type StateSlot = StateField | StateField[];

/** A state region: a flat record, copyable without knowing what owns it. */
export type StateRecord = Record<string, StateSlot | undefined>;

/** A region with nothing in it yet, which is what bar 0 finds. */
export function newState(): StateRecord {
  return {};
}

/** The mechanical copy 2.11 asks for: one level, with queues cloned. */
export function copyState(record: StateRecord): StateRecord {
  const out: StateRecord = {};
  for (const key of Object.keys(record)) {
    const value = record[key];
    out[key] = Array.isArray(value) ? [...value] : value;
  }
  return out;
}

/** A number held in a region, with a default for the bar it is first read on. */
export function slot(record: StateRecord, key: string, fallback: number): number {
  const value = record[key];
  return typeof value === 'number' ? value : fallback;
}

/** A condition held in a region, false until something sets it. */
export function flag(record: StateRecord, key: string): boolean {
  return record[key] === true;
}

/**
 * A queue held in a region, created on the bar it is first read on.
 *
 * The caller keeps it bounded. A queue that grew with the dataset would not be
 * copyable in the sense 2.11 requires.
 */
export function queue(record: StateRecord, key: string): StateField[] {
  const held = record[key];
  if (Array.isArray(held)) return held;
  const made: StateField[] = [];
  record[key] = made;
  return made;
}

/**
 * A number held in a region that may honestly have none yet.
 *
 * `slot` answers with a fallback, which is what a running total wants. A study
 * that remembers the previous bar's high wants the other answer: absence until
 * a present value has been put there, so the bar after a hole is treated as the
 * bar after a hole rather than as one following a zero.
 */
export function held(record: StateRecord, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' ? value : null;
}
