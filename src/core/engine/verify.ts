/**
 * Load-time verification, `compiled-program.md` 3.5, and the refusals a host
 * makes beside it.
 *
 * Before executing a single bar an engine must verify the program. What is
 * bought by doing it here rather than discovering a problem halfway through a
 * bar is stated in the specification and is the reason the interpreter is as
 * plain as it is: a verified program cannot underflow the stack, cannot jump
 * out of bounds, cannot address a slot that does not exist and cannot loop
 * without charging the budget. Every remaining failure is a script error with a
 * source position, which is the only kind of failure a user should ever see.
 *
 * Four refusals that are not verification sit here too, because they happen at
 * the same moment and for the same reason: a version this engine does not
 * implement (OS6016, OS6017), a capability it does not have (OS6006), a library
 * entry that disagrees with its manifest (OS6004), and a budget the host is not
 * willing to spend (OS5003, OS5004, OS5005, OS5009). Each names what it refused
 * and the value it allows, and none of them silently caps anything: a program
 * that quietly gets a smaller budget than it asked for produces a wrong number
 * instead of a message.
 */
import { COMPILED_FORMAT_VERSION } from '../version/index.js';
import type { Diagnostic } from '../diagnostics/index.js';
import type { EngineLimits } from './budget.js';
import { NO_POSITION, failure } from './errors.js';
import { manifestEntry, manifestSays } from './library/index.js';
import type { CompiledProgram, Instruction } from './types.js';
import { checkList, checkOnce } from './verify-code.js';
import type { ListLimits } from './verify-code.js';
import { ShapeCheck } from './verify-shape.js';
import { checkTables } from './verify-tables.js';

/** The language versions whose library semantics this engine implements. */
export const LANGUAGE_VERSIONS: readonly number[] = [1];

/**
 * What this engine can do, as the tags of 2.2.
 *
 * `orders` is not here. The engine turns an order call into a pending effect
 * and hands it to whatever route the host supplied, so the capability belongs
 * to the configuration rather than to the engine, and `capabilitiesFor` adds it
 * when a route exists. The two request tags are absent because the compiled
 * format carries no form that could hold a request expression.
 */
const ENGINE_CAPABILITIES: readonly string[] = [
  'core.1',
  'arrays',
  'functions',
  'loops',
  'objects',
  'tables',
  'alerts',
];

export function capabilitiesFor(hasOrderRoute: boolean): readonly string[] {
  return hasOrderRoute ? [...ENGINE_CAPABILITIES, 'orders'] : ENGINE_CAPABILITIES;
}

export interface VerifyOptions {
  readonly capabilities: readonly string[];
  readonly limits: EngineLimits;
}

export type VerifyResult =
  | { readonly ok: true; readonly program: CompiledProgram }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

/** Which instruction needs which tag, the part of check 8 the program decides. */
const INSTRUCTION_TAGS: Readonly<Record<string, string>> = {
  ARRAY: 'arrays',
  ELEM: 'arrays',
  CALL_FN: 'functions',
  TICK: 'loops',
};

export function verify(raw: unknown, options: VerifyOptions): VerifyResult {
  const shape = new ShapeCheck();
  const refused = (diagnostic: Diagnostic): VerifyResult => ({ ok: false, diagnostic });
  const broken = (): VerifyResult =>
    refused(shape.problem() ?? failure('OS6018', NO_POSITION, {
      location: 'the program',
      reason: 'it is not a compiled program',
    }));

  if (!shape.object(raw, 'the program')) return broken();

  const version = raw['openscript'];
  if (!shape.object(version, 'openscript')) return broken();
  if (!shape.string(version['format'], 'openscript.format')) return broken();
  if (!shape.whole(version['language'], 'openscript.language')) return broken();
  if (version['format'] !== COMPILED_FORMAT_VERSION) {
    return refused(
      failure('OS6016', NO_POSITION, {
        found: version['format'],
        max: COMPILED_FORMAT_VERSION,
      }),
    );
  }
  if (!LANGUAGE_VERSIONS.includes(version['language'])) {
    return refused(
      failure('OS6017', NO_POSITION, {
        found: version['language'],
        versions: LANGUAGE_VERSIONS.join(', '),
      }),
    );
  }

  if (!checkTables(shape, raw)) return broken();
  const program = raw as unknown as CompiledProgram;

  // Check 8, the program's half: a tag it declared that this engine lacks.
  for (const tag of program.requires) {
    if (!options.capabilities.includes(tag)) {
      return refused(failure('OS6006', NO_POSITION, { tag }));
    }
  }

  const sizes = tableSizes(program);
  if (!checkList(shape, 'code', program.code, sizes, 'HALT')) return broken();
  for (let f = 0; f < program.functions.length; f += 1) {
    const body = program.functions[f]?.code ?? [];
    if (!checkList(shape, `functions[${f}]`, body, bodySizes(sizes, program, f), 'RET')) {
      return broken();
    }
  }
  if (!checkOnce(shape, program.code, program.channels.map((one) => one.once))) return broken();

  const missing = missingTag(program);
  if (missing !== undefined) {
    return refused(
      failure('OS6018', NO_POSITION, {
        location: 'requires',
        reason: `the program uses ${missing.opcode} and does not declare ${missing.tag}`,
      }),
    );
  }

  const library = checkLibrary(program);
  if (library !== undefined) return refused(library);

  const budget = checkBudgets(program, options.limits);
  if (budget !== undefined) return refused(budget);

  return { ok: true, program };
}

/** Check 9: every `lib.functions` entry agrees with this engine's manifest. */
function checkLibrary(program: CompiledProgram): Diagnostic | undefined {
  for (let index = 0; index < program.lib.functions.length; index += 1) {
    const entry = program.lib.functions[index];
    if (entry === undefined) continue;
    const mine = manifestEntry(entry.name, entry.arity);
    if (mine === undefined) {
      return failure('OS6004', NO_POSITION, {
        index,
        name: entry.name,
        arity: entry.arity,
        manifest: manifestSays(entry.name),
      });
    }
    if (mine.state !== entry.state || mine.effect !== entry.effect) {
      return failure('OS6004', NO_POSITION, {
        index,
        name: entry.name,
        arity: entry.arity,
        manifest: `${entry.name} holding state ${String(mine.state)} with effect ${mine.effect}`,
      });
    }
  }
  return undefined;
}

/**
 * The ceilings a host is willing to spend, none of them silently applied.
 *
 * 2.4: a host refuses at load, naming the limit and the value it allows, and
 * must not silently cap the value, because a program that quietly gets a
 * smaller budget than it asked for produces a wrong number instead of a
 * message.
 */
function checkBudgets(program: CompiledProgram, limits: EngineLimits): Diagnostic | undefined {
  if (limits.loops !== null && program.limits.loops > limits.loops) {
    return failure('OS5003', NO_POSITION, {
      option: 'loops',
      max: limits.loops,
      found: program.limits.loops,
    });
  }
  const history = program.limits.history;
  if (limits.history !== null && history !== null && history > limits.history) {
    return failure('OS5003', NO_POSITION, {
      option: 'history',
      max: limits.history,
      found: history,
    });
  }
  if (limits.instructions !== null) {
    let found = program.code.length;
    for (const one of program.functions) found += one.code.length;
    if (found > limits.instructions) {
      return failure('OS5009', NO_POSITION, { found, max: limits.instructions });
    }
  }
  if (limits.states !== null && program.states.length > limits.states) {
    const [first, second] = busiestPair(program);
    return failure('OS5004', NO_POSITION, {
      found: program.states.length,
      max: limits.states,
      first,
      second,
    });
  }
  const depth = callDepth(program);
  if (depth > limits.frames) {
    return failure('OS5005', NO_POSITION, {
      construct: 'a call',
      found: depth,
      max: limits.frames,
    });
  }
  return undefined;
}

/**
 * The two functions whose nesting produced the most call paths.
 *
 * OS5004's message names them because the number of paths grows
 * multiplicatively where several functions each call the next more than once,
 * and a reader who is told only the total has nowhere to start. The pair with
 * the most call sites between them is where the multiplication happened.
 */
function busiestPair(program: CompiledProgram): readonly [string, string] {
  const counts = new Map<string, number>();
  const lists: readonly (readonly [string, readonly Instruction[]])[] = [
    ['the top level', program.code],
    ...program.functions.map(
      (one) => [one.name, one.code] as readonly [string, readonly Instruction[]],
    ),
  ];
  for (const [caller, code] of lists) {
    for (const instruction of code) {
      if (instruction[0] !== 'CALL_FN') continue;
      const site = program.callSites[instruction[1] as number];
      const callee = site === undefined ? undefined : program.functions[site.fn]?.name;
      if (callee === undefined) continue;
      const key = `${caller}\u0000${callee}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let best: readonly [string, string] = ['the top level', 'the functions it calls'];
  let most = 0;
  // Sorted before the walk, so the answer does not depend on a map's order.
  for (const key of [...counts.keys()].sort()) {
    const count = counts.get(key) ?? 0;
    if (count <= most) continue;
    const [caller, callee] = key.split('\u0000');
    best = [caller ?? '', callee ?? ''];
    most = count;
  }
  return best;
}

/**
 * The deepest chain of call sites, which is the deepest the frame stack goes.
 *
 * Recursion is an error in the language, so the call graph is acyclic and the
 * walk terminates; the visited set is a guard against a program that was
 * written by something other than this compiler, and it stops rather than
 * looping forever.
 */
function callDepth(program: CompiledProgram): number {
  const bodies = program.functions.map((one) => one.code);
  const sitesIn = (code: readonly Instruction[]): number[] =>
    code.flatMap((one) => (one[0] === 'CALL_FN' && typeof one[1] === 'number' ? [one[1]] : []));

  const known = new Map<number, number>();
  const walking = new Set<number>();
  const depthOf = (site: number): number => {
    const cached = known.get(site);
    if (cached !== undefined) return cached;
    if (walking.has(site)) return 1;
    walking.add(site);
    const fn = program.callSites[site]?.fn;
    const body = fn === undefined ? undefined : bodies[fn];
    let deepest = 0;
    for (const inner of body === undefined ? [] : sitesIn(body)) {
      deepest = Math.max(deepest, depthOf(inner));
    }
    walking.delete(site);
    known.set(site, deepest + 1);
    return deepest + 1;
  };

  let deepest = 0;
  for (const site of sitesIn(program.code)) deepest = Math.max(deepest, depthOf(site));
  return deepest + 1;
}

/** Check 8's other half: an instruction whose tag the program did not declare. */
function missingTag(
  program: CompiledProgram,
): { readonly opcode: string; readonly tag: string } | undefined {
  const lists = [program.code, ...program.functions.map((one) => one.code)];
  for (const code of lists) {
    for (const instruction of code) {
      const tag = INSTRUCTION_TAGS[instruction[0]];
      if (tag !== undefined && !program.requires.includes(tag)) {
        return { opcode: instruction[0], tag };
      }
    }
  }
  return undefined;
}

function tableSizes(program: CompiledProgram): ListLimits {
  return {
    slots: program.frame.slots,
    cells: program.cells.length,
    states: program.states.length,
    registers: program.series.length,
    channels: program.channels.length,
    libFunctions: program.lib.functions.length,
    callSites: program.callSites.length,
    loops: program.loops.length,
    consts: program.consts.length,
    series: 0,
    argcOf: (site: number) => program.callSites[site]?.argc ?? 0,
  };
}

/**
 * The sizes inside a function body.
 *
 * A body's slots are its own frame's, and a `HISTP` indexes the series bindings
 * of whichever call site reached it. Every site that calls this function has to
 * bind the same number, because the operand is fixed in the body, so the
 * smallest binding list is the one that decides what is in range.
 */
function bodySizes(base: ListLimits, program: CompiledProgram, fn: number): ListLimits {
  let series = 0;
  for (const site of program.callSites) {
    if (site.fn === fn) series = series === 0 ? site.series.length : Math.min(series, site.series.length);
  }
  return { ...base, slots: program.functions[fn]?.slots ?? 0, series };
}
