/**
 * The memory ceilings and the run-time refusals, as the library sees them.
 *
 * The library is handed this rather than the budget itself, so that the only
 * thing a library call can do to the engine's counters is ask whether something
 * it is about to build is allowed. A call cannot charge the loop budget, cannot
 * read the clock and cannot stop a bar for a reason of its own.
 *
 * Every refusal here carries a catalogue code, and they are the codes the
 * catalogue has: an array past its element ceiling is OS5002, a string past its
 * character ceiling is OS5008, an argument outside its contract is OS4003, an
 * index outside an array is OS4004, and a change to an object a script already
 * deleted is OS4005.
 */
import type { Span } from '../span/index.js';
import type { Budget } from './budget.js';
import { raise } from './errors.js';
import type { Guard } from './library/index.js';

export function guardFor(budget: Budget): Guard {
  return {
    array(span: Span, name: string, size: number): void {
      budget.checkArray(span, name, size);
    },

    string(span: Span, text: string): string {
      return budget.checkString(span, text);
    },

    chars(span: Span, length: number): void {
      budget.checkLength(span, length);
    },

    /**
     * An argument outside its contract, OS4003.
     *
     * The compile-time half of this is OS3004, which the checker raises when
     * the argument is a literal. This is the run-time half, for a length a
     * script computed, and it names the call and the parameter so the reader is
     * looking at one argument rather than at a line.
     */
    badArgument(span: Span, name: string, argument: string, found: string): never {
      raise('OS4003', span, { name, argument, found });
    },

    badIndex(span: Span, name: string, index: string, size: number): never {
      raise('OS4004', span, { index, name, size });
    },

    deleted(span: Span, kind: string, bar: number): never {
      raise('OS4005', span, { kind, bar });
    },
  };
}
