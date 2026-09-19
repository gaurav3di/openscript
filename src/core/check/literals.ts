/**
 * The value behind an expression that was written out.
 *
 * Several rules only apply to a value the source states rather than computes: a
 * length has to be a whole number when it is written as one, a `style` has to
 * be one of a closed set when it is written as a string, and a warmup is exact
 * only when every length on the path was a number in the file. Each of those
 * asks the same two questions, and asking them in one place is what keeps the
 * answers the same.
 *
 * A written negative is a unary minus over a literal rather than a literal, so
 * it is read through here as well. Without that, `step = -1` would look like
 * something computed and a loop that counts downwards would lose the one check
 * that says it terminates.
 */
import type { Expression } from '../ast/index.js';
import { withoutGrouping } from '../ast/index.js';

export function literalNumber(expression: Expression | undefined): number | undefined {
  if (expression === undefined) return undefined;
  const inner = withoutGrouping(expression);
  if (inner.kind === 'numberLiteral') return inner.value;
  if (inner.kind === 'unary' && (inner.operator === '-' || inner.operator === '+')) {
    const operand = literalNumber(inner.operand);
    if (operand === undefined) return undefined;
    return inner.operator === '-' ? -operand : operand;
  }
  return undefined;
}

export function literalString(expression: Expression | undefined): string | undefined {
  if (expression === undefined) return undefined;
  const inner = withoutGrouping(expression);
  return inner.kind === 'stringLiteral' ? inner.value : undefined;
}
