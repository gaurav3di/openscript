/**
 * Reading a script in the source dialect into logical lines of tokens.
 *
 * The source dialect is line oriented and indentation delimited, like
 * OpenScript, and it differs in the two places a reader has to know about. A
 * statement continues onto the next line when a bracket is still open, when
 * the line ends on an operator that cannot end one, or when the next line is
 * indented by an amount that is not a whole number of blocks: the dialect's
 * blocks are four columns deep, and a continuation is told apart from a block
 * by being indented off that grid. A tab in leading whitespace counts as one
 * block.
 *
 * This reader is deliberately separate from OpenScript's lexer. The two
 * languages share a shape and differ in almost every token rule that matters to
 * a diagnostic: the source dialect has `:=`, `=>` and single quoted strings as
 * ordinary tokens and no `none`, and running its text through OpenScript's
 * lexer would report every one of those as a mistake in a file nobody wrote in
 * OpenScript.
 *
 * Nothing here refuses anything. A character the dialect does not have becomes
 * a `bad` token, and the parser decides what the statement holding it is.
 */
import type { SourceFile } from '../source/index.js';

export type TokenKind = 'name' | 'number' | 'string' | 'color' | 'op' | 'bad';

export interface Token {
  readonly kind: TokenKind;
  /** The characters as written. */
  readonly text: string;
  /** A string literal's decoded value; for every other kind, the text. */
  readonly value: string;
  readonly offset: number;
  readonly length: number;
}

/** A `//` comment, with the text after the two slashes. */
export interface Remark {
  readonly text: string;
  readonly offset: number;
  readonly line: number;
}

/** One statement's worth of tokens, which may have spanned several lines. */
export interface Logical {
  /** Leading columns of the first line, a tab counted as one block. */
  readonly indent: number;
  readonly tokens: readonly Token[];
  /** Comments written after code on any of the statement's lines. */
  readonly remarks: readonly Remark[];
  readonly firstLine: number;
  readonly lastLine: number;
}

export type Item =
  | { readonly kind: 'code'; readonly logical: Logical }
  | { readonly kind: 'remark'; readonly remark: Remark; readonly indent: number }
  | { readonly kind: 'blank'; readonly line: number };

/** The width of one block in the dialect, which a continuation is indented off. */
const BLOCK = 4;

const TWO_CHARACTER = [':=', '==', '!=', '<=', '>=', '=>', '+=', '-=', '*=', '/=', '%='];
const ONE_CHARACTER = '+-*/%<>=?:,.()[]';

/** Tokens after which a statement cannot end, so the next indented line continues it. */
const CONTINUES = new Set([
  ',', '+', '-', '*', '/', '%', '==', '!=', '<', '<=', '>', '>=', '?', ':', ':=', '=',
  '+=', '-=', '*=', '/=', '%=', 'and', 'or', 'not', '(', '[',
]);

const NAME_START = /[A-Za-z_]/;
const NAME_PART = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;
const HEX = /[0-9A-Fa-f]/;

const ESCAPES: Readonly<Record<string, string>> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' };

interface Physical {
  readonly line: number;
  readonly indent: number;
  readonly tokens: Token[];
  readonly remark: Remark | undefined;
}

/** Columns of leading whitespace, and where the text after it starts. */
function measure(text: string): { indent: number; start: number } {
  let indent = 0;
  let start = 0;
  while (start < text.length) {
    const c = text[start];
    if (c === ' ') indent += 1;
    else if (c === '\t') indent += BLOCK - (indent % BLOCK);
    else break;
    start += 1;
  }
  return { indent, start };
}

function readString(text: string, at: number): { end: number; value: string; closed: boolean } {
  const quote = text[at];
  let value = '';
  let i = at + 1;
  while (i < text.length) {
    const c = text[i] ?? '';
    if (c === quote) return { end: i + 1, value, closed: true };
    if (c === '\\' && i + 1 < text.length) {
      const next = text[i + 1] ?? '';
      value += ESCAPES[next] ?? next;
      i += 2;
      continue;
    }
    value += c;
    i += 1;
  }
  return { end: text.length, value, closed: false };
}

function readNumber(text: string, at: number): number {
  let i = at;
  while (i < text.length && DIGIT.test(text[i] ?? '')) i += 1;
  if (text[i] === '.' && !NAME_START.test(text[i + 1] ?? '')) {
    i += 1;
    while (i < text.length && DIGIT.test(text[i] ?? '')) i += 1;
  }
  if ((text[i] === 'e' || text[i] === 'E') && /[0-9+-]/.test(text[i + 1] ?? '')) {
    let j = i + 1;
    if (text[j] === '+' || text[j] === '-') j += 1;
    if (DIGIT.test(text[j] ?? '')) {
      i = j;
      while (i < text.length && DIGIT.test(text[i] ?? '')) i += 1;
    }
  }
  return i;
}

/** Every token on one physical line, and the comment that ends it if any. */
function tokensOf(
  text: string,
  start: number,
  lineStart: number,
  line: number,
): { tokens: Token[]; remark: Remark | undefined } {
  const tokens: Token[] = [];
  const token = (kind: TokenKind, from: number, to: number, value?: string): void => {
    const written = text.slice(from, to);
    tokens.push({ kind, text: written, value: value ?? written, offset: lineStart + from, length: to - from });
  };
  let i = start;
  while (i < text.length) {
    const c = text[i] ?? '';
    if (c === ' ' || c === '\t') {
      i += 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      return { tokens, remark: { text: text.slice(i + 2).trimEnd(), offset: lineStart + i, line } };
    }
    if (NAME_START.test(c)) {
      let j = i + 1;
      while (j < text.length && NAME_PART.test(text[j] ?? '')) j += 1;
      token('name', i, j);
      i = j;
      continue;
    }
    if (DIGIT.test(c) || (c === '.' && DIGIT.test(text[i + 1] ?? ''))) {
      const j = readNumber(text, i);
      token('number', i, j);
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      const read = readString(text, i);
      token(read.closed ? 'string' : 'bad', i, read.end, read.value);
      i = read.end;
      continue;
    }
    if (c === '#') {
      let j = i + 1;
      while (j < text.length && HEX.test(text[j] ?? '')) j += 1;
      token(j - i === 7 || j - i === 9 ? 'color' : 'bad', i, j);
      i = j;
      continue;
    }
    const pair = text.slice(i, i + 2);
    if (TWO_CHARACTER.includes(pair)) {
      token('op', i, i + 2);
      i += 2;
      continue;
    }
    token(ONE_CHARACTER.includes(c) ? 'op' : 'bad', i, i + 1);
    i += 1;
  }
  return { tokens, remark: undefined };
}

/** How far a line's brackets leave the statement open. */
function depthAfter(depth: number, tokens: readonly Token[]): number {
  let open = depth;
  for (const one of tokens) {
    if (one.kind !== 'op') continue;
    if (one.text === '(' || one.text === '[') open += 1;
    else if (one.text === ')' || one.text === ']') open = Math.max(0, open - 1);
  }
  return open;
}

interface Building {
  indent: number;
  tokens: Token[];
  remarks: Remark[];
  firstLine: number;
  lastLine: number;
  depth: number;
}

function continues(current: Building, next: Physical): boolean {
  if (current.depth > 0) return true;
  if (next.indent <= current.indent) return false;
  if (next.indent % BLOCK !== 0) return true;
  const last = current.tokens[current.tokens.length - 1];
  return last !== undefined && CONTINUES.has(last.text);
}

/**
 * The whole file as items: statements, comment lines and blank lines, in order.
 *
 * A comment line or a blank line inside an open statement belongs to that
 * statement and ends nothing, the same rule OpenScript gives them.
 */
export function readItems(file: SourceFile): readonly Item[] {
  const items: Item[] = [];
  let current: Building | undefined;
  const held: Item[] = [];

  const close = (): void => {
    if (current === undefined) return;
    const { indent, tokens, remarks, firstLine, lastLine } = current;
    items.push({ kind: 'code', logical: { indent, tokens, remarks, firstLine, lastLine } });
    current = undefined;
  };

  for (let line = 1; line <= file.lineCount; line += 1) {
    const text = file.lineText(line);
    const { indent, start } = measure(text);
    const read = tokensOf(text, start, file.lineStart(line), line);
    const physical: Physical = { line, indent, tokens: read.tokens, remark: read.remark };

    if (physical.tokens.length === 0) {
      if (current !== undefined && current.depth > 0) {
        if (physical.remark !== undefined) current.remarks.push(physical.remark);
        continue;
      }
      held.push(
        physical.remark === undefined
          ? { kind: 'blank', line }
          : { kind: 'remark', remark: physical.remark, indent },
      );
      continue;
    }

    if (current !== undefined && continues(current, physical)) {
      current.tokens.push(...physical.tokens);
      if (physical.remark !== undefined) current.remarks.push(physical.remark);
      current.lastLine = line;
      current.depth = depthAfter(current.depth, physical.tokens);
      continue;
    }

    close();
    items.push(...held);
    held.length = 0;
    current = {
      indent,
      tokens: [...physical.tokens],
      remarks: physical.remark === undefined ? [] : [physical.remark],
      firstLine: line,
      lastLine: line,
      depth: depthAfter(0, physical.tokens),
    };
  }
  close();
  items.push(...held);
  return items;
}
