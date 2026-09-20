/**
 * What the emitter's tests read, and the two analyses they run over a program.
 *
 * The analyses are here rather than in the compiler on purpose. They are the
 * load-time verification of `compiled-program.md` 3.5, written a second time
 * and from the document rather than from the emitter's own tables, because a
 * test that asked the compiler whether the compiler was right would pass for
 * every program the compiler can produce, including the wrong ones. An engine
 * in another language will run exactly these checks before it executes a bar,
 * and the point of running them here is to fail in this repository instead.
 */
import { readFileSync, readdirSync } from 'node:fs';

import { DiagnosticBag, check, lex, parseTokens, sourceFile } from '../../src/core/index.js';
import type { Diagnostic, SourceFile } from '../../src/core/index.js';
import { emit } from '../../src/core/emit/index.js';
import type { CompiledProgram, Gap, Instruction } from '../../src/core/emit/index.js';

const ROOT = new URL('../../../', import.meta.url);

/** The twelve target scripts, which are what Phase 2 has to compute and draw. */
export const TARGETS = new URL('examples/', ROOT);

export interface Emitted {
  readonly name: string;
  readonly file: SourceFile;
  readonly program: CompiledProgram | undefined;
  readonly gaps: readonly Gap[];
  readonly diagnostics: readonly Diagnostic[];
}

export function scriptNames(): readonly string[] {
  return readdirSync(TARGETS)
    .filter((name) => name.endsWith('.oscript'))
    .sort();
}

export function compile(name: string, text: string): Emitted {
  const file = sourceFile(name, text);
  const bag = new DiagnosticBag();
  const tokens = lex(file, bag);
  const script = parseTokens(file, tokens, bag);
  const checked = check(file, script, bag);
  const result = emit(file, checked, bag, {});
  return { name, file, program: result.program, gaps: result.gaps, diagnostics: bag.ordered() };
}

export function compileTarget(name: string): Emitted {
  return compile(name, readFileSync(new URL(name, TARGETS), 'utf8'));
}

/** Every target that produced a program, which is what the shape tests walk. */
export function emittedTargets(): readonly Emitted[] {
  return scriptNames()
    .map(compileTarget)
    .filter((one) => one.program !== undefined);
}

/** Every instruction list in a program: the bar's own, then each function body. */
export function instructionLists(
  program: CompiledProgram,
): readonly { readonly name: string; readonly code: readonly Instruction[] }[] {
  return [
    { name: 'code', code: program.code },
    ...program.functions.map((one, index) => ({
      name: `functions[${index}] ${one.name}`,
      code: one.code,
    })),
  ];
}

/**
 * The stack depth at each instruction, or the first place two paths disagreed.
 *
 * `compiled-program.md` 3.5 check 5: every instruction has a fixed stack effect,
 * so the depth at each one is computable by walking the list; it must agree on
 * every path reaching an instruction, must never go below zero, and must be
 * zero at `HALT`.
 */
export interface DepthReport {
  readonly depths: readonly (number | undefined)[];
  readonly problems: readonly string[];
}

const DEPTH: Readonly<Record<string, number>> = {
  CONST: 1,
  DUP: 1,
  POP: -1,
  LOAD: 1,
  STORE: -1,
  CELL_INIT: 0,
  LOADC: 1,
  STOREC: -1,
  SLOAD: 1,
  SSTORE: -1,
  HIST: 0,
  HISTP: 0,
  ADD: -1,
  SUB: -1,
  MUL: -1,
  DIV: -1,
  MOD: -1,
  NEG: 0,
  LT: -1,
  LE: -1,
  GT: -1,
  GE: -1,
  EQ: -1,
  NE: -1,
  NOT: 0,
  AND: -1,
  OR: -1,
  AND_SHORT: 0,
  OR_SHORT: 0,
  JUMP: 0,
  JUMP_FALSE: -1,
  TICK: 0,
  FOR_INIT: -3,
  FOR_NEXT: 0,
  ELEM: -1,
  RET: -1,
  EMIT: -1,
  HALT: 0,
};

/** Where each opcode carries a jump target, and where it carries a count. */
const TARGET_AT: Readonly<Record<string, number>> = {
  CELL_INIT: 1,
  AND_SHORT: 0,
  OR_SHORT: 0,
  JUMP: 0,
  JUMP_FALSE: 0,
  FOR_INIT: 4,
  FOR_NEXT: 4,
};

function effectOf(instruction: Instruction, argcOf: (site: number) => number): number {
  const [opcode, ...operands] = instruction;
  if (opcode === 'ARRAY') return 1 - (operands[0] ?? 0);
  if (opcode === 'CALL_LIB') return 1 - (operands[1] ?? 0);
  if (opcode === 'CALL_FN') return 1 - argcOf(operands[0] ?? 0);
  return DEPTH[opcode] ?? 0;
}

export function targetsOf(instruction: Instruction): readonly number[] {
  const at = TARGET_AT[instruction[0]];
  if (at === undefined) return [];
  const operand = instruction[at + 1];
  return typeof operand === 'number' ? [operand] : [];
}

export function walkStack(
  code: readonly Instruction[],
  argcOf: (site: number) => number,
): DepthReport {
  const depths: (number | undefined)[] = new Array<number | undefined>(code.length).fill(undefined);
  const problems: string[] = [];

  const reach = (index: number, depth: number): void => {
    if (index < 0 || index >= code.length) {
      problems.push(`instruction ${index} is outside the list`);
      return;
    }
    if (depth < 0) problems.push(`depth ${depth} at instruction ${index}`);
    const known = depths[index];
    if (known === undefined) depths[index] = depth;
    else if (known !== depth) problems.push(`depth ${known} and ${depth} both reach ${index}`);
  };

  reach(0, 0);
  for (let i = 0; i < code.length; i += 1) {
    const instruction = code[i];
    const depth = depths[i];
    if (instruction === undefined || depth === undefined) continue;
    const after = depth + effectOf(instruction, argcOf);
    for (const target of targetsOf(instruction)) reach(target, after);
    const opcode = instruction[0];
    // Check 5's third sentence, over both terminators: a `RET` reaches nothing
    // after it, so a body that is one value short is at minus one exactly here
    // and nowhere a `reach` would see it.
    if ((opcode === 'HALT' || opcode === 'RET') && after !== 0) {
      problems.push(`depth ${after} at ${opcode}`);
    }
    if (opcode !== 'JUMP' && opcode !== 'RET' && opcode !== 'HALT') reach(i + 1, after);
  }

  return { depths, problems };
}

/**
 * How many times each channel is written, at least and at most, on a path from
 * instruction 0 to the terminator.
 *
 * `compiled-program.md` 3.5 check 7: every channel declared `once` is written
 * exactly once on every path, which is how a plot column is guaranteed a value,
 * or an explicit absence, for every bar. Counts are capped at two, because
 * "more than once" is the whole of what the check needs to know and a loop
 * would otherwise never settle.
 */
export function channelCounts(
  code: readonly Instruction[],
  channels: number,
): { readonly least: readonly number[]; readonly most: readonly number[] } {
  const cap = 2;
  const least: (number[] | undefined)[] = new Array<number[] | undefined>(code.length).fill(
    undefined,
  );
  const most: (number[] | undefined)[] = new Array<number[] | undefined>(code.length).fill(
    undefined,
  );
  const pending: number[] = [0];
  least[0] = new Array<number>(channels).fill(0);
  most[0] = new Array<number>(channels).fill(0);

  const merge = (index: number, low: readonly number[], high: readonly number[]): void => {
    if (index < 0 || index >= code.length) return;
    const knownLow = least[index];
    const knownHigh = most[index];
    if (knownLow === undefined || knownHigh === undefined) {
      least[index] = [...low];
      most[index] = [...high];
      pending.push(index);
      return;
    }
    let changed = false;
    for (let c = 0; c < channels; c += 1) {
      const lower = Math.min(knownLow[c] ?? 0, low[c] ?? 0);
      const upper = Math.min(cap, Math.max(knownHigh[c] ?? 0, high[c] ?? 0));
      if (lower !== knownLow[c]) {
        knownLow[c] = lower;
        changed = true;
      }
      if (upper !== knownHigh[c]) {
        knownHigh[c] = upper;
        changed = true;
      }
    }
    if (changed) pending.push(index);
  };

  let guard = code.length * channels * 8 + 64;
  while (pending.length > 0 && guard > 0) {
    guard -= 1;
    const index = pending.pop();
    if (index === undefined) continue;
    const instruction = code[index];
    const low = least[index];
    const high = most[index];
    if (instruction === undefined || low === undefined || high === undefined) continue;

    const nextLow = [...low];
    const nextHigh = [...high];
    if (instruction[0] === 'EMIT') {
      const channel = instruction[1] ?? 0;
      nextLow[channel] = Math.min(cap, (nextLow[channel] ?? 0) + 1);
      nextHigh[channel] = Math.min(cap, (nextHigh[channel] ?? 0) + 1);
    }

    for (const target of targetsOf(instruction)) merge(target, nextLow, nextHigh);
    const opcode = instruction[0];
    if (opcode === 'HALT') continue;
    if (opcode !== 'JUMP' && opcode !== 'RET') merge(index + 1, nextLow, nextHigh);
  }

  const end = code.findIndex((one) => one[0] === 'HALT');
  return {
    least: least[end] ?? new Array<number>(channels).fill(0),
    most: most[end] ?? new Array<number>(channels).fill(0),
  };
}
