/**
 * `highlight`, and the one property a host cannot do without.
 *
 * Every test names the wrong implementation it is there to catch, because a test
 * that cannot fail is documentation with a green tick on it. The wrong
 * implementations named below are not hypothetical: each is what this function
 * would be if the obvious version of it had been written.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PUNCTUATORS, RESERVED_WORDS, normaliseSource, sourceFile } from '../../src/core/index.js';
import { highlight, highlightLines } from '../../src/editor/index.js';
import type { Highlight } from '../../src/editor/index.js';
import { CORPUS, MALFORMED } from './support.js';

/** The pieces of a source as `kind@offset+length`, which is kind and span and nothing else. */
function shape(source: string): readonly string[] {
  return highlight(source).map((piece) => `${piece.kind}@${piece.span.offset}+${piece.span.length}`);
}

/** The kind of the piece covering an offset, for a test about one token. */
function kindAt(source: string, offset: number): string | undefined {
  return highlight(source).find(
    (piece) => offset >= piece.span.offset && offset < piece.span.offset + piece.span.length,
  )?.kind;
}

/**
 * The covering property, stated once and asserted everywhere.
 *
 * Catches the implementation this would be if it returned the lexer's tokens:
 * every space between them missing, so a host drawing the list loses the
 * indentation of every line and the caret stops landing where the text is.
 */
function tiles(source: string, why: string): void {
  const normalised = normaliseSource(source);
  const pieces = highlight(source);

  let at = 0;
  for (const piece of pieces) {
    assert.equal(piece.span.offset, at, `${why}: a gap or an overlap at ${at}`);
    assert.ok(piece.span.length > 0, `${why}: an empty piece at ${at}`);
    assert.equal(
      piece.text,
      normalised.slice(piece.span.offset, piece.span.offset + piece.span.length),
      `${why}: a piece whose text is not what its span covers`,
    );
    at += piece.span.length;
  }

  assert.equal(at, normalised.length, `${why}: the file is not covered to its end`);
  assert.equal(pieces.map((piece) => piece.text).join(''), normalised, `${why}: not the file`);
}

// ---------------------------------------------------------------------------
// Covering the file
// ---------------------------------------------------------------------------

test('the pieces of every script in the repository cover it exactly', () => {
  for (const script of CORPUS) tiles(script.text, script.name);
  assert.ok(CORPUS.length >= 100, 'the corpus is the repository, not a sample of it');
});

test('the pieces of a file that is not a program cover it exactly', () => {
  // Catches the version of this that recovers comments by scanning for `//` and
  // gives up on text it cannot read. A file being typed into is malformed most
  // of the time, and that is when a trader is looking at the highlighting.
  for (const source of MALFORMED) tiles(source, JSON.stringify(source));
});

test('a span carries the line and column the compiler would give it', () => {
  // Catches a piece whose offset is right and whose line is counted from its own
  // scan. A host drawing a squiggle from a diagnostic and a highlight from here
  // has to be able to put the two in one coordinate system.
  const source = 'version 1\nstudy("a")\n    x = 1\n';
  const file = sourceFile('t.oscript', source);
  for (const piece of highlight(source)) {
    const position = file.positionAt(piece.span.offset);
    assert.equal(piece.span.line, position.line);
    assert.equal(piece.span.column, position.column);
  }
});

// ---------------------------------------------------------------------------
// What each piece is
// ---------------------------------------------------------------------------

test('every reserved word of the language is painted as a keyword', () => {
  // Catches a hand written list of keywords, which is wrong the day a word is
  // added to the language and stays wrong until somebody notices a grey `while`.
  for (const word of RESERVED_WORDS) {
    assert.equal(kindAt(`${word}\n`, 0), 'keyword', word);
  }
});

test('a punctuation mark is not a keyword, although its kind is its own text', () => {
  // Catches the folklore version: "a reserved word is a token whose kind equals
  // its text". That is true of every punctuation mark as well, so `+` and `(`
  // would both be painted as keywords by it.
  for (const mark of PUNCTUATORS) {
    const kind = kindAt(`a ${mark} b\n`, 2);
    assert.notEqual(kind, 'keyword', mark);
    assert.ok(kind === 'operator' || kind === 'punctuation', `${mark} is ${String(kind)}`);
  }
});

test('the marks that compute are operators and the marks that group are not', () => {
  // Catches a split made by hand. The tables the language publishes decide it,
  // so an operator added to the language arrives as an operator.
  assert.equal(kindAt('x = a + b\n', 6), 'operator');
  assert.equal(kindAt('x = a >= b\n', 6), 'operator');
  assert.equal(kindAt('x += 1\n', 2), 'operator');
  assert.equal(kindAt('x = f(a)\n', 5), 'punctuation');
  assert.equal(kindAt('x = [1]\n', 4), 'punctuation');
  assert.equal(kindAt('x = a.b\n', 5), 'punctuation');
});

test('a name the standard library has is a built-in and a name it does not is not', () => {
  // Catches a list of built-in names typed out in a theme file, which is the
  // copy that drifts. The manifest the checker resolves against is asked.
  assert.equal(kindAt('x = close\n', 4), 'builtin');
  assert.equal(kindAt('x = ema(close, 9)\n', 4), 'builtin');
  assert.equal(kindAt('myLength = 1\n', 0), 'name');
});

test('the member of a namespace is a built-in and the same word alone is not', () => {
  // Catches asking the manifest about the bare half of a dotted name. `box` is
  // an ordinary name and `draw.box` is a library entry, and a highlighter that
  // painted every `box` as a built-in would be wrong about the trader's own
  // variable.
  assert.equal(kindAt('draw.box(1, 2, 3, 4)\n', 0), 'builtin');
  assert.equal(kindAt('draw.box(1, 2, 3, 4)\n', 5), 'builtin');
  assert.equal(kindAt('box = 1\n', 0), 'name');
});

test('a hexadecimal colour is its own kind and a number is not', () => {
  // Catches a highlighter that paints `#ff8800` as a name or as two pieces.
  assert.equal(kindAt('x = #ff8800\n', 4), 'color');
  assert.deepEqual(shape('x = #ff8800\n').slice(4, 5), ['color@4+7']);
  assert.equal(kindAt('x = 42\n', 4), 'number');
  assert.equal(kindAt('x = "42"\n', 4), 'string');
});

// ---------------------------------------------------------------------------
// Comments, which the lexer does not hand back
// ---------------------------------------------------------------------------

test('a comment after code comes back as a comment', () => {
  // Catches the version that returns tokens only. The lexer emits nothing for a
  // comment, so a highlighter that forwards the token stream leaves every
  // comment in a file unpainted and, worse, uncovered.
  assert.equal(kindAt('x = 1 // why\n', 6), 'comment');
  assert.deepEqual(shape('x = 1 // why\n').slice(-2), ['comment@6+6', 'whitespace@12+1']);
});

test('a comment on a line of its own comes back as one piece', () => {
  // Catches a recovery that only looks at gaps between tokens on the same line,
  // which misses the comment above the first statement of every file in this
  // repository.
  assert.deepEqual(shape('// alone\nx = 1\n').slice(0, 2), ['comment@0+8', 'whitespace@8+1']);
});

test('two slashes inside a string literal are not a comment', () => {
  // Catches a host scanning the text for `//` instead of walking the tokens.
  // The scan finds one here, and everything after it on the line, including the
  // closing quotation mark, stops being painted as code.
  assert.equal(kindAt('url = "http://example\n', 6), 'string');
  const pieces = highlight('x = "a // b"\n');
  assert.equal(pieces.some((piece) => piece.kind === 'comment'), false);
});

test('a comment runs to the end of its line and no further', () => {
  // Catches a recovery that takes the whole gap between two tokens as one
  // comment, which swallows the line below it whenever a comment is the last
  // thing on a line and the next statement is two lines down.
  const pieces = highlight('x = 1 // why\n\ny = 2\n');
  const comment = pieces.find((piece) => piece.kind === 'comment');
  assert.deepEqual(
    [comment?.span.offset, comment?.span.length],
    [6, 6],
    'the comment stops at the line ending',
  );
});

test('a region written as a block comment is not a comment', () => {
  // Catches a highlighter that decided the language has block comments. It does
  // not (3.2), the lexer reports OS1026 on the marker, and painting the region
  // as a comment would tell a reader their file is fine.
  const pieces = highlight('a /* b */ c\n');
  assert.equal(pieces.some((piece) => piece.kind === 'comment'), false);
  assert.equal(pieces.some((piece) => piece.kind === 'unknown'), true);
});

// ---------------------------------------------------------------------------
// The per-line shape
// ---------------------------------------------------------------------------

test('every line of the file has an entry, in order, including the blank ones', () => {
  // Catches a grouping built from the pieces alone, which has no entry for a
  // line that holds nothing. A renderer walking lines would then draw the file
  // with its blank lines missing and every line below one drawn too high.
  const source = 'version 1\n\nstudy("a")\n';
  const lines = highlightLines(source);
  assert.equal(lines.length, sourceFile('t.oscript', source).lineCount);
  assert.deepEqual(
    lines.map((line) => line.line),
    lines.map((_, index) => index + 1),
  );
  assert.deepEqual(lines[1]?.pieces, []);
});

test("a line's pieces are exactly that line's text, with no line ending in them", () => {
  // Catches the split every host makes for itself and gets wrong: a run of
  // whitespace that crosses a line ending handed whole to the line it started
  // on, which gives that line a trailing space it does not have and takes the
  // next line's indentation away.
  for (const script of CORPUS) {
    const file = sourceFile(script.name, script.text);
    for (const line of highlightLines(script.text)) {
      assert.equal(
        line.pieces.map((piece) => piece.text).join(''),
        file.lineText(line.line),
        `${script.name}:${line.line}`,
      );
      for (const piece of line.pieces) {
        assert.equal(piece.span.line, line.line, `${script.name}:${line.line} belongs to its line`);
        assert.equal(piece.text.includes('\n'), false, 'no piece holds a line ending');
      }
    }
  }
});

test("a line's indentation is one of its pieces", () => {
  // Catches a per-line shape that starts at the first token of the line. The
  // leading spaces would then be missing, and every indented line would be drawn
  // against the left margin.
  const lines = highlightLines('if close > open\n    x = 1\n');
  const body = lines[1]?.pieces[0] as Highlight | undefined;
  assert.equal(body?.kind, 'whitespace');
  assert.equal(body?.text, '    ');
});
