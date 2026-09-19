/**
 * Strings and formatting, `stdlib.md` section 10.
 *
 * **A string is a sequence of code points** (`compiled-program.md` 3.1), so
 * length, indexing and comparison count code points and not the storage unit of
 * the language this engine happens to be written in. An engine whose native
 * strings are sixteen bit units must count and index past a surrogate pair as
 * one element, or two engines will disagree about the length of a string
 * holding a symbol outside the basic plane and about every substring taken
 * after one. That is what the spread into an array is doing everywhere below:
 * it costs a pass over the string and buys agreement.
 *
 * **Number to string is specified, not the host's default.** `text(x)` is the
 * shortest decimal string that reads back as the same binary64 value, which is
 * what this language's own conversion already produces. `text(x, d)` rounds to
 * `d` decimals with halves away from zero and always emits exactly `d` digits
 * after the point, because this is a display conversion and half up is what a
 * reader of a price expects.
 */
import { roundHalfAway } from '../../stdlib/index.js';
import type { Value } from '../values/index.js';
import { isColour, reference } from '../values/index.js';
import { entry, numberAt, refAt, stringAt, valueAt, wholeAt } from './binding.js';
import type { CallContext, ManifestEntry } from './binding.js';

/** A value as `text(x)` spells it. */
export function spell(ctx: CallContext, value: Value): string {
  if (value === null) return 'none';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return value;
  if (isColour(value)) {
    const byte = (x: number): string => x.toString(16).padStart(2, '0');
    return `#${byte(value.r)}${byte(value.g)}${byte(value.b)}${byte(roundHalfAway(value.a * 255))}`;
  }
  return ctx.heap.get(value.id)?.kind ?? 'none';
}

/**
 * `text(x, d)`: exactly `d` digits after the point, halves away from zero.
 *
 * The rounding is done on the number before it is written out rather than left
 * to a formatting routine, because a routine's tie rule is the host language's
 * and the two disagree at exactly the values a price lands on.
 */
function fixed(x: number, decimals: number): string {
  const scale = Math.pow(10, decimals);
  const scaled = roundHalfAway(x * scale);
  const negative = scaled < 0;
  const digits = Math.abs(scaled).toFixed(0);
  if (decimals === 0) return negative ? `-${digits}` : digits;
  const padded = digits.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals);
  const fraction = padded.slice(padded.length - decimals);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/**
 * `number(s)`: a string to a number, absent for anything it does not parse.
 *
 * The grammar is written out rather than handed to the host language's parser,
 * which accepts hexadecimal, infinities and a bare leading point in some
 * languages and not others. Absence rather than zero for text that is not a
 * number, so a script can tell text that is not a number apart from the number
 * zero.
 */
const NUMERIC = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function parseNumber(text: string): Value {
  const trimmed = text.trim();
  if (!NUMERIC.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? (parsed === 0 ? 0 : parsed) : null;
}

/** Code points, which is what every index in this file counts. */
function points(text: string): string[] {
  return [...text];
}

function makeArray(ctx: CallContext, items: Value[]): Value {
  ctx.guard.array(ctx.span, 'the array', items.length);
  return reference(ctx.heap.allocate({ kind: 'array', items }));
}

export const TEXT_ENTRIES: readonly ManifestEntry[] = [
  entry('text', 'x', (ctx, args) => ctx.guard.string(ctx.span, spell(ctx, valueAt(args, 0)))),

  entry('text', 'x decimals', (ctx, args) => {
    const x = numberAt(args, 0);
    const decimals = wholeAt(ctx, 'text', 'decimals', args, 1);
    if (x === null || decimals === null) return null;
    return ctx.guard.string(ctx.span, fixed(x, decimals));
  }),

  entry('number', 's', (_ctx, args) => {
    const text = stringAt(args, 0);
    return text === null ? null : parseNumber(text);
  }),

  entry('str.length', 's', (_ctx, args) => {
    const text = stringAt(args, 0);
    return text === null ? null : points(text).length;
  }),

  entry('str.upper', 's', (ctx, args) => map(ctx, args, (s) => s.toUpperCase())),
  entry('str.lower', 's', (ctx, args) => map(ctx, args, (s) => s.toLowerCase())),
  entry('str.trim', 's', (ctx, args) => map(ctx, args, (s) => s.trim())),

  entry('str.contains', 's part', (_ctx, args) => pair(args, (s, part) => s.includes(part))),
  entry('str.startsWith', 's part', (_ctx, args) => pair(args, (s, part) => s.startsWith(part))),
  entry('str.endsWith', 's part', (_ctx, args) => pair(args, (s, part) => s.endsWith(part))),

  entry('str.indexOf', 's part', (_ctx, args) =>
    pair(args, (s, part) => {
      const at = s.indexOf(part);
      return at < 0 ? -1 : points(s.slice(0, at)).length;
    }),
  ),

  entry('str.substring', 's from to', (ctx, args) => {
    const text = stringAt(args, 0);
    const from = wholeAt(ctx, 'str.substring', 'from', args, 1);
    if (text === null || from === null) return null;
    const all = points(text);
    const to = args[2] === null || args[2] === undefined
      ? all.length
      : wholeAt(ctx, 'str.substring', 'to', args, 2);
    if (to === null) return null;
    return ctx.guard.string(ctx.span, all.slice(from, to).join(''));
  }),

  entry('str.replace', 's find with', (ctx, args) => triple(ctx, args, (s, find, into) =>
    s.replace(find, () => into),
  )),
  entry('str.replaceAll', 's find with', (ctx, args) => triple(ctx, args, (s, find, into) =>
    s.split(find).join(into),
  )),

  entry('str.split', 's separator', (ctx, args) => {
    const text = stringAt(args, 0);
    const separator = stringAt(args, 1);
    if (text === null || separator === null) return null;
    const parts: Value[] = text.split(separator);
    return makeArray(ctx, parts);
  }),

  entry('str.join', 'parts separator', (ctx, args) => {
    const handle = refAt(args, 0);
    const separator = stringAt(args, 1);
    if (handle === null || separator === null) return null;
    const object = ctx.heap.get(handle.id);
    if (object === undefined || object.kind !== 'array') return null;
    const pieces: string[] = [];
    for (const item of object.items) pieces.push(spell(ctx, item));
    return ctx.guard.string(ctx.span, pieces.join(separator));
  }),

  entry('str.padLeft', 's width fill', (ctx, args) => pad(ctx, args, true)),
  entry('str.padRight', 's width fill', (ctx, args) => pad(ctx, args, false)),

  entry('str.repeat', 's n', (ctx, args) => {
    const text = stringAt(args, 0);
    const count = wholeAt(ctx, 'str.repeat', 'n', args, 1);
    if (text === null || count === null) return null;
    // Measured before it is built. A length times a count is where the string
    // ceiling is actually reached, and building the string first to measure it
    // is how an engine runs out of memory instead of reporting that it would.
    ctx.guard.chars(ctx.span, points(text).length * count);
    return text.repeat(count);
  }),
];

function map(ctx: CallContext, args: readonly Value[], of: (s: string) => string): Value {
  const text = stringAt(args, 0);
  return text === null ? null : ctx.guard.string(ctx.span, of(text));
}

function pair(args: readonly Value[], of: (s: string, part: string) => Value): Value {
  const text = stringAt(args, 0);
  const part = stringAt(args, 1);
  return text === null || part === null ? null : of(text, part);
}

function triple(
  ctx: CallContext,
  args: readonly Value[],
  of: (s: string, a: string, b: string) => string,
): Value {
  const text = stringAt(args, 0);
  const a = stringAt(args, 1);
  const b = stringAt(args, 2);
  if (text === null || a === null || b === null) return null;
  return ctx.guard.string(ctx.span, of(text, a, b));
}

function pad(ctx: CallContext, args: readonly Value[], left: boolean): Value {
  const text = stringAt(args, 0);
  const width = wholeAt(ctx, left ? 'str.padLeft' : 'str.padRight', 'width', args, 1);
  const fill = stringAt(args, 2) ?? ' ';
  if (text === null || width === null || fill === '') return text === null ? null : text;
  const all = points(text);
  if (all.length >= width) return text;
  const filler = points(fill);
  const needed = width - all.length;
  const padding: string[] = [];
  for (let i = 0; i < needed; i += 1) padding.push(filler[i % filler.length] ?? ' ');
  const joined = padding.join('');
  return ctx.guard.string(ctx.span, left ? joined + text : text + joined);
}
