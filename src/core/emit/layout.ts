/**
 * Where every value the program holds is put: slots, cells, registers,
 * channels and state regions.
 *
 * `compiled-program.md` 2.10 and 2.11 describe three regions with three
 * lifetimes, and the checker has already decided which one each name belongs
 * to. What is left is the arithmetic: an index per name, per frame, in a table
 * an engine reads by position. That is all this file does, and keeping it out
 * of the passes that emit code is what stops an index being allocated twice in
 * one place and read as a different number in another.
 *
 * The one decision here rather than in the checker is the frame. Slots and cell
 * operands are relative to the frame that holds them, so a function body
 * numbers its own from zero and the call site supplies the base (2.12). A
 * single global counter would produce a program that runs correctly from one
 * call site and wrongly from the second.
 */
import type { Binding } from '../check/index.js';
import type { Cell, Channel, Register } from './program.js';

/** One frame's slots, its cells and the library state its body needs. */
export class FrameLayout {
  readonly slotNames: string[] = [];
  readonly cellNames: (string | null)[] = [];
  readonly cellKinds: ('var' | 'live')[] = [];
  /** Relative state index to the index into `lib.functions` that owns it. */
  readonly stateFns: number[] = [];

  private readonly bindingSlot = new Map<number, number>();
  private readonly bindingCell = new Map<number, number>();

  /** A slot with no name in the source: a loop's limit, a step, a cursor. */
  slot(name: string): number {
    const index = this.slotNames.length;
    this.slotNames.push(name);
    return index;
  }

  slotFor(binding: Binding): number {
    const found = this.bindingSlot.get(binding.id);
    if (found !== undefined) return found;
    const index = this.slot(binding.name);
    this.bindingSlot.set(binding.id, index);
    return index;
  }

  hasSlotFor(binding: Binding): boolean {
    return this.bindingSlot.has(binding.id);
  }

  cellFor(binding: Binding): number {
    const found = this.bindingCell.get(binding.id);
    if (found !== undefined) return found;
    const index = this.cellNames.length;
    this.cellNames.push(binding.name);
    this.cellKinds.push(binding.persistence === 'live' ? 'live' : 'var');
    this.bindingCell.set(binding.id, index);
    return index;
  }

  hasCellFor(binding: Binding): boolean {
    return this.bindingCell.has(binding.id);
  }

  /** A per-call-site region for a stateful library call, relative to the base. */
  state(libraryFunction: number): number {
    const index = this.stateFns.length;
    this.stateFns.push(libraryFunction);
    return index;
  }

  get slotCount(): number {
    return this.slotNames.length;
  }
}

/**
 * The tables that are one per program rather than one per frame.
 *
 * A register, a channel and a library function entry are addressed the same way
 * from every frame, which is what lets a function body read a series and write
 * a plot column without knowing where it was called from.
 */
export class Layout {
  readonly registers: Register[] = [];
  readonly channels: Channel[] = [];
  readonly channelNames: string[] = [];

  private readonly barFields = new Map<string, number>();
  private readonly bindingRegister = new Map<number, number>();

  /** The register the engine fills from the host's bar, 2.10. One per field. */
  bar(field: string): number {
    const found = this.barFields.get(field);
    if (found !== undefined) return found;
    const id = this.registers.length;
    this.registers.push({ id, kind: 'bar', field, name: field });
    this.barFields.set(field, id);
    return id;
  }

  /** A top-level name whose history the program reads, written by `SSTORE`. */
  computedFor(binding: Binding): number {
    const found = this.bindingRegister.get(binding.id);
    if (found !== undefined) return found;
    const id = this.computed(binding.name);
    this.bindingRegister.set(binding.id, id);
    return id;
  }

  hasComputedFor(binding: Binding): boolean {
    return this.bindingRegister.has(binding.id);
  }

  registerFor(binding: Binding): number | undefined {
    return this.bindingRegister.get(binding.id);
  }

  computed(name: string): number {
    const id = this.registers.length;
    this.registers.push({ id, kind: 'computed', field: null, name });
    return id;
  }

  /** A series argument retained for one call site, 2.10 and 4.10. */
  argument(name: string): number {
    const id = this.registers.length;
    this.registers.push({ id, kind: 'argument', field: null, name });
    return id;
  }

  channel(
    type: Channel['type'],
    defer: boolean,
    once: boolean,
    name: string,
  ): number {
    const id = this.channels.length;
    this.channels.push({ id, type, defer, once });
    this.channelNames.push(name);
    return id;
  }
}

/** The cells of one frame, as the program's `cells[]` carries them. */
export function cellsOf(frame: FrameLayout, base: number): Cell[] {
  return frame.cellKinds.map((kind, index) => ({
    id: base + index,
    kind,
    name: frame.cellNames[index] ?? null,
  }));
}
