/**
 * What the emitter could not do, and which specification asked for it.
 *
 * Every diagnostic in this compiler carries a catalogue code, and the catalogue
 * is closed: a stage that meets something it cannot express reports a gap
 * rather than inventing a code for it. A gap is not a diagnostic. It is a note
 * from one part of the project to the people who write the other parts, saying
 * that two specifications, or a specification and the catalogue, do not yet meet.
 *
 * It carries a span when one exists, because the fastest way to understand a
 * gap is to look at the line that provoked it. `blocking` is what separates
 * "this program is emitted and something about it is unresolved" from "this
 * program is not emitted at all", and an emitter that returned a program while
 * a blocking gap stood would be handing somebody an artifact that computes the
 * wrong numbers.
 */
import type { Span } from '../span/index.js';

export interface Gap {
  /** What could not be done, in one sentence, in the compiler's own voice. */
  readonly what: string;
  /** The section that asks for it, so a reader can go and check. */
  readonly specification: string;
  readonly span: Span | undefined;
  /** Whether it stopped a faithful program from being produced. */
  readonly blocking: boolean;
}

export class GapLog {
  private readonly seen = new Set<string>();
  readonly gaps: Gap[] = [];

  /** Records a gap once per distinct sentence, however many lines provoke it. */
  add(gap: Gap): void {
    const key = `${gap.specification}|${gap.what}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.gaps.push(gap);
  }

  get blocked(): boolean {
    return this.gaps.some((one) => one.blocking);
  }
}
