/**
 * `requires`, the capability tags of `compiled-program.md` 2.2.
 *
 * Tags are the real compatibility mechanism and the version number is the
 * coarse one. A version says how new a program is; a tag says what it actually
 * needs, so an engine that implements everything except order placement runs
 * every study ever written and refuses exactly the strategies, with a message
 * naming the capability it lacks rather than "too new".
 *
 * That is also why every tag here is derived from what was emitted rather than
 * from what was written. **A compiler must emit every tag the program needs and
 * must not emit a tag it does not need**, because a spurious tag turns an engine
 * that could have run the program into an engine that refuses it.
 */
import type { LibraryEntry, Type } from '../check/index.js';
import type { Emitter } from './context.js';
import type { Instruction, Request } from './program.js';

/** The tags of format 1.0, in the order 2.2's table gives them. */
const ORDER: readonly string[] = [
  'core.1',
  'arrays',
  'functions',
  'loops',
  'orders',
  'objects',
  'tables',
  'alerts',
  'req.timeframe',
  'req.symbol',
];

const DRAWN_OBJECTS: readonly string[] = ['line', 'label', 'box', 'polyline'];

function mentionsArray(type: Type): boolean {
  if (type.kind === 'array') return true;
  if (type.kind === 'series') return mentionsArray(type.element);
  return false;
}

function isArrayFunction(entry: LibraryEntry): boolean {
  return (
    mentionsArray(entry.returns) || entry.parameters.some((one) => mentionsArray(one.type))
  );
}

function createsObject(entry: LibraryEntry): boolean {
  return entry.returns.kind === 'object' && DRAWN_OBJECTS.includes(entry.returns.object);
}

function usesArrayInstruction(lists: readonly (readonly Instruction[])[]): boolean {
  return lists.some((code) => code.some(([opcode]) => opcode === 'ARRAY' || opcode === 'ELEM'));
}

/**
 * Every instruction list in the program, the bodies of its reads included.
 *
 * A tag says what the program needs, and a read's expression is part of the
 * program: an engine that cannot run an `ELEM` cannot run one inside a read
 * either, and a tag derived from the bar's list alone would tell it otherwise.
 */
function codeOf(lists: Instruction[][], requests: readonly Request[]): void {
  for (const request of requests) {
    lists.push([...request.body.code]);
    for (const one of request.body.functions) lists.push([...one.code]);
    codeOf(lists, request.body.requests);
  }
}

function loopsIn(requests: readonly Request[]): boolean {
  return requests.some(
    (one) => one.body.loops.length > 0 || loopsIn(one.body.requests),
  );
}

export function requiresOf(e: Emitter, code: readonly Instruction[]): readonly string[] {
  const lists: Instruction[][] = [[...code], ...e.functions.map((one) => [...one.code])];
  codeOf(lists, e.requests);
  const needed = new Set<string>(['core.1']);

  if (usesArrayInstruction(lists) || e.calledEntries.some(isArrayFunction)) needed.add('arrays');
  if (e.checked.functions.length > 0) needed.add('functions');
  if (e.loops.length > 0 || loopsIn(e.requests)) needed.add('loops');
  if (e.libraryFunctions.some((one) => one.effect === 'order')) needed.add('orders');
  if (e.calledEntries.some(createsObject)) needed.add('objects');
  if (e.tables.length > 0) needed.add('tables');
  if (e.alerts.length > 0) needed.add('alerts');
  for (const request of e.checked.requests) needed.add(request.name);

  return ORDER.filter((tag) => needed.has(tag));
}
