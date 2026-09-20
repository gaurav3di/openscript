/**
 * Completions, as the editor's completion source.
 *
 * The whole of the work is done by `complete`, which reads the standard library
 * manifest, the checker's bindings and the error catalogue. What is here is the
 * translation: the editor wants a range to replace, a list of rows, and a note
 * about whether the list is already filtered.
 *
 * **The list is already filtered**, by the word the writer has typed, compared
 * exactly, because the language's names are case sensitive. So `filter` is false
 * and the editor is told not to filter it again: its own matcher is fuzzy and
 * case insensitive, and running it over a list that has already answered the
 * question would put `EMA` in front of somebody as though it compiled.
 *
 * **A planned call is shown and marked.** `complete` carries the catalogue's own
 * OS2020 sentence on a planned row, so that is what goes in the row's expanded
 * note, and the row is pushed to the bottom of the list with the editor's own
 * boost. A host that would rather not show them at all drops them with one
 * field, which is why they are marked rather than filtered here.
 */
import { complete } from '../../editor/index.js';
import type { Completion } from '../../editor/index.js';
import type {
  EditorCompletion,
  EditorCompletionContext,
  EditorCompletionResult,
} from './contract.js';
import { COMPLETION_TYPES } from './tokens.js';

/** As far down the list as the editor will move a row. */
const PLANNED_BOOST = -99;

function rowOf(one: Completion): EditorCompletion {
  const info = one.refusal ?? one.summary;
  const type = COMPLETION_TYPES[one.kind];
  return {
    label: one.label,
    ...(type === undefined ? {} : { type }),
    detail: one.detail,
    ...(info === undefined ? {} : { info }),
    ...(one.insert === one.label ? {} : { apply: one.insert }),
    ...(one.planned ? { boost: PLANNED_BOOST } : {}),
  };
}

/**
 * Every completion for the position the editor is asking about.
 *
 * ```ts
 * autocompletion({ override: [openscriptCompletion] })
 * ```
 *
 * Nothing comes back for an empty list rather than an empty list, because the
 * editor reads the two differently: an empty result closes the panel and null
 * lets another source answer, and a host with a snippet source of its own should
 * keep it.
 */
export function openscriptCompletion(
  context: EditorCompletionContext,
): EditorCompletionResult | null {
  const rows = complete(context.state.doc.toString(), context.pos);
  // The first row carries the range every row replaces, so an empty list and a
  // list whose first row is missing are one answer: nothing. Two guards for that
  // would be one guard and a line no test can reach.
  const first = rows[0];
  if (first === undefined) return null;

  return {
    from: first.replace.offset,
    to: first.replace.offset + first.replace.length,
    options: rows.map(rowOf),
    filter: false,
  };
}
