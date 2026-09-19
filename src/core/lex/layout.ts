import type { DiagnosticSink } from '../diagnostics/index.js';
import type { SourceFile } from '../source/index.js';
import type { Span } from '../span/index.js';
import type { Token, TokenKind } from '../tokens/index.js';
import { BlockStack } from './blocks.js';
import { endsWithArrow, opensBlock } from './statements.js';

/** The leading whitespace of a line, held until the line turns out to carry a token. */
interface PendingLine {
  readonly line: number;
  readonly offset: number;
  readonly width: number;
  readonly text: string;
  readonly hasTab: boolean;
}

/** The statement being read, which may have begun several lines above. */
interface OpenStatement {
  readonly line: number;
  readonly indent: number;
  firstKind: TokenKind | undefined;
}

/** The statement above, which is all it takes to know whether a block may open here. */
interface ClosedStatement {
  readonly line: number;
  readonly firstKind: TokenKind;
  readonly arrowAtEnd: boolean;
}

/**
 * What the shape of a file means: where a statement begins, where a block opens
 * and closes, and what a line's leading whitespace is worth.
 *
 * It is a separate thing from the scanner because it works in lines and
 * statements where the scanner works in characters, and because it is where the
 * two rules that a naive lexer gets wrong live: a line that carries no token is
 * never asked about its indentation, and a line indented past its siblings is
 * one error rather than a new block.
 *
 * It writes the layout tokens straight into the list the scanner is filling, so
 * an indent lands in front of the token that opened the block rather than being
 * threaded back in afterwards.
 */
export class Layout {
  readonly #file: SourceFile;
  readonly #sink: DiagnosticSink;
  readonly #tokens: Token[];
  readonly #blocks = new BlockStack();

  #pending: PendingLine | undefined;
  #statement: OpenStatement | undefined;
  #previous: ClosedStatement | undefined;

  constructor(file: SourceFile, sink: DiagnosticSink, tokens: Token[]) {
    this.#file = file;
    this.#sink = sink;
    this.#tokens = tokens;
  }

  /** Holds a line's leading whitespace, which may turn out to mean nothing at all. */
  beginLine(line: number, offset: number, width: number, text: string, hasTab: boolean): void {
    this.#pending = { line, offset, width, text, hasTab };
  }

  /** The line is over. Whatever it was holding was never wanted. */
  endLine(): void {
    this.#pending = undefined;
  }

  /**
   * Turns the leading whitespace into block structure, at the moment the line
   * turns out to carry a token and not before. A line that produces no token
   * never reaches here, which is the whole of the rule that a blank line and a
   * comment-only line carry no indentation at all (3.10).
   */
  admit(continuing: boolean): void {
    const pending = this.#pending;
    if (pending === undefined) return;
    this.#pending = undefined;

    if (pending.hasTab) {
      this.#sink.report('OS1002', this.#span(pending.offset, pending.width), {});
    }

    if (continuing) {
      this.#checkContinuation(pending);
      return;
    }

    this.#enterBlock(pending);
    this.#statement = { line: pending.line, indent: pending.width, firstKind: undefined };
  }

  /**
   * A continuation line belongs to a statement that began above it, so it opens
   * and closes nothing. It only has to sit further right than the line that
   * began the statement, so that it can never be read as a new one (3.11).
   */
  #checkContinuation(pending: PendingLine): void {
    const statement = this.#statement;
    if (statement === undefined || pending.width > statement.indent) return;
    this.#sink.report('OS1003', this.#span(pending.offset, pending.width), {
      found: pending.width,
      // The shallowest indentation that still reads as a continuation. The
      // catalogue's sentence is written for a block, and this is the value that
      // makes its fix name the action the reader has to take.
      expected: statement.indent + 1,
      line: statement.line,
    });
  }

  #enterBlock(pending: PendingLine): void {
    const firstToken = pending.offset + pending.width;
    const event = this.#blocks.enter(
      pending.width,
      this.#afterHeader(),
      this.#previous?.line ?? pending.line,
    );

    switch (event.kind) {
      case 'same':
        break;
      case 'open':
        this.#tokens.push({
          kind: 'indent',
          span: this.#span(pending.offset, pending.width),
          text: pending.text,
        });
        break;
      case 'close':
        this.#dedent(event.count, firstToken);
        break;
      case 'mismatch':
        this.#dedent(event.count, firstToken);
        this.#sink.report('OS1003', this.#span(pending.offset, pending.width), {
          found: pending.width,
          expected: event.expected,
          line: event.openerLine,
        });
        break;
    }
  }

  /** The first token of a statement decides whether a block may open under it. */
  observe(kind: TokenKind): void {
    const statement = this.#statement;
    if (statement !== undefined && statement.firstKind === undefined) statement.firstKind = kind;
  }

  endStatement(): void {
    const statement = this.#statement;
    this.#statement = undefined;
    if (statement === undefined || statement.firstKind === undefined) return;
    this.#previous = {
      line: statement.line,
      firstKind: statement.firstKind,
      arrowAtEnd: endsWithArrow(this.#tokens),
    };
  }

  /** A second statement beginning on a line that already held one, after a `;`. */
  beginStatement(line: number, indent: number): void {
    this.#statement = { line, indent, firstKind: undefined };
  }

  /** The end of the file closes every block still open. */
  closeBlocks(at: number): void {
    this.#dedent(this.#blocks.closeAll(), at);
  }

  #dedent(count: number, at: number): void {
    for (let i = 0; i < count; i++) {
      this.#tokens.push({ kind: 'dedent', span: this.#span(at, 0), text: '' });
    }
  }

  #afterHeader(): boolean {
    const previous = this.#previous;
    return previous !== undefined && opensBlock(previous.firstKind, previous.arrowAtEnd);
  }

  #span(offset: number, length: number): Span {
    return this.#file.spanAt(offset, length);
  }
}
