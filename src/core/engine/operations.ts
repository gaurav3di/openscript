/**
 * The instructions whose behaviour is more than one line, lifted out of the
 * dispatch loop.
 *
 * Four of the forty-one have rules a reader has to be able to find: the two
 * history reads, the array subscript and the numeric `for`. Each is written
 * here as a plain function of what it needs, so the loop stays a switch that
 * can be read top to bottom and each rule sits beside the part of
 * `compiled-program.md` section 4 that states it.
 */
import type { Span } from '../span/index.js';
import { raise } from './errors.js';
import type { Frame } from './frames.js';
import type { Memory } from './memory.js';
import type { Registers } from './registers.js';
import type { CompiledProgram, Constant, Instruction } from './types.js';
import type { Heap, Value } from './values/index.js';
import { ABSENT, isRef } from './values/index.js';

/** What the operations below need from the machine, and nothing more. */
export interface Ops {
  readonly program: CompiledProgram;
  readonly registers: Registers;
  readonly memory: Memory;
  readonly heap: Heap;
  readonly slots: Value[];
  here(): Span;
  barIndex(): number;
}

/** A pool entry as a machine value. Entries 0, 1 and 2 are fixed by 2.9. */
export function constantValueOf(held: Constant | undefined): Value {
  if (held === undefined) return ABSENT;
  switch (held[0]) {
    case 'z':
      return ABSENT;
    case 'b':
    case 'n':
    case 's':
      return held[1];
    default:
      return { tag: 'color', r: held[1][0], g: held[1][1], b: held[1][2], a: held[1][3] };
  }
}

/**
 * `HIST`, resolved in the order 4.4 gives and in no other.
 *
 * Case 3 and case 4 are different on purpose. A depth past the start of the
 * dataset is absence, because the value never existed; a depth past the
 * retained history is OS4002, because it existed and the engine threw it away.
 * Returning absence for both would hide a real bug behind a plausible gap.
 */
export function historyRead(ops: Ops, register: number, back: Value): Value {
  if (back === null) return ABSENT;
  if (typeof back !== 'number' || !Number.isInteger(back) || back < 0) {
    raise('OS4001', ops.here(), { index: describe(back) });
  }
  const bar = ops.barIndex();
  if (back > bar) return ABSENT;
  const depth = ops.program.limits.history;
  if (depth !== null && back > depth) {
    raise('OS4002', ops.here(), { index: back, depth, suggested: back });
  }
  return ops.registers.at(register, bar, back);
}

/** `ELEM`: an index outside the array is a mistake, not a missing measurement. */
export function elementRead(ops: Ops, array: Value, index: Value): Value {
  const object = ops.heap.deref(array);
  const size = object !== undefined && object.kind === 'array' ? object.items.length : 0;
  if (
    object === undefined ||
    object.kind !== 'array' ||
    typeof index !== 'number' ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= size
  ) {
    raise('OS4004', ops.here(), { index: describe(index), name: nameOf(ops, array), size });
  }
  return object.items[index] ?? ABSENT;
}

/**
 * `FOR_INIT`: pops the step, then the limit, then the start, in that order.
 *
 * An absent bound is OS4013 rather than zero iterations. Treating absence as
 * "do not run" was rejected because a `for` loop whose bound is absent during
 * warmup would silently produce nothing and the script would look correct.
 */
export function forInit(ops: Ops, instruction: Instruction, frame: Frame): void {
  const step = frame.stack.pop() ?? ABSENT;
  const limit = frame.stack.pop() ?? ABSENT;
  const start = frame.stack.pop() ?? ABSENT;
  const bounds = [
    [start, 'start'],
    [limit, 'limit'],
    [step, 'step'],
  ] as const;
  for (const [value, bound] of bounds) {
    if (value === null) raise('OS4013', ops.here(), { bound });
  }
  for (const [value] of bounds) {
    if (typeof value !== 'number') raise('OS4001', ops.here(), { index: describe(value) });
  }
  if (step === 0) {
    raise('OS3004', ops.here(), {
      name: 'this loop',
      argument: 'step',
      range: 'anything but zero',
      found: 0,
    });
  }
  frame.slots[instruction[2] as number] = start;
  frame.slots[instruction[3] as number] = limit;
  frame.slots[instruction[4] as number] = step;
  // A descending range with a positive step runs zero times and is never
  // silently reversed.
  const from = start as number;
  const to = limit as number;
  const by = step as number;
  if (by > 0 ? from > to : from < to) frame.pc = instruction[5] as number;
}

/** `FOR_NEXT`: advance, and jump back to the `TICK` when another turn is due. */
export function forNext(instruction: Instruction, frame: Frame): void {
  const variable = instruction[2] as number;
  const limit = frame.slots[instruction[3] as number] as number;
  const step = frame.slots[instruction[4] as number] as number;
  const next = (frame.slots[variable] as number) + step;
  frame.slots[variable] = next === 0 ? 0 : next;
  if (step > 0 ? next <= limit : next >= limit) frame.pc = instruction[5] as number;
}

/**
 * The name a value goes by, for a diagnostic that has to say which array.
 *
 * The scan is over the named slots and cells of frame 0, which is where a
 * script's own names live. A value held only inside another object has no name
 * in the program, and the message says "the array" rather than inventing one: a
 * fix that named something the reader cannot find in their file is worse than a
 * fix that names nothing.
 */
export function nameOf(ops: Ops, value: Value): string {
  if (!isRef(value)) return 'the value';
  const names = ops.program.debug.names;
  for (let i = 0; i < ops.slots.length; i += 1) {
    const held = ops.slots[i];
    if (held !== undefined && isRef(held) && held.id === value.id) {
      const name = names.slots[i];
      if (name !== undefined && name !== '') return name;
    }
  }
  for (let i = 0; i < ops.program.cells.length; i += 1) {
    const held = ops.memory.load(i);
    if (isRef(held) && held.id === value.id) {
      const name = names.cells[i];
      if (name !== undefined && name !== '') return name;
    }
  }
  return 'the array';
}

/** A value as a diagnostic has to print it. */
export function describe(value: Value): string {
  if (value === null) return 'none';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return value.tag === 'color' ? 'a colour' : 'an object';
}
