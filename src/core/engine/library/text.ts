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

/** A magnitude as decimal digits, and how many of them fall before the point. */
interface Spread {
  readonly digits: string;
  readonly point: number;
}

/**
 * A written magnitude as digits, with the point moved right by `places`.
 *
 * **This is the only place an exponent is allowed to exist.** A runtime writes
 * a large enough magnitude in exponential form, and `1e+22` reaching a routine
 * that splits a whole part from a fraction comes back out as `1e+.22`: a label
 * on a price or a cumulative volume with nonsense in it, and no diagnostic
 * anywhere. So the exponent is taken off here, once, and everything after this
 * works on digits and a position, where moving the point is arithmetic on an
 * integer and cannot produce a character that was not a digit.
 *
 * It takes the writing rather than the number because the two callers need two
 * different ones, and which digits a magnitude has is their question, not this
 * one's.
 */
function spread(shown: string, places: number): Spread {
  const e = shown.indexOf('e');
  const mantissa = e < 0 ? shown : shown.slice(0, e);
  const exponent = e < 0 ? 0 : Number(shown.slice(e + 1));
  const dot = mantissa.indexOf('.');
  const whole = dot < 0 ? mantissa : mantissa.slice(0, dot);
  const fraction = dot < 0 ? '' : mantissa.slice(dot + 1);
  return { digits: whole + fraction, point: whole.length + exponent + places };
}

/** One added to a digit string, which grows it when every digit is a nine. */
function carry(digits: string): string {
  const out = [...digits];
  for (let i = out.length - 1; i >= 0; i -= 1) {
    const digit = out[i] ?? '0';
    if (digit !== '9') {
      out[i] = String.fromCharCode(digit.charCodeAt(0) + 1);
      return out.join('');
    }
    out[i] = '0';
  }
  return `1${out.join('')}`;
}

/**
 * A spread written out, rounded half up where the point falls inside its digits.
 *
 * Both callers pass a point at or past the last digit, so the first line is the
 * answer every time either of them asks. The rest is here so that this is a
 * function of what it is given rather than of that reasoning, and half up on a
 * magnitude is half away from zero because the sign is carried separately.
 */
function written(of: Spread): string {
  if (of.point >= of.digits.length) return of.digits + '0'.repeat(of.point - of.digits.length);
  if (of.point < 0) return '0';
  const kept = of.digits.slice(0, of.point);
  if ((of.digits[of.point] ?? '0') < '5') return kept === '' ? '0' : kept;
  return carry(kept);
}

/**
 * `text(x, d)`: exactly `d` digits after the point, halves away from zero.
 *
 * The rounding is done on the number before it is written out rather than left
 * to a formatting routine, because a routine's tie rule is the host language's
 * and the two disagree at exactly the values a price lands on.
 *
 * **The result is positional, always**, whatever the magnitude: a sign, at
 * least one digit, and exactly `d` digits after the point. `spread` is what
 * makes that true of every magnitude rather than of the ones below a threshold.
 *
 * **Past the scaling range the digits are the shortest form's, zero filled.**
 * Scaling by `10 ** d` leaves binary64 altogether for a large enough magnitude
 * or a large enough `d`, and there is nothing to round out there: a binary64 at
 * or above 2 ** 53 is a whole number already, and a decimal place that far from
 * the leading digit is past every digit the value carries. Two engines write
 * the same digits, because the shortest decimal form is what each one's own
 * conversion produces. Inside the range the scaling is what it was, so no value
 * that had an answer has a different one.
 */
function fixed(x: number, decimals: number): string {
  const scaled = roundHalfAway(x * Math.pow(10, decimals));
  const usable = Number.isFinite(scaled);
  const sign = (usable ? scaled < 0 : x < 0) ? '-' : '';
  // Within the scaling range the whole number's own digits are asked for and
  // not its shortest form, which drops the low digits of a large one.
  const magnitude = usable
    ? spread(Math.abs(scaled).toFixed(0), 0)
    : spread(Math.abs(x).toString(), decimals);
  const digits = written(magnitude).padStart(decimals + 1, '0');
  if (decimals === 0) return sign + digits;
  const whole = digits.slice(0, digits.length - decimals);
  return `${sign}${whole}.${digits.slice(digits.length - decimals)}`;
}

/**
 * How long `text(x, d)` will be, before a character of it is built.
 *
 * A floor rather than the exact count: a carry off the front adds one digit and
 * a negative adds the sign, and both are caught by the ceiling the built string
 * is checked against. What this is for is the decimal count a script computed,
 * which can ask for a string no engine can hold, and building it to find that
 * out is how an engine runs out of memory instead of reporting that it would
 * have. `str.repeat` measures first for the same reason.
 */
function lengthOf(x: number, decimals: number): number {
  const before = Math.max(1, spread(Math.abs(x).toString(), 0).point);
  return before + decimals + (decimals > 0 ? 1 : 0);
}

/**
 * `toNumber(s)`: a string to a number, absent for anything it does not parse.
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
    ctx.guard.chars(ctx.span, lengthOf(x, decimals));
    return ctx.guard.string(ctx.span, fixed(x, decimals));
  }),

  entry('toNumber', 's', (_ctx, args) => {
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
