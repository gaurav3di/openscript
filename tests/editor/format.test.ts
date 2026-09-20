/**
 * `format`, and the rule that makes a format button safe to press.
 *
 * The first test in this file is the one that matters: every script in the
 * repository is laid out again, both texts are compiled, and the two compiled
 * programs have to be identical. A formatter that can change a number is a
 * hazard on a script that is holding a position, and asserting that it does not
 * is worth nothing next to compiling both and comparing.
 *
 * Every test names the wrong implementation it exists to catch.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DiagnosticBag, lex, normaliseSource, parseTokens, sourceFile } from '../../src/core/index.js';
import type { Token } from '../../src/core/index.js';
import { format, highlightLines } from '../../src/editor/index.js';
import { CORPUS, MALFORMED, compile, meaningOf } from './support.js';

/** The token stream a parser would read, which is everything that decides meaning. */
function stream(source: string): readonly string[] {
  const file = sourceFile('t.oscript', source);
  return lex(file, new DiagnosticBag()).map((token: Token) =>
    token.kind === 'indent' ? token.kind : `${token.kind}:${token.text}`,
  );
}

/** Whether the front end had anything to say, which is what stops a file being laid out. */
function reads(source: string): boolean {
  const file = sourceFile('t.oscript', source);
  const bag = new DiagnosticBag();
  parseTokens(file, lex(file, bag), bag);
  return bag.isEmpty;
}

// ---------------------------------------------------------------------------
// The property
// ---------------------------------------------------------------------------

test('formatting every script in the repository does not change what it compiles to', () => {
  // The whole reason this function may exist. Catches any rule here that moves a
  // token rather than the whitespace around it: a space inside the arrow of a
  // single-line `fn`, a sign printed away from the number it signs, a bracket
  // re-indented into a different block. Each of those compiles, and each of them
  // computes something else.
  let compared = 0;
  for (const script of CORPUS) {
    const before = compile(script);
    assert.ok(before.program !== undefined, `${script.name} compiles to begin with`);

    const formatted = format(script.text);
    const after = compile({ name: script.name, text: formatted });
    assert.ok(after.program !== undefined, `${script.name} still compiles`);

    assert.equal(
      meaningOf(after.program),
      meaningOf(before.program),
      `${script.name}: the formatter changed the program`,
    );
    compared += 1;
  }
  assert.equal(compared, CORPUS.length);
  assert.ok(compared >= 100, 'the corpus is the repository, not a sample of it');
});

test('formatting every script leaves the token stream it was read from alone', () => {
  // The property behind the property, asserted separately because it is what the
  // function checks for itself before it returns anything. Catches a rule that
  // joins two tokens or splits one: `a - -b` printed as `a--b`, `=>` printed as
  // `= >`, a comma taken into a name.
  for (const script of CORPUS) {
    assert.deepEqual(
      stream(format(script.text)),
      stream(script.text),
      script.name,
    );
  }
});

test('a script that is already laid out is returned exactly', () => {
  // Catches a formatter that is not idempotent, which is the one thing that
  // makes a format button unusable in a version controlled folder: every press
  // produces a diff, so nobody can tell a real change from a press.
  for (const script of CORPUS) {
    const once = format(script.text);
    assert.equal(format(once), once, script.name);
  }
});

test('the corpus was not already canonical, so the comparisons above compared something', () => {
  // Catches the way this whole file could go green while doing nothing: a
  // formatter that returns its input. Every assertion above would hold.
  const changed = CORPUS.filter((script) => format(script.text) !== script.text);
  assert.ok(changed.length > 50, `${changed.length} of ${CORPUS.length} scripts were laid out`);
});

test('no formatted line holds two spaces where one is the layout', () => {
  // The other half of the test above, and the one that notices a quiet refusal.
  //
  // `format` returns the source untouched when its own check says a rule moved a
  // token, which is the right way for it to fail and the wrong way for a suite
  // to be told about it: a rule that broke for one construct would refuse only
  // the scripts holding that construct, and a count of how many scripts changed
  // would still look healthy. So this asserts a property of the output that a
  // refusal cannot have. Every script in this repository aligns its assignments
  // into columns, and the canonical layout has one space inside a line, with the
  // two before a trailing comment as the single exception.
  for (const script of CORPUS) {
    const formatted = format(script.text);
    for (const line of highlightLines(formatted)) {
      for (const [at, piece] of line.pieces.entries()) {
        if (piece.kind !== 'whitespace' || at === 0) continue;
        const next = line.pieces[at + 1];
        const allowed = next?.kind === 'comment' ? 2 : 1;
        assert.equal(
          piece.text.length,
          allowed,
          `${script.name}:${line.line} was not laid out: ${JSON.stringify(line.pieces.map((one) => one.text).join(''))}`,
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// A source that does not parse
// ---------------------------------------------------------------------------

test('a source the front end has something to say about is returned unchanged', () => {
  // Catches a formatter that lays out what it can. The lexer emits no token for
  // a character it refused, so a reprint deletes it, and a trader watches a
  // character vanish from their file. Byte for byte, including the line endings,
  // because a file that was not understood must come back as it went in.
  let refused = 0;
  for (const source of MALFORMED) {
    if (reads(source)) continue;
    assert.equal(format(source), source, JSON.stringify(source));
    refused += 1;
  }
  assert.ok(refused > 10, `${refused} malformed sources were refused`);
});

test('a file that is only comments keeps them', () => {
  // Catches a printer driven by the token stream alone. A comment produces no
  // token, so such a printer returns an empty file, and a trader who pressed
  // format on a script they had commented out loses all of it.
  const source = '// one\n// two\n';
  assert.equal(format(source), source);
});

// ---------------------------------------------------------------------------
// The canonical layout of 3.13
// ---------------------------------------------------------------------------

/**
 * Each case is a source and what the specification says it looks like laid out.
 *
 * They are small on purpose: a rule that is wrong is easier to see in four
 * tokens than in a study, and the corpus above is what says the rules hold
 * together over real scripts.
 */
const CASES: readonly (readonly [string, string, string])[] = [
  ['x=1+2\n', 'x = 1 + 2\n', 'one space around an operator'],
  ['x = a+b*c\n', 'x = a + b * c\n', 'and around every one of them'],
  ['x   = 1\nyy  = 2\n', 'x = 1\nyy = 2\n', 'assignments are not aligned into columns'],
  ['f( a , b )\n', 'f(a, b)\n', 'nothing inside a bracket, a space after a comma'],
  ['x = [ 1 , 2 ]\n', 'x = [1, 2]\n', 'an array literal is a bracket like any other'],
  ['x = close [ 1 ]\n', 'x = close[1]\n', 'an index belongs to what it indexes'],
  ['study ("a")\n', 'study("a")\n', 'an argument list belongs to the name in front of it'],
  ['if (a)\n    x = 1\n', 'if (a)\n    x = 1\n', 'a bracket that groups keeps its space'],
  ['x = -1\n', 'x = -1\n', 'a sign belongs to its number'],
  ['x = a - -1\n', 'x = a - -1\n', 'and is not the subtraction beside it'],
  ['x = a-1\n', 'x = a - 1\n', 'which is spaced like any other operator'],
  ['x = not a\n', 'x = not a\n', 'a word operator keeps the space that spells it'],
  ['x = a?b:c\n', 'x = a ? b : c\n', "both of the ternary's marks are spaced"],
  ['var s : series number = none\n', 'var s: series number = none\n', 'a type belongs to its name'],
  ['fn f(a)=>a+1\n', 'fn f(a) => a + 1\n', 'and the arrow is never broken open'],
  ['if a\n  x=1\n', 'if a\n    x = 1\n', 'a block is four spaces'],
  ['if a\n  if b\n     x=1\n', 'if a\n    if b\n        x = 1\n', 'and four more for the next'],
  ['f(a,\n  b)\n', 'f(a,\n        b)\n', 'a continuation is eight past its statement'],
  ['x = 1 //why\n', 'x = 1  //why\n', 'two spaces before a comment after code'],
  ['if a\n// note\n    x = 1\n', 'if a\n    // note\n    x = 1\n', 'a comment joins its block'],
  ['x = 1\n\n\n\ny = 2\n', 'x = 1\n\ny = 2\n', 'never two blank lines'],
  ['\n\nx = 1\n', 'x = 1\n', 'and never one at the top'],
  ['x = 1', 'x = 1\n', 'one line ending at the end'],
  ['x = 1\r\ny = 2\r\n', 'x = 1\ny = 2\n', 'line endings are normalised, as 3.1 requires'],
  [
    'msg = "a" + \\\n    "b"\n',
    'msg = "a" + \\\n        "b"\n',
    'a continuation backslash is kept where it was written',
  ],
];

for (const [source, expected, why] of CASES) {
  test(`the canonical layout: ${why}`, () => {
    assert.equal(format(source), expected, JSON.stringify(source));
    assert.equal(format(expected), expected, 'and the layout is already the canonical one');
  });
}

test('the cases above are all sources the front end reads', () => {
  // Catches a case written with a mistake in it, which would be returned
  // unchanged and would assert that the formatter does nothing.
  for (const [source, expected] of CASES) {
    assert.equal(reads(normaliseSource(source)), true, JSON.stringify(source));
    assert.equal(reads(expected), true, JSON.stringify(expected));
  }
});
