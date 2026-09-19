import type { TypeAnnotation } from '../ast/index.js';
import { makeNode } from '../ast/index.js';
import { spanning } from '../span/index.js';
import type { TokenKind } from '../tokens/index.js';
import { RESERVED_WORDS } from '../tokens/index.js';
import type { Cursor } from './cursor.js';

/**
 * A type as a script writes it, on a parameter or a `var`.
 *
 * The grammar of section 19 admits only the real type names. The prose wins
 * here, because OS2016 and OS2019 are check stage: this reads any word into a
 * `namedType` and lets the checker be the one to say that `whole` is not a
 * type, which is the difference between a caret with no sentence and a sentence
 * naming the types that do exist.
 */

const RESERVED: ReadonlySet<TokenKind> = new Set<TokenKind>(RESERVED_WORDS);

/**
 * What may stand as a type name.
 *
 * A literal is taken as well as a word, so `len: 5` reaches OS2016 with `5` in
 * its message instead of failing here with a caret and nothing to act on.
 */
function isTypeWord(kind: TokenKind): boolean {
  return (
    kind === 'identifier' ||
    kind === 'numberLiteral' ||
    kind === 'stringLiteral' ||
    RESERVED.has(kind)
  );
}

export function parseTypeAnnotation(cursor: Cursor): TypeAnnotation {
  const token = cursor.token;

  if (token.kind === 'series') {
    cursor.advance();
    const element = parseTypeAnnotation(cursor);
    return makeNode('seriesType', spanning(token.span, element.span), { element });
  }

  if (token.kind === 'array' && cursor.peek().kind === '<') {
    cursor.advance();
    cursor.advance();
    const element = parseTypeAnnotation(cursor);
    const close = cursor.take('>');
    if (close === undefined) cursor.unexpected(cursor.token);
    return makeNode('arrayType', spanning(token.span, close?.span ?? element.span), { element });
  }

  if (isTypeWord(token.kind)) {
    cursor.advance();
    return makeNode('namedType', token.span, { name: token.text });
  }

  cursor.unexpected(token);
  return makeNode('namedType', cursor.holeSpan(), { name: '' });
}
