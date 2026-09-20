/**
 * Offsets, translated between the document the editor holds and the text the
 * compiler read.
 *
 * `language.md` 3.1 normalises a file before anything reads it: a byte order
 * mark is dropped and every CRLF becomes LF. Every span the compiler produces
 * therefore indexes the normalised text, which `docs/integrating/the-editor-half.md`
 * tells a host plainly and expects it to handle.
 *
 * A drop-in cannot expect it. A document written on a machine that ends its
 * lines with two characters is an ordinary document, the editor holds it exactly
 * as it is, and an adapter that handed the editor a span from the normalised
 * text would put every squiggle on a file's fiftieth line fifty characters to
 * the left. That is the kind of defect that is reported as "the underline is in
 * the wrong place" and survives for months.
 *
 * So the two are mapped. The map is built only when the document is not already
 * normalised, which is the common case and costs a comparison; when it is built
 * it is one walk of the text.
 */
import { normaliseSource } from '../../core/index.js';

const BYTE_ORDER_MARK = 0xfeff;
const CARRIAGE_RETURN = 13;
const LINE_FEED = 10;

/** The document as the compiler reads it, and where each of its offsets sits. */
export interface Document {
  /** The normalised text: what `diagnose`, `complete` and the rest are given. */
  readonly text: string;
  /**
   * The offset in the editor's own document that a normalised offset names.
   *
   * The identity where the document is already normalised, which is what a
   * document written on a machine that ends its lines with one character is.
   */
  at(offset: number): number;
}

export function documentOf(raw: string): Document {
  const text = normaliseSource(raw);
  if (text === raw) return { text, at: (offset) => offset };

  // One entry per normalised offset, plus the one past its end, so that the end
  // of a span at the end of the file maps as readily as its start.
  const map = new Array<number>(text.length + 1);
  let normalised = 0;
  let held = raw.charCodeAt(0) === BYTE_ORDER_MARK ? 1 : 0;

  while (normalised <= text.length) {
    map[normalised] = held;
    if (normalised === text.length) break;
    if (raw.charCodeAt(held) === CARRIAGE_RETURN && raw.charCodeAt(held + 1) === LINE_FEED) {
      held += 1;
    }
    held += 1;
    normalised += 1;
  }

  return {
    text,
    at: (offset) => map[Math.min(Math.max(offset, 0), text.length)] ?? offset,
  };
}

/** The normalised offset an editor offset names, which is the other direction. */
export function normalisedOffset(held: Document, raw: number): number {
  // Walked rather than inverted, because the inverse of the map above is only
  // needed at one position per call and building a second array to answer one
  // question would cost a file's length for a comparison's worth of work.
  let low = 0;
  let high = held.text.length;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (held.at(middle) <= raw) low = middle;
    else high = middle - 1;
  }
  return low;
}
