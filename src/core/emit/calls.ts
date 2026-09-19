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
import type { LibraryEntry } from '../check/index.js';
import { libraryEntries } from '../check/index.js';
import type { Emitter, Frame } from './context.js';
import { calleeText } from './context.js';
import { emitExpression } from './expressions.js';
import { bodyFor } from './functions.js';
import { emitDeclarationCall } from './outputs.js';
import { registerOfName } from './registers.js';

/** The two reads of `stdlib.md` 15.1, whose expression argument has no encoding. */
const REQUEST_CALLS = new Set(['req.timeframe', 'req.symbol']);

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
    // stdlib.md 15.4 compiles the expression argument as a separate program over
    // the requested bars. compiled-program.md defines no field, no instruction
    // and no call form that can carry one, and emitting the argument inline
    // would compute it on this chart's bars, which is a different series.
    e.gap(
      'a higher timeframe or other instrument read carries an expression compiled over the ' +
        'requested bars, and the compiled program has no field or instruction that can hold one',
      'stdlib.md 15.4, against compiled-program.md 2 and 4',
      call.span,
      true,
    );
    f.builder.at(call.span);
    f.builder.push('CONST', e.pool.absent());
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

  for (let i = 0; i < entry.parameters.length; i += 1) {
    const argument = args[i];
    if (argument !== undefined) {
      emitExpression(e, f, argument.value);
      continue;
    }
    const parameter = entry.parameters[i];
    e.gap(
      'an omitted optional argument is emitted as absent, because the library surface records ' +
        'which parameters are optional and not what each one defaults to',
      'compiled-program.md 4.10, against stdlib.md section 1',
      call.span,
      false,
    );
    f.builder.at(call.span);
    f.builder.push('CONST', e.pool.absent());
    if (parameter === undefined) continue;
  }

  f.builder.at(call.span);
  const state = entry.stateful ? f.layout.state(index) : -1;
  f.builder.push('CALL_LIB', index, entry.parameters.length, state);
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
