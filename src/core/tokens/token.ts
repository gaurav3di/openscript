import type { Span } from '../span/index.js';
import type { TokenKind } from './kind.js';

interface TokenFields {
  readonly kind: TokenKind;
  readonly span: Span;
  /**
   * The source text the token was read from, exactly as written.
   *
   * An indent token's text is the leading spaces of the line it opens, which is
   * what OS1003 counts when it says how deeply a line was indented. A dedent, a
   * newline and the end of the file carry no text.
   */
  readonly text: string;
}

/**
 * A number literal and the value it denotes.
 *
 * The value is carried rather than re-read later because the literal forms of
 * 3.5 include digit group underscores and a hexadecimal form, and a second
 * reader of the text would be a second place that has to agree about them.
 */
export interface NumberToken extends TokenFields {
  readonly kind: 'numberLiteral';
  readonly value: number;
}

/** A string literal with its escape sequences already resolved. */
export interface StringToken extends TokenFields {
  readonly kind: 'stringLiteral';
  readonly value: string;
}

export interface SimpleToken extends TokenFields {
  readonly kind: Exclude<TokenKind, 'numberLiteral' | 'stringLiteral'>;
}

export type Token = NumberToken | StringToken | SimpleToken;
