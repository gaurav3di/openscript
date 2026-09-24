/**
 * The names some line of the file gives a value, wherever that line is.
 *
 * `warmup.ts` answers `never` for a value that is absent on every bar, and
 * OS8009 is built on it. The checker reads a name's warmup at the point of use,
 * in source order, which is right for a plain name: it is recomputed every bar
 * and cannot be read before this bar's line writes it. It is not right for a
 * `var`, which is one name over the whole run: a line near the top can read the
 * value a line near the bottom wrote on the bar before, which is the shape of
 * every rollover that carries a running figure into a held one and restarts it.
 *
 * So the checker asks this set before it calls a `var` never. An assignment of
 * the literal `none` is not counted, because it gives the name nothing, and a
 * placeholder `var x = none` that nothing else writes stays exactly what OS8009
 * was written for.
 */
import type { AstNode, Script } from '../ast/index.js';
import { childrenOf, withoutGrouping } from '../ast/index.js';

export function namesGivenAValue(script: Script): ReadonlySet<string> {
  const found = new Set<string>();
  collect(script, found);
  return found;
}

function collect(node: AstNode, found: Set<string>): void {
  if (node.kind === 'assignment' && withoutGrouping(node.value).kind !== 'noneLiteral') {
    found.add(node.target.text);
  }
  for (const child of childrenOf(node)) collect(child, found);
}
