/**
 * A tag that names nothing, read from the file, `stdlib.md` 17.2.
 *
 * **A tag argument that defaults to the empty string is a label the destination
 * carries. A tag argument that is required, or defaults to absence, is a
 * reference to something that has to exist.** `buy`, `sell`, `exit`,
 * `order.place`, `order.reverse` and `order.bracket` all default theirs to `""`,
 * and an empty label is an ordinary order. `cancel` requires one and `close`
 * defaults to absence, and both name something the strategy already has.
 *
 * `cancel` is refused by the engine, with OS7009, because what it asks about is
 * whether an order is live now and only a run knows that. `close` is refused
 * here, before any bar runs, because what it asks about is answerable from the
 * file alone: a tag no order in the file is placed with can never name a part of
 * a position, so the call sends nothing on every bar and says nothing, and the
 * script goes on believing it has flattened.
 *
 * **The run cannot tell that mistake from an ordinary bar.** A tag naming no
 * ledger row is also what a working script looks like before its entry has
 * happened: `close(tag = "runner")` on the bar an exit signal first fires is a
 * tag that has never named a row yet, and refusing it would refuse a script that
 * had done exactly what this code's own fix asks. Nothing a script can write
 * today would guard it either, because every call that reads the ledger
 * (`stdlib.md` 17.3) is planned. The file, unlike the run, is complete: what it
 * can place is all of what it will ever place.
 *
 * **Only what is written is read.** A tag a script computes could be anything,
 * so a computed tag on an order that places one leaves this pass silent for the
 * whole file rather than reporting a close it cannot prove is dead.
 */
import type { Argument } from '../ast/index.js';
import type { Span } from '../span/index.js';
import type { Checker } from './checker.js';
import type { CheckedCall } from './checked.js';
import { literalString } from './literals.js';

/**
 * The calls that append a ledger row a later `close` can act on.
 *
 * `exit`, `order.bracket` and `cancel` are not among them: a bracket is a level
 * and a cancellation is an instruction about an order, and neither appends a
 * row (`stdlib.md` 17.7). Nor is `close` itself, which only ever reduces what
 * one of these opened, so a close that is the only mention of a tag is exactly
 * the call this pass is about.
 */
const PLACING: ReadonlySet<string> = new Set(['buy', 'sell', 'order.place', 'order.reverse']);

/** The `tag` argument a call was given, absent where it was not written. */
function tagArgument(checked: CheckedCall): Argument | undefined {
  const index = checked.entry?.parameters.findIndex((one) => one.name === 'tag') ?? -1;
  return index < 0 ? undefined : checked.arguments[index];
}

/** One `close` whose tag was written out, and where its tag is written. */
interface WrittenClose {
  readonly tag: string;
  readonly span: Span;
}

/** OS7016: a `close` naming a tag no order in this file is placed with. */
export function reportUnplaceableTags(checker: Checker): void {
  if (checker.declaration?.form !== 'strategy') return;

  const placed = new Set<string>();
  const closes: WrittenClose[] = [];

  for (const checked of checker.calls) {
    if (checked.target !== 'library') continue;

    if (PLACING.has(checked.name)) {
      const argument = tagArgument(checked);
      // A call that writes no tag takes the empty one its signature states.
      if (argument === undefined) {
        placed.add('');
        continue;
      }
      const written = literalString(argument.value);
      if (written === undefined) return;
      placed.add(written);
      continue;
    }

    if (checked.name !== 'close') continue;
    const argument = tagArgument(checked);
    if (argument === undefined) continue;
    const written = literalString(argument.value);
    if (written !== undefined) closes.push({ tag: written, span: argument.span });
  }

  for (const close of closes) {
    if (placed.has(close.tag)) continue;
    checker.report('OS7016', close.span, { tag: JSON.stringify(close.tag) });
  }
}
