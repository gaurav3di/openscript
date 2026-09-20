/**
 * Laying a script out again, as an editor command.
 *
 * `format` is the tier's, and the guarantee it carries is the one that makes a
 * format button safe to put in front of somebody holding a position: laying a
 * script out again cannot change what it computes. Every example and every gate
 * script in the repository is formatted, both texts compiled, and the compiled
 * programs compared field for field; and every call checks itself against the
 * lexer, so a rule that is wrong returns the source untouched rather than a
 * changed program.
 *
 * The whole document is replaced rather than a minimal edit computed. It is the
 * honest version: a diff would have to be trusted to be equivalent to the
 * replacement, and a formatter that moved a line somewhere unintended would do
 * it silently. The cursor is kept where it was in the new text, clamped, because
 * a format that sends the caret to the top of the file is a format nobody
 * presses twice.
 *
 * **A document with two character line endings comes back with one character
 * ones**, because that is what `language.md` 3.1 normalises a file to before
 * anything reads it and what every offset in this tier indexes. It is the one
 * change to a file's bytes that formatting makes without being asked, and it is
 * recorded in `spec/editor-narrowings.json`.
 */
import { format } from '../../editor/index.js';
import type { EditorView } from './contract.js';
import { documentOf, normalisedOffset } from './positions.js';

/**
 * Lays the document out again, and says whether anything changed.
 *
 * ```ts
 * keymap.of([{ key: "Shift-Alt-f", run: formatDocument }])
 * ```
 *
 * False where the document is already laid out, which is what an editor command
 * returns when it has nothing to do: the key press then falls through to
 * whatever else is bound to it rather than being swallowed.
 */
export function formatDocument(view: EditorView): boolean {
  const raw = view.state.doc.toString();
  const held = documentOf(raw);
  const laid = format(held.text);
  if (laid === raw) return false;

  const at = normalisedOffset(held, view.state.selection.main.head);
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: laid },
    selection: { anchor: Math.min(at, laid.length) },
    scrollIntoView: true,
  });
  return true;
}
