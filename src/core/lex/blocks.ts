/**
 * The block structure of language.md 3.10, which is a stack of indentation
 * widths and nothing more.
 *
 * Only a line that carries a token ever reaches this. A blank line and a
 * comment-only line carry no indentation at all: they never open a block, never
 * end one and are never OS1003, and the rule is kept by never asking about
 * them rather than by asking and forgiving.
 */

interface Level {
  readonly width: number;
  /**
   * The line that opened the block, which is the header above it rather than
   * the block's own first line. It is what OS1003 offers as the indentation to
   * move to when the reader meant to end the block rather than to stay in it.
   */
  readonly openerLine: number;
}

/** What a line's indentation means for the blocks around it. */
export type IndentEvent =
  /** Another line of the block already open. */
  | { readonly kind: 'same' }
  /** Deeper than the header above it: a block begins. */
  | { readonly kind: 'open' }
  /** Shallower: this many blocks end here. */
  | { readonly kind: 'close'; readonly count: number }
  /**
   * Indented to a width no open block has, which is OS1003. The line is kept in
   * the block it landed in, so that one lost space reports one error rather
   * than reshaping every block below it.
   */
  | {
      readonly kind: 'mismatch';
      readonly count: number;
      readonly expected: number;
      readonly openerLine: number;
    };

export class BlockStack {
  // The file's own top level, which no header opened. Line 1 is the honest
  // answer to where it began.
  readonly #levels: Level[] = [{ width: 0, openerLine: 1 }];

  get depth(): number {
    return this.#levels.length - 1;
  }

  #top(): Level {
    return this.#levels[this.#levels.length - 1] ?? { width: 0, openerLine: 1 };
  }

  /**
   * Takes the next line's indentation.
   *
   * `afterHeader` is whether the statement above this line was one that opens a
   * block. Without it a line that drifted one space to the right would open a
   * block of its own and every sibling below it would be reported instead of
   * the one line that moved.
   */
  enter(width: number, afterHeader: boolean, openerLine: number): IndentEvent {
    const top = this.#top();

    if (width > top.width) {
      if (!afterHeader) {
        return { kind: 'mismatch', count: 0, expected: top.width, openerLine: top.openerLine };
      }
      this.#levels.push({ width, openerLine });
      return { kind: 'open' };
    }

    if (width === top.width) return { kind: 'same' };

    let count = 0;
    while (this.#levels.length > 1 && width < this.#top().width) {
      this.#levels.pop();
      count++;
    }

    const landed = this.#top();
    if (width === landed.width) return { kind: 'close', count };
    return { kind: 'mismatch', count, expected: landed.width, openerLine: landed.openerLine };
  }

  /** Every block still open, which the end of the file closes. */
  closeAll(): number {
    const count = this.#levels.length - 1;
    this.#levels.length = 1;
    return count;
  }
}
