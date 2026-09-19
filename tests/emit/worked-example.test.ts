/**
 * The worked example of `compiled-program.md` section 12, compiled and compared
 * field by field against the program the document prints.
 *
 * This is the closest thing the project has to a conformance test of its own
 * emitter. Somebody implementing an engine in another language reads section 12
 * and builds against it, so a compiler that produces anything else for that
 * source produces something their engine was not written for, whatever the rest
 * of the document says.
 *
 * Both halves are read out of the specification at test time rather than copied
 * here. A copy would pass forever after the document changed, which is the one
 * failure this test exists to prevent.
 *
 * One thing has to be worked around, and it is recorded as a test of its own
 * below rather than hidden: the example's own source does not compile. It names
 * its moving average `avg`, and `avg(arr)` is a library function
 * (`language.md` 14.1), so assigning to it is OS2002.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { CompiledProgram, Position } from '../../src/core/emit/index.js';
import { compile } from './support.js';

const SPEC = new URL('../../../spec/compiled-program.md', import.meta.url);

/** The name the example uses for its average, and the one that is free. */
const TAKEN = 'avg';
const FREE = 'mean';

function specText(): string {
  return readFileSync(SPEC, 'utf8');
}

/** The first fenced block of a given language after a heading. */
function blockAfter(heading: string, language: string): string {
  const text = specText();
  const at = text.indexOf(heading);
  assert.ok(at >= 0, `${heading} is not in the specification`);
  const fence = text.indexOf('```' + language, at);
  assert.ok(fence >= 0, `${heading} has no ${language} block`);
  const from = fence + 3 + language.length;
  const to = text.indexOf('```', from);
  assert.ok(to >= 0, `${heading} has an unterminated block`);
  return text.slice(from, to);
}

/**
 * 12.1's source, with the line number gutter the document prints stripped.
 *
 * A numbered blank line carries its number and nothing after it, so the gutter
 * is two spaces or the end of the line. Taking only the first spelling leaves a
 * line of whitespace where a blank one belongs, and an indented line with
 * nothing above it to indent under is OS1003.
 */
function workedSource(): string {
  const block = blockAfter('### 12.1 The source', '');
  const lines = block.replace(/^\n/, '').replace(/\n$/, '').split('\n');
  return `${lines.map((line) => line.replace(/^\s*\d+(?:\s{2}|\s*$)/, '')).join('\n')}\n`;
}

function workedProgram(): CompiledProgram {
  return JSON.parse(blockAfter('### 12.2 The compiled program', 'json')) as CompiledProgram;
}

/**
 * The example's source, as written, refuses to compile.
 *
 * Recorded as an assertion rather than as a note, so that the day somebody
 * corrects the document this fails and tells them to take the workaround below
 * out with it.
 */
test("the worked example's own source assigns to a library name", () => {
  const one = compile('two-bar-mean.osc', workedSource());
  const codes = one.diagnostics
    .filter((d) => d.severity === 'error')
    .map((d) => `${d.code} at ${d.span.line}:${d.span.column}, length ${d.span.length}`);
  assert.deepEqual(codes, [
    'OS2002 at 6:1, length 3',
    'OS2014 at 9:12, length 3',
    'OS2014 at 13:6, length 3',
  ]);
});

/**
 * Catches any disagreement at all between this compiler and section 12.2.
 *
 * `source`, `compiler` and `debug` are compared separately: the first two are a
 * hash and a version that belong to whoever built the program, and the third is
 * compared below in the one way the rename leaves meaningful.
 */
test('the worked example compiles to the program the document prints', () => {
  const one = compile('two-bar-mean.osc', workedSource().split(TAKEN).join(FREE));
  assert.deepEqual(
    one.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code),
    [],
  );
  assert.ok(one.program !== undefined, one.gaps.map((gap) => gap.what).join('; '));

  const expected = workedProgram() as unknown as Record<string, unknown>;
  const actual = one.program as unknown as Record<string, unknown>;
  for (const field of Object.keys(expected)) {
    if (field === 'source' || field === 'compiler' || field === 'debug') continue;
    assert.deepEqual(actual[field], expected[field], field);
  }
});

/**
 * Catches an instruction attributed to the wrong statement.
 *
 * Every column on line 6 shifts by one, because `mean` is a letter longer than
 * the name the document uses, so the lines are compared everywhere and the
 * columns everywhere else. An engine's runtime error draws its caret from this
 * table, and a caret under the wrong line is the thing this project promised
 * not to ship.
 */
test('every instruction is attributed to the line the document gives it', () => {
  const one = compile('two-bar-mean.osc', workedSource().split(TAKEN).join(FREE));
  const program = one.program as CompiledProgram;
  const expected = workedProgram().debug.pos;

  const positionOf = (pos: readonly Position[], index: number): Position | undefined => {
    let found: Position | undefined;
    for (const triple of pos) {
      if (triple[0] <= index) found = triple;
    }
    return found;
  };

  const RENAMED_LINE = 6;
  for (let index = 0; index < program.code.length; index += 1) {
    const mine = positionOf(program.debug.pos, index);
    const theirs = positionOf(expected, index);
    assert.ok(mine !== undefined && theirs !== undefined, `instruction ${index} has no position`);
    assert.equal(mine[1], theirs[1], `instruction ${index}: line`);
    if (mine[1] === RENAMED_LINE) continue;
    assert.equal(mine[2], theirs[2], `instruction ${index}: column`);
  }

  assert.deepEqual(program.debug.names.cells, workedProgram().debug.names.cells);
  assert.deepEqual(program.debug.names.series, workedProgram().debug.names.series);
  assert.deepEqual(program.debug.names.channels, workedProgram().debug.names.channels);
  assert.deepEqual(program.debug.names.slots, ['len', FREE]);
  assert.equal(program.debug.retain, false);
  assert.deepEqual(program.debug.fnPos, []);
});
