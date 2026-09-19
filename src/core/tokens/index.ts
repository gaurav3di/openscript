/**
 * The token vocabulary of language.md section 3. Types and the two tables the
 * types are derived from; the lexer that produces them is the next stage.
 */
export type {
  KeywordKind,
  LayoutKind,
  LiteralKind,
  NameKind,
  PunctuationKind,
  TokenKind,
} from './kind.js';
export { PUNCTUATORS, RESERVED_WORDS } from './kind.js';

export type { NumberToken, SimpleToken, StringToken, Token } from './token.js';
