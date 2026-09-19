/**
 * Check 1 of `compiled-program.md` 3.5: every required field is present and of
 * the declared type.
 *
 * This is the half of verification that reads an untrusted object and decides
 * whether it is a compiled program at all. It runs before anything else,
 * because every later check indexes into a table this one proves is a table.
 *
 * The failures are all one code. OS6018 covers a malformed instruction list, an
 * unreadable encoding and a field of the wrong type because they are not
 * separate fixes: each is a defect of the compiler that wrote the program, and
 * none of them is repairable by hand. What varies is the location, and the
 * location is a field path, so a compiler author is told `outputs.plots[2].
 * channel` rather than "structure".
 */
import type { Diagnostic } from '../diagnostics/index.js';
import { malformed } from './errors.js';

type Unknown = Readonly<Record<string, unknown>>;

/** Collects the first failure and stops: a malformed program has no second opinion. */
export class ShapeCheck {
  private failure: Diagnostic | undefined;

  problem(): Diagnostic | undefined {
    return this.failure;
  }

  fail(path: string, reason: string): false {
    this.failure ??= malformed(path, reason);
    return false;
  }

  object(value: unknown, path: string): value is Unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return this.fail(path, 'an object was required');
    }
    return true;
  }

  array(value: unknown, path: string): value is readonly unknown[] {
    if (!Array.isArray(value)) return this.fail(path, 'an array was required');
    return true;
  }

  number(value: unknown, path: string): value is number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return this.fail(path, 'a finite number was required');
    }
    return true;
  }

  whole(value: unknown, path: string): value is number {
    if (!this.number(value, path)) return false;
    if (!Number.isInteger(value)) return this.fail(path, 'a whole number was required');
    return true;
  }

  string(value: unknown, path: string): value is string {
    if (typeof value !== 'string') return this.fail(path, 'a string was required');
    return true;
  }

  bool(value: unknown, path: string): value is boolean {
    if (typeof value !== 'boolean') return this.fail(path, 'a true or false was required');
    return true;
  }

  /** A whole number that indexes a table, with the table's size in the message. */
  index(value: unknown, path: string, size: number, table: string): value is number {
    if (!this.whole(value, path)) return false;
    if (value < 0 || value >= size) {
      return this.fail(path, `${value} is outside ${table}, which holds ${size}`);
    }
    return true;
  }

  one<T extends string>(value: unknown, path: string, allowed: readonly T[]): value is T {
    if (!this.string(value, path)) return false;
    if (!(allowed as readonly string[]).includes(value)) {
      return this.fail(path, `${value} is not one of ${allowed.join(', ')}`);
    }
    return true;
  }

  /** A field that may be a value or null, which is a value the script could write. */
  nullable(value: unknown, path: string, check: (v: unknown, p: string) => boolean): boolean {
    return value === null ? true : check.call(this, value, path);
  }
}

/** The tags of a constant pool entry, 2.9. */
const CONSTANT_TAGS = ['z', 'b', 'n', 's', 'c'] as const;

export function checkConstant(shape: ShapeCheck, value: unknown, path: string): boolean {
  if (!shape.array(value, path)) return false;
  if (value.length !== 2) return shape.fail(path, 'a pool entry is a tag and a value');
  const tag = value[0];
  if (!shape.one(tag, `${path}[0]`, CONSTANT_TAGS)) return false;
  const held = value[1];
  switch (tag) {
    case 'z':
      return held === null ? true : shape.fail(`${path}[1]`, 'the absent entry holds null');
    case 'b':
      return shape.bool(held, `${path}[1]`);
    case 'n':
      return shape.number(held, `${path}[1]`);
    case 's':
      return shape.string(held, `${path}[1]`);
    default:
      return checkColour(shape, held, `${path}[1]`);
  }
}

export function checkColour(shape: ShapeCheck, value: unknown, path: string): boolean {
  if (!shape.array(value, path)) return false;
  if (value.length !== 4) return shape.fail(path, 'a colour is four numbers');
  for (let i = 0; i < 3; i += 1) {
    if (!shape.whole(value[i], `${path}[${i}]`)) return false;
    const channel = value[i] as number;
    if (channel < 0 || channel > 255) {
      return shape.fail(`${path}[${i}]`, `a channel runs 0 to 255 and this is ${channel}`);
    }
  }
  if (!shape.number(value[3], `${path}[3]`)) return false;
  const alpha = value[3] as number;
  if (alpha < 0 || alpha > 1) {
    return shape.fail(`${path}[3]`, `an alpha runs 0 to 1 and this is ${alpha}`);
  }
  return true;
}

/**
 * A declaration field, 2.3: a value, or the `{ "input": key }` reference.
 *
 * The key half of check 10 lives here, because this is the one walk that
 * visits every field that may hold one. The value half runs later, with the
 * host's settings in hand.
 */
export function checkField(
  shape: ShapeCheck,
  value: unknown,
  path: string,
  keys: ReadonlySet<string>,
): boolean {
  if (value === null) return true;
  const kind = typeof value;
  if (kind === 'boolean' || kind === 'string') return true;
  if (kind === 'number') return shape.number(value, path);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      if (!shape.number(value[i], `${path}[${i}]`)) return false;
    }
    return true;
  }
  if (!shape.object(value, path)) return false;
  const key = value['input'];
  if (key === undefined) return shape.fail(path, 'an object here is an input reference');
  if (!shape.string(key, `${path}.input`)) return false;
  if (!keys.has(key)) {
    return shape.fail(path, `it names the input ${key}, which inputs[] does not declare`);
  }
  return true;
}
