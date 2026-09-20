/**
 * Where the cursor is, in the language's own terms.
 *
 * `complete` and `signature` both need the same three answers: what word is
 * being typed, whether it follows a namespace and a dot, and which argument of
 * which call it sits in. They are worked out once, here, because two copies of
 * this would disagree on the day somebody fixes one of them.
 *
 * ## It reads tokens, not the tree
 *
 * A file being typed into is a file that does not parse: `ema(close, ` is the
 * state a call is in for as long as it takes to write one, and it has no
 * complete tree node for the parser to hand back. The tokens, on the other hand,
 * are exactly what the writer has typed so far, and the real lexer produced
 * them. So the enclosing call is found by walking bracket depth backwards over
 * the token stream rather than by looking for a `Call` node that is not there
 * yet.
 *
 * This is not a second parser. It asks one question the grammar already fixes,
 * which bracket is still open, and it answers nothing else: what the call means,
 * whether its arguments type check and whether the name exists are the checker's
 * and are asked of the checker.
 *
 * **An unclosed bracket swallows the rest of the file**, and that is the
 * compiler's reading too: a call opened on line 5 and never closed makes every
 * line below it part of one unfinished statement, which is what the parser
 * reports and what `diagnose-typing` in the benchmark suite measures. A special
 * case here that stopped at the end of a line would give a writer a different
 * answer from the diagnostics beside them.
 */
import { endOffset } from '../core/index.js';
import type { SourceFile, Span, Token } from '../core/index.js';
import { isReserved } from './kinds.js';

/** The call the cursor is inside, as far as the brackets say. */
export interface CallSite {
  /** The callee as written, with its namespace: `ema`, `draw.box`. */
  readonly name: string;
  readonly nameSpan: Span;
  /** Which argument the cursor is in, counting from zero. */
  readonly argument: number;
  /** The label written for this argument, when it was written as `name = ...`. */
  readonly label: string | undefined;
  /** Every label already written in this call, so a completion can drop them. */
  readonly labels: readonly string[];
  /** The bracket that opened it, which is what a host anchors a tooltip to. */
  readonly open: Span;
}

/** What the cursor is on, and what it is inside. */
export interface Site {
  /** The word being typed, when the cursor is in or at the end of one. */
  readonly word: string;
  /** Where it sits, so a host replaces the word rather than inserting into it. */
  readonly replace: Span;
  /** The namespace the word follows, when it was written as `draw.` */
  readonly namespace: string | undefined;
  /** Whether the cursor sits after a dot, where only members may be written. */
  readonly afterDot: boolean;
  readonly call: CallSite | undefined;
}

const OPENERS: ReadonlySet<string> = new Set(['(', '[']);
const CLOSERS: ReadonlySet<string> = new Set([')', ']']);

/** Whether a token is a word: a name, or a reserved word, which is also a word. */
function isWord(token: Token | undefined): boolean {
  return token !== undefined && (token.kind === 'identifier' || isReserved(token.kind));
}

/**
 * The tokens that end at or before an offset, and the one the offset is inside.
 *
 * A layout token is skipped: an `indent` covers a line's leading spaces and a
 * `dedent` and the end of the file cover nothing, so none of them is ever the
 * word somebody is typing, and a bracket scan that counted them would still be
 * correct but a word scan that returned one would not.
 */
function before(tokens: readonly Token[], offset: number): readonly Token[] {
  const taken: Token[] = [];
  for (const token of tokens) {
    if (token.span.offset >= offset) break;
    if (token.kind === 'newline' || token.kind === 'indent') continue;
    if (token.kind === 'dedent' || token.kind === 'endOfFile') continue;
    taken.push(token);
  }
  return taken;
}

/**
 * The call whose bracket is still open at the cursor, and where in it.
 *
 * Walked forwards with a stack rather than backwards with a counter, because
 * the answer wanted is the innermost frame that is still open and a stack is
 * what that is. A square bracket counts too: `f(a[1], b` has the cursor in `f`'s
 * second argument, and a scan that only knew round brackets would put it in the
 * first.
 */
function callAt(tokens: readonly Token[], text: string): CallSite | undefined {
  interface Frame {
    readonly open: Token;
    readonly callee: readonly Token[];
    commas: number;
    label: string | undefined;
    readonly labels: string[];
  }

  const stack: Frame[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined) continue;

    if (OPENERS.has(token.kind)) {
      stack.push({
        open: token,
        callee: calleeOf(tokens, i),
        commas: 0,
        label: undefined,
        labels: [],
      });
      continue;
    }
    if (CLOSERS.has(token.kind)) {
      stack.pop();
      continue;
    }

    const frame = stack[stack.length - 1];
    if (frame === undefined) continue;
    if (token.kind === ',') {
      frame.commas += 1;
      frame.label = undefined;
      continue;
    }
    // `name =` is a label, and `name ==` is a comparison. The lexer has already
    // told the two apart: they are different tokens.
    if (token.kind === '=' && isWord(tokens[i - 1])) {
      const label = tokens[i - 1];
      if (label !== undefined) {
        frame.label = label.text;
        frame.labels.push(label.text);
      }
    }
  }

  const frame = stack[stack.length - 1];
  if (frame === undefined || frame.open.kind !== '(' || frame.callee.length === 0) {
    return undefined;
  }

  const first = frame.callee[0];
  const last = frame.callee[frame.callee.length - 1];
  if (first === undefined || last === undefined) return undefined;

  return {
    name: text.slice(first.span.offset, endOffset(last.span)),
    nameSpan: first.span,
    argument: frame.commas,
    label: frame.label,
    labels: frame.labels,
    open: frame.open.span,
  };
}

/**
 * The name in front of a bracket, as one or three tokens.
 *
 * A dotted name is `identifier . identifier` to the lexer, so a call to
 * `draw.box` is found by reading back over the dot. A bracket with no name in
 * front of it is a grouping or an array literal rather than a call, and this
 * returns nothing for it.
 */
function calleeOf(tokens: readonly Token[], open: number): readonly Token[] {
  const name = tokens[open - 1];
  if (!isWord(name) || name === undefined) return [];
  const dot = tokens[open - 2];
  const namespace = tokens[open - 3];
  if (dot?.kind === '.' && isWord(namespace) && namespace !== undefined) {
    return [namespace, dot, name];
  }
  return [name];
}

/**
 * Everything the two functions need to know about a position.
 *
 * The word is the token the offset is inside or immediately after, which is
 * what a writer half way through typing a name has. A cursor sitting on a space
 * has no word and an empty replacement span at the cursor, so a host inserts
 * there rather than overwriting whatever is to the left.
 */
export function siteAt(file: SourceFile, tokens: readonly Token[], offset: number): Site {
  const text = file.text;
  const at = Math.min(Math.max(Math.trunc(offset), 0), text.length);
  const taken = before(tokens, at);

  const last = taken[taken.length - 1];
  const touching = last !== undefined && endOffset(last.span) === at;
  const word = touching && isWord(last) ? last : undefined;

  // The dot is the token before the word being typed, or the last token when
  // nothing has been typed after it yet.
  const dot = word === undefined ? last : taken[taken.length - 2];
  const holder = word === undefined ? taken[taken.length - 2] : taken[taken.length - 3];
  const afterDot = dot?.kind === '.' && (word !== undefined || touching);
  const namespace = afterDot && isWord(holder) ? holder?.text : undefined;

  const scanned = word === undefined ? taken : taken.slice(0, -1);

  return {
    word: word?.text ?? '',
    replace: word?.span ?? file.spanAt(at, 0),
    namespace,
    afterDot: afterDot === true,
    call: callAt(scanned, text),
  };
}

/**
 * The token an offset is inside, for a hover, which is not the same question.
 *
 * A completion is about what is being typed, so the token that ends at the
 * cursor is the word. A hover is about what is under the pointer, so the token
 * that contains the offset is the answer and one that merely ends there is not:
 * pointing at the space after `ema` is not pointing at `ema`.
 */
export function tokenOn(tokens: readonly Token[], offset: number): Token | undefined {
  return tokens.find(
    (token) =>
      token.span.length > 0 && offset >= token.span.offset && offset < endOffset(token.span),
  );
}
