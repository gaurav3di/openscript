/**
 * The interpreter: step 6 of the bar cycle, and the whole architecture of the
 * language in one loop.
 *
 * **It walks a list. There is no `eval`, no generated function and no code
 * built from text anywhere in it**, which is what lets the language run inside
 * an application under a content security policy that forbids turning text into
 * code, and what lets a platform run many customers' scripts in one process.
 * The compiler emits data and this walks it; that is the foundation of the
 * whole design rather than a preference.
 *
 * **What verification already proved, this does not re-check.** A verified
 * program cannot underflow the stack, cannot jump out of bounds, cannot address
 * a slot that does not exist and cannot loop without charging the budget (3.5).
 * So the loop below pops without testing for an empty stack and indexes without
 * testing a bound, and every remaining failure is a script error with a source
 * position, which is the only kind of failure a user should ever see.
 *
 * **The budget is checked on the path every instruction takes.** One increment
 * and one comparison, because the alternative is a loop an engine hopes will
 * end. The loop budget itself is charged by `TICK` and by nothing else, so two
 * engines run out at the same iteration of the same loop on the same bar (8.5).
 */
import type { Span } from '../span/index.js';
import {
  add,
  and,
  compare,
  divide,
  equals,
  isFalsey,
  multiply,
  negate,
  not,
  or,
  remainder,
  subtract,
} from './arithmetic.js';
import type { Budget } from './budget.js';
import type { Channels } from './channels.js';
import type { Frame } from './frames.js';
import { makeFrame, positionAt } from './frames.js';
import type {
  BarView,
  CallContext,
  Guard,
  HostFacts,
  ManifestEntry,
  PositionFacts,
  StateRecord,
} from './library/index.js';
import type { Memory } from './memory.js';
import {
  constantValueOf,
  elementRead,
  forInit,
  forNext,
  historyRead,
  nameOf,
} from './operations.js';
import type { Ops } from './operations.js';
import type { Registers } from './registers.js';
import type { CompiledProgram, Instruction, Position } from './types.js';
import type { Heap, Value } from './values/index.js';
import { ABSENT, reference } from './values/index.js';

/** Everything the interpreter is handed once, at load. */
export interface MachineParts {
  readonly program: CompiledProgram;
  readonly registers: Registers;
  readonly memory: Memory;
  readonly channels: Channels;
  readonly heap: Heap;
  readonly budget: Budget;
  readonly guard: Guard;
  readonly host: HostFacts;
  /** The strategy's own position, read from the run's ledger. */
  readonly position: PositionFacts;
  /** The library entry behind each `lib.functions` index, resolved at load. */
  readonly library: readonly ManifestEntry[];
  /** The position table of each function body, by function index. */
  readonly fnPositions: readonly (readonly Position[])[];
  spanAt(line: number, column: number): Span;
}

/**
 * The region a stateless call is handed.
 *
 * Shared rather than allocated per call, because an entry declared without
 * state never touches it and an allocation on the path of every `max` and every
 * colour would be the engine's largest per bar cost for nothing.
 */
const NO_STATE: StateRecord = {};

/**
 * The reused call context.
 *
 * `CallContext` declares `state` read-only, because a library call is handed a
 * region rather than choosing one. The machine is the one place that sets it,
 * so it holds the same object through a type that can.
 */
interface MutableContext extends Omit<CallContext, 'state'> {
  state: StateRecord;
}

export class Machine {
  private readonly parts: MachineParts;
  private readonly top: Frame;
  private readonly callers: Frame[] = [];
  private frame: Frame;
  private view: BarView;
  private barIndex = 0;
  /** The loop whose `TICK` executed most recently, for OS5001's line. */
  private lastLoop = -1;
  /**
   * The value a top level `RET` handed back, `compiled-program.md` 2.16.1.
   *
   * A program's own `code` ends in `HALT` and produces nothing, so this stays
   * absent for it. A request body ends in `RET` and its value is the read's
   * value for that requested bar, which is the one thing the interpreter has to
   * hand out rather than write into a register or a channel.
   */
  private returned: Value = ABSENT;
  private readonly ctx: MutableContext;
  private readonly ops: Ops;

  constructor(parts: MachineParts, view: BarView) {
    this.parts = parts;
    this.view = view;
    const { program } = parts;
    this.top = makeFrame(program.code, program.frame.slots, 0, 0, [], program.debug.pos);
    this.frame = this.top;
    this.ops = this.operations();

    // One context, reused by every call, with the two fields that change per
    // call read through getters. A fresh object per `CALL_LIB` would be an
    // allocation on the hottest path in the engine, and the span is a binary
    // search that most calls never ask for.
    const machine = this;
    this.ctx = {
      heap: parts.heap,
      host: parts.host,
      position: parts.position,
      guard: parts.guard,
      state: NO_STATE,
      get span(): Span {
        return machine.here();
      },
      get bar(): BarView {
        return machine.view;
      },
      nameOf: (value: Value): string => machine.nameOf(value),
    };
  }

  /** Step 3: the stack, the slots and the frame stack all start empty. */
  begin(view: BarView, index: number): void {
    this.view = view;
    this.barIndex = index;
    this.lastLoop = -1;
    this.returned = ABSENT;
    this.callers.length = 0;
    this.frame = this.top;
    this.top.pc = 0;
    this.top.stack.length = 0;
    this.top.slots.fill(ABSENT);
  }

  /** What the last `run` handed back, for an instruction list that ends in `RET`. */
  result(): Value {
    return this.returned;
  }

  /** The slot array of frame 0, which inputs and grids are written into. */
  slots(): Value[] {
    return this.top.slots;
  }

  /** Where the instruction that just executed came from. */
  here(): Span {
    const at = positionAt(this.frame.positions, Math.max(this.frame.pc - 1, 0));
    return this.parts.spanAt(at.line, at.column);
  }

  /**
   * Runs the bar.
   *
   * The dispatch is a switch over the opcode name. A name rather than a number
   * is what the format carries (2.14) so that a program is readable and
   * diffable by hand; an engine may map names to its own integers at load and
   * must not depend on any numbering, because none is defined.
   */
  run(): void {
    const { budget, channels, memory, registers, heap } = this.parts;
    for (;;) {
      if (budget.step()) budget.overrun(this.here(), this.loopLine());
      const frame = this.frame;
      const instruction = frame.code[frame.pc] as Instruction;
      frame.pc += 1;
      const stack = frame.stack;

      switch (instruction[0]) {
        case 'CONST':
          stack.push(constantValueOf(this.parts.program.consts[instruction[1] as number]));
          break;
        case 'DUP':
          stack.push(stack[stack.length - 1] ?? ABSENT);
          break;
        case 'POP':
          stack.pop();
          break;
        case 'LOAD':
          stack.push(frame.slots[instruction[1] as number] ?? ABSENT);
          break;
        case 'STORE':
          frame.slots[instruction[1] as number] = pop(stack);
          break;
        case 'CELL_INIT':
          if (memory.initialise(frame.cellBase + (instruction[1] as number))) {
            frame.pc = instruction[2] as number;
          }
          break;
        case 'LOADC':
          stack.push(memory.load(frame.cellBase + (instruction[1] as number)));
          break;
        case 'STOREC':
          memory.store(frame.cellBase + (instruction[1] as number), pop(stack));
          break;
        case 'SLOAD':
          stack.push(registers.get(instruction[1] as number));
          break;
        case 'SSTORE':
          registers.set(instruction[1] as number, pop(stack));
          break;
        case 'HIST':
          stack.push(historyRead(this.ops, instruction[1] as number, pop(stack)));
          break;
        case 'HISTP':
          stack.push(historyRead(this.ops, frame.series[instruction[1] as number] ?? -1, pop(stack)));
          break;
        case 'ADD':
          stack.push(this.joined(stack));
          break;
        case 'SUB':
          stack.push(binary(stack, subtract));
          break;
        case 'MUL':
          stack.push(binary(stack, multiply));
          break;
        case 'DIV':
          stack.push(binary(stack, divide));
          break;
        case 'MOD':
          stack.push(binary(stack, remainder));
          break;
        case 'NEG':
          stack.push(negate(pop(stack)));
          break;
        case 'LT':
        case 'LE':
        case 'GT':
        case 'GE': {
          const b = pop(stack);
          stack.push(compare(instruction[0], pop(stack), b));
          break;
        }
        case 'EQ': {
          const b = pop(stack);
          stack.push(equals(pop(stack), b));
          break;
        }
        case 'NE': {
          const b = pop(stack);
          stack.push(!equals(pop(stack), b));
          break;
        }
        case 'NOT':
          stack.push(not(pop(stack)));
          break;
        case 'AND':
          stack.push(binary(stack, and));
          break;
        case 'OR':
          stack.push(binary(stack, or));
          break;
        case 'AND_SHORT':
          if (stack[stack.length - 1] === false) frame.pc = instruction[1] as number;
          break;
        case 'OR_SHORT':
          if (stack[stack.length - 1] === true) frame.pc = instruction[1] as number;
          break;
        case 'JUMP':
          frame.pc = instruction[1] as number;
          break;
        case 'JUMP_FALSE':
          if (isFalsey(pop(stack))) frame.pc = instruction[1] as number;
          break;
        case 'TICK': {
          const loop = instruction[1] as number;
          this.lastLoop = loop;
          budget.tick(this.here(), this.parts.program.loops[loop]?.line ?? 0);
          break;
        }
        case 'FOR_INIT':
          forInit(this.ops, instruction, frame);
          break;
        case 'FOR_NEXT':
          forNext(instruction, frame);
          break;
        case 'ARRAY': {
          const count = instruction[1] as number;
          const items = stack.splice(stack.length - count, count);
          this.parts.guard.array(this.here(), 'the array', items.length);
          stack.push(reference(heap.allocate({ kind: 'array', items })));
          break;
        }
        case 'ELEM': {
          const index = pop(stack);
          stack.push(elementRead(this.ops, pop(stack), index));
          break;
        }
        case 'CALL_LIB':
          this.callLibrary(instruction, stack);
          break;
        case 'CALL_FN':
          this.callFunction(instruction[1] as number, stack);
          break;
        case 'RET': {
          const value = pop(stack);
          const caller = this.callers.pop();
          if (caller === undefined) {
            this.returned = value;
            return;
          }
          this.frame = caller;
          caller.stack.push(value);
          break;
        }
        case 'EMIT':
          channels.write(instruction[1] as number, pop(stack));
          break;
        case 'HALT':
          return;
        default:
          // Unreachable in a verified program: check 2 refused every opcode
          // this switch does not have an arm for.
          throw new Error(`${String(instruction[0])} is not an instruction`);
      }
    }
  }

  private loopLine(): number | undefined {
    if (this.lastLoop < 0) return undefined;
    return this.parts.program.loops[this.lastLoop]?.line;
  }

  /** What the operations in `operations.ts` need, built once. */
  private operations(): Ops {
    const machine = this;
    return {
      program: this.parts.program,
      registers: this.parts.registers,
      memory: this.parts.memory,
      heap: this.parts.heap,
      slots: this.top.slots,
      here: () => machine.here(),
      barIndex: () => machine.barIndex,
    };
  }

  /** `ADD` with the string ceiling applied, since it is the one that grows one. */
  private joined(stack: Value[]): Value {
    const b = pop(stack);
    const value = add(pop(stack), b);
    return typeof value === 'string' ? this.parts.guard.string(this.here(), value) : value;
  }

  /**
   * `CALL_LIB`.
   *
   * A call whose manifest entry carries an effect does not perform it: it
   * appends a record holding the function index and the argument values as they
   * stood, and pushes absent. The machine does that here rather than in the
   * entry, so an effect cannot be forgotten by whoever writes the next one.
   */
  private callLibrary(instruction: Instruction, stack: Value[]): void {
    const index = instruction[1] as number;
    const count = instruction[2] as number;
    const state = instruction[3] as number;
    const args = stack.splice(stack.length - count, count);
    const of = this.parts.library[index] as ManifestEntry;

    if (of.effect !== 'none') {
      this.parts.channels.defer({ fn: index, name: of.name, effect: of.effect, args });
      stack.push(ABSENT);
      return;
    }

    this.ctx.state =
      state < 0 ? NO_STATE : this.parts.memory.region(this.frame.stateBase + state);
    stack.push(of.call(this.ctx, args));
  }

  /** `CALL_FN`: everything it needs is in the call site, 4.10. */
  private callFunction(site: number, stack: Value[]): void {
    const { program, fnPositions } = this.parts;
    const call = program.callSites[site];
    if (call === undefined) return;
    const target = program.functions[call.fn];
    if (target === undefined) return;
    const args = stack.splice(stack.length - call.argc, call.argc);
    const frame = makeFrame(
      target.code,
      target.slots,
      call.cellBase,
      call.stateBase,
      call.series,
      fnPositions[call.fn] ?? [],
    );
    for (let i = 0; i < args.length; i += 1) frame.slots[i] = args[i] ?? ABSENT;
    this.callers.push(this.frame);
    this.frame = frame;
  }

  /** The name a value goes by, which a library call asks for by the same route. */
  nameOf(value: Value): string {
    return nameOf(this.ops, value);
  }
}

/** The stack cannot be empty here: the verifier's depth walk proved it. */
function pop(stack: Value[]): Value {
  return stack.pop() ?? ABSENT;
}

function binary(stack: Value[], of: (a: Value, b: Value) => Value): Value {
  const b = pop(stack);
  return of(pop(stack), b);
}
