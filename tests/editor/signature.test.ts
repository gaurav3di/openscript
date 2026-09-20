/**
 * `signature`, and the trap it exists to avoid.
 *
 * A tooltip that shows a default is worth having only if the number in it is the
 * number the compiler fills in. There are two places a default lives: the
 * library manifest, for a call an engine makes, and the emitter, for the eight
 * declaration calls whose optional arguments become fields of a declaration. A
 * tooltip built on the first alone shows nothing beside `width?` while the
 * compiler writes 1.5.
 *
 * So the test that matters below does not compare the tooltip with a number
 * typed here. It compiles a script, reads the value out of the compiled program,
 * and compares the tooltip with that: the number a writer is shown and the
 * number an engine is given are the same number, or this fails.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DiagnosticBag,
  check,
  emit,
  lex,
  namedColour,
  normaliseSource,
  parseTokens,
  sourceFile,
} from '../../src/core/index.js';
import type { CompiledProgram } from '../../src/core/index.js';
import { signature } from '../../src/editor/index.js';
import { MALFORMED } from './support.js';

const HEAD = 'version 1\nstudy("t")\n';

/** The whole front end, so a test can read what an engine would be given. */
function compiled(source: string): CompiledProgram | undefined {
  const file = sourceFile('t.oscript', source);
  const bag = new DiagnosticBag();
  const tokens = lex(file, bag);
  const checked = check(file, parseTokens(file, tokens, bag), bag);
  return emit(file, checked, bag, {}).program;
}

// ---------------------------------------------------------------------------
// The default shown is the default the compiler applies
// ---------------------------------------------------------------------------

test('a declaration call\'s default is the value the compiled program carries', () => {
  // Catches the version that reads the library manifest alone. `plot` carries no
  // default there at all, so that version shows a writer nothing beside `width?`
  // while every plot they draw is 1.5 wide.
  const open = `${HEAD}plot(close, "C", aqua, `;
  const held = signature(open, open.length);
  assert.equal(held?.parameters[3]?.name, 'width');

  const program = compiled(`${HEAD}plot(close, "C")\n`);
  assert.equal(held?.parameters[3]?.defaultText, String(program?.outputs.plots[0]?.width));
});

test('a colour default is the colour the compiled program carries', () => {
  const open = `${HEAD}level(10, "L", `;
  const held = signature(open, open.length);
  const colour = held?.parameters.find((one) => one.name === 'color')?.defaultText;

  const program = compiled(`${HEAD}level(10, "L")\n`);
  assert.deepEqual(program?.outputs.levels[0]?.color, namedColour('gray'));
  assert.equal(colour, '#808080ff', 'the same colour, in the spelling the specification prints');
});

test('an ordinary call\'s default is the manifest\'s, spelled as the specification prints it', () => {
  const open = `${HEAD}x = alma(close, 9, `;
  const held = signature(open, open.length);
  assert.equal(held?.parameters[2]?.name, 'offset');
  assert.equal(held?.parameters[2]?.defaultText, '0.85');
  assert.equal(held?.parameters[2]?.required, false);
});

test('a required parameter is marked required and carries no default', () => {
  const open = `${HEAD}x = ema(`;
  const held = signature(open, open.length);
  assert.equal(held?.parameters[0]?.required, true);
  assert.equal(held?.parameters[0]?.defaultText, undefined);
});

test('an argument with a closed set of values carries the set', () => {
  const open = `${HEAD}x = ma(close, 9, `;
  const held = signature(open, open.length);
  assert.deepEqual(held?.parameters[2]?.values, ['sma', 'ema', 'wma', 'rma', 'hma', 'vwma']);
});

// ---------------------------------------------------------------------------
// Which parameter the cursor is in
// ---------------------------------------------------------------------------

test('the commas decide which parameter the cursor is in', () => {
  const open = `${HEAD}x = ema(close, `;
  assert.equal(signature(open, open.length)?.active, 1);
  assert.equal(signature(open, open.indexOf('close'))?.active, 0);
});

test('a label decides it wherever the argument sits', () => {
  // Catches counting commas alone: `language.md` 11.2 lets a named argument
  // appear at any position after the positional ones, so the fourth argument is
  // not necessarily the fourth parameter.
  const open = `${HEAD}plot(close, "C", scale = `;
  const held = signature(open, open.length);
  assert.equal(held?.parameters[held.active]?.name, 'scale');
});

test('more arguments than the signature takes leaves the cursor in no parameter', () => {
  const open = `${HEAD}x = ema(close, 9, 1, `;
  assert.equal(signature(open, open.length)?.active, -1);
});

test('the innermost open bracket is the call', () => {
  // Catches a scan that takes the first bracket rather than the innermost: the
  // cursor is in `sma`, not in `plot`.
  const open = `${HEAD}plot(sma(close, `;
  const held = signature(open, open.length);
  assert.equal(held?.name, 'sma');
  assert.equal(held?.active, 1);
});

test('a square bracket counts as a bracket', () => {
  // Catches a scan that only knows round brackets, which would put the cursor in
  // the first argument rather than the second.
  const open = `${HEAD}a = [1, 2]\nx = sma(a[1], `;
  assert.equal(signature(open, open.length)?.active, 1);
});

test('the callee\'s own name is the span, so a host can anchor to it', () => {
  const open = `${HEAD}x = ema(close, `;
  const held = signature(open, open.length);
  assert.equal(held?.span.offset, open.indexOf('ema'));
  assert.equal(held?.span.length, 3);
  assert.equal(held?.span.line, 3);
  assert.equal(held?.span.column, 5);
});

test('a dotted callee is named in full', () => {
  const open = `${HEAD}b = draw.box(1, `;
  const held = signature(open, open.length);
  assert.equal(held?.name, 'draw.box');
});

// ---------------------------------------------------------------------------
// A function the file declares
// ---------------------------------------------------------------------------

test('a function the file declares is answered from the checker\'s record of it', () => {
  const source = `${HEAD}fn double(v) =>\n    v * 2\n\nx = double(\n`;
  const held = signature(source, source.length - 1);
  assert.equal(held?.of, 'declared');
  assert.equal(held?.name, 'double');
  assert.equal(held?.parameters[0]?.name, 'v');
  assert.equal(held?.active, 0);
});

test('a default a declared function states is quoted from the source', () => {
  // Catches a printer: the tree holds an expression, and printing one back would
  // be a second formatter with its own opinions. The text is what was written.
  const source = `${HEAD}fn scaled(v, by = 2 * 3) =>\n    v * by\n\nx = scaled(1, \n`;
  const held = signature(source, source.length - 1);
  assert.equal(held?.parameters[1]?.defaultText, '2 * 3');
  assert.equal(held?.parameters[1]?.required, false);
});

// ---------------------------------------------------------------------------
// Where there is no call
// ---------------------------------------------------------------------------

test('a cursor in no call is answered with nothing', () => {
  const source = `${HEAD}x = 1\n`;
  assert.equal(signature(source, source.length), undefined);
  assert.equal(signature(`${HEAD}x = ema(close, 9)\n`, HEAD.length + 1), undefined);
});

test('a callee the language does not have is answered with nothing', () => {
  // Catches a tooltip invented for an unresolved name: OS2001 is what says the
  // name does not exist, and a signature for it would be a second opinion.
  const open = `${HEAD}notACall(`;
  assert.equal(signature(open, open.length), undefined);
});

test('a bracket that is not a call is not a call', () => {
  const open = `${HEAD}x = (1 + `;
  assert.equal(signature(open, open.length), undefined);
});

// ---------------------------------------------------------------------------
// A file that is not a program
// ---------------------------------------------------------------------------

test('every offset of every malformed file answers with a span inside it', () => {
  for (const source of MALFORMED) {
    const normalised = normaliseSource(source);
    for (let offset = 0; offset <= normalised.length; offset += 1) {
      const held = signature(source, offset);
      if (held === undefined) continue;
      assert.ok(
        held.span.offset + held.span.length <= normalised.length,
        `${JSON.stringify(source)} at ${offset}: a span past the end of the file`,
      );
      assert.ok(held.active >= -1 && held.active < held.parameters.length);
    }
  }
});
