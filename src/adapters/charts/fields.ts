/**
 * A declaration field, read.
 *
 * Every field of `meta` and of every declaration in `outputs` holds either a
 * value or the reference `{ "input": key }`, and the reference is how a tunable
 * colour, a tunable pane range or a tunable band opacity reaches a declaration
 * that is otherwise fixed before the first bar. The engine resolves those once
 * at load, against the settings the host handed it; this module resolves the
 * same fields against the settings the chart currently holds, which is what a
 * descriptor built once and restyled many times needs.
 *
 * The lookup is a parameter rather than a settings object because converting one
 * stored setting into a value is the input table's job, not this module's, and
 * passing it in is what keeps the two from having to import each other.
 */
import type { Colour, Field, InputReference } from '../../core/emit/index.js';
import type { ColourValue, Value } from '../../core/engine/index.js';
import { isColourValue } from './colours.js';

/** What a field's `{ "input": key }` form is resolved through. */
export type InputLookup = (key: string) => Value;

export function isReference(field: Field): field is InputReference {
  return typeof field === 'object' && field !== null && !Array.isArray(field);
}

/** A field as a value, with any input reference resolved. */
export function fieldOf(field: Field, lookup: InputLookup): Value {
  if (field === null) return null;
  if (isReference(field)) return lookup(field.input);
  if (Array.isArray(field)) return colourFrom(field);
  return field as Value;
}

/** A field that holds a colour, or nothing when it holds none. */
export function colourField(field: Field, lookup: InputLookup): ColourValue | undefined {
  const value = fieldOf(field, lookup);
  return isColourValue(value) ? value : undefined;
}

export function numberField(field: Field, lookup: InputLookup, fallback: number): number {
  const value = fieldOf(field, lookup);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function stringField(field: Field, lookup: InputLookup, fallback: string): string {
  const value = fieldOf(field, lookup);
  return typeof value === 'string' ? value : fallback;
}

export function boolField(field: Field, lookup: InputLookup): boolean | undefined {
  const value = fieldOf(field, lookup);
  return typeof value === 'boolean' ? value : undefined;
}

/** A field that holds `[min, max]`, or nothing when it holds no such pair. */
export function rangeField(
  field: Field,
  lookup: InputLookup,
): { readonly min: number; readonly max: number } | null {
  const value = isReference(field) ? lookup(field.input) : field;
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [min, max] = value as readonly unknown[];
  if (typeof min !== 'number' || typeof max !== 'number') return null;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

/** The four numbers a colour field carries, as the value model holds them. */
function colourFrom(field: readonly number[] | Colour): ColourValue | null {
  if (field.length !== 4) return null;
  const [r, g, b, a] = field as readonly [number, number, number, number];
  return { tag: 'color', r, g, b, a };
}
