/**
 * OS8019: a name, or an array, still holding an object the script deleted.
 *
 * `language.md` 5.4: deleting an object touches neither the name nor the array
 * element that refers to it, so what is left is stale rather than absent, and
 * the next setter that reaches it stops the bar with OS4005, usually many bars
 * after the line that caused it. The warning is about the line that caused it.
 *
 * The rule is read on one path, which is the block the delete is written in.
 * A `draw.delete(name)` is cleared by a later statement of the same block that
 * assigns the name again, `none` or a new object alike. A
 * `draw.delete(element(arr, i))`, or `arr[i]`, is cleared by a later statement
 * of the same block that takes an element out of the array or empties it. Only
 * a name that outlives the bar is followed: a plain name is recomputed on the
 * next bar, and a stale value in it cannot reach one.
 *
 * What this does not see, and does not claim to: a clearing line in a nested
 * block, which may not run, and a deletion reached through a function's
 * parameter, where the name the caller holds is not in view.
 */
import type { AstNode, Block, Call, Expression, Script } from '../ast/index.js';
import { childrenOf, withoutGrouping } from '../ast/index.js';
import type { Binding } from './checked.js';
import type { Checker } from './checker.js';
import { elementOf } from './types.js';

/** The calls that take an element out of an array or empty it, `language.md` 14.1. */
const REMOVING = new Set(['shift', 'pop', 'remove', 'clear']);

interface Held {
  readonly binding: Binding;
  /** Whether the object sits in an element of the array the binding names. */
  readonly inArray: boolean;
}

export function reportDeletedStillHeld(checker: Checker): void {
  visit(checker, checker.script);
}

function visit(checker: Checker, node: AstNode): void {
  if (node.kind === 'script' || node.kind === 'block') {
    reportList(checker, statementsOf(node));
  }
  for (const child of childrenOf(node)) visit(checker, child);
}

function statementsOf(node: Script | Block): readonly AstNode[] {
  return node.kind === 'script' ? node.items : node.statements;
}

function reportList(checker: Checker, statements: readonly AstNode[]): void {
  statements.forEach((statement, index) => {
    const call = deleteCall(checker, statement);
    if (call === undefined) return;
    const argument = call.args[0]?.value;
    if (argument === undefined) return;
    const held = heldBy(checker, argument);
    if (held === undefined) return;
    const kind = objectKindOf(checker, argument);
    if (kind === undefined) return;
    const later = statements.slice(index + 1);
    const cleared = held.inArray
      ? later.some((one) => removesFrom(checker, one, held.binding))
      : later.some((one) => assigns(one, held.binding.name));
    if (cleared) return;
    checker.report('OS8019', argument.span, {
      name: held.binding.name,
      kind,
      line: call.span.line,
    });
  });
}

/** The `draw.delete(...)` a statement is, when it is one. */
function deleteCall(checker: Checker, statement: AstNode): Call | undefined {
  if (statement.kind !== 'expressionStatement') return undefined;
  const expression = withoutGrouping(statement.expression);
  if (expression.kind !== 'call') return undefined;
  return checker.callSites.get(expression)?.name === 'draw.delete' ? expression : undefined;
}

/** The persistent name the deleted object is still reachable through. */
function heldBy(checker: Checker, argument: Expression): Held | undefined {
  const written = withoutGrouping(argument);
  if (written.kind === 'nameReference') {
    const binding = persistent(checker, written);
    return binding === undefined ? undefined : { binding, inArray: false };
  }
  const array = arrayOf(checker, written);
  if (array === undefined) return undefined;
  const binding = persistent(checker, array);
  return binding === undefined ? undefined : { binding, inArray: true };
}

/** `element(arr, i)` or `arr[i]`, as the array expression it reads. */
function arrayOf(checker: Checker, written: Expression): Expression | undefined {
  if (written.kind === 'index') return withoutGrouping(written.target);
  if (written.kind === 'call' && checker.callSites.get(written)?.name === 'element') {
    const first = written.args[0]?.value;
    return first === undefined ? undefined : withoutGrouping(first);
  }
  return undefined;
}

function persistent(checker: Checker, expression: Expression): Binding | undefined {
  if (expression.kind !== 'nameReference') return undefined;
  const binding = checker.references.get(expression);
  return binding !== undefined && binding.persistence !== 'none' ? binding : undefined;
}

function objectKindOf(checker: Checker, argument: Expression): string | undefined {
  const type = checker.types.get(argument);
  if (type === undefined) return undefined;
  const element = elementOf(type);
  return element.kind === 'object' ? element.object : undefined;
}

function assigns(statement: AstNode, name: string): boolean {
  return statement.kind === 'assignment' && statement.target.text === name;
}

/** Whether any call in the statement takes an element out of this array. */
function removesFrom(checker: Checker, node: AstNode, binding: Binding): boolean {
  if (node.kind === 'call') {
    const name = checker.callSites.get(node)?.name;
    const first = node.args[0]?.value;
    if (name !== undefined && REMOVING.has(name) && first !== undefined) {
      const target = withoutGrouping(first);
      if (target.kind === 'nameReference' && checker.references.get(target) === binding) return true;
    }
  }
  return childrenOf(node).some((child) => removesFrom(checker, child, binding));
}
