/**
 * The canonical layout of a file, line by line.
 *
 * `language.md` 3.13 states the rules; this applies them. The two halves are
 * separate because the specification is what another implementation writes a
 * formatter from, and a rule that lived only here would be a rule only this
 * formatter has.
 *
 * ## What is preserved, and why that is the safe direction
 *
 * The writer's line breaks are kept. A formatter that joined a call spanning
 * four lines into one would be correct and unusable: it would take the layout
 * somebody chose to make a long argument list readable and hand back a line
 * nobody can read. So this decides indentation and spacing, which have one right
 * answer, and leaves the choice of where to break a long statement to the person
 * writing it, which does not.
 *
 * It is also the safe direction. A break that was there before is a break the
 * lexer already accepted, so preserving them cannot turn a legal file into an
 * illegal one, while inventing or removing one can: a statement continues onto
 * the next line only under the three conditions of 3.11, and a formatter that
 * moved a break would have to know them, which is the language's rule
 * implemented twice.
 *
 * ## Comments
 *
 * A comment on a line of its own takes the indentation of the next line that
 * carries a token, so a commented-out statement sits with the block it belongs
 * to. This is safe for a reason worth stating: such a line produces no token at
 * all, so its indentation says nothing about block structure and cannot open or
 * close one (3.10). A comment after code stays where it is, two spaces clear of
 * the code.
 */
import type { SourceFile, Token } from '../core/index.js';
import type { Highlight } from './scan.js';
import { spaceBetween } from './spacing.js';
import type { Shapes } from './spacing.js';

/** One level of block, `language.md` 3.13. */
const INDENT = '    ';

/**
 * What a continuation line is indented past the line that began its statement.
 *
 * Eight rather than four so that a continuation can never be read as the body of
 * the header above it. `if crossUp(fast,` with its second half indented four
 * would sit exactly where the block's first statement sits, which is legal and
 * unreadable.
 */
const CONTINUATION = '        ';

/** Two, so a trailing comment is visibly not part of the code it follows. */
const BEFORE_COMMENT = '  ';

const BACKSLASH = '\\';

interface CodeLine {
  readonly tokens: Token[];
  readonly indent: string;
}

/**
 * The code lines of a file, each with the indentation the canonical layout gives
 * it.
 *
 * Depth comes from the lexer's own indent and dedent tokens rather than from
 * counting spaces, so the blocks this prints are the blocks the compiler read. A
 * line that begins a statement is indented by its depth; a line that continues
 * one is indented past the line that began it.
 */
function codeLines(tokens: readonly Token[]): ReadonlyMap<number, CodeLine> {
  const lines = new Map<number, CodeLine>();
  let depth = 0;
  let starting = true;

  for (const token of tokens) {
    switch (token.kind) {
      case 'indent':
        depth += 1;
        continue;
      case 'dedent':
        depth -= 1;
        continue;
      case 'newline':
        starting = true;
        continue;
      case 'endOfFile':
        continue;
      default:
        break;
    }

    let line = lines.get(token.span.line);
    if (line === undefined) {
      const body = INDENT.repeat(Math.max(depth, 0));
      line = { tokens: [], indent: starting ? body : body + CONTINUATION };
      lines.set(token.span.line, line);
    }
    line.tokens.push(token);
    starting = false;
  }

  return lines;
}

/** One code line as text: its indentation, then its tokens with their spacing. */
function printCode(file: SourceFile, line: CodeLine, shapes: Shapes): string {
  let text = line.indent;
  for (const [at, token] of line.tokens.entries()) {
    const before = line.tokens[at - 1];
    if (before !== undefined && spaceBetween(before, token, shapes)) text += ' ';
    text += file.text.slice(token.span.offset, token.span.offset + token.span.length);
  }
  return text;
}

/** The indentation of the next line that carries a token, for a comment to take. */
function indentBelow(lines: ReadonlyMap<number, CodeLine>, from: number, last: number): string {
  for (let line = from + 1; line <= last; line += 1) {
    const found = lines.get(line);
    if (found !== undefined) return found.indent;
  }
  return '';
}

/**
 * Blank lines, as the canonical layout has them: never two in a row, never
 * before the first line, and one line ending at the end of the file.
 *
 * A blank line between two paragraphs of a script is the writer's, and it is
 * kept. A run of four is a file that has been edited for a year, and one of them
 * says everything the four said.
 */
function joinLines(printed: readonly (string | undefined)[]): string {
  const kept: string[] = [];
  for (const line of printed) {
    if (line !== undefined) {
      kept.push(line);
      continue;
    }
    if (kept.length === 0 || kept[kept.length - 1] === '') continue;
    kept.push('');
  }
  while (kept.length > 0 && kept[kept.length - 1] === '') kept.pop();
  return kept.length === 0 ? '' : `${kept.join('\n')}\n`;
}

/**
 * The whole file, laid out.
 *
 * The pieces are the covering scan, which is where the comments come from and
 * where a line continuation backslash is found. A backslash is kept wherever it
 * was written rather than worked out again: whether a statement needs one is the
 * lexer's rule, and the file in front of this one has already been through the
 * lexer with it in place.
 */
export function layOut(
  file: SourceFile,
  tokens: readonly Token[],
  pieces: readonly Highlight[],
  shapes: Shapes,
): string {
  const lines = codeLines(tokens);
  const comments = new Map<number, string>();
  const continued = new Set<number>();

  for (const piece of pieces) {
    if (piece.kind === 'comment') comments.set(piece.span.line, piece.text.trimEnd());
    else if (piece.kind === 'unknown' && piece.text === BACKSLASH) continued.add(piece.span.line);
  }

  const printed: (string | undefined)[] = [];
  for (let line = 1; line <= file.lineCount; line += 1) {
    const code = lines.get(line);
    const comment = comments.get(line);

    if (code === undefined) {
      printed.push(comment === undefined ? undefined : indentBelow(lines, line, file.lineCount) + comment);
      continue;
    }

    let text = printCode(file, code, shapes);
    if (continued.has(line)) text += ` ${BACKSLASH}`;
    if (comment !== undefined) text += BEFORE_COMMENT + comment;
    printed.push(text);
  }

  return joinLines(printed);
}
