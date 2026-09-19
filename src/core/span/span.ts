/**
 * Where something is in the source text.
 *
 * Every token and every node carries one of these, and every diagnostic is
 * drawn under one, so the definition of a column here decides where a caret
 * lands for every reader of the language. It is stated rather than implied.
 *
 * ## A column counts UTF-16 code units
 *
 * An editor and a terminal disagree about what a column is, and there is no
 * answer that is right for both, so the question is which one gets the stored
 * number and which one converts.
 *
 * The stored number is UTF-16 code units, one-based, because that is what the
 * things that consume a column ask for: a browser text component indexes the
 * text it holds in UTF-16, and the language server protocol an editor speaks
 * counts positions in UTF-16 by default. Storing anything else means converting
 * at every token on the hot path of a compile that runs while somebody waits,
 * and converting is exactly where an off-by-one caret comes from.
 *
 * A terminal counts characters, not code units, so the renderer does not use
 * the column at all. It takes the source line and the span's offsets and counts
 * code points itself when it pads the caret, which is why a caret sitting after
 * a string literal holding an astral character still lands under the right
 * character in a terminal.
 *
 * The practical reach of the difference is small and worth knowing: outside a
 * string literal the language accepts ASCII only (language.md 3.1), so a column
 * can only diverge from a character count on a line that holds a string literal
 * with non-ASCII text in it.
 *
 * ## Offsets index the normalised text
 *
 * A byte order mark is dropped and CRLF becomes LF before anything else reads
 * the file (language.md 3.1), so an offset counts into the text after those two
 * changes. A host that has to point back into the file on disk adds the mark
 * and the carriage returns back itself; see the source module, which is the one
 * place that does the normalising.
 */
export interface Span {
  /** Zero-based UTF-16 code unit index into the normalised source text. */
  readonly offset: number;
  /** Length in UTF-16 code units. Zero where a diagnostic points between two characters. */
  readonly length: number;
  /** One-based, because that is the first line an editor shows. */
  readonly line: number;
  /** One-based UTF-16 code unit count from the start of the line. */
  readonly column: number;
}

/** Anything the compiler can point a caret at. */
export interface Positioned {
  readonly span: Span;
}

export function makeSpan(offset: number, length: number, line: number, column: number): Span {
  return { offset, length, line, column };
}

/** One past the last code unit the span covers. */
export function endOffset(span: Span): number {
  return span.offset + span.length;
}

/**
 * The span from the start of the first to the end of the last.
 *
 * This is how a node gets a span: a call expression runs from its callee to its
 * closing bracket, and the caret under it covers the whole call rather than the
 * one token the parser happened to be holding.
 */
export function spanning(first: Span, last: Span): Span {
  return {
    offset: first.offset,
    length: Math.max(endOffset(last) - first.offset, 0),
    line: first.line,
    column: first.column,
  };
}

/** Whether an offset falls inside the span. A zero length span contains nothing. */
export function containsOffset(span: Span, offset: number): boolean {
  return offset >= span.offset && offset < endOffset(span);
}
