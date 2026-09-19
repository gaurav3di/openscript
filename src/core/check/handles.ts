/**
 * Where a declaration handle may stand, which is `language.md` 5.4's table.
 *
 * `plot()`, `plotCandles()`, `fill()` and `level()` hand back the compile-time
 * half of a declaration. It is not a value. No slot, no cell and no register
 * ever holds one, and nothing of it is left in the bar loop, so the places one
 * may be written are a closed list of three:
 *
 *     a declaration statement            plot(close, "C", aqua)
 *     the whole right side of a plain     upper = plot(basis + dev, "U", aqua)
 *       assignment, where the right side
 *       is the declaration call itself
 *     an argument of a call               fill(upper, lower, color = c)
 *
 * The third is a permission to be written, not to be accepted: the signature
 * decides, and `fill` is the one call in version 1 whose parameters take a
 * handle. Everywhere else a value is required, and 5.4 answers that with
 * OS2003.
 *
 * The rule is a permission rather than a refusal written out at each of the
 * twenty places a value can appear, because the refusal has to hold for the
 * position nobody thought of. An expression the checker accepts and the
 * emitter cannot emit becomes an instruction reading a slot nothing ever
 * writes, and a study then plots absence on every bar where the script said
 * plot. Silence of that kind is worse than a refusal, so the default is to
 * refuse and the permissions are listed.
 */
import type { Expression } from '../ast/index.js';
import type { Checker } from './checker.js';
import type { Type } from './types.js';
import { UNKNOWN, typeText } from './types.js';

/**
 * What a position holds when it requires a value and fixes no type of its own.
 *
 * A `var`, a ternary arm, a `return` and an operand of `==` all want one value
 * per bar and take any type. What they cannot take is the one thing that has no
 * per-bar value at all, and that is the sentence OS2003 has to say.
 */
const PER_BAR_VALUE = 'a per-bar value';

/**
 * Marks an expression as one of the places 5.4 lets a handle be written.
 *
 * Grouping is transparent to every rule in the language, so `(upper)` is
 * permitted wherever `upper` is and each layer is marked.
 */
export function allowHandle(checker: Checker, expression: Expression): void {
  let node: Expression = expression;
  for (;;) {
    checker.handleSites.add(node);
    if (node.kind !== 'grouping') return;
    node = node.expression;
  }
}

/** Whether a handle written here has been permitted by one of the three rules. */
export function handleAllowed(checker: Checker, expression: Expression): boolean {
  return checker.handleSites.has(expression);
}

/**
 * OS2003 for a handle in a position that requires a value, `language.md` 5.4.
 *
 * The expression is left `unknown` rather than left as a handle, so the rule
 * above it does not report a second time and the emitter is never handed a
 * handle to find a register for.
 */
export function refuseHandle(checker: Checker, expression: Expression, type: Type): Type {
  checker.report('OS2003', expression.span, {
    leftType: PER_BAR_VALUE,
    rightType: typeText(type),
  });
  return checker.record(expression, UNKNOWN, checker.warmupOf(expression));
}
