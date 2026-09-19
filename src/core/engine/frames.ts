/**
 * Frames, and where an instruction came from in the source.
 *
 * A frame is `compiled-program.md` 3.3's seven fields. Two of them, `cellBase`
 * and `stateBase`, are what make one function body serve many independent
 * pieces of state: a cell operand inside a body is added to the frame's base,
 * so the same body reaches different cells from different call sites, and the
 * call site supplies the bases. That is `language.md` 11.4's rule that state is
 * allocated per call site, made mechanical.
 *
 * **A frame's stack region is its own.** A called function cannot see or
 * disturb the caller's operands, which is what makes the verifier's depth walk
 * a local question rather than a whole program one.
 *
 * Positions are looked up rather than carried per instruction. 2.15 stores one
 * triple per change of position and the position of any instruction is the
 * triple with the greatest index at or below it, so a run of instructions from
 * one expression costs one triple. The lookup runs when a diagnostic is raised
 * and never on the path an instruction takes.
 */
import type { Instruction, Position } from './types.js';
import type { Value } from './values/index.js';
import { ABSENT } from './values/index.js';

export interface Frame {
  readonly code: readonly Instruction[];
  pc: number;
  readonly slots: Value[];
  readonly cellBase: number;
  readonly stateBase: number;
  /** The register bound to each series parameter, from the call site. */
  readonly series: readonly number[];
  readonly stack: Value[];
  /** The position table for this frame's instruction list. */
  readonly positions: readonly Position[];
}

export function makeFrame(
  code: readonly Instruction[],
  slots: number,
  cellBase: number,
  stateBase: number,
  series: readonly number[],
  positions: readonly Position[],
): Frame {
  return {
    code,
    pc: 0,
    slots: new Array<Value>(slots).fill(ABSENT),
    cellBase,
    stateBase,
    series,
    stack: [],
    positions,
  };
}

/**
 * The line and column of one instruction.
 *
 * A binary search rather than a scan, because a program with four thousand
 * instructions raising a diagnostic inside a loop would otherwise walk the
 * table once per raise, and a debugger stepping instruction by instruction asks
 * for this on every step.
 */
export function positionAt(positions: readonly Position[], pc: number): {
  readonly line: number;
  readonly column: number;
} {
  let low = 0;
  let high = positions.length - 1;
  let found: Position | undefined;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const entry = positions[middle];
    if (entry === undefined) break;
    if (entry[0] <= pc) {
      found = entry;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found === undefined ? { line: 0, column: 0 } : { line: found[1], column: found[2] };
}
