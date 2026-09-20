/**
 * An instruction list under construction, with its source positions.
 *
 * Two things live here rather than in the passes that emit code, because both
 * are easy to get subtly wrong in a hundred places and right in one.
 *
 * **Positions.** `compiled-program.md` 2.15 stores one triple per change of
 * position, and the position of any instruction is the triple with the greatest
 * index at or below it. So the builder is told where it is and works out which
 * triples to keep; a pass that appended a triple per instruction would produce a
 * correct program and a debug table four times the size of the code.
 *
 * **Stack depth.** Section 3.5 check 5 is the verifier's, and a compiler that
 * cannot compute the same number cannot know it emitted a loadable program. The
 * builder walks its own list on demand, so an emitter can assert the depth is
 * zero where the language says a statement has finished.
 */
import type { Span } from '../span/index.js';
import type { Instruction, Position } from './program.js';
import type { Opcode } from './opcodes.js';
import { depthChange, operandCount, targetPositions } from './opcodes.js';

export class CodeBuilder {
  private readonly instructions: Instruction[] = [];
  private readonly positions: Position[] = [];
  private line = 0;
  private column = 0;

  /** Where the instructions pushed after this call came from. */
  at(span: Span): void {
    this.line = span.line;
    this.column = span.column;
  }

  /** The index the next instruction will take, which is what a jump targets. */
  get here(): number {
    return this.instructions.length;
  }

  /**
   * Appends one instruction and returns its index.
   *
   * The operand count is checked here because an instruction with the wrong
   * number of operands is a program an engine refuses at load with one code and
   * no line (3.5 check 2), and this is the last place that still knows the line.
   */
  push(opcode: Opcode, ...operands: number[]): number {
    if (operands.length !== operandCount(opcode)) {
      throw new Error(
        `${opcode} takes ${operandCount(opcode)} operands and was given ${operands.length}`,
      );
    }
    const index = this.instructions.length;
    const last = this.positions[this.positions.length - 1];
    if (last === undefined || last[1] !== this.line || last[2] !== this.column) {
      this.positions.push([index, this.line, this.column]);
    }
    this.instructions.push([opcode, ...operands] as Instruction);
    return index;
  }

  /** Fills in a jump whose target was not known when it was emitted. */
  patch(index: number, operand: number, target: number): void {
    const instruction = this.instructions[index];
    if (instruction === undefined) throw new Error(`no instruction at ${index}`);
    const operands = instruction.slice(1) as number[];
    operands[operand] = target;
    this.instructions[index] = [instruction[0], ...operands] as Instruction;
  }

  get code(): readonly Instruction[] {
    return this.instructions;
  }

  get pos(): readonly Position[] {
    return this.positions;
  }
}

/** What walking an instruction list found, or the first place it stopped making sense. */
export interface Walk {
  /** The depth at each instruction, before it executes. */
  readonly depths: readonly number[];
  /** The first instruction whose depth two paths disagreed about, or nothing. */
  readonly conflict: number | undefined;
  /** The first instruction the walk reached with a negative depth, or nothing. */
  readonly underflow: number | undefined;
  /**
   * The first `RET` or `HALT` the stack is not empty at, or nothing.
   *
   * Section 3.5 check 5 is three sentences and this is the third: the depth
   * agrees on every path, it never goes below zero, and **it is zero at the
   * terminator**. Only the first two were walked here, and the difference is
   * not academic. A `RET` reaches nothing after it, so an expression that left
   * the stack one short took it to minus one exactly at the `RET`, where
   * nothing was ever asked; the walk finished clean and a body whose stack does
   * not add up was emitted, for an engine to refuse at load with a code about
   * the compiler. Every `RET` is checked rather than the last one, because an
   * early `return` is a terminator too and owes the same debt.
   */
  readonly terminal: number | undefined;
}

/**
 * The stack depth at every instruction, computed exactly as section 3.5 does.
 *
 * A forward pass is enough because every backward jump in a program this
 * compiler emits targets a `TICK` at a loop header, and a loop body leaves the
 * stack as it found it. The walk still records a disagreement rather than
 * assuming one, so a bug in a pass shows up here and not in an engine.
 */
export function walkDepths(
  code: readonly Instruction[],
  argcOf: (site: number) => number,
): Walk {
  const depths: (number | undefined)[] = new Array<number | undefined>(code.length).fill(undefined);
  let conflict: number | undefined;
  let underflow: number | undefined;
  let terminal: number | undefined;

  const reach = (index: number, depth: number): void => {
    if (index < 0 || index > code.length) return;
    if (depth < 0 && underflow === undefined) underflow = index;
    const known = depths[index];
    if (known === undefined) depths[index] = depth;
    else if (known !== depth && conflict === undefined) conflict = index;
  };

  reach(0, 0);
  for (let i = 0; i < code.length; i += 1) {
    const instruction = code[i];
    const depth = depths[i];
    if (instruction === undefined || depth === undefined) continue;
    const opcode = instruction[0] as Opcode;
    const operands = instruction.slice(1) as number[];
    const after = depth + depthChange(opcode, operands, argcOf);

    if (opcode === 'RET' || opcode === 'HALT') {
      if (after !== 0 && terminal === undefined) terminal = i;
      continue;
    }
    for (const position of targetPositions(opcode)) {
      const target = operands[position];
      if (target !== undefined) reach(target, after);
    }
    if (opcode !== 'JUMP') reach(i + 1, after);
  }

  return {
    depths: depths.map((one) => one ?? 0),
    conflict,
    underflow,
    terminal,
  };
}
