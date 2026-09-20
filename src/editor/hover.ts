/**
 * `hover`: what the thing under the pointer is.
 *
 * Three answers, and the difference between them is what the compiler says the
 * word is rather than anything guessed from its spelling:
 *
 *     a library name    its signatures from the manifest, the line the
 *                       specification gives it, the first bar its own row
 *                       promises a value on, and the channels of a named colour
 *     a declared name   the type the checker worked out, how it is held between
 *                       bars, and where in the file it was declared
 *     a reserved word   that it is one, and nothing else. See below
 *
 * ## What a hover wants and cannot have, said plainly
 *
 * **There is no per-word explanation of a keyword in a machine readable form.**
 * `language.md` 3.4 reserves the words in one block and explains each one in the
 * prose of the section that uses it, which is a page rather than a field. So a
 * hover over `var` says it is a reserved word and stops. The alternative was to
 * type thirty-five sentences into this file, and that is the copy that drifts:
 * it would be right today, the specification would improve next month, and the
 * only copy a writer ever reads would be the stale one. A host that wants more
 * links the word to the specification, which is one page and stays current.
 *
 * **A name with several signatures has one description.** The specification
 * gives every signature its own row, and the map read here is keyed by name, so
 * `close` is described by its bar series row rather than by the order function's.
 * Every signature is still listed: it is the sentence beside them that is the
 * first row's.
 *
 * **A parameter has no description of its own anywhere.** `stdlib.md` describes
 * a call in one line and names its parameters in the signature; only section
 * 13's shared input arguments have a table with a meaning per argument. So
 * `signature` shows a parameter's name, type, default and accepted values, which
 * are facts, and no sentence, which would have to be invented.
 *
 * Each of those is recorded in `spec/editor-narrowings.json` beside what the
 * adapter narrows, so a host reads them in one place rather than discovering
 * them.
 */
import {
  endOffset,
  entryFor,
  fillTemplate,
  isNamespace,
  libraryEntries,
  namedColour,
  proseFor,
  typeText,
} from '../core/index.js';
import type { Colour, SourceFile, Span, Token } from '../core/index.js';
import { isReserved } from './kinds.js';
import { signatureTextOf } from './manifest.js';
import { readChecked } from './reading.js';
import { bindingNamed } from './scope.js';
import { tokenOn } from './site.js';

export type HoverKind = 'library' | 'declared' | 'keyword';

export interface Hover {
  readonly kind: HoverKind;
  /** The word the pointer is over, which is what a host underlines. */
  readonly span: Span;
  /** The name as written, dotted where the word is half of a namespaced name. */
  readonly name: string;
  /**
   * Every signature the name has, in the order the manifest holds them.
   *
   * More than one where the language gives the name more than one, which
   * `stdlib.md` 2.2 allows: a hover has no arguments to choose between them
   * with, so it shows both rather than picking.
   */
  readonly signatures: readonly string[];
  /** The line the specification gives it, where it gives one. */
  readonly summary: string | undefined;
  /** The first bar it can produce a value for, as its own row states it. */
  readonly warmup: string | undefined;
  /** The type the checker gave a declared name. */
  readonly type: string | undefined;
  /** Where a declared name was declared, which is what a host jumps to. */
  readonly declaredAt: Span | undefined;
  /** The channels of a named colour, for a swatch. */
  readonly colour: Colour | undefined;
  /** Named in the library and not implemented in this version: OS2020. */
  readonly planned: boolean;
  /** The catalogue's OS2020 message for this name, on a planned name and no other. */
  readonly refusal: string | undefined;
}

/**
 * The name a word is part of, which is the dotted one when it is half of one.
 *
 * Pointing at `box` in `draw.box` is pointing at `draw.box`: the member on its
 * own is an ordinary name the library does not have, and a hover that said so
 * would be wrong about the word under the pointer.
 */
function nameAt(
  file: SourceFile,
  tokens: readonly Token[],
  token: Token,
): { name: string; span: Span } {
  const index = tokens.indexOf(token);
  const dot = tokens[index - 1];
  const namespace = tokens[index - 2];
  if (dot?.kind === '.' && namespace?.kind === 'identifier' && isNamespace(namespace.text)) {
    return {
      name: `${namespace.text}.${token.text}`,
      span: file.spanAt(namespace.span.offset, endOffset(token.span) - namespace.span.offset),
    };
  }
  // A namespace with a member after it is pointed at as the whole name too, so
  // that hovering either half of `draw.box` says the same thing.
  const next = tokens[index + 1];
  const member = tokens[index + 2];
  if (
    isNamespace(token.text) &&
    next?.kind === '.' &&
    member?.kind === 'identifier' &&
    libraryEntries(`${token.text}.${member.text}`).length > 0
  ) {
    return {
      name: `${token.text}.${member.text}`,
      span: file.spanAt(token.span.offset, endOffset(member.span) - token.span.offset),
    };
  }
  return { name: file.text.slice(token.span.offset, endOffset(token.span)), span: token.span };
}

const NOTHING = {
  summary: undefined,
  warmup: undefined,
  type: undefined,
  declaredAt: undefined,
  colour: undefined,
  planned: false,
  refusal: undefined,
} as const;

/**
 * What the word at an offset is, or nothing where the offset is not on a word.
 *
 * A pointer over a space, a bracket, a number or a string gets nothing: those
 * are not names, and a tooltip that appeared over a comma would be in the way
 * rather than useful. A host that wants a literal's value has it in the text.
 */
export function hover(source: string, offset: number): Hover | undefined {
  const { file, tokens, checked } = readChecked(source);
  const token = tokenOn(tokens, offset);
  if (token === undefined) return undefined;

  if (isReserved(token.kind)) {
    // A reserved word, and every one of them is also a word a script may not
    // declare. What it means is the specification's, and there is no per-word
    // field to read it from, which the file header states and the narrowings
    // record.
    return { kind: 'keyword', span: token.span, name: token.text, signatures: [], ...NOTHING };
  }
  if (token.kind !== 'identifier') return undefined;

  const { name, span } = nameAt(file, tokens, token);

  const binding = bindingNamed(checked, name, offset);
  if (binding !== undefined) {
    const persistence = binding.persistence === 'none' ? '' : `${binding.persistence} `;
    return {
      kind: 'declared',
      span,
      name,
      signatures: [`${persistence}${name}: ${typeText(binding.type)}`],
      summary: undefined,
      warmup: undefined,
      type: typeText(binding.type),
      declaredAt: binding.declaredAt,
      colour: undefined,
      planned: false,
      refusal: undefined,
    };
  }

  const entries = libraryEntries(name);
  const first = entries[0];
  if (first === undefined) return undefined;

  const prose = proseFor(name);
  const planned = entries.every((one) => one.planned);
  return {
    kind: 'library',
    span,
    name,
    signatures: entries.map(signatureTextOf),
    summary: prose?.summary,
    warmup: prose?.warmup,
    type: typeText(first.returns),
    declaredAt: undefined,
    colour: namedColour(name),
    planned,
    refusal: planned ? fillTemplate(entryFor('OS2020').message, { name }) : undefined,
  };
}
