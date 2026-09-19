/**
 * The canonical encoding, `compiled-program.md` 2.14.
 *
 * It exists so that a hash of a program means something: two compilers, in two
 * languages, handed the same source, produce the same bytes. So none of the
 * rules below is cosmetic, and none of them is this file's invention.
 *
 * - UTF-8, no byte order mark, no whitespace between tokens.
 * - Object keys sorted ascending by Unicode code point. Sorted rather than in
 *   the specification's listed order, because a sort is a rule an emitter in any
 *   language can follow without a table.
 * - A number is the shortest decimal string that reads back as the same
 *   binary64 value, with an exponent written as `e` and an optional `-`.
 * - A string escapes only the quote, the backslash and the code points below
 *   0x20, the last as `\u00XX` except for `\n`, `\r` and `\t`.
 */
import type { CompiledProgram } from './program.js';
import { sha256 } from './sha256.js';

/**
 * A number, shortest round trip.
 *
 * The host's own shortest form is already the shortest that reads back
 * identically. What it is not is the spelling the specification asks for: a
 * positive exponent is written with a `+` that the format does not allow, so
 * that one sign is removed and nothing else is touched.
 */
export function canonicalNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error('a compiled program holds finite numbers only');
  return String(value === 0 ? 0 : value).replace('e+', 'e');
}

export function canonicalString(value: string): string {
  let out = '"';
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (character === '"') out += '\\"';
    else if (character === '\\') out += '\\\\';
    else if (character === '\n') out += '\\n';
    else if (character === '\r') out += '\\r';
    else if (character === '\t') out += '\\t';
    else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, '0')}`;
    else out += character;
  }
  return `${out}"`;
}

export function canonicalise(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return canonicalNumber(value);
  if (typeof value === 'string') return canonicalString(value);
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, one]) => one !== undefined,
    );
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const body = entries
      .map(([key, one]) => `${canonicalString(key)}:${canonicalise(one)}`)
      .join(',');
    return `{${body}}`;
  }
  throw new Error(`a compiled program holds no value of this kind: ${typeof value}`);
}

/**
 * The two hashes a host records against a run.
 *
 * `source.hash` identifies the source and the hash of the canonical encoding
 * identifies the program, and they are two answers because a compiler change
 * that alters what a source compiles to has to be visible without the source
 * having changed at all.
 */
export function sourceHash(text: string): string {
  return `sha256:${sha256(text)}`;
}

export function programHash(program: CompiledProgram): string {
  return `sha256:${sha256(canonicalise(program))}`;
}
