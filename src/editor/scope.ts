/**
 * Which of the file's own names may be written at a position.
 *
 * A completion list that offered every name in the file would offer a loop
 * variable three blocks away and a function parameter from another function,
 * and a writer accepting one of those gets OS2001 from the compiler a moment
 * later. So the two rules the language states are applied, and both are asked of
 * the compiler's own answers rather than worked out again here.
 *
 *     declared above     OS2001 is "not defined at this point in the file", so a
 *                        name is offered from the end of the statement that
 *                        declares it. Not from the end of the name: `x` is not
 *                        yet a name inside `x = ema(x, 9)`, and `f` is not one
 *                        inside `f`'s own body, because recursion is OS2005
 *     and still inside   a name belongs to the block that declared it
 *                        (`language.md` 12), so it is offered inside that block
 *                        and nowhere else
 *
 * The bindings are the checker's, not a second walk of the tree: `declaredAt` is
 * the span the checker points OS2002 and OS8010 at, and the kind, the type and
 * the persistence are what it worked out. What is derived here is one thing, the
 * region a binding belongs to, and it is derived from the tree the parser
 * produced by asking which nodes enclose the declaration.
 */
import { containsOffset, endOffset, isStatement, pathAtOffset } from '../core/index.js';
import type { AstNode, Binding, CheckedScript, NodeKind } from '../core/index.js';

/**
 * The node kinds that hold a scope of their own.
 *
 * A block is the obvious one. A function declaration is here because its
 * parameters are declared in its header rather than in its body, and a loop
 * because its variable is declared in the header too. Anything else a name is
 * declared inside belongs to whichever of these encloses it, and a file level
 * name belongs to the file.
 */
const SCOPES: ReadonlySet<NodeKind> = new Set<NodeKind>([
  'block',
  'functionDeclaration',
  'forRangeStatement',
  'forInStatement',
]);

/**
 * The region a declaration belongs to, and the offset it starts being a name at.
 *
 * Both come from one walk of the path to the declaration. The region is the
 * innermost enclosing scope, or the file. The offset is the end of the statement
 * that declares it, except for a parameter and a loop variable, whose statement
 * is the function or the loop they are read inside: those two are names from the
 * end of the header that declares them.
 */
interface Region {
  readonly node: AstNode | undefined;
  readonly from: number;
}

const HEADERS: ReadonlySet<Binding['kind']> = new Set<Binding['kind']>(['parameter', 'loop']);

function regionOf(script: CheckedScript, binding: Binding): Region {
  const path = pathAtOffset(script.script, binding.declaredAt.offset);
  let node: AstNode | undefined;
  let statement: AstNode | undefined;

  for (let i = path.length - 1; i >= 0; i -= 1) {
    const held = path[i];
    if (held === undefined) continue;
    if (statement === undefined && isStatement(held)) statement = held;
    if (SCOPES.has(held.kind)) {
      node = held;
      break;
    }
  }

  const from = HEADERS.has(binding.kind)
    ? endOffset(binding.declaredAt)
    : endOffset(statement?.span ?? binding.declaredAt);
  return { node, from };
}

/**
 * Every name the file itself declares that may be written at an offset.
 *
 * A library name is not here: the manifest answers for those, and a binding of
 * kind `library` is the checker's record of the global scope rather than
 * something the file declared.
 */
export function inScopeAt(script: CheckedScript, offset: number): readonly Binding[] {
  return script.bindings.filter((binding) => {
    if (binding.kind === 'library') return false;
    const region = regionOf(script, binding);
    if (region.from > offset) return false;
    // No enclosing scope node means the file, and the file holds every offset,
    // including the one past its last character where somebody is typing.
    return region.node === undefined || containsOffset(region.node.span, offset);
  });
}

/**
 * The binding a name means at an offset, or nothing where the file declares none.
 *
 * The declaration itself counts, which the scope rule above deliberately does
 * not: a name is not in scope inside its own right hand side, and pointing at it
 * on the line that declares it is still pointing at it. Without this, a hover
 * over the `x` in `x = ema(close, 9)` would say nothing at all.
 */
export function bindingNamed(
  script: CheckedScript,
  name: string,
  offset: number,
): Binding | undefined {
  const declaring = script.bindings.find(
    (binding) => binding.name === name && containsOffset(binding.declaredAt, offset),
  );
  if (declaring !== undefined) return declaring;

  const held = inScopeAt(script, offset).filter((binding) => binding.name === name);
  // The innermost declaration wins, which is the one declared last among those
  // still in scope: a block level name shadows a file level one of the same
  // spelling for as long as its block lasts.
  return held[held.length - 1];
}
