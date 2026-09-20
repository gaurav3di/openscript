/**
 * Whether an expression is settled before the first bar runs.
 *
 * `language.md` 13.2 states the rule once and every option, declaration field
 * and marker argument follows it: a literal, arithmetic over literals, or a
 * call to `input()`. A settings dialog and a legend are built before bar 0, so
 * a field that depended on a bar could not be filled in at the moment the host
 * needs it, and that is OS3003.
 *
 * An `input()` counts because it is resolved before bar 0 as well. The name a
 * script assigns an input to counts for the same reason, which is what lets
 * `table(position = corner)` work with `corner` declared above it.
 *
 * So does a colour built out of constants, which is the one call in the library
 * whose result is settled before bar 0 as surely as a literal is. `fade(red, 50)`
 * is the same four numbers on every bar, it is what a level and a marker are
 * normally coloured with, and refusing it would leave a script no way to write a
 * translucent colour in a field that has to be fixed.
 */
import type { Expression } from '../ast/index.js';
import { withoutGrouping } from '../ast/index.js';
import { inputHeldBy } from './checked.js';
import type { Checker } from './checker.js';
import { BAR_SERIES } from './surface.js';

/** The names `math` holds that are numbers rather than functions. */
const CONSTANT_MEMBERS = new Set(['math.pi', 'math.e']);

/**
 * The calls that produce a value before the first bar, `stdlib.md` 11.2.
 *
 * A colour built out of constants is a constant: `fade(red, 50)` is the same
 * four numbers on every bar, and a level or a marker declared with one has a
 * colour to carry. The list is here, beside the rule, because the compiler folds
 * exactly these and the two have to be one list rather than two. A call this
 * accepted and the emitter could not fold would reach a declaration field with
 * nothing to write in it, and the compiler would have to refuse a script that
 * the checker had already passed.
 */
export const FOLDABLE_CALLS: ReadonlySet<string> = new Set([
  'rgb',
  'rgba',
  'fade',
  'withAlpha',
  'alpha',
  'mix',
]);

export function isCompileTimeConstant(checker: Checker, expression: Expression): boolean {
  const inner = withoutGrouping(expression);
  switch (inner.kind) {
    case 'numberLiteral':
    case 'stringLiteral':
    case 'booleanLiteral':
    case 'colorLiteral':
    case 'noneLiteral':
      return true;
    case 'arrayLiteral':
      return inner.elements.every((element) => isCompileTimeConstant(checker, element));
    case 'unary':
      return isCompileTimeConstant(checker, inner.operand);
    case 'binary':
      return (
        isCompileTimeConstant(checker, inner.left) && isCompileTimeConstant(checker, inner.right)
      );
    case 'ternary':
      return (
        isCompileTimeConstant(checker, inner.condition) &&
        isCompileTimeConstant(checker, inner.whenTrue) &&
        isCompileTimeConstant(checker, inner.whenFalse)
      );
    case 'nameReference': {
      const binding = checker.lookup(inner.name);
      // A name that holds a setting is one, and a `var` initialised from one is
      // not: the cell is the setting's value on the first bar and whatever the
      // bar puts in it after that, so it is fixed before bar 0 only until
      // something assigns to it (`language.md` 8.2 and 13.4).
      if (binding !== undefined) return inputHeldBy(binding) !== undefined;
      // A colour name is an ordinary global of type `color` and never changes.
      return checker.typeOf(inner).kind === 'color';
    }
    case 'member':
      return CONSTANT_MEMBERS.has(memberPath(inner.object, inner.member.text));
    case 'call': {
      const name = calleeName(inner.callee);
      if (name === 'input') return true;
      if (name === undefined || !FOLDABLE_CALLS.has(name)) return false;
      return inner.args.every((argument) => isCompileTimeConstant(checker, argument.value));
    }
    default:
      return false;
  }
}

/**
 * Whether the expression names one of the price series an `input` may default
 * to, `stdlib.md` 13.1.
 *
 * A source input is the one place a bar series stands where a constant is
 * otherwise required: `input(close, "Source")` does not read `close`, it names
 * which column the study is to read, and the host resolves that before bar 0
 * exactly as it resolves a number.
 */
export function isSourceName(expression: Expression): boolean {
  const inner = withoutGrouping(expression);
  return inner.kind === 'nameReference' && BAR_SERIES.includes(inner.name);
}

function memberPath(object: Expression, member: string): string {
  const inner = withoutGrouping(object);
  return inner.kind === 'nameReference' ? `${inner.name}.${member}` : member;
}

function calleeName(callee: Expression): string | undefined {
  const inner = withoutGrouping(callee);
  if (inner.kind === 'nameReference') return inner.name;
  if (inner.kind === 'member') {
    const object = withoutGrouping(inner.object);
    if (object.kind === 'nameReference') return `${object.name}.${inner.member.text}`;
  }
  return undefined;
}

/** The dotted name a callee spells, or nothing when it is not a name at all. */
export function calleeNameOf(callee: Expression): string | undefined {
  return calleeName(callee);
}
