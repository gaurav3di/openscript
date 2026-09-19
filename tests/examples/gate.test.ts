import assert from 'node:assert/strict';
import { test } from 'node:test';

import { endOffset, walk } from '../../src/core/index.js';
import type { AstNode } from '../../src/core/index.js';
import { TARGETS, compile, read, report, scriptsIn } from './support.js';

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

test('the whole of every target script reached the tree', () => {
  for (const name of targets) {
    const compiled = compile(name, read(TARGETS, name));
    const last = compiled.script.items.at(-1);
    assert.ok(last, `${name} has no items`);

    // Recovery skips a line it could not read, and a file that has already been
    // refused reports nothing more about the tail it skipped. Reaching the last
    // line that carries a token is the proof that nothing was skipped.
    const lastLineWithToken = compiled.tokens
      .filter((token) => token.kind !== 'endOfFile' && token.kind !== 'dedent')
      .map((token) => token.span.line)
      .reduce((highest, line) => Math.max(highest, line), 0);
    const lastLineParsed = compiled.file.positionAt(endOffset(last.span)).line;

    assert.equal(
      lastLineParsed >= lastLineWithToken,
      true,
      `${name}: the last statement ends at line ${lastLineParsed} and the file has a token on ` +
        `line ${lastLineWithToken}`,
    );
  }
});
