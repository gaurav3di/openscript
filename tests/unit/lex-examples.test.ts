import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { DiagnosticBag, lex, renderDiagnostics, sourceFile } from '../../src/core/index.js';

const EXAMPLES = new URL('../../../examples/', import.meta.url);

const scripts = readdirSync(EXAMPLES).filter((name) => name.endsWith('.oscript'));

test('there are twelve example scripts to lex', () => {
  assert.equal(scripts.length, 12);
});

for (const name of scripts) {
  test(`${name} lexes with nothing to report`, () => {
    const file = sourceFile(name, readFileSync(new URL(name, EXAMPLES), 'utf8'));
    const bag = new DiagnosticBag();
    const tokens = lex(file, bag);

    assert.equal(bag.isEmpty, true, `\n${renderDiagnostics(file, bag.ordered())}`);
    assert.equal(tokens[tokens.length - 1]?.kind, 'endOfFile');

    // The shape a parser is entitled to assume: a block opens after a statement
    // ended and closes before another begins, every block that opened closed,
    // and no statement ended twice.
    let depth = 0;
    for (const [at, token] of tokens.entries()) {
      const before = tokens[at - 1]?.kind;
      if (token.kind === 'indent') {
        depth++;
        assert.equal(before, 'newline', `indent at line ${token.span.line}`);
      }
      if (token.kind === 'dedent') {
        depth--;
        assert.equal(before === 'newline' || before === 'dedent', true, `dedent at ${at}`);
      }
      if (token.kind === 'newline') {
        assert.notEqual(before, 'newline', `two newlines at line ${token.span.line}`);
      }
      assert.equal(depth >= 0, true, `more blocks closed than opened at line ${token.span.line}`);
    }
    assert.equal(depth, 0, 'a block was left open');
    assert.equal(
      tokens.some((token) => token.kind === 'indent'),
      true,
      'an example with no block would not be exercising much',
    );
  });
}
