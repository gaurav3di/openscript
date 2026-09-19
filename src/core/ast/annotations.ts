import type { Positioned } from '../span/index.js';

/**
 * A type as a script writes it, on a parameter, a `var` or a function result.
 *
 * The tree keeps the words rather than a resolved type. A resolved type is the
 * checker's, it has no source position, and it exists for expressions that were
 * never annotated at all; an annotation is a piece of syntax with a span that a
 * caret can land on.
 */

/** The types a value can have, language.md 5.1. */
export const VALUE_TYPE_NAMES = ['number', 'string', 'bool', 'color'] as const;
export type ValueTypeName = (typeof VALUE_TYPE_NAMES)[number];

/**
 * The runtime object types of language.md 5.4.
 *
 * These five are recognised in a type position only and are ordinary global
 * function names everywhere else, which is why they are not reserved words. The
 * declaration handle types `plot`, `fill` and `level` are deliberately missing:
 * a handle can never be a `var`, a parameter, a result or an array element, so
 * it can never be annotated.
 */
export const OBJECT_TYPE_NAMES = ['line', 'label', 'box', 'polyline', 'table'] as const;
export type ObjectTypeName = (typeof OBJECT_TYPE_NAMES)[number];

export function isValueTypeName(text: string): text is ValueTypeName {
  return (VALUE_TYPE_NAMES as readonly string[]).includes(text);
}

export function isObjectTypeName(text: string): text is ObjectTypeName {
  return (OBJECT_TYPE_NAMES as readonly string[]).includes(text);
}

/**
 * A type written as one word.
 *
 * The word is an arbitrary string rather than one of the two unions above,
 * because "that is not a type" is OS2016 and OS2016 is a check, not a parse
 * error. A parser that could only build a legal annotation would have to report
 * a syntax error at `len: whole`, and the reader would get a caret and no
 * sentence naming the types that do exist.
 */
export interface NamedType extends Positioned {
  readonly kind: 'namedType';
  readonly name: string;
}

/** `series number`: one value of the element type per bar, language.md 5.2. */
export interface SeriesType extends Positioned {
  readonly kind: 'seriesType';
  readonly element: TypeAnnotation;
}

/**
 * `array<number>`, language.md 14.1.
 *
 * The element is any annotation and not just a legal element type, for the
 * reason `namedType` holds any word: `array<plot>` has to reach the checker so
 * that OS2019 can name the types an array does hold.
 */
export interface ArrayType extends Positioned {
  readonly kind: 'arrayType';
  readonly element: TypeAnnotation;
}

export type TypeAnnotation = NamedType | SeriesType | ArrayType;
