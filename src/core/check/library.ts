/**
 * The shape of the standard library, as the checker needs to see it.
 *
 * `stdlib.md` is the specification of what each call does and what it costs in
 * bars. What the checker needs from it is narrower: a name, the parameters it
 * takes, the type it gives back, where it may be written and how many bars it
 * delays its source by. That is what an entry here holds, and nothing here
 * implements any of it: the numbers are computed under `src/core/stdlib/`.
 *
 * Entries are written as signature strings because a signature is what the
 * specification's tables already show a reader, so the two can be compared by
 * eye without translating one of them first. A string is parsed once, when this
 * module loads, into the record below; there is no code built from text
 * anywhere, and there cannot be, which is the rule the whole design rests on.
 */
import type { HandleKind, ObjectKind, Type } from './types.js';
import {
  BOOL,
  COLOR,
  NONE,
  NOTHING,
  NUMBER,
  STRING,
  UNKNOWN,
  arrayOf,
  handleType,
  objectType,
  seriesOf,
} from './types.js';

/**
 * How a call's own warmup relates to the warmup of what it was given.
 *
 * `delay` and `params` both add bars to the source's own warmup, which is what
 * makes warmups compose: `sma(ema(close, 10), 10)` is absent until bar 18.
 * `params` reads the added bars off the call's own arguments, so it can only
 * be exact when those arguments are literal numbers, and `exact` says whether
 * the formula in `stdlib.md` is reproduced here or only bounded below.
 */
export type WarmupRule =
  | { readonly kind: 'delay'; readonly bars: number }
  | {
      readonly kind: 'params';
      readonly params: readonly string[];
      readonly scale: number;
      readonly add: number;
      readonly exact: boolean;
    }
  /** A value on bar 0 however late its arguments are: `isNone` is the example. */
  | { readonly kind: 'total' }
  /** The warmup of one named argument, and of nothing else. */
  | { readonly kind: 'argument'; readonly param: string }
  /** Present as soon as the earlier of these arguments is: `orElse`. */
  | { readonly kind: 'either'; readonly params: readonly string[] }
  /** Decided by the data rather than by a length, so a floor is all there is. */
  | { readonly kind: 'data' };

/**
 * A whole number argument and the range it accepts, for OS3004.
 *
 * The bounds are numbers and the sentence is derived from them, so the message
 * a reader sees and the test the checker runs cannot say different things. A
 * fractional length is refused rather than truncated (`language.md` 5.1): a
 * length of 14.5 is a bug in the script and rounding it hides the bug.
 */
export interface WholeRange {
  readonly text: string;
  readonly min: number | undefined;
  readonly max: number | undefined;
}

export function wholeRange(min?: number, max?: number): WholeRange {
  const text =
    min !== undefined && max !== undefined
      ? `${min} to ${max}`
      : min !== undefined
        ? `${min} or more`
        : max !== undefined
          ? `${max} or less`
          : 'with no fractional part';
  return { text, min, max };
}

export interface LibraryParameter {
  readonly name: string;
  readonly type: Type;
  /** Whether the entry gives it a default. A missing required one is OS3012. */
  readonly optional: boolean;
}

export interface LibraryEntry {
  /** `ema`, or `draw.line` with its namespace, exactly as a script writes it. */
  readonly name: string;
  /** A value such as `close` is read bare; a function is called. */
  readonly callable: boolean;
  readonly parameters: readonly LibraryParameter[];
  readonly returns: Type;
  readonly warmup: WarmupRule;
  /** Holds per-bar state, so a call inside a branch is OS8001. */
  readonly stateful: boolean;
  /** Top level only: OS3006, or OS3007 for `input`. */
  readonly topLevel: boolean;
  /** Available only in a `strategy()` file: OS7001. */
  readonly strategyOnly: boolean;
  /** Named so the surface is legible, and not in this release: OS2001. */
  readonly planned: boolean;
  /** Arguments with a closed set of accepted strings: OS3008. */
  readonly values: Readonly<Record<string, readonly string[]>>;
  /** Arguments that must be a whole number, with the range for OS3004. */
  readonly whole: Readonly<Record<string, WholeRange>>;
  /** Arguments read once before bar 0, so a bar-dependent one is OS3003. */
  readonly constant: readonly string[];
  /** Pairs that set the same thing two ways, so giving both is OS3010. */
  readonly conflicts: readonly (readonly [string, string])[];
}

export interface EntryOptions {
  readonly warmup?: WarmupRule;
  readonly stateful?: true;
  readonly topLevel?: true;
  readonly strategyOnly?: true;
  readonly planned?: true;
  readonly values?: Readonly<Record<string, readonly string[]>>;
  readonly whole?: Readonly<Record<string, WholeRange>>;
  readonly constant?: readonly string[];
  readonly conflicts?: readonly (readonly [string, string])[];
}

const OBJECT_NAMES: readonly string[] = ['line', 'label', 'box', 'polyline', 'table'];
const HANDLE_NAMES: readonly string[] = ['plot', 'fill', 'level'];

/**
 * A type as the signature strings spell it.
 *
 * `any` and the single letters are not types of the language. `any` is a
 * parameter that takes whatever it is given, which is what `isNone` and `text`
 * want. A single letter is a stand-in carried from one parameter to another, so
 * that `push(arr, v)` can say that `v` is whatever `arr` holds and `orElse`
 * can say it gives back what it was given. Both are resolved at the call site
 * and neither ever reaches a name's type.
 */
export const ANY: Type = UNKNOWN;

const VARIABLE = /^[A-Z]$/;

function parseType(text: string): Type {
  const trimmed = text.trim();
  if (trimmed.startsWith('series ')) return seriesOf(parseType(trimmed.slice(7)));
  if (trimmed.startsWith('array<') && trimmed.endsWith('>')) {
    return arrayOf(parseType(trimmed.slice(6, -1)));
  }
  switch (trimmed) {
    case 'number':
      return NUMBER;
    case 'string':
      return STRING;
    case 'bool':
      return BOOL;
    case 'color':
      return COLOR;
    case 'none':
      return NONE;
    case 'nothing':
      return NOTHING;
    case 'any':
      return ANY;
    default:
      if (VARIABLE.test(trimmed)) return { kind: 'variable', name: trimmed };
      if (OBJECT_NAMES.includes(trimmed)) return objectType(trimmed as ObjectKind);
      if (HANDLE_NAMES.includes(trimmed)) return handleType(trimmed as HandleKind);
      throw new Error(`library signature names no such type: ${trimmed}`);
  }
}

/** Split on commas that are not inside angle brackets. */
function splitParameters(text: string): readonly string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '<') depth += 1;
    else if (ch === '>') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/**
 * One entry, from `name(param: type, optional?: type) -> result`.
 *
 * A name with no bracket is a value a script reads bare, such as `close` or
 * `bar.index`. A `?` after a parameter name means the library gives it a
 * default; what that default is belongs to the library manifest, not here, so
 * the checker never carries a second copy of a number it does not use.
 */
export function entry(signature: string, options: EntryOptions = {}): LibraryEntry {
  const arrow = signature.indexOf('->');
  if (arrow < 0) throw new Error(`library signature has no result type: ${signature}`);
  const head = signature.slice(0, arrow).trim();
  const returns = parseType(signature.slice(arrow + 2));

  const open = head.indexOf('(');
  const callable = open >= 0;
  const name = callable ? head.slice(0, open).trim() : head;
  const parameters: LibraryParameter[] = [];

  if (callable) {
    if (!head.endsWith(')')) throw new Error(`library signature is not closed: ${signature}`);
    for (const part of splitParameters(head.slice(open + 1, -1))) {
      const colon = part.indexOf(':');
      if (colon < 0) throw new Error(`library parameter has no type: ${part}`);
      const written = part.slice(0, colon).trim();
      const optional = written.endsWith('?');
      parameters.push({
        name: optional ? written.slice(0, -1) : written,
        type: parseType(part.slice(colon + 1)),
        optional,
      });
    }
  }

  return {
    name,
    callable,
    parameters,
    returns,
    warmup: options.warmup ?? { kind: 'delay', bars: 0 },
    stateful: options.stateful === true,
    topLevel: options.topLevel === true,
    strategyOnly: options.strategyOnly === true,
    planned: options.planned === true,
    values: options.values ?? {},
    whole: options.whole ?? {},
    constant: options.constant ?? [],
    conflicts: options.conflicts ?? [],
  };
}

/** `bar `len - 1`` and its relatives, the commonest warmup shape in the library. */
export function fromLength(param: string, add: number, scale = 1): WarmupRule {
  return { kind: 'params', params: [param], scale, add, exact: true };
}

/** A warmup this module bounds below rather than reproducing the formula for. */
export function atLeastLength(params: readonly string[], add = 0): WarmupRule {
  return { kind: 'params', params, scale: 1, add, exact: false };
}

export const DELAY_ZERO: WarmupRule = { kind: 'delay', bars: 0 };
export const TOTAL: WarmupRule = { kind: 'total' };
export const DATA_DRIVEN: WarmupRule = { kind: 'data' };

export function delayBars(bars: number): WarmupRule {
  return { kind: 'delay', bars };
}

/**
 * Every entry of a name, in the order they were declared.
 *
 * A bare name may carry more than one signature (stdlib.md 2.2), so a lookup
 * answers with a list and the call site picks by arity and by argument type.
 * There is no run-time dispatch anywhere: the choice is made here, once.
 */
export type LibraryIndex = ReadonlyMap<string, readonly LibraryEntry[]>;

export function indexOf(entries: readonly LibraryEntry[]): LibraryIndex {
  const index = new Map<string, LibraryEntry[]>();
  for (const one of entries) {
    const existing = index.get(one.name);
    if (existing === undefined) index.set(one.name, [one]);
    else existing.push(one);
  }
  return index;
}
