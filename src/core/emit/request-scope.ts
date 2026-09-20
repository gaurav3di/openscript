/**
 * One read's expression while it is being emitted, and the settings it reads.
 *
 * Its own file rather than a class inside `context.ts`, because it is not the
 * state one compile shares: it is the state of one expression compiled over
 * another instrument's bars, and the one thing that crosses the boundary
 * between the two.
 */
import type { Binding, CheckedInput } from '../check/index.js';
import { inputHeldBy } from '../check/index.js';
import type { Emitter } from './context.js';
import { inputKey } from './context.js';
import type { RequestInput } from './program.js';

/**
 * `stdlib.md` 15.4 lets an expression inside a read name a setting and nothing
 * else of the file, because a setting resolves before bar 0 and holds for the
 * run while a per-bar name has no counterpart on the requested bars. Each one
 * read here is filled into a register of the body's own table, named by
 * `inputs` on the request (2.16).
 */
export class RequestScope {
  readonly inputs: RequestInput[] = [];
  private readonly byInput = new Map<number, number>();

  /** The register a setting is filled into, or nothing when this is not one. */
  registerFor(e: Emitter, binding: Binding): number | undefined {
    const held = inputHeldBy(binding);
    if (held === undefined) return undefined;
    const input = e.checked.inputs[held];
    return input === undefined ? undefined : this.registerForInput(e, input);
  }

  /**
   * The same register for an `input()` written inside the expression itself.
   *
   * The two forms are one question. `stdlib.md` 15.4 lets a read's expression
   * name a setting because a setting resolves before bar 0 and holds for the
   * run, and that is a fact about the input rather than about whether a name
   * was put in front of it. So both resolve here, keyed by the input, and two
   * reads of one setting inside one body share one register rather than asking
   * the engine to fill the same value twice.
   */
  registerForInput(e: Emitter, input: CheckedInput): number {
    const found = this.byInput.get(input.id);
    if (found !== undefined) return found;
    const register = e.layout.filled('input', inputKey(input));
    this.byInput.set(input.id, register);
    this.inputs.push({ input: inputKey(input), series: register });
    return register;
  }
}
