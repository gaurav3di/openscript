/** Immutable contribution chunks, shared by state checkpoints and independent forks. */
import type { Value } from './value.js';

const WIDTH = 32;

interface Chunk {
  readonly values: readonly Value[];
  readonly prior: Chunk | null;
}

/** Appending copies at most one short tail, never the contributed prefix. */
export class ContributionHistory {
  readonly head: Chunk | null;
  readonly tail: readonly Value[];
  readonly count: number;

  constructor(
    head: Chunk | null = null,
    tail: readonly Value[] = Object.freeze([]),
    count = 0,
  ) {
    this.head = head;
    this.tail = tail;
    this.count = count;
    Object.freeze(this);
  }

  append(value: Value): ContributionHistory {
    const full = this.tail.length === WIDTH;
    const head = full ? Object.freeze({ values: this.tail, prior: this.head }) : this.head;
    const tail = Object.freeze(full ? [value] : [...this.tail, value]);
    return new ContributionHistory(head, tail, this.count + 1);
  }

  /** Index chunk references once; each subsequent newest-first read is constant work. */
  view(length: number): ContributionView {
    const size = Math.min(length, this.count);
    const chunks: (readonly Value[])[] = [];
    let remaining = size - this.tail.length;
    let head = this.head;
    while (remaining > 0 && head !== null) {
      chunks.push(head.values);
      head = head.prior;
      remaining -= WIDTH;
    }
    return new ContributionView(this.tail, chunks, size);
  }
}

/** A transient index into the current window. It is not retained in state. */
export class ContributionView {
  private readonly tail: readonly Value[];
  private readonly chunks: readonly (readonly Value[])[];
  readonly size: number;

  constructor(
    tail: readonly Value[], chunks: readonly (readonly Value[])[], size: number,
  ) {
    this.tail = tail;
    this.chunks = chunks;
    this.size = size;
  }

  at(back: number): Value {
    if (back < 0 || back >= this.size || !Number.isInteger(back)) return null;
    if (back < this.tail.length) return this.tail[this.tail.length - 1 - back]!;
    const before = back - this.tail.length;
    return this.chunks[Math.floor(before / WIDTH)]![WIDTH - 1 - before % WIDTH]!;
  }
}
