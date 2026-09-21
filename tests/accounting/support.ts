/**
 * One question, asked two ways: can this shape survive being written down.
 *
 * The money shapes and the run record are portable data on purpose, and the
 * reason is not tidiness. A run record is handed to a second engine as a
 * conformance case and handed back to this one months later to prove an upgrade
 * changed nothing, so a shape that only the process that built it can read is a
 * case that proves nothing about either. A date, a map, a class instance, a
 * function or an absent field all pass a review and fail at the first boundary,
 * and they fail quietly: `JSON.stringify` drops an undefined member, turns a
 * date into a string that never comes back as a date, and turns a map into an
 * empty object.
 *
 * So both halves of the question are asked, because neither one catches what
 * the other does.
 *
 * `Portable` is the compile time half. It rebuilds a type with every member
 * JSON cannot carry turned into `never`, so a literal written against it stops
 * compiling the moment somebody adds a member of a kind that cannot travel. It
 * catches the shape whether or not any test happens to build one.
 *
 * `portabilityProblems` is the run time half. It walks a value the tests build
 * and names what it found, which catches what a type cannot: a number that is
 * not finite, a member whose value is undefined where the type says it is a
 * number, and an object that comes back to itself.
 */

/**
 * The same shape, with every member JSON cannot carry turned into `never`.
 *
 * A `never` member is a member nothing can be assigned to, so a literal written
 * against this type stops compiling at the member that cannot travel and names
 * it. The list of what cannot travel is written out rather than inferred,
 * because a structural test for "a plain object" is not something a type can
 * ask, and a list somebody can read is worth more here than a clever one.
 */
export type Portable<T> = T extends string | number | boolean | null
  ? T
  : T extends readonly (infer Element)[]
    ? readonly Portable<Element>[]
    : T extends Date | RegExp | ReadonlyMap<unknown, unknown> | ReadonlySet<unknown>
      ? never
      : T extends (...args: never[]) => unknown
        ? never
        : T extends object
          ? { readonly [Key in keyof T]: Portable<T[Key]> }
          : never;

/**
 * What in this value could not be written down, in the words of where it is.
 *
 * Empty is the answer a shape in this part of the tree has to give. A finding
 * names the path, because a report saying only that something is wrong with a
 * record of fifty thousand bars is a report nobody can act on.
 */
export function portabilityProblems(value: unknown, at = 'the value'): readonly string[] {
  const problems: string[] = [];
  walk(value, at, new Set<object>(), problems);
  return problems;
}

function walk(value: unknown, at: string, seen: Set<object>, problems: string[]): void {
  if (value === null) return;

  const kind = typeof value;
  if (kind === 'string' || kind === 'boolean') return;
  if (kind === 'number') {
    if (!Number.isFinite(value)) {
      problems.push(`${at} is a number JSON does not carry, so it comes back as null`);
    }
    return;
  }
  if (kind !== 'object') {
    problems.push(`${at} is a ${kind}, which JSON does not carry`);
    return;
  }

  const held = value as object;
  if (seen.has(held)) {
    problems.push(`${at} is a reference back to something the value already holds`);
    return;
  }
  seen.add(held);

  if (Array.isArray(held)) {
    (held as readonly unknown[]).forEach((one, index) => {
      walk(one, `${at}[${index}]`, seen, problems);
    });
    seen.delete(held);
    return;
  }

  const prototype: unknown = Object.getPrototypeOf(held);
  if (prototype !== Object.prototype && prototype !== null) {
    problems.push(`${at} is tagged ${tagOf(held)} and is not a plain object`);
    seen.delete(held);
    return;
  }

  for (const [key, one] of Object.entries(held)) {
    if (one === undefined) {
      problems.push(`${at}.${key} is undefined, so JSON leaves the member out altogether`);
      continue;
    }
    walk(one, `${at}.${key}`, seen, problems);
  }
  seen.delete(held);
}

/**
 * What to call the thing in a finding: its own tag.
 *
 * The obvious spelling is the name of whatever built it, and this file does not
 * write it, because reaching for that property is the indirect route to the
 * function builder and rule one of this project closes that door rather than
 * arguing about which reach was innocent. The tag says as much for every kind
 * that matters here.
 */
function tagOf(held: object): string {
  return Object.prototype.toString.call(held).slice('[object '.length, -1);
}
