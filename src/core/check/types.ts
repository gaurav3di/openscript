/**
 * The types of language.md section 5, as the checker holds them.
 *
 * An annotation is syntax and has a span; this is the checker's answer, it has
 * no position, and it exists for expressions nobody annotated. The two are
 * separate for that reason and `ast/annotations.ts` says the same thing from
 * the other side.
 *
 * Three things about this model are worth knowing before reading anything that
 * uses it.
 *
 * `none` is a member of every type (section 6), so it is a type here and it
 * satisfies every other one. That is why a first assignment of `none` fixes
 * nothing: there is no information in it to fix a name's type with.
 *
 * A series is a wrapper rather than a flag, and broadcast (section 5.2) makes
 * `T` and `series T` interchangeable at every boundary, so nothing outside this
 * file compares two types by identity.
 *
 * `unknown` is what an expression has after a diagnostic was already reported
 * about it. It satisfies everything and everything satisfies it, so one mistake
 * produces one diagnostic instead of one per operator above it.
 */

/** The scalar types, which are the ones an array may hold and a `var` may take. */
export const VALUE_KINDS = ['number', 'string', 'bool', 'color'] as const;
export type ValueKind = (typeof VALUE_KINDS)[number];

/** The runtime object types of language.md 5.4. */
export const OBJECT_KINDS = ['line', 'label', 'box', 'polyline', 'table'] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

/** The declaration handle types of language.md 5.4. */
export const HANDLE_KINDS = ['plot', 'fill', 'level'] as const;
export type HandleKind = (typeof HANDLE_KINDS)[number];

export type Type =
  | { readonly kind: ValueKind }
  | { readonly kind: 'none' }
  | { readonly kind: 'series'; readonly element: Type }
  | { readonly kind: 'array'; readonly element: Type }
  | { readonly kind: 'handle'; readonly handle: HandleKind }
  | { readonly kind: 'object'; readonly object: ObjectKind }
  /**
   * The object kinds one parameter accepts, and nothing else.
   *
   * `draw.setFrom` moves the first anchor of a line or of a box, and neither a
   * single object type nor `any` says that: the first is too narrow to write
   * and the second takes a label, a number and everything else, which is how a
   * setter applied to the wrong object came to compile, run on every bar and
   * draw nothing with nothing reported.
   *
   * It is a set of object kinds rather than a union of arbitrary types because
   * a set is what the eleven signatures that need it mean, and nothing else in
   * version 1 needs more. A general union would have to answer what it means
   * for a series, an array element and a name's type, and no entry is asking.
   * This type therefore appears in a library signature and never as the type of
   * an expression, so nothing downstream has to hold one.
   */
  | { readonly kind: 'objects'; readonly objects: readonly ObjectKind[] }
  /** The absence of a result. Not a type a name can hold; see language.md 5.1. */
  | { readonly kind: 'nothing' }
  /**
   * A stand-in inside a library signature, and nowhere else.
   *
   * `element(arr, i)` returns whatever `arr` holds and `orElse(x, fallback)`
   * returns whatever it was given. Both are one signature over many types, and
   * the call site binds the stand-in to a real type before anything downstream
   * sees it, so no expression is ever left with one of these as its type.
   */
  | { readonly kind: 'variable'; readonly name: string }
  /** Already reported about. Satisfies everything, so mistakes do not cascade. */
  | { readonly kind: 'unknown' };

export const NUMBER: Type = { kind: 'number' };
export const STRING: Type = { kind: 'string' };
export const BOOL: Type = { kind: 'bool' };
export const COLOR: Type = { kind: 'color' };
export const NONE: Type = { kind: 'none' };
export const NOTHING: Type = { kind: 'nothing' };
export const UNKNOWN: Type = { kind: 'unknown' };

export function seriesOf(element: Type): Type {
  return element.kind === 'series' ? element : { kind: 'series', element };
}

export function arrayOf(element: Type): Type {
  return { kind: 'array', element };
}

export function handleType(handle: HandleKind): Type {
  return { kind: 'handle', handle };
}

export function objectType(object: ObjectKind): Type {
  return { kind: 'object', object };
}

/** The set of object kinds a parameter accepts, for a signature that takes two. */
export function objectsType(objects: readonly ObjectKind[]): Type {
  return { kind: 'objects', objects };
}

/** The object kinds a type stands for, or nothing when it stands for none. */
function objectKindsOf(type: Type): readonly ObjectKind[] | undefined {
  if (type.kind === 'object') return [type.object];
  if (type.kind === 'objects') return type.objects;
  return undefined;
}

/** The value behind a series, and the type itself when it is not one. */
export function elementOf(type: Type): Type {
  return type.kind === 'series' ? type.element : type;
}

export function isSeries(type: Type): boolean {
  return type.kind === 'series';
}

export function isHandle(type: Type): boolean {
  return type.kind === 'handle';
}

export function isDefinite(type: Type): boolean {
  return type.kind !== 'none' && type.kind !== 'unknown';
}

/**
 * The type as a reader sees it in a message.
 *
 * Every OS2003, OS2012 and OS3011 puts one of these in front of somebody, so
 * the spelling is the spelling of the specification's own tables rather than an
 * internal tag: `series number`, not `series(number)`.
 */
export function typeText(type: Type): string {
  switch (type.kind) {
    case 'series':
      return `series ${typeText(type.element)}`;
    case 'array':
      return `array<${typeText(type.element)}>`;
    case 'handle':
      return type.handle;
    case 'object':
      return type.object;
    case 'objects':
      return kindList(type.objects);
    case 'nothing':
      return 'nothing';
    case 'variable':
      return type.name;
    case 'unknown':
      return 'unknown';
    default:
      return type.kind;
  }
}

/**
 * A set of object kinds as a reader sees it: `a line or a box`.
 *
 * Written out rather than abbreviated because this is the whole of what OS3011
 * can tell somebody who passed the wrong object: the sentence has to name what
 * the setter does take, and a reader who is told `object` learns nothing.
 */
function kindList(kinds: readonly ObjectKind[]): string {
  if (kinds.length === 0) return 'nothing';
  if (kinds.length === 1) return kinds[0] as string;
  return `${kinds.slice(0, -1).join(', ')} or ${kinds[kinds.length - 1] as string}`;
}

/**
 * Whether two types are the same once broadcast is taken into account.
 *
 * Broadcast (language.md 5.2) changes no value, so `number` and `series number`
 * are the same type to every rule in the language that asks whether two things
 * mix. The series-ness survives in the result, which is what `join` is for.
 */
export function sameType(left: Type, right: Type): boolean {
  const a = elementOf(left);
  const b = elementOf(right);
  if (a.kind === 'unknown' || b.kind === 'unknown') return true;
  if (a.kind === 'variable' || b.kind === 'variable') return true;
  // A set of object kinds is compared before the tags are, because an object
  // and a set the object is in are the same type to every rule that asks. A
  // kind outside the set is not, which is the whole point of writing the set.
  if (a.kind === 'objects' || b.kind === 'objects') {
    const wanted = objectKindsOf(a);
    const given = objectKindsOf(b);
    if (wanted === undefined || given === undefined) return false;
    return given.some((one) => wanted.includes(one));
  }
  if (a.kind !== b.kind) return false;
  if (a.kind === 'array' && b.kind === 'array') return sameType(a.element, b.element);
  if (a.kind === 'handle' && b.kind === 'handle') return a.handle === b.handle;
  if (a.kind === 'object' && b.kind === 'object') return a.object === b.object;
  return true;
}

/**
 * Whether a value of `from` may stand where `to` is wanted.
 *
 * `none` is accepted everywhere a value is, because it is a member of every
 * type. `nothing` is accepted nowhere, because a call that draws rather than
 * computing has no result to stand anywhere: that case is OS2003.
 */
export function accepts(to: Type, from: Type): boolean {
  if (to.kind === 'unknown' || from.kind === 'unknown') return true;
  if (to.kind === 'variable' || from.kind === 'variable') return true;
  if (from.kind === 'nothing' || to.kind === 'nothing') return from.kind === to.kind;
  if (from.kind === 'none') return true;
  if (to.kind === 'none') return true;
  return sameType(to, from);
}

/**
 * Whether two types may stand beside each other.
 *
 * This is `sameType` with the rule of language.md 6 added: `none` is a member
 * of every type, so an arm of a ternary, a `case` value or an operand of `==`
 * that is absent mixes with anything. It is the test every rule that compares
 * two written expressions uses, and `sameType` is the narrower question of
 * whether two definite types are the same one.
 */
export function compatible(left: Type, right: Type): boolean {
  if (left.kind === 'nothing' || right.kind === 'nothing') return left.kind === right.kind;
  if (elementOf(left).kind === 'none' || elementOf(right).kind === 'none') return true;
  return sameType(left, right);
}

/**
 * The type of a place that holds both, with series-ness carried across.
 *
 * A name assigned a plain number on one line and a series number on another
 * holds a series number, because a bar where the plain value was written is a
 * bar of the series. `none` never decides the answer, which is the rule of
 * language.md 10.1 stated once, here, for every caller.
 */
export function join(left: Type, right: Type): Type {
  if (left.kind === 'unknown') return right;
  if (right.kind === 'unknown') return left;
  if (left.kind === 'none') return right;
  if (right.kind === 'none') return left;
  const element = elementOf(left);
  return isSeries(left) || isSeries(right) ? seriesOf(element) : element;
}

/** Whether this type may be an array element, language.md 14.1. OS2019 otherwise. */
export function canBeArrayElement(type: Type): boolean {
  switch (type.kind) {
    case 'number':
    case 'string':
    case 'bool':
    case 'color':
    case 'object':
    case 'unknown':
      return true;
    default:
      return false;
  }
}
