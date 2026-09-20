/**
 * Calls: to the library, to a user function, and to the handful of names that
 * declare part of the file rather than computing anything.
 *
 * The split in this file is the one the task of emitting a program turns on. A
 * `plot` call is a fixed entry in `outputs` plus one `EMIT` per bar, and it is
 * not a function an engine calls at all. An `ema` call is a `CALL_LIB` with a
 * state region. A call to a `fn` is a `CALL_FN` naming a call site, and the
 * call site rather than the body is where that call's cells and state live.
 */
import type { Call, Expression, Member, NameReference } from '../ast/index.js';
import { withoutGrouping } from '../ast/index.js';
import type { LibraryEntry, LibraryParameter } from '../check/index.js';
import { libraryEntries } from '../check/index.js';
import { namedColour } from './colours.js';
import type { Value } from './values.js';
import type { Emitter, Frame } from './context.js';
import { calleeText } from './context.js';
import { emitExpression } from './expressions.js';
import { bodyFor } from './functions.js';
import { emitDeclarationCall } from './outputs.js';
import { registerOfName } from './registers.js';
import {
  REQUEST_CALLS,
  REQUEST_STATUS_CALLS,
  emitRequestRead,
  requestIdFor,
} from './requests.js';

/** Whether a call leaves a value on the stack, which a statement has to pop. */
export function leavesValue(e: Emitter, expression: Expression): boolean {
  const node = withoutGrouping(expression);
  if (node.kind !== 'call') return true;
  const checked = e.callAt(node);
  const name = checked?.name ?? calleeText(node.callee);
  return !e.isDeclaration(name);
}

export function emitCall(e: Emitter, f: Frame, call: Call): void {
  const checked = e.callAt(call);
  if (checked === undefined || checked.target === 'unresolved') {
    f.builder.at(call.span);
    f.builder.push('CONST', e.pool.absent());
    return;
  }

  if (e.isDeclaration(checked.name)) {
    emitDeclarationCall(e, f, call, checked.name, undefined);
    return;
  }

  if (REQUEST_CALLS.has(checked.name)) {
    // One entry of `requests` and one register the engine fills, 2.16. The
    // expression argument is not emitted here: it belongs to the requested
    // bars, and emitting it inline would compute it on this chart's.
    emitRequestRead(e, f, call, checked);
    return;
  }

  if (checked.target === 'user' && checked.fn !== undefined) {
    emitUserCall(e, f, call, checked.fn, checked.arguments, checked.seriesArguments);
    return;
  }

  const entry = checked.entry;
  if (entry === undefined) {
    f.builder.at(call.span);
    f.builder.push('CONST', e.pool.absent());
    return;
  }
  emitLibraryCall(e, f, call, entry, checked.arguments);
}

/**
 * A library call: every argument in parameter order, then `CALL_LIB`.
 *
 * Named arguments, argument order and defaults are entirely a compile-time
 * matter (4.10), so an engine never sees a name and never consults a signature.
 * What this compiler cannot do is the last of those three. The library surface
 * the checker carries records **which** parameters are optional and not what
 * each one defaults to, so an argument a script left out is emitted as absent
 * rather than as the value `stdlib.md` gives it.
 */
function emitLibraryCall(
  e: Emitter,
  f: Frame,
  call: Call,
  entry: LibraryEntry,
  args: readonly ({ readonly value: Expression } | undefined)[],
): void {
  const index = e.libraryFunction(entry);

  if (REQUEST_STATUS_CALLS.has(entry.name)) {
    emitReadHandle(e, f, call, args[0]?.value);
    f.builder.at(call.span);
    f.builder.push('CALL_LIB', index, entry.parameters.length, -1);
    return;
  }

  for (let i = 0; i < entry.parameters.length; i += 1) {
    const argument = args[i];
    if (argument !== undefined) {
      emitExpression(e, f, argument.value);
      continue;
    }
    const parameter = entry.parameters[i];
    const value = parameter === undefined ? undefined : defaultOf(parameter);
    if (value === undefined) {
      e.gap(
        'an omitted optional argument is emitted as absent, because the library surface records ' +
          'which parameters are optional and not what each one defaults to',
        'compiled-program.md 4.10, against stdlib.md section 1',
        call.span,
        false,
      );
    }
    f.builder.at(call.span);
    const constant = value === undefined ? undefined : e.pool.of(value);
    f.builder.push('CONST', constant ?? e.pool.absent());
  }

  f.builder.at(call.span);
  const state = entry.stateful ? f.layout.state(index) : -1;
  f.builder.push('CALL_LIB', index, entry.parameters.length, state);
}

/**
 * The constant an omitted argument becomes, from the default its signature
 * declares.
 *
 * The text is read here rather than in the checker because a default is a
 * value, and values are the emitter's: 4.10 puts named arguments, argument
 * order and defaults entirely at compile time, so the program carries the
 * number a script left out and no engine holds a table of them. A default the
 * signature does not declare, or one whose text does not match its type, is
 * nothing: the caller emits absence and records the gap rather than guessing at
 * a value that would then be this compiler's invention.
 */
function defaultOf(parameter: LibraryParameter): Value | undefined {
  const text = parameter.defaultText;
  if (text === undefined) return undefined;
  if (text === 'none') return { kind: 'absent' };
  switch (parameter.type.kind) {
    case 'bool':
      return text === 'true' || text === 'false'
        ? { kind: 'bool', value: text === 'true' }
        : undefined;
    case 'number': {
      const value = Number(text);
      return Number.isFinite(value) ? { kind: 'number', value } : undefined;
    }
    case 'string':
      return text.length >= 2 && text.startsWith('"') && text.endsWith('"')
        ? { kind: 'string', value: text.slice(1, -1) }
        : undefined;
    case 'color': {
      const value = namedColour(text);
      return value === undefined ? undefined : { kind: 'colour', value };
    }
    default:
      return undefined;
  }
}

/**
 * The read `req.isReady` and `req.error` are asking about, as its id (2.16).
 *
 * The argument names a read rather than carrying one: a value on a bar cannot
 * say which request produced it, and the two calls answer about the request.
 * A name that holds no read is absent, which is what those two answer for a
 * read that does not exist; the checker takes any value here, so this is the
 * one place that can tell.
 */
function emitReadHandle(e: Emitter, f: Frame, call: Call, argument: Expression | undefined): void {
  const id = argument === undefined ? undefined : requestIdFor(e, argument);
  f.builder.at(call.span);
  if (id === undefined) {
    e.gap(
      'a read status call was given something that is not a name holding a read, and the ' +
        'signature admits any value, so there is no request for it to ask about',
      'compiled-program.md 2.16, against stdlib.md 15.1',
      call.span,
      false,
    );
    f.builder.push('CONST', e.pool.absent());
    return;
  }
  f.builder.push('CONST', e.pool.number(id));
}

/**
 * A call to a `fn`, and the registers the call site has to retain for it.
 *
 * A series argument is always given a fresh register, even when the argument is
 * a bare series name whose register already exists (4.10). Binding the existing
 * one would give the body history on bars where the call did not execute, which
 * would make a call inside an `if` behave differently from a call inside a
 * function inside an `if`.
 */
function emitUserCall(
  e: Emitter,
  f: Frame,
  call: Call,
  checkedFunction: number,
  args: readonly ({ readonly value: Expression } | undefined)[],
  seriesArguments: readonly number[],
): void {
  const declared = e.checked.functions[checkedFunction];
  const parameters = declared?.parameters.length ?? args.length;
  const site = e.newSite(0, parameters);
  f.sites.push(site.index);
  site.series = new Array<number>(parameters).fill(-1);

  // The body is emitted before the arguments are pushed, because the body is
  // what says which parameters need a register: a `HISTP` against a parameter
  // the call site bound `-1` is a corrupt program, and the checker can only
  // mark a parameter it was able to prove is a series (`language.md` 11.2).
  site.fn = bodyFor(e, checkedFunction, site);
  const retained = new Set<number>(seriesArguments);
  for (const instruction of e.functions[site.fn]?.code ?? []) {
    if (instruction[0] === 'HISTP') retained.add(instruction[1] ?? 0);
  }

  for (let i = 0; i < parameters; i += 1) {
    const argument = args[i];
    if (argument === undefined) {
      // A parameter's own default is compiled into the call site rather than
      // into the body (4.10), and the tree carries it on the declaration.
      const fallback = declared?.declaration.parameters[i]?.defaultValue;
      if (fallback === undefined) {
        f.builder.at(call.span);
        f.builder.push('CONST', e.pool.absent());
      } else {
        emitExpression(e, f, fallback);
      }
    } else {
      emitExpression(e, f, argument.value);
    }

    if (!retained.has(i)) continue;
    const register = e.layout.argument(declared?.parameters[i]?.name ?? `arg${i}`);
    site.series[i] = register;
    f.builder.at(call.span);
    f.builder.push('DUP');
    f.builder.push('SSTORE', register);
  }

  f.builder.at(call.span);
  f.builder.push('CALL_FN', site.index);
}

/**
 * A library value read without brackets: a bar series, a named colour, a fact
 * about the chart, the session or the position.
 *
 * Only a bar series is a register. Everything else is a value the host supplies
 * and the only instruction that can fetch one is a call of no arguments, so
 * that is what it compiles to and the engine's own manifest decides the value.
 * A named colour goes the same way deliberately: the exact channels are the
 * manifest's (`stdlib.md` 11.1), and a colour that reaches a bar should come
 * from there rather than from this compiler's stand-in table.
 */
export function emitLibraryValue(e: Emitter, f: Frame, node: NameReference | Member): void {
  const name = node.kind === 'nameReference' ? node.name : memberName(node);
  f.builder.at(node.span);

  const register = registerOfName(e, name);
  if (register !== undefined) {
    f.builder.push('SLOAD', register);
    return;
  }

  const entry = libraryEntries(name).find((one) => !one.callable);
  if (entry === undefined) {
    f.builder.push('CONST', e.pool.absent());
    return;
  }
  const index = e.libraryFunction(entry);
  const state = entry.stateful ? f.layout.state(index) : -1;
  f.builder.push('CALL_LIB', index, 0, state);
}

function memberName(node: Member): string {
  const object = withoutGrouping(node.object);
  return object.kind === 'nameReference' ? `${object.name}.${node.member.text}` : node.member.text;
}
