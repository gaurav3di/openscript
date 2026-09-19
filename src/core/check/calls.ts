/**
 * Resolving a call: which signature it means, whether what was written fits it,
 * and what comes back.
 *
 * The arguments have already been checked as expressions by the time this runs,
 * so everything here reads their recorded types and warmups. That is what keeps
 * this file out of a cycle with the expression pass, and it is also the order
 * a reader expects: the inner expressions are wrong or they are not, before
 * anything asks whether they fit the call.
 *
 * Overload resolution is by arity and then by argument type, which is the whole
 * of `stdlib.md` 2.2. It happens once, here, and there is no run-time dispatch.
 */
import type { Argument, Call } from '../ast/index.js';
import { withoutGrouping } from '../ast/index.js';
import { bindArguments, arityText, signatureText } from './arguments.js';
import type { ParameterShape } from './arguments.js';
import type { Checker, Placement } from './checker.js';
import { reportStrategyOnly } from './checker.js';
import type { CheckedCall } from './checked.js';
import { isCompileTimeConstant } from './constant.js';
import { refuseHandle } from './handles.js';
import type { LibraryEntry } from './library.js';
import { literalNumber, literalString } from './literals.js';
import { recordOutput, reportCallWarnings } from './outputs.js';
import { isTopLevelOnly, libraryEntries } from './surface.js';
import { closestName } from './suggest.js';
import type { Type } from './types.js';
import { NOTHING, UNKNOWN, accepts, elementOf, isHandle, typeText } from './types.js';
import type { Warmup } from './warmup.js';
import { BAR_ZERO, allOf, delayed, earlier, weaken } from './warmup.js';

/** The calls whose first argument is an array that an empty literal may fill. */
const INSERTERS = new Set(['push', 'unshift', 'insert', 'set']);

function shapesOf(entry: LibraryEntry): readonly ParameterShape[] {
  return entry.parameters.map((one) => ({ name: one.name, optional: one.optional }));
}

/**
 * The signature a call means.
 *
 * With one candidate there is nothing to choose. With several, arity decides
 * first because it is the cheaper test and it separates most of the library's
 * overloads on its own; where two signatures take the same count, the written
 * positional arguments decide, which is `stdlib.md` 2.2's second rule.
 */
function selectOverload(
  checker: Checker,
  call: Call,
  entries: readonly LibraryEntry[],
): LibraryEntry | undefined {
  const callable = entries.filter((one) => one.callable);
  const first = callable[0];
  if (first === undefined || callable.length === 1) return first;

  const given = call.args.length;
  const byArity = callable.filter((one) => {
    const required = one.parameters.filter((p) => !p.optional).length;
    return given >= required && given <= one.parameters.length;
  });
  const narrowed = byArity.length === 0 ? callable : byArity;
  const only = narrowed[0];
  if (only === undefined || narrowed.length === 1) return only;

  const byType = narrowed.find((one) =>
    call.args.every((argument, index) => {
      if (argument.label !== undefined) return true;
      const parameter = one.parameters[index];
      return parameter === undefined || accepts(parameter.type, checker.typeOf(argument.value));
    }),
  );
  return byType ?? only;
}

/** Binds the stand-ins of a signature to the types the call actually supplied. */
function bindVariables(
  checker: Checker,
  entry: LibraryEntry,
  filled: readonly (Argument | undefined)[],
): Map<string, Type> {
  const bound = new Map<string, Type>();

  const remember = (name: string, type: Type): void => {
    const existing = bound.get(name);
    if (existing === undefined || existing.kind === 'none' || existing.kind === 'unknown') {
      bound.set(name, type);
    }
  };

  for (let i = 0; i < entry.parameters.length; i += 1) {
    const parameter = entry.parameters[i];
    const argument = filled[i];
    if (parameter === undefined || argument === undefined) continue;
    // A stand-in binds to the type it was given, and a declaration handle is
    // the one type it must not carry: a signature that returned one would hand
    // a name a handle the emitter has no declaration for (`language.md` 5.4).
    // `validateArguments` reports it; this keeps the result out of the tree.
    const supplied = checker.typeOf(argument.value);
    const given = supplied.kind === 'handle' ? UNKNOWN : supplied;
    const wanted = parameter.type;
    if (wanted.kind === 'variable') remember(wanted.name, given);
    else if (wanted.kind === 'array' && wanted.element.kind === 'variable') {
      const element = elementOf(given);
      if (element.kind === 'array') remember(wanted.element.name, element.element);
    }
  }

  return bound;
}

/**
 * Whether a parameter is written to take whatever it is given.
 *
 * A stand-in (`orElse(x: T, fallback: T)`) and `any` (`text(x: any)`) both name
 * no type, so a handle in one of them has no declared type to be named against
 * and OS3011 would have nothing to put in its sentence. What is true of both is
 * that they take a value, which is the answer OS2003 gives.
 */
function takesAnyValue(type: Type): boolean {
  switch (type.kind) {
    case 'variable':
    case 'unknown':
      return true;
    case 'array':
    case 'series':
      return takesAnyValue(type.element);
    default:
      return false;
  }
}

function substitute(type: Type, bound: ReadonlyMap<string, Type>): Type {
  switch (type.kind) {
    case 'variable':
      return bound.get(type.name) ?? UNKNOWN;
    case 'array':
      return { kind: 'array', element: substitute(type.element, bound) };
    case 'series':
      return { kind: 'series', element: substitute(type.element, bound) };
    default:
      return type;
  }
}

/**
 * The first bar this call can produce a value for.
 *
 * Every rule but `total` and `argument` composes with the arguments' own
 * warmups, which is what makes `sma(ema(close, 10), 10)` absent until bar 18
 * rather than until bar 9. A length that is not written out as a number is a
 * length the checker does not have, so the answer becomes a floor.
 */
function warmupOfCall(
  checker: Checker,
  entry: LibraryEntry,
  filled: readonly (Argument | undefined)[],
): Warmup {
  const argumentWarmup = (name: string): Warmup | undefined => {
    const index = entry.parameters.findIndex((one) => one.name === name);
    const argument = index < 0 ? undefined : filled[index];
    return argument === undefined ? undefined : checker.warmupOf(argument.value);
  };

  const supplied = filled.filter((one): one is Argument => one !== undefined);
  const base = allOf(supplied.map((one) => checker.warmupOf(one.value)));
  const rule = entry.warmup;

  switch (rule.kind) {
    case 'total':
      return BAR_ZERO;
    case 'argument':
      return argumentWarmup(rule.param) ?? BAR_ZERO;
    case 'either': {
      const present = rule.params
        .map(argumentWarmup)
        .filter((one): one is Warmup => one !== undefined);
      return present.length === 0 ? BAR_ZERO : present.reduce(earlier);
    }
    case 'data':
      return weaken(base);
    case 'delay':
      return delayed(base, rule.bars);
    case 'params': {
      let total = 0;
      let known = rule.exact;
      for (const name of rule.params) {
        const index = entry.parameters.findIndex((one) => one.name === name);
        const argument = index < 0 ? undefined : filled[index];
        const value = argument === undefined ? undefined : literalNumber(argument.value);
        if (value === undefined) known = false;
        else total += value;
      }
      return known
        ? delayed(base, rule.scale * total + rule.add)
        : weaken(delayed(base, rule.add));
    }
  }
}

/** Every argument against the parameter it filled: type, value set, range, constancy. */
export function validateArguments(
  checker: Checker,
  entry: LibraryEntry,
  filled: readonly (Argument | undefined)[],
  bound: ReadonlyMap<string, Type>,
): void {
  for (let i = 0; i < entry.parameters.length; i += 1) {
    const parameter = entry.parameters[i];
    const argument = filled[i];
    if (parameter === undefined || argument === undefined) continue;

    const expected = substitute(parameter.type, bound);
    const given = checker.typeOf(argument.value);
    const span = argument.span;

    if (given.kind === 'nothing') {
      checker.report('OS2003', span, {
        leftType: typeText(expected),
        rightType: typeText(NOTHING),
      });
    } else if (entry.name === 'fill' && (i === 0 || i === 1)) {
      // `unknown` is what an expression already reported about carries, and it
      // satisfies everything, so a band drawn to a name whose own line was
      // refused does not collect a second diagnostic about the same mistake.
      if (given.kind !== 'unknown' && (given.kind !== 'handle' || given.handle !== 'plot')) {
        checker.report('OS3020', span, {
          argument: parameter.name,
          found: typeText(given),
        });
      }
    } else if (isHandle(given) && parameter.type.kind !== 'handle') {
      // `fill` is the one signature in version 1 that declares a handle
      // parameter, and it is answered above. Every other parameter takes a
      // value, including a stand-in, which binds to whatever it is given and
      // would otherwise carry a handle into a call that has no way to hold one.
      if (takesAnyValue(parameter.type)) {
        refuseHandle(checker, argument.value, given);
      } else if (expected.kind === 'object') {
        checker.report('OS3019', span, {
          name: entry.name,
          argument: parameter.name,
          expected: typeText(expected),
          found: typeText(given),
        });
      } else {
        checker.report('OS3011', span, {
          name: entry.name,
          argument: parameter.name,
          expected: typeText(expected),
          found: typeText(given),
        });
      }
    } else if (!accepts(expected, given)) {
      checker.report('OS3011', span, {
        name: entry.name,
        argument: parameter.name,
        expected: typeText(expected),
        found: typeText(given),
      });
    }

    const allowed = entry.values[parameter.name];
    const written = literalString(argument.value);
    if (allowed !== undefined && written !== undefined && !allowed.includes(written)) {
      checker.report('OS3008', span, {
        argument: parameter.name,
        values: allowed.join(', '),
        found: written,
        suggestion: closestName(written, allowed),
      });
    }

    const range = entry.whole[parameter.name];
    const value = range === undefined ? undefined : literalNumber(argument.value);
    if (range !== undefined && value !== undefined && !inRange(value, range.min, range.max)) {
      checker.report('OS3004', span, {
        name: entry.name,
        argument: parameter.name,
        range: range.text,
        found: value,
      });
    }

    if (entry.constant.includes(parameter.name) && !isCompileTimeConstant(checker, argument.value)) {
      checker.report('OS3003', span, { option: parameter.name });
    }
  }

  reportConflicts(checker, entry, filled);
}

/**
 * OS3010: two arguments that state one thing two ways.
 *
 * Reconciling them would need a rule, and every rule anybody has proposed for
 * it surprises somebody, so both are refused and the script says which it
 * meant. The caret goes under the second of the two, which is the one the
 * reader is most likely to have added.
 */
function reportConflicts(
  checker: Checker,
  entry: LibraryEntry,
  filled: readonly (Argument | undefined)[],
): void {
  for (const [first, second] of entry.conflicts) {
    const a = filled[entry.parameters.findIndex((one) => one.name === first)];
    const b = filled[entry.parameters.findIndex((one) => one.name === second)];
    if (a === undefined || b === undefined) continue;
    checker.report('OS3010', b.span, { first, second });
  }
}

function inRange(value: number, min: number | undefined, max: number | undefined): boolean {
  if (!Number.isInteger(value)) return false;
  if (min !== undefined && value < min) return false;
  return max === undefined || value <= max;
}

/**
 * An empty array literal taking its element type from the first insertion.
 *
 * `language.md` 14.1 gives an unannotated `[]` its type from the first `push`,
 * `unshift`, `insert` or `set` in source order, and this is that moment: the
 * checker is looking at the call, it knows which name the array came from, and
 * it knows what is being put in.
 */
function fixElementType(
  checker: Checker,
  entry: LibraryEntry,
  filled: readonly (Argument | undefined)[],
): void {
  if (!INSERTERS.has(entry.name)) return;
  const target = filled[0];
  const value = filled[filled.length - 1];
  if (target === undefined || value === undefined) return;

  const reference = withoutGrouping(target.value);
  if (reference.kind !== 'nameReference') return;
  const binding = checker.lookup(reference.name);
  if (binding === undefined) return;

  const current = elementOf(binding.type);
  if (current.kind !== 'array' || current.element.kind !== 'unknown') return;

  const element = elementOf(checker.typeOf(value.value));
  if (element.kind === 'unknown' || element.kind === 'none') return;
  binding.type = { kind: 'array', element };
}

/**
 * A call to a name the library holds.
 *
 * The result is recorded whether or not anything was reported about it, because
 * every stage above this one asks the same two questions of a call site, and a
 * hole in the map would make each of them invent an answer of its own.
 */
export function resolveLibraryCall(
  checker: Checker,
  call: Call,
  name: string,
  placement: Placement,
): CheckedCall {
  const entries = libraryEntries(name);
  const entry = selectOverload(checker, call, entries);

  if (entry === undefined) {
    const held = entries[0];
    checker.report('OS2010', call.span, {
      name,
      type: held === undefined ? typeText(UNKNOWN) : typeText(held.returns),
      suggestion: checker.suggestionFor(name),
    });
    return unresolved(call, name);
  }

  if (entry.planned) {
    checker.report('OS2001', call.span, { name, suggestion: checker.suggestionFor(name) });
  }

  reportStrategyOnly(checker, name, call.span, entry.strategyOnly);
  checkPlacement(checker, call, entry, placement);

  const shapes = shapesOf(entry);
  const filled = bindArguments(checker, call.span, call.args, name, shapes);
  const bound = bindVariables(checker, entry, filled);
  validateArguments(checker, entry, filled, bound);
  fixElementType(checker, entry, filled);

  const stateful = entry.stateful;
  if (stateful && placement.branched) {
    checker.report('OS8001', call.span, { name });
  }

  const checked: CheckedCall = {
    call,
    name,
    target: 'library',
    entry,
    fn: undefined,
    arguments: filled,
    returns: substitute(entry.returns, bound),
    warmup: warmupOfCall(checker, entry, filled),
    stateful,
    stateId: stateful ? checker.takeStateId() : undefined,
    seriesArguments: [],
  };
  remember(checker, checked);
  recordOutput(checker, entry, checked);
  reportCallWarnings(checker, entry, checked);
  return checked;
}

/** OS3006 and OS3007: a call that describes the file's shape, written inside it. */
function checkPlacement(
  checker: Checker,
  call: Call,
  entry: LibraryEntry,
  placement: Placement,
): void {
  if (!entry.topLevel || placement.topLevel) return;
  const construct = placement.construct ?? 'a block';
  if (entry.name === 'input') checker.report('OS3007', call.span, {});
  else if (isTopLevelOnly(entry.name)) {
    checker.report('OS3006', call.span, { name: entry.name, construct });
  }
}

export function unresolved(call: Call, name: string): CheckedCall {
  return {
    call,
    name,
    target: 'unresolved',
    entry: undefined,
    fn: undefined,
    arguments: [],
    returns: UNKNOWN,
    warmup: BAR_ZERO,
    stateful: false,
    stateId: undefined,
    seriesArguments: [],
  };
}

export function remember(checker: Checker, checked: CheckedCall): void {
  checker.calls.push(checked);
  checker.callSites.set(checked.call, checked);
}

export { arityText, signatureText };
