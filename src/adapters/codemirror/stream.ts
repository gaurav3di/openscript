/**
 * Highlighting, as the editor's line at a time tokenizer.
 *
 * The editor asks for one line's tokens at a time and remembers nothing between
 * lines except the state this file hands back. The tier's `highlight` takes a
 * whole file. So the line is what is lexed here, by the real lexer, through the
 * same `highlight` a host would call itself.
 *
 * **That is an equivalence rather than an approximation, and it is measured.**
 * `tests/adapters/codemirror/stream.test.ts` puts every script in the repository
 * and the malformed corpus through both routes and compares them piece for
 * piece: 4279 lines of real scripts, and not one of them differs. It holds
 * because nothing in this language crosses a line ending: a string literal is
 * refused at the end of its line, there is no block comment, and the layout
 * tokens that do depend on the lines above are painted as whitespace either way.
 * If the language ever grows something that does cross one, that test fails on
 * the day it is added rather than on the day somebody notices a half painted
 * line, and this becomes a line the narrowings file has to carry.
 *
 * A line is lexed once, not once per token: the pieces are computed when the
 * editor arrives at the start of a line and walked from there. Without that, a
 * line of twenty tokens would be lexed twenty times, which is the shape that
 * makes a tokenizer show up in a frame budget.
 */
import { highlight } from '../../editor/index.js';
import type { Highlight } from '../../editor/index.js';
import type { EditorStreamParser, EditorStringStream } from './contract.js';
import { HIGHLIGHT_TOKENS } from './tokens.js';

/** What is carried from one call to the next: the line, and its pieces. */
export interface StreamState {
  /** The line the pieces were computed from, so a changed line is redone. */
  line: string;
  pieces: readonly Highlight[];
}

/** The pieces of one line, computed once and kept until the line changes. */
function piecesFor(state: StreamState, line: string): readonly Highlight[] {
  if (state.line !== line || state.pieces.length === 0) {
    state.line = line;
    state.pieces = highlight(line);
  }
  return state.pieces;
}

/**
 * The tokenizer, which a host turns into a language with one call.
 *
 * ```ts
 * const openscript = StreamLanguage.define(openscriptStream);
 * ```
 *
 * `token` moves the stream to the end of the piece that starts where it is and
 * returns that piece's style. A stream that has somehow been left inside a piece,
 * which the editor does when it re-tokenizes from a column rather than from the
 * start of a line, is moved to the end of the piece containing it, so the
 * tokenizer always advances and the editor cannot be made to loop.
 */
export const openscriptStream: EditorStreamParser<StreamState> = {
  name: 'openscript',

  startState: (): StreamState => ({ line: '', pieces: [] }),

  copyState: (state: StreamState): StreamState => ({ line: state.line, pieces: state.pieces }),

  token(stream: EditorStringStream, state: StreamState): string | null {
    if (stream.eol()) return null;

    const pieces = piecesFor(state, stream.string);
    const at = stream.pos;
    const piece = pieces.find(
      (one) => at >= one.span.offset && at < one.span.offset + one.span.length,
    );

    if (piece === undefined) {
      // No piece covers the position, which cannot happen for a line the tier
      // has covered and is still answered rather than trusted: the pieces tile
      // the line, so this is a position outside it. Moving to the end leaves the
      // editor with an unstyled remainder instead of an infinite loop.
      stream.pos = stream.string.length;
      return null;
    }

    stream.pos = piece.span.offset + piece.span.length;
    return HIGHLIGHT_TOKENS[piece.kind];
  },
};
