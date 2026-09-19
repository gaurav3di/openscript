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
 */
import type { Expression } from '../ast/index.js';
import { withoutGrouping } from '../ast/index.js';
import type { Checker } from './checker.js';
import { BAR_SERIES } from './surface.js';

/** The names `math` holds that are numbers rather than functions. */
const CONSTANT_MEMBERS = new Set(['math.pi', 'math.e']);

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
      if (binding !== undefined) return binding.input !== undefined;
      // A colour name is an ordinary global of type `color` and never changes.
      return checker.typeOf(inner).kind === 'color';
    }
    case 'member':
      return CONSTANT_MEMBERS.has(memberPath(inner.object, inner.member.text));
    case 'call':
      return calleeName(inner.callee) === 'input';
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
