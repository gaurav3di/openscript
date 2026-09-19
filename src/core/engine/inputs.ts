/**
 * Inputs, resolved once at load, `compiled-program.md` 2.6 and 5.1.
 *
 * Input resolution and the substitution of every `{ "input": ... }` reference
 * happen **once, before step 1 of bar 0**, so the declarations in `outputs` and
 * anything built from them exist before the first bar runs. Step 5 writes
 * already resolved values into slots and resolves nothing.
 *
 * **A value that fails validation is a refusal, not a fallback.** The host's
 * value is used when it passes and the declared default when the host supplies
 * none, and a supplied value that fails is OS6019 and the program does not run.
 * Falling back to the default would be a settings dialog that silently ignores
 * what a user typed, which is worse than one that says the value is out of
 * range.
 *
 * **An input value is never absent.** `input()` cannot declare `none` as a
 * default, because the default's type is what fixes the input's type.
 */
import type { Diagnostic } from '../diagnostics/index.js';
import { isBarField } from './bars.js';
import { NO_POSITION, failure } from './errors.js';
import type { CompiledInput, CompiledProgram, Constant, Field } from './types.js';
import type { Value } from './values/index.js';

/** The eight built-in series a `"source"` input may select, 2.6. */
const SOURCES: readonly string[] = [
  'open',
  'high',
  'low',
  'close',
  'hl2',
  'hlc3',
  'ohlc4',
  'volume',
];

export interface ResolvedInput {
  readonly key: string;
  readonly slot: number;
  /** The bar field a `"source"` input selected, which step 5 reads per bar. */
  readonly field: string | undefined;
  /** The effective value, for every other kind. */
  readonly value: Value;
}

export type InputResult =
  | { readonly ok: true; readonly inputs: readonly ResolvedInput[] }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

/** A host's own conversion for a `"time"` input, which needs the chart's zone. */
export type TimeResolver = (text: string) => number | null;

/** The value a constant pool entry denotes. */
export function constantValue(entry: Constant): Value {
  switch (entry[0]) {
    case 'z':
      return null;
    case 'b':
    case 'n':
    case 's':
      return entry[1];
    default:
      return { tag: 'color', r: entry[1][0], g: entry[1][1], b: entry[1][2], a: entry[1][3] };
  }
}

export function resolveInputs(
  program: CompiledProgram,
  settings: Readonly<Record<string, unknown>>,
  resolveTime: TimeResolver,
): InputResult {
  const inputs: ResolvedInput[] = [];
  for (const declared of program.inputs) {
    const resolved = resolveOne(declared, settings, resolveTime);
    if ('diagnostic' in resolved) return { ok: false, diagnostic: resolved.diagnostic };
    inputs.push(resolved.input);
  }
  return { ok: true, inputs };
}

function refuse(key: string, value: unknown, validation: string): {
  readonly diagnostic: Diagnostic;
} {
  return {
    diagnostic: failure('OS6019', NO_POSITION, { value: describe(value), key, validation }),
  };
}

function resolveOne(
  declared: CompiledInput,
  settings: Readonly<Record<string, unknown>>,
  resolveTime: TimeResolver,
): { readonly input: ResolvedInput } | { readonly diagnostic: Diagnostic } {
  const supplied = Object.prototype.hasOwnProperty.call(settings, declared.key)
    ? settings[declared.key]
    : undefined;
  const fallback = constantValue(declared.default);

  if (declared.kind === 'source') {
    const field = supplied === undefined ? fallback : supplied;
    if (typeof field !== 'string' || !SOURCES.includes(field)) {
      return refuse(declared.key, field, `a source names one of ${SOURCES.join(', ')}`);
    }
    if (!isBarField(field)) {
      return refuse(declared.key, field, 'this engine has no bar field of that name');
    }
    return { input: { key: declared.key, slot: declared.slot, field, value: null } };
  }

  if (declared.kind === 'time') {
    const held = supplied === undefined ? fallback : supplied;
    const time = typeof held === 'number' ? held : typeof held === 'string' ? resolveTime(held) : null;
    if (time === null) {
      return refuse(declared.key, held, 'a time is a timestamp or a date and time the host can read');
    }
    return { input: { key: declared.key, slot: declared.slot, field: undefined, value: time } };
  }

  if (supplied === undefined) {
    return { input: { key: declared.key, slot: declared.slot, field: undefined, value: fallback } };
  }

  const wrong = validate(declared, supplied);
  if (wrong !== undefined) return refuse(declared.key, supplied, wrong);
  return {
    input: { key: declared.key, slot: declared.slot, field: undefined, value: supplied as Value },
  };
}

/** What rule the host's value broke, or nothing when it passes. */
function validate(declared: CompiledInput, supplied: unknown): string | undefined {
  switch (declared.kind) {
    case 'number': {
      if (typeof supplied !== 'number' || !Number.isFinite(supplied)) {
        return 'this input takes a number';
      }
      if (declared.min !== null && supplied < declared.min) {
        return `the minimum is ${declared.min}`;
      }
      if (declared.max !== null && supplied > declared.max) {
        return `the maximum is ${declared.max}`;
      }
      return undefined;
    }
    case 'bool':
      return typeof supplied === 'boolean' ? undefined : 'this input takes true or false';
    case 'color':
      return isColourValue(supplied) ? undefined : 'this input takes a colour';
    case 'select': {
      if (typeof supplied !== 'string') return 'this input takes one of its listed values';
      const allowed = (declared.options ?? []).map((one) => constantValue(one));
      if (!allowed.includes(supplied)) {
        return `the choices are ${allowed.map((one) => String(one)).join(', ')}`;
      }
      return undefined;
    }
    default:
      return typeof supplied === 'string' ? undefined : 'this input takes a string';
  }
}

function isColourValue(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const held = value as Record<string, unknown>;
  return (
    held['tag'] === 'color' &&
    typeof held['r'] === 'number' &&
    typeof held['g'] === 'number' &&
    typeof held['b'] === 'number' &&
    typeof held['a'] === 'number'
  );
}

/**
 * A declaration field with its `{ "input": key }` reference substituted.
 *
 * Every field of `meta`, of `meta.strategy` and of every declaration in
 * `outputs` may hold the reference, and it is gone before bar 0.
 */
export function fieldValue(field: Field, inputs: readonly ResolvedInput[]): Value {
  if (field === null) return null;
  if (typeof field === 'object' && !Array.isArray(field)) {
    const key = (field as { readonly input: string }).input;
    const found = inputs.find((one) => one.key === key);
    return found === undefined ? null : found.value;
  }
  if (Array.isArray(field)) {
    const [r, g, b, a] = field as readonly number[];
    if (r === undefined || g === undefined || b === undefined || a === undefined) return null;
    return { tag: 'color', r, g, b, a };
  }
  return field as Value;
}

/**
 * A date and time read as if it were UTC.
 *
 * **This is a stand-in.** `stdlib.md` 12.1 reads every calendar field in the
 * chart's timezone, which is an IANA zone name the host states, and an engine
 * that has not been given one cannot apply it. A host with a zone supplies its
 * own resolver; this one is what a test and a host with no zone get, and it is
 * deterministic, which is the property that matters most here.
 */
const STAMP = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

export function utcTime(text: string): number | null {
  const parsed = STAMP.exec(text.trim());
  if (parsed === null) return null;
  const at = (index: number): number => Number(parsed[index] ?? '0');
  const value = Date.UTC(at(1), at(2) - 1, at(3), at(4), at(5), at(6));
  return Number.isFinite(value) ? value : null;
}

function describe(value: unknown): string {
  if (value === undefined || value === null) return 'none';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return 'a value of another type';
}
