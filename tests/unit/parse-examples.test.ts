import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  DiagnosticBag,
  childrenOf,
  endOffset,
  parse,
  renderDiagnostics,
  sourceFile,
  walk,
} from '../../src/core/index.js';
import type { AstNode } from '../../src/core/index.js';

const EXAMPLES = new URL('../../../examples/', import.meta.url);

const scripts = readdirSync(EXAMPLES).filter((name) => name.endsWith('.oscript'));

test('there are twelve example scripts to parse', () => {
  assert.equal(scripts.length, 12);
});

for (const name of scripts) {
  test(`${name} parses with nothing to report`, () => {
    const file = sourceFile(name, readFileSync(new URL(name, EXAMPLES), 'utf8'));
    const bag = new DiagnosticBag();
    const script = parse(file, bag);

    assert.equal(bag.isEmpty, true, `\n${renderDiagnostics(file, bag.ordered())}`);
    assert.equal(script.kind, 'script');
    assert.notEqual(script.items.length, 0);

    const seen: AstNode[] = [];
    walk(script, {
      enter(node) {
        seen.push(node);
      },
    });

    // A file that parsed cleanly has no holes in it: every hole is somewhere a
    // diagnostic was raised, and there were none.
    assert.equal(
      seen.some((node) => node.kind === 'missingExpression'),
      false,
      'a clean parse left a hole in the tree',
    );

    for (const node of seen) {
      assert.equal(node.span.offset >= 0, true, `${node.kind} starts before the file`);
      assert.equal(
        endOffset(node.span) <= file.text.length,
        true,
        `${node.kind} ends past the file`,
      );
      // A parent covers its children, which is what lets an editor find the
      // node under a caret by descending rather than by searching.
      for (const child of childrenOf(node)) {
        assert.equal(
          child.span.offset >= node.span.offset && endOffset(child.span) <= endOffset(node.span),
          true,
          `${child.kind} at ${child.span.line} escapes its ${node.kind}`,
        );
      }
    }
  });
}

test('the examples between them exercise every statement form', () => {
  const kinds = new Set<string>();
  for (const name of scripts) {
    const file = sourceFile(name, readFileSync(new URL(name, EXAMPLES), 'utf8'));
    walk(parse(file, new DiagnosticBag()), {
      enter(node) {
        kinds.add(node.kind);
      },
    });
  }

  // A bare `else` is deliberately absent from the list: no example writes one,
  // and `parse-statements` covers it instead.
  for (const kind of [
    'versionLine',
    'scriptDeclaration',
    'assignment',
    'varDeclaration',
    'expressionStatement',
    'ifStatement',
    'ifBranch',
    'forRangeStatement',
    'switchStatement',
    'switchCase',
    'switchDefault',
    'continueStatement',
    'functionDeclaration',
    'parameter',
    'block',
    'ternary',
    'binary',
    'unary',
    'call',
    'argument',
    'index',
    'member',
    'arrayLiteral',
    'nameReference',
    'numberLiteral',
    'stringLiteral',
    'booleanLiteral',
    'noneLiteral',
    'grouping',
    'name',
  ]) {
    assert.equal(kinds.has(kind), true, `no example uses ${kind}`);
  }
});
