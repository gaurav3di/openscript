/**
 * The tokenizer, and the equivalence that decides whether it is honest.
 *
 * The component tokenises a line at a time; `highlight` takes a whole file. The
 * adapter therefore lexes the line on its own, and the question that matters is
 * whether that is the same answer. It is measured rather than argued: every
 * script in the repository and every malformed file goes through both routes and
 * the pieces are compared.
 *
 * If the language ever grows something that crosses a line ending, this fails on
 * the day it is added, and `spec/editor-narrowings.json` gains a real row where
 * it now carries a measurement.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normaliseSource } from '../../../src/core/index.js';
import { HIGHLIGHT_TOKENS, openscriptStream } from '../../../src/adapters/codemirror/index.js';
import { highlight, highlightLines } from '../../../src/editor/index.js';
import { MALFORMED } from '../../editor/support.js';
import { CORPUS, tokensOf } from './support.js';

/** One line through the adapter, as `kind text` pairs. */
function throughAdapter(line: string): readonly string[] {
  return tokensOf(openscriptStream, line).map((piece) => `${piece.style}:${piece.text}`);
}

/** The same line through the tier, mapped to the styles the adapter would use. */
function throughTier(source: string, line: number): readonly string[] {
  const held = highlightLines(source)[line];
  return (held?.pieces ?? []).map((piece) => `${HIGHLIGHT_TOKENS[piece.kind]}:${piece.text}`);
}

function compare(source: string, why: string): number {
  const lines = normaliseSource(source).split('\n');
  lines.forEach((line, index) => {
    assert.deepEqual(
      throughAdapter(line),
      throughTier(source, index),
      `${why} line ${index + 1}: the adapter and the tier disagree`,
    );
  });
  return lines.length;
}

test('a line at a time is the same answer as the whole file, over the repository', () => {
  let lines = 0;
  for (const script of CORPUS) lines += compare(script.text, script.name);
  assert.ok(CORPUS.length >= 100, 'the corpus is the repository, not a sample of it');
  assert.ok(lines > 4000, `only ${lines} lines were compared`);
});

test('a line at a time is the same answer for a file that is not a program', () => {
  for (const source of MALFORMED) compare(source, JSON.stringify(source));
});

test('the tokenizer advances on every call', () => {
  // The support file throws rather than looping if it does not, so this is a
  // test of the file it would hang: a tokenizer that returns without moving the
  // stream hangs the component, which is the worst failure in this adapter.
  for (const script of CORPUS.slice(0, 5)) {
    for (const line of script.text.split('\n')) tokensOf(openscriptStream, line);
  }
});

test('the pieces of a line cover it exactly', () => {
  // Catches the same defect the tier's covering property catches, one layer up:
  // a character dropped between two tokens draws everything after it on the line
  // a column to the left, and the caret stops sitting where the text is.
  const line = '    fast = ema(close, 9)      // a comment';
  let at = 0;
  for (const piece of tokensOf(openscriptStream, line)) {
    assert.equal(piece.from, at);
    at = piece.to;
  }
  assert.equal(at, line.length);
});

test('every kind has a style name or an honest null', () => {
  // Catches a kind added to the tier and forgotten here, which would be an
  // unpainted piece in somebody's editor and nothing anywhere saying so. The
  // record is typed over the closed set of kinds, so this is really a test that
  // the two unstyled ones are the two that should be.
  const unstyled = Object.entries(HIGHLIGHT_TOKENS)
    .filter(([, style]) => style === null)
    .map(([kind]) => kind);
  assert.deepEqual(unstyled.sort(), ['unknown', 'whitespace']);
  for (const [kind, style] of Object.entries(HIGHLIGHT_TOKENS)) {
    if (style === null) continue;
    assert.ok(style.length > 0, `${kind} has an empty style name`);
  }
});

test('a keyword, a library name and a name of the file\'s own are painted apart', () => {
  // The four are compared with each other rather than with the record they came
  // from. A test that asserts `styleOf("ema") === HIGHLIGHT_TOKENS.builtin` is
  // comparing the mapping with itself and holds whatever the mapping says, so it
  // would pass with every kind painted the same colour.
  const pieces = tokensOf(openscriptStream, 'var fast = ema(close, 9)');
  const styleOf = (text: string): string | null =>
    pieces.find((piece) => piece.text === text)?.style ?? 'missing';

  const apart = [styleOf('var'), styleOf('ema'), styleOf('fast'), styleOf('9')];
  assert.equal(new Set(apart).size, 4, `four kinds, ${new Set(apart).size} colours: ${apart}`);
  assert.equal(styleOf('close'), styleOf('ema'), 'a library value and a library call are both built in');
  assert.equal(styleOf('var'), HIGHLIGHT_TOKENS.keyword);
});

test('a comment is recovered, and a comment marker inside a string is not one', () => {
  const inComment = tokensOf(openscriptStream, 'plot(close)  // a comment');
  assert.ok(inComment.some((piece) => piece.style === HIGHLIGHT_TOKENS.comment));

  const inString = tokensOf(openscriptStream, 'x = "a // not a comment"');
  assert.ok(
    !inString.some((piece) => piece.style === HIGHLIGHT_TOKENS.comment),
    'a comment marker inside a string literal is ordinary text',
  );
});

test('a state carried from another line is replaced rather than believed', () => {
  // The component copies state at line boundaries and restarts from it, so a
  // state holding another line's pieces arrives here in the ordinary course of
  // editing. The line in front of the tokenizer is what decides.
  //
  // The stale state carries another line's real pieces, not an empty list: a
  // cache that only fills when it is empty passes the empty version of this test
  // and paints a line with the line above it in production.
  const stale = { line: 'x  = 1', pieces: highlight('x  = 1') };
  const pieces = tokensOf(
    {
      startState: () => stale,
      token: (stream, held) => openscriptStream.token(stream, held),
    },
    'plot(close)',
  );
  assert.deepEqual(
    pieces.map((piece) => `${piece.style}:${piece.text}`),
    throughTier('plot(close)\n', 0),
  );
});
