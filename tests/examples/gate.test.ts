import assert from 'node:assert/strict';
import { test } from 'node:test';

import { endOffset, walk } from '../../src/core/index.js';
import type { AstNode } from '../../src/core/index.js';
import { TARGETS, compile, read, report, scriptsIn } from './support.js';
import type { Compiled } from './support.js';

/**
 * The gate for the compiler front end.
 *
 * The twelve scripts in examples/ are the specification's own claim about what
 * the language can express. Every one of them has to lex and parse with nothing
 * reported, and a script that does not is the most valuable thing this phase can
 * find: it means either the parser is wrong or the language is, and the script is
 * not the thing to adjust to make the failure go away.
 */

/** Stated rather than counted, so a script that goes missing fails the gate. */
const TARGET_COUNT = 12;

const targets = scriptsIn(TARGETS);

test('the twelve target scripts are all there', () => {
  assert.equal(
    targets.length,
    TARGET_COUNT,
    `examples/ holds ${targets.length} scripts: ${targets.join(', ')}`,
  );
});

for (const name of targets) {
  test(`${name} lexes and parses with nothing to report`, () => {
    const compiled = compile(name, read(TARGETS, name));

    assert.equal(compiled.diagnostics.length, 0, report(compiled));
    assert.notEqual(compiled.tokens.length, 0, `${name} produced no tokens`);
    assert.notEqual(compiled.script.items.length, 0, `${name} parsed to an empty file`);

    // A hole in the tree is where a diagnostic was raised, and there were none.
    // Without this the gate would pass a file the parser had quietly half read.
    const holes: AstNode[] = [];
    walk(compiled.script, {
      enter(node) {
        if (node.kind === 'missingExpression') holes.push(node);
      },
    });
    assert.deepEqual(
      holes.map((hole) => `${hole.span.line}:${hole.span.column}`),
      [],
      `${name} parsed cleanly and still left a hole in the tree`,
    );
  });
}

/**
 * The layout tokens, which carry no text of their own.
 *
 * A newline, an indent and a dedent are the shape of the file rather than
 * anything written on a line, so a line whose only tokens are these carries
 * nothing for the tree to have read.
 */
const LAYOUT: ReadonlySet<string> = new Set(['newline', 'indent', 'dedent', 'endOfFile']);

/** Every line the lexer found something written on, in order. */
function linesCarryingAToken(compiled: Compiled): readonly number[] {
  const lines = new Set<number>();
  for (const token of compiled.tokens) {
    if (!LAYOUT.has(token.kind)) lines.add(token.span.line);
  }
  return [...lines].sort((first, second) => first - second);
}

/**
 * Every line a node of the tree begins or ends on, in order.
 *
 * Begins or ends, rather than every line a span runs across, because a span
 * that runs across a line is not evidence that anything on it was read: a
 * block's span reaches from its first statement to its last whether or not the
 * statements between them are still in it, which is the exact shape of the
 * defect this test exists to catch. A line a node starts or stops on is a line
 * the parser demonstrably stood at.
 *
 * The file's own node is left out for the same reason: it spans everything
 * between the first token and the last, so counting it would make every line
 * covered and leave this test unable to fail.
 */
function linesTheTreeTouches(compiled: Compiled): readonly number[] {
  const lines = new Set<number>();
  walk(compiled.script, {
    enter(node) {
      if (node.kind === 'script') return;
      lines.add(node.span.line);
      lines.add(compiled.file.positionAt(endOffset(node.span)).line);
    },
  });
  return [...lines].sort((first, second) => first - second);
}

test('the whole of every target script reached the tree', () => {
  for (const name of targets) {
    const compiled = compile(name, read(TARGETS, name));
    assert.notEqual(compiled.script.items.length, 0, `${name} parsed to an empty file`);

    // The two sets are equal, not one inside the other. A line written and not
    // in the tree is a statement the parser dropped in silence, which it has
    // done before. A line in the tree and not written is a span claiming text
    // nothing read, which sends an editor's selection and a caret to the wrong
    // place. Comparing the whole of both catches a hole in the middle of a
    // file, where reaching the last line does not.
    assert.deepEqual(
      linesTheTreeTouches(compiled),
      linesCarryingAToken(compiled),
      `${name}: the lines the tree begins or ends on are not the lines the file ` +
        `carries tokens on`,
    );
  }
});
