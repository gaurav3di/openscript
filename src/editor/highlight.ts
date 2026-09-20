/**
 * `highlight`: source text in, painted spans out.
 *
 * It is the real lexer and nothing else. A word added to the language is
 * coloured on the day it lexes, because the only thing between the lexer and a
 * colour here is a table lookup in `kinds.ts` that asks the language's own
 * tables which sort of thing a token is.
 *
 * ## Two shapes, and why both
 *
 * A host paints a document one of two ways and there is no third: it draws over
 * the whole text, or it renders a line at a time. So both shapes are here, and
 * the second is derived from the first rather than scanned again.
 *
 * `highlight` is the flat one: every piece of the file in order, covering it
 * exactly once. It is the primitive because the covering property is a property
 * of a flat list, and because a host holding one can produce anything else.
 *
 * `highlightLines` is the per-line one, and it exists because the split is where
 * the mistake is made. A host slicing the flat list at line boundaries has to
 * decide what to do with a piece of whitespace that runs from the end of one
 * line to the start of the next, and getting it wrong costs a line its
 * indentation or gives it somebody else's. Done once here, each line's pieces
 * concatenate to exactly that line's text, newline excluded, which is what a
 * line renderer wants and what the test asserts.
 *
 * ## Offsets are into the normalised text
 *
 * A byte order mark is dropped and CRLF becomes LF before anything else reads a
 * file (`language.md` 3.1), so a span's offset counts into the text after those
 * two changes, exactly as a diagnostic's does. A host that keeps its buffer
 * exactly as the file was written normalises it once on the way in, or draws
 * from each piece's own `text` and never indexes its buffer at all.
 */
import type { SourceFile, Span } from '../core/index.js';
import { read } from './reading.js';
import { scan } from './scan.js';
import type { Highlight } from './scan.js';

/** One line's pieces, with the line they are on so a caller counts nothing. */
export interface HighlightedLine {
  /** One-based, the same line a diagnostic's span carries. */
  readonly line: number;
  readonly pieces: readonly Highlight[];
}

/**
 * The pieces of a file, in order, covering every character exactly once.
 *
 * Nothing here throws and nothing here reports. A file being typed into is
 * malformed most of the time, and a highlighter that stopped at the first
 * character the language does not have would leave the rest of a trader's
 * script grey while they finished the word. `diagnose` is where the compiler
 * says what is wrong with it.
 */
export function highlight(source: string): readonly Highlight[] {
  const held = read(source);
  return scan(held.file, held.tokens);
}

/**
 * The same pieces, grouped by line, with every line of the file present.
 *
 * A piece that runs across a line ending is cut at it, and the line ending
 * itself belongs to no line: a renderer draws the text of a line and puts the
 * break there itself. A blank line is an entry with no pieces rather than a
 * missing entry, so a caller can walk lines one to `lineCount` and never index
 * past the end of a shorter list.
 */
export function highlightLines(source: string): readonly HighlightedLine[] {
  const { file, tokens } = read(source);
  const pieces = scan(file, tokens);
  const lines: Highlight[][] = [];
  for (let line = 0; line < file.lineCount; line += 1) lines.push([]);

  for (const piece of pieces) {
    for (const part of split(file, piece)) {
      lines[part.span.line - 1]?.push(part);
    }
  }

  return lines.map((held, index) => ({ line: index + 1, pieces: held }));
}

/**
 * One piece as the pieces of the lines it covers, the line endings dropped.
 *
 * Only whitespace can reach here holding a line ending, since no token and no
 * comment crosses one, but the split is written for any piece rather than for
 * that one case: a piece shape that grows a new kind should not need this
 * function to be revisited to stay correct.
 */
function split(file: SourceFile, piece: Highlight): readonly Highlight[] {
  if (!piece.text.includes('\n')) return [piece];

  const out: Highlight[] = [];
  let from = 0;
  for (let i = 0; i <= piece.text.length; i += 1) {
    const ending = i === piece.text.length || piece.text.charCodeAt(i) === 10;
    if (!ending) continue;
    if (i > from) out.push(partOf(file, piece, from, i));
    from = i + 1;
  }
  return out;
}

function partOf(file: SourceFile, piece: Highlight, from: number, to: number): Highlight {
  const span: Span = file.spanAt(piece.span.offset + from, to - from);
  return { kind: piece.kind, span, text: piece.text.slice(from, to) };
}
