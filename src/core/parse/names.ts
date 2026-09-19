import type { Name } from '../ast/index.js';
import { makeNode } from '../ast/index.js';
import type { TokenKind } from '../tokens/index.js';
import { RESERVED_WORDS } from '../tokens/index.js';
import type { Cursor } from './cursor.js';
import { describeToken } from './cursor.js';

/**
 * Reading the places a name is written, which is where OS1019 lives.
 *
 * The lexer cannot make this call. A reserved word before an `=` is a legal
 * label inside a call and is OS1019 inside a parameter list (language.md 3.4),
 * and only the parser knows which of the two lists it is reading. So a reserved
 * word arrives carrying its keyword kind, and the readers below are the
 * answers: `takeName` refuses one, `takeLabel` and `takeMember` accept one,
 * because a label and a member are matched against a published list rather than
 * looked up in a scope.
 */

const RESERVED: ReadonlySet<TokenKind> = new Set<TokenKind>(RESERVED_WORDS);

/** Whether a token may stand where a word is expected. */
export function isWordKind(kind: TokenKind): boolean {
  return kind === 'identifier' || RESERVED.has(kind);
}

/**
 * A name that is not reserved, derived from one that is.
 *
 * OS1019 promises a near name that keeps the meaning, and the derivation has to
 * work for all thirty six words rather than for the five anyone remembers, so
 * it is mechanical: the word is what the reader meant, and the suffix is what
 * makes it theirs to use.
 */
function unreservedNear(word: string): string {
  return `${word}Value`;
}

/** No word where one was required, which leaves the statement without its subject. */
function missingWord(cursor: Cursor): Name {
  const hole = cursor.holeSpan();
  cursor.report('OS1022', hole, {
    token: describeToken(cursor.previousMeaningful() ?? cursor.token),
  });
  return makeNode('name', hole, { text: '' });
}

/**
 * The name at the cursor: an identifier, or a reserved word that is OS1019.
 *
 * The word is taken either way. A script that named something `type` still
 * meant to declare it, and every later diagnostic about that name is more use
 * to the reader than a hole where the declaration should have been.
 */
export function takeName(cursor: Cursor): Name {
  const token = cursor.token;
  if (!isWordKind(token.kind)) return missingWord(cursor);

  cursor.advance();
  if (token.kind !== 'identifier') {
    cursor.report('OS1019', token.span, {
      word: token.text,
      suggestion: unreservedNear(token.text),
    });
  }
  return makeNode('name', token.span, { text: token.text });
}

/**
 * The label of a named argument, where a reserved word is legal.
 *
 * A label is matched against the callee's parameter list and is never looked up
 * in a scope, so `plot(v, "V", color = aqua)` is correct and is not OS1019.
 */
export function takeLabel(cursor: Cursor): Name {
  const token = cursor.advance();
  return makeNode('name', token.span, { text: token.text });
}

/**
 * The word after a dot.
 *
 * A member is matched against the namespace or the object type it was read
 * from, which is the same kind of published list a label is matched against, so
 * a reserved word is not OS1019 here either. Whether the member exists at all
 * is OS2009, and the checker owns it.
 */
export function takeMember(cursor: Cursor): Name {
  return isWordKind(cursor.kind) ? takeLabel(cursor) : missingWord(cursor);
}

/** Whether the cursor is on a named argument's label: a word, then a bare `=`. */
export function atLabel(cursor: Cursor): boolean {
  return isWordKind(cursor.kind) && cursor.peek().kind === '=';
}
