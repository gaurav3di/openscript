/**
 * The covering scan: every character of a file, exactly once, with what it is.
 *
 * ## The property that decides the shape
 *
 * A host draws highlighting behind or over a text component, and it draws it by
 * walking a list. Drop one character anywhere on a line and everything after it
 * on that line is drawn one column to the left, so the caret stops sitting where
 * the text is. That is not a cosmetic bug: it is the editor feeling broken, and
 * it is reported as "the cursor is in the wrong place" rather than as a
 * highlighting fault, which is why it survives.
 *
 * So the guarantee here is not "here are the tokens". It is **the spans tile the
 * source**: they are in order, they do not overlap, none is empty, and their
 * texts concatenate to the file exactly. A host that renders the spans and
 * nothing else cannot lose a character, because there is nowhere for one to go.
 * `tests/editor/highlight.test.ts` holds that over every script in the
 * repository and over a corpus of malformed ones.
 *
 * ## Where the comments come from
 *
 * The lexer emits no token for a comment, because the parser has no use for one
 * (`language.md` 3.10, and it is the rule that lets a commented-out statement
 * sit at column zero inside a block without closing it). A highlighter does have
 * a use for one, so they have to be recovered, and this is the one place in the
 * project that does it. Leaving it to each host is what produced the two
 * problems this file exists to remove: a platform recovering comments from the
 * gaps between token spans, and doing it with its own scan for `//`.
 *
 * A scan of its own is the wrong answer, because a `//` inside a string literal
 * is ordinary text (3.2) and finding that out means lexing strings a second
 * time. This does not scan the file. It walks the tokens the real lexer
 * produced, and only looks at what is left between them, which by construction
 * holds no string literal: a `//` in a gap is always a comment, with no second
 * opinion about the language anywhere in it.
 *
 * What else can be in a gap is small and worth naming, because a reader of this
 * file will want to know whether it can be surprised: blanks, a line continuation
 * backslash, a region somebody meant as a block comment, and the characters the
 * lexer refused and reported. All of those are `unknown`, which means "the lexer
 * took no token from this", and `diagnose` is what says whether any of it is a
 * mistake.
 */
import { endOffset } from '../core/index.js';
import type { SourceFile, Span, Token } from '../core/index.js';
import { kindOf } from './kinds.js';
import type { HighlightKind } from './kinds.js';

/** One piece of the file, with what it is and the text it covers. */
export interface Highlight {
  readonly kind: HighlightKind;
  readonly span: Span;
  /**
   * The source the span covers, carried rather than left to the caller to slice.
   *
   * A host that concatenates these gets the file back, so a renderer never
   * indexes the buffer and never has to agree with this module about what an
   * offset means. It is also what makes the covering property a one-line test.
   */
  readonly text: string;
}

const SLASH = 47;
const LINE_FEED = 10;

/** Whether a comment opens at `at`: two slashes, which run to the end of the line. */
function opensComment(text: string, at: number): boolean {
  return text.charCodeAt(at) === SLASH && text.charCodeAt(at + 1) === SLASH;
}

function isBlank(code: number): boolean {
  // The three the lexer passes over between tokens. A tab is OS1002 in leading
  // whitespace and is still whitespace to look at, so it is painted as such and
  // the compiler is left to be the one that objects to it. A lone carriage
  // return is not one of these: `language.md` 3.1 does not accept it, the lexer
  // reports it, and painting it as a space would hide the one thing about it
  // worth knowing.
  return code === 32 || code === 9 || code === LINE_FEED;
}

/** The end of the line `at` sits on, or the end of the file. */
function endOfLine(text: string, at: number): number {
  const found = text.indexOf('\n', at);
  return found === -1 ? text.length : found;
}

/**
 * A run of one kind inside a gap, from `from` up to but not including its end.
 *
 * The three cases are tried in the order they can be told apart: a blank is a
 * blank, two slashes open a comment to the end of the line, and anything else
 * runs until one of those two begins.
 */
function runIn(text: string, from: number, to: number): { end: number; kind: HighlightKind } {
  if (isBlank(text.charCodeAt(from))) {
    let i = from;
    while (i < to && isBlank(text.charCodeAt(i))) i += 1;
    return { end: i, kind: 'whitespace' };
  }

  if (opensComment(text, from)) {
    return { end: Math.min(endOfLine(text, from), to), kind: 'comment' };
  }

  let i = from;
  while (i < to && !isBlank(text.charCodeAt(i)) && !opensComment(text, i)) i += 1;
  return { end: i, kind: 'unknown' };
}

/**
 * Every piece of a file, in order, covering it exactly.
 *
 * The token list is walked rather than sorted, and a token that would overlap
 * the piece before it is skipped rather than believed. Both of those are
 * defences rather than expectations: the property this returns is what a host
 * draws with, and it has to hold for a stream from a file somebody is halfway
 * through typing as firmly as for one from a script that compiles.
 */
export function scan(file: SourceFile, tokens: readonly Token[]): readonly Highlight[] {
  const text = file.text;
  const out: Highlight[] = [];
  let at = 0;

  const fill = (to: number): void => {
    let from = at;
    while (from < to) {
      const run = runIn(text, from, to);
      out.push({
        kind: run.kind,
        span: file.spanAt(from, run.end - from),
        text: text.slice(from, run.end),
      });
      from = run.end;
    }
  };

  const read: Token[] = [];
  for (const token of tokens) {
    if (token.span.length === 0) {
      // A dedent and the end of the file are positions rather than text, and a
      // newline at the end of a file is one too. Nothing to paint, but the
      // token still counts as read for the dotted name question next door.
      read.push(token);
      continue;
    }
    if (token.span.offset < at) continue;
    if (token.span.offset > at) {
      fill(token.span.offset);
      at = token.span.offset;
    }
    out.push({
      kind: kindOf(token, read),
      span: token.span,
      text: text.slice(token.span.offset, endOffset(token.span)),
    });
    at = endOffset(token.span);
    read.push(token);
  }

  fill(text.length);
  return out;
}
