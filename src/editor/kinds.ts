/**
 * What a host paints, and where each kind comes from.
 *
 * A highlighter is the one part of a language tool that is always written twice:
 * once in the compiler, where the vocabulary is decided, and once in a theme
 * file, where somebody types the words out again from memory. The second copy is
 * wrong from the day a word is added to the language, and nobody notices, because
 * an unpainted keyword still compiles.
 *
 * So nothing below is a list of words. Every kind is decided by asking the
 * compiler a question it already answers:
 *
 *     keyword      the token's kind is in the language's reserved word table
 *     builtin      the standard library manifest has an entry for the name
 *     operator     the mark is in one of the language's operator tables
 *     punctuation  a mark the grammar has that no operator table claims
 *
 * A word added to `RESERVED_WORDS`, a function added to the manifest and a mark
 * added to `PUNCTUATORS` are each painted the day they lex, without this file
 * being edited.
 *
 * ## Why `reserved` is a question and not a comparison
 *
 * A token's kind is its own text for a keyword and for a punctuation mark, which
 * is what lets a parser read `token.kind === 'if'`. A consuming platform read
 * that as "a reserved word is a token whose kind equals its text", which is true
 * and is folklore: it is nowhere in the token vocabulary, it silently takes in
 * every punctuation mark as well, and it would stop being true the first time a
 * kind and a spelling came apart. `kindOf` answers the question instead, from
 * the same table the lexer classifies with.
 */
import { PUNCTUATORS, RESERVED_WORDS } from '../core/index.js';
import {
  ARITHMETIC_OPERATORS,
  ASSIGNMENT_OPERATORS,
  COMPARISON_OPERATORS,
  EQUALITY_OPERATORS,
  isLibraryName,
  isNamespace,
} from '../core/index.js';
import type { Token, TokenKind } from '../core/index.js';

/**
 * What a span of source is, for the purpose of giving it a colour.
 *
 * Eleven kinds, and the set is closed: a host writes eleven theme rules once and
 * never has to add a twelfth, because a new word in the language arrives as one
 * of these rather than as a kind nobody has a colour for.
 *
 * `whitespace` and `unknown` exist because every character of the file is
 * covered exactly once (see `scan.ts`), so the spaces between tokens have to be
 * something. `unknown` is source the lexer took no token from and that is not a
 * space or a comment: a character the language does not have, a region somebody
 * meant as a block comment, or a line continuation backslash. It does not mean
 * "wrong": `diagnose` says what is wrong, and a highlighter that had a second
 * opinion about it would be a second opinion about the language.
 */
export type HighlightKind =
  | 'keyword'
  | 'builtin'
  | 'name'
  | 'number'
  | 'string'
  | 'color'
  | 'comment'
  | 'operator'
  | 'punctuation'
  | 'whitespace'
  | 'unknown';

const RESERVED: ReadonlySet<string> = new Set<string>(RESERVED_WORDS);

/**
 * The marks that compute something, as against the marks that group and
 * separate.
 *
 * Built from the language's own operator tables rather than by dividing the
 * punctuation list by hand, so that an operator added to the language is painted
 * as one. The tables of words, `and` and `or` and `not`, are reserved words and
 * are painted as keywords, which is what they are to the lexer.
 *
 * What is left over is punctuation: the brackets, the comma, the dot, and the
 * two marks of the ternary. They group and separate rather than compute, and a
 * theme that wants them dimmer than the arithmetic can have that.
 */
const OPERATORS: ReadonlySet<string> = new Set<string>([
  ...ARITHMETIC_OPERATORS,
  ...COMPARISON_OPERATORS,
  ...EQUALITY_OPERATORS,
  ...ASSIGNMENT_OPERATORS,
]);

const PUNCTUATION: ReadonlySet<string> = new Set<string>(PUNCTUATORS);

/** Whether a token's kind is a reserved word of language.md 3.4. */
export function isReserved(kind: TokenKind): boolean {
  return RESERVED.has(kind);
}

/**
 * Whether a name is one the standard library already has.
 *
 * The manifest is the same index the checker resolves against and the same one
 * the example check reads its globals from, so a function added to the library
 * is painted as a built-in on the day it is added. A namespace is included
 * because `draw` on its own is not a value a script can hold: it is half of a
 * dotted name, and `dotted` below finishes the question for the other half.
 */
function isBuiltin(name: string): boolean {
  return isLibraryName(name) || isNamespace(name);
}

/**
 * The member half of a namespaced name, which is only a built-in in company.
 *
 * `box` is an ordinary name, and `draw.box` is a library entry. The manifest is
 * asked about the dotted spelling, so nothing here decides what a namespace
 * holds: `language.md` 15.2 and the manifest do.
 */
function dotted(before: readonly Token[], name: string): boolean {
  const dot = before[before.length - 1];
  const namespace = before[before.length - 2];
  if (dot?.kind !== '.' || namespace?.kind !== 'identifier') return false;
  return isNamespace(namespace.text) && isLibraryName(`${namespace.text}.${name}`);
}

/**
 * The kind a token is painted as, given the tokens before it.
 *
 * The tokens before it are needed for exactly one question, the dotted name
 * above. Everything else is decided by the token alone.
 */
export function kindOf(token: Token, before: readonly Token[]): HighlightKind {
  switch (token.kind) {
    case 'numberLiteral':
      return 'number';
    case 'stringLiteral':
      return 'string';
    case 'hexColor':
      // The language's own spelling of the type is `color`, so that is the kind
      // a host matches on, whatever the prose around it calls the thing.
      return 'color';
    case 'identifier':
      return isBuiltin(token.text) || dotted(before, token.text) ? 'builtin' : 'name';
    case 'newline':
    case 'indent':
    case 'dedent':
    case 'endOfFile':
      // Layout is the file's shape rather than something to read, and an indent
      // token's span is the leading spaces of its line, which are spaces.
      return 'whitespace';
    default:
      if (isReserved(token.kind)) return 'keyword';
      if (OPERATORS.has(token.kind)) return 'operator';
      return PUNCTUATION.has(token.kind) ? 'punctuation' : 'unknown';
  }
}
