/**
 * The constant pool, `compiled-program.md` 2.9.
 *
 * Entries 0, 1 and 2 are absent, `false` and `true`, always, so `CONST 0` is
 * the whole of pushing absence and no instruction has to encode a literal.
 * Everything else is deduplicated, because a pool is per program and a literal
 * repeated forty times is forty pushes of one entry.
 *
 * An array literal is deliberately not poolable. It must produce a new array
 * every time it is evaluated, so it compiles to pushes and an `ARRAY`
 * instruction, and a shared pool object would be the same array on every bar.
 */
import type { Constant } from './program.js';
import type { Value } from './values.js';

export const ABSENT_INDEX = 0;
export const FALSE_INDEX = 1;
export const TRUE_INDEX = 2;

export class ConstantPool {
  private readonly entries: Constant[] = [
    ['z', null],
    ['b', false],
    ['b', true],
  ];
  private readonly byKey = new Map<string, number>([
    ['z', ABSENT_INDEX],
    ['b:false', FALSE_INDEX],
    ['b:true', TRUE_INDEX],
  ]);

  get all(): readonly Constant[] {
    return this.entries;
  }

  absent(): number {
    return ABSENT_INDEX;
  }

  bool(value: boolean): number {
    return value ? TRUE_INDEX : FALSE_INDEX;
  }

  number(value: number): number {
    // A negative zero is normalised on every store (3.1), so the pool never
    // holds one and two scripts writing 0 and -0 share an entry.
    return this.intern(['n', value === 0 ? 0 : value], `n:${value === 0 ? 0 : value}`);
  }

  string(value: string): number {
    return this.intern(['s', value], `s:${value}`);
  }

  colour(value: readonly [number, number, number, number]): number {
    return this.intern(['c', value], `c:${value.join(',')}`);
  }

  /** The pool index for a folded value, or nothing when it is not poolable. */
  of(value: Value): number | undefined {
    switch (value.kind) {
      case 'absent':
        return this.absent();
      case 'bool':
        return this.bool(value.value);
      case 'number':
        return this.number(value.value);
      case 'string':
        return this.string(value.value);
      case 'colour':
        return this.colour(value.value);
      default:
        return undefined;
    }
  }

  private intern(entry: Constant, key: string): number {
    const found = this.byKey.get(key);
    if (found !== undefined) return found;
    const index = this.entries.length;
    this.entries.push(entry);
    this.byKey.set(key, index);
    return index;
  }
}

/** A folded value as a constant entry, for an input's default and its options. */
export function constantOf(value: Value): Constant | undefined {
  switch (value.kind) {
    case 'absent':
      return ['z', null];
    case 'bool':
      return ['b', value.value];
    case 'number':
      return ['n', value.value];
    case 'string':
      return ['s', value.value];
    case 'colour':
      return ['c', value.value];
    default:
      return undefined;
  }
}
