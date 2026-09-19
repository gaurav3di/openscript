import { makeSpan } from '../span/index.js';
import type { Span } from '../span/index.js';

/** A place in the source, one-based on both axes. See the span module on columns. */
export interface SourcePosition {
  readonly line: number;
  readonly column: number;
}

/**
 * A file the compiler is working on: its normalised text, and the index that
 * turns an offset into a line and a column.
 *
 * Every stage needs the same two answers, and computing them by scanning from
 * the top of the file each time is how a compiler becomes quadratic on the one
 * input that has many diagnostics. The line starts are built once.
 */
export interface SourceFile {
  /** What the file is called, for the first line of a rendered diagnostic. */
  readonly name: string;
  /** The text after normalisation. Offsets and spans index this, not the bytes on disk. */
  readonly text: string;
  readonly lineCount: number;
  /** The line's text, without its newline. An out of range line is empty. */
  lineText(line: number): string;
  /** The offset the line starts at. */
  lineStart(line: number): number;
  positionAt(offset: number): SourcePosition;
  offsetAt(position: SourcePosition): number;
  /** The span covering length code units from offset, with its line and column worked out. */
  spanAt(offset: number, length: number): Span;
}

const BYTE_ORDER_MARK = '﻿';

/**
 * Drops a leading byte order mark and turns CRLF into LF, which language.md 3.1
 * requires to happen before anything else reads the file, so that a script
 * written on one operating system compiles identically on another.
 *
 * A lone carriage return is deliberately left alone. It is not a line ending
 * the language accepts, so it belongs to the lexer as OS1001 on the character
 * rather than being silently repaired here.
 */
export function normaliseSource(raw: string): string {
  const withoutMark = raw.startsWith(BYTE_ORDER_MARK) ? raw.slice(BYTE_ORDER_MARK.length) : raw;
  return withoutMark.includes('\r\n') ? withoutMark.replace(/\r\n/g, '\n') : withoutMark;
}

function lineStartsOf(text: string): readonly number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

export function sourceFile(name: string, raw: string): SourceFile {
  const text = normaliseSource(raw);
  const starts = lineStartsOf(text);

  const clampLine = (line: number): number => Math.min(Math.max(Math.trunc(line), 1), starts.length);

  const lineStart = (line: number): number => starts[clampLine(line) - 1] ?? 0;

  const lineEnd = (line: number): number => {
    const next = starts[clampLine(line)];
    if (next === undefined) return text.length;
    // The next line starts one past the newline, which this line does not own.
    return next - 1;
  };

  const positionAt = (offset: number): SourcePosition => {
    const at = Math.min(Math.max(Math.trunc(offset), 0), text.length);
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if ((starts[middle] ?? 0) <= at) low = middle;
      else high = middle - 1;
    }
    return { line: low + 1, column: at - (starts[low] ?? 0) + 1 };
  };

  return {
    name,
    text,
    lineCount: starts.length,
    lineText: (line) => text.slice(lineStart(line), lineEnd(line)),
    lineStart,
    positionAt,
    offsetAt: (position) => {
      const start = lineStart(position.line);
      const end = lineEnd(position.line);
      return Math.min(start + Math.max(Math.trunc(position.column), 1) - 1, end);
    },
    spanAt: (offset, length) => {
      const { line, column } = positionAt(offset);
      return makeSpan(offset, Math.max(length, 0), line, column);
    },
  };
}
