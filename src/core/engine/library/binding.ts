/**
 * What a `CALL_LIB` needs, and what the machine has to hand it.
 *
 * The interfaces the library asks its caller for are declared here rather than
 * imported from the engine, so the dependency points one way: the engine knows
 * about the library and the library knows only about the shape of the facts it
 * is given. That is what lets the same table be driven by a chart engine, a
 * backtest and a test that supplies four bars by hand.
 *
 * **An entry carries the same four facts the program carries.** `lib.functions`
 * in a compiled program holds a name, an arity, whether the function holds
 * state and what effect it has, and 2.5 says plainly why: they are there to be
 * disagreed with. At load the engine compares each entry against this table and
 * refuses a mismatch with OS6004, which catches a program compiled against a
 * newer library before it computes a single wrong number.
 */
import type { Span } from '../../span/index.js';
import type { ColourValue, Heap, Reference, Value } from '../values/index.js';
import { isColour, isNumber, isRef, isString } from '../values/index.js';
import type { StateRecord } from './state.js';

/** What a call does to the world outside the machine, 5.4. */
export type Effect = 'none' | 'signal' | 'order' | 'draw' | 'log';

/** The bar being executed, as a library call sees it. */
export interface BarView {
  readonly index: number;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly close: number | null;
  readonly volume: number | null;
  readonly time: number | null;
  /**
   * The previous bar's close, or absent on bar 0.
   *
   * Here rather than in a state region because `trueRange()` needs it and the
   * library surface declares that call stateless, and because the value is a
   * fact about the dataset rather than about a call site: it is the same for
   * every call on a bar and it does not move when a moving bar re-executes.
   */
  readonly previousClose: number | null;
  readonly isConfirmed: boolean;
  readonly isRealtime: boolean;
  readonly isNew: boolean;
  readonly isLast: boolean;
  readonly updates: number;
  /** Whether the host says a trading session begins on this bar. */
  readonly isSessionStart: boolean;
  /** Whether the host says a trading session ends on this bar. */
  readonly isSessionEnd: boolean;
}

/** The facts an engine reads from the host and never from anywhere else, 5.2. */
export interface HostFacts {
  symbol(): Value;
  exchange(): Value;
  interval(): Value;
  tickSize(): Value;
  lotSize(): Value;
  /** The chart clock, which the host supplies, 8.4. */
  now(): Value;
  positionSize(): Value;
  positionPrice(): Value;
}

/** Everything one call can reach. */
export interface CallContext {
  readonly heap: Heap;
  readonly span: Span;
  readonly bar: BarView;
  readonly host: HostFacts;
  /** This call site's region, empty on the first bar that reaches the call. */
  readonly state: StateRecord;
  /** The ceilings, so a library call that grows something can be stopped. */
  readonly guard: Guard;
  /** The name this value goes by in the program, for a diagnostic. */
  nameOf(value: Value): string;
}

/**
 * The memory ceilings a library call has to respect.
 *
 * Two ceilings, because two are what the catalogue can state truthfully: an
 * array holds at most so many elements (OS5002) and a string at most so many
 * code points (OS5008). There is no code for a ceiling on the whole heap, and
 * inventing one would mean a message that named an array for a limit the array
 * did not reach, so the engine enforces the two it can name and reclaims what
 * nothing can reach instead.
 */
export interface Guard {
  array(span: Span, name: string, size: number): void;
  string(span: Span, text: string): string;
  /** The same ceiling against a length, for a string not yet built. */
  chars(span: Span, length: number): void;
  /** Raise a run-time diagnostic that names an argument of this call. */
  badArgument(span: Span, name: string, argument: string, found: string): never;
  /** Raise a run-time diagnostic against an index outside an array. */
  badIndex(span: Span, name: string, index: string, size: number): never;
  /** Raise a run-time diagnostic against an object a script already deleted. */
  deleted(span: Span, kind: string, bar: number): never;
}

export type LibraryCall = (ctx: CallContext, args: readonly Value[]) => Value;

export interface ManifestEntry {
  readonly name: string;
  readonly arity: number;
  readonly state: boolean;
  readonly effect: Effect;
  /** Parameter names, in order, so a diagnostic can say which one was wrong. */
  readonly params: readonly string[];
  /** Positions that must hold a whole number of one or more. */
  readonly whole: readonly number[];
  readonly call: LibraryCall;
}

export interface EntryOptions {
  readonly state?: true;
  readonly effect?: Effect;
  readonly whole?: readonly number[];
}

/**
 * Declares one entry.
 *
 * The parameter names are written as one space separated string, because that
 * is how `stdlib.md`'s tables show a signature and the two can then be compared
 * by eye without translating one of them first.
 */
export function entry(
  name: string,
  params: string,
  call: LibraryCall,
  options: EntryOptions = {},
): ManifestEntry {
  const list = params === '' ? [] : params.split(' ');
  return {
    name,
    arity: list.length,
    state: options.state === true,
    effect: options.effect ?? 'none',
    params: list,
    whole: options.whole ?? [],
    call,
  };
}

/** An entry whose work happens at step 9, so the call itself produces absence. */
export function deferred(name: string, params: string, effect: Effect): ManifestEntry {
  return entry(name, params, () => null, { effect });
}

export function numberAt(args: readonly Value[], index: number): number | null {
  const value = args[index];
  return value !== undefined && isNumber(value) ? value : null;
}

export function stringAt(args: readonly Value[], index: number): string | null {
  const value = args[index];
  return value !== undefined && isString(value) ? value : null;
}

export function boolAt(args: readonly Value[], index: number): boolean | null {
  const value = args[index];
  return typeof value === 'boolean' ? value : null;
}

export function colourAt(args: readonly Value[], index: number): ColourValue | null {
  const value = args[index];
  return value !== undefined && isColour(value) ? value : null;
}

export function refAt(args: readonly Value[], index: number): Reference | null {
  const value = args[index];
  return value !== undefined && isRef(value) ? value : null;
}

export function valueAt(args: readonly Value[], index: number): Value {
  return args[index] ?? null;
}

/**
 * A length argument, checked against its contract.
 *
 * A length that is present and is not a whole number of one or more is a bug in
 * the script and is OS4003, named against the parameter that took it. A length
 * that is absent is left to the function, which returns absence: the argument
 * arrived during another value's warmup, and stopping the study would turn a
 * gap into an error.
 */
export function lengthAt(
  ctx: CallContext,
  name: string,
  param: string,
  args: readonly Value[],
  index: number,
): number | null {
  return checkedWhole(ctx, name, param, args[index], 1);
}

/** A whole number of zero or more, for a digit count or an index. */
export function wholeAt(
  ctx: CallContext,
  name: string,
  param: string,
  args: readonly Value[],
  index: number,
): number | null {
  return checkedWhole(ctx, name, param, args[index], 0);
}

function checkedWhole(
  ctx: CallContext,
  name: string,
  param: string,
  value: Value | undefined,
  least: number,
): number | null {
  if (value === undefined || value === null) return null;
  if (!isNumber(value) || !Number.isInteger(value) || value < least) {
    ctx.guard.badArgument(ctx.span, name, param, describe(value));
  }
  return value;
}

/** A value as a diagnostic has to print it. */
export function describe(value: Value): string {
  if (value === null) return 'none';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value.tag === 'color') return `a colour`;
  return 'an object';
}
