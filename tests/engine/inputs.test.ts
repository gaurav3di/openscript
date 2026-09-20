/**
 * An `input()` written where a value belongs, compiled and then run.
 *
 * `language.md` 13.2 lets a declaration option be "a literal, arithmetic over
 * literals, or a call to `input()`", and 13.4 puts an `input()` anywhere at the
 * top level of a file. The declaration line can only take the second spelling of
 * the first rule: it is the first statement of the file, so there is no name
 * above it to bind an input to and pass down. Every one of the six shapes below
 * was refused at emit with OS6018, whose own message tells the reader their
 * script came from a broken compiler.
 *
 * The tests run as well as compile, because the refusal is only half of what
 * went wrong. A test that asserted the absence of OS6018 would pass against an
 * emitter that carried a reference to the wrong input, or loaded the slot next
 * to the right one, and both of those are a study drawn from a number nobody
 * asked for. So every script here declares two inputs with different values, and
 * every assertion is about the value that came out.
 *
 * The shape that already worked, an input bound to a name and passed to a later
 * declaration call, is asserted in `tests/emit/declarations.test.ts` and is not
 * repeated here.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { CompiledProgram, Field, Instruction } from '../../src/core/emit/index.js';
import type { HostBar } from '../../src/core/engine/index.js';
import { compile, engineFor, flat, running, timeOf } from './support.js';

const HEADER = 'version 1\n';

function programOf(text: string): CompiledProgram {
  const compiled = compile('inputs.oscript', text);
  assert.deepEqual(
    compiled.diagnostics.map((one) => `${one.code} at ${one.span.line}:${one.span.column}`),
    [],
    'the script did not compile',
  );
  return compiled.program;
}

/**
 * The value a declaration field stands for, resolved as 2.3 and 2.6 say.
 *
 * Written from the documents rather than taken from the compiler, because a
 * test that asked the compiler to resolve its own reference would agree with it
 * whichever input it had named.
 */
function resolved(
  program: CompiledProgram,
  field: Field,
  settings: Readonly<Record<string, unknown>> = {},
): unknown {
  assert.ok(
    field !== null && typeof field === 'object' && !Array.isArray(field),
    'the field holds a value rather than a reference to an input',
  );
  const key = (field as { readonly input: string }).input;
  const row = program.inputs.find((one) => one.key === key);
  assert.ok(row !== undefined, `the field names ${key}, which inputs[] does not declare`);
  return key in settings ? settings[key] : row.default[1];
}

/** The channel one plot publishes on, found by the title the script gave it. */
function channelOf(program: CompiledProgram, title: string): number {
  const plot = program.outputs.plots.find((one) => one.title === title);
  assert.ok(plot !== undefined, `no plot is titled ${title}`);
  return plot.channel;
}

function count(code: readonly Instruction[], opcode: string, operand: number): number {
  return code.filter((one) => one[0] === opcode && one[1] === operand).length;
}

/** Closes of 1 to 12, so a mean over the last few of them is arithmetic by hand. */
function ramp(): readonly HostBar[] {
  const out: HostBar[] = [];
  for (let i = 1; i <= 12; i += 1) out.push(flat(i, timeOf(i - 1)));
  return out;
}

/** The last value one plot published over the ramp, under these settings. */
function lastValue(
  text: string,
  title: string,
  settings: Readonly<Record<string, unknown>>,
): unknown {
  const program = programOf(text);
  const compiled = compile('inputs.oscript', text);
  const run = engineFor(compiled, { settings }).run(ramp());
  assert.equal(run.diagnostic, undefined, 'the run did not finish');
  const last = run.bars[run.bars.length - 1];
  return last?.columns[channelOf(program, title)];
}

/**
 * Catches an emitter whose folding does not resolve an `input()` call, which
 * refused all three of these with OS6018 and no program; and one that folds the
 * input's default into the field in its place, which would ignore what the
 * reader typed into the dialog and would do it silently.
 *
 * Each script declares a second input with a different value, so a field that
 * named the wrong one would resolve to the wrong number rather than to none.
 */
test('a declaration option written as an input in place carries a reference to it', () => {
  const precision = programOf(
    `${HEADER}study("Range", precision = input(2, "Precision"))\n` +
      `extra = input(5, "Extra")\nplot(close + extra, "C")\n`,
  );
  assert.deepEqual(precision.meta.precision, { input: 'input0' });
  assert.equal(resolved(precision, precision.meta.precision), 2);
  assert.equal(resolved(precision, precision.meta.precision, { input0: 7 }), 7);

  const overlay = programOf(
    `${HEADER}study("Range", overlay = input(true, "Overlay"))\n` +
      `extra = input(5, "Extra")\nplot(close + extra, "C")\n`,
  );
  assert.deepEqual(overlay.meta.overlay, { input: 'input0' });
  assert.equal(resolved(overlay, overlay.meta.overlay), true);

  const title = programOf(
    `${HEADER}study(input("R", "Title"))\nextra = input(5, "Extra")\nplot(close + extra, "C")\n`,
  );
  assert.deepEqual(title.meta.title, { input: 'input0' });
  assert.equal(resolved(title, title.meta.title), 'R');
  // `short` defaults to `title`, so it carries the same reference rather than
  // the title's resolved value, which nothing knows before the settings arrive.
  assert.deepEqual(title.meta.short, { input: 'input0' });

  // The declaration line is the first statement of the file, so an input
  // written in it is always the first input the file declares and an emitter
  // that named `inputs[0]` for every option would answer correctly above. Three
  // in one line, each a different type and a different value, is what tells an
  // option that found its own input from one that took whichever came first.
  const three = programOf(
    `${HEADER}study(input("R", "Title"), precision = input(2, "Precision"), ` +
      `overlay = input(true, "Overlay"))
plot(close, "C")
`,
  );
  assert.deepEqual(
    [three.meta.title, three.meta.precision, three.meta.overlay],
    [{ input: 'input0' }, { input: 'input1' }, { input: 'input2' }],
  );
  assert.equal(resolved(three, three.meta.title), 'R');
  assert.equal(resolved(three, three.meta.precision), 2);
  assert.equal(resolved(three, three.meta.overlay), true);
});

/**
 * Catches a program an engine will not load: the reference has to name a
 * declared input, which is a check at load (3.5), and an emitter that wrote a
 * key nothing declares would be caught here and nowhere earlier.
 */
test('a program whose option is a reference loads with the setting for it', () => {
  const text =
    `${HEADER}study("Range", precision = input(2, "Precision"))\n` +
    `extra = input(5, "Extra")\nplot(close + extra, "C")\n`;
  const engine = running(text, { settings: { input0: 7, extra: 9 } });
  const run = engine.run(ramp());
  assert.equal(run.diagnostic, undefined);
  const last = run.bars[run.bars.length - 1];
  assert.equal(last?.columns[channelOf(programOf(text), 'C')], 21, 'close 12 plus an extra of 9');
});

/**
 * Catches an emitter that emits nothing for an `input()` inside an expression,
 * which is what left the stack one value short and produced OS6018; and one
 * that loads the wrong slot, which the decoy input above each read is here to
 * expose: it would answer 100 rather than 21.
 */
test('an input read inside an expression loads that input slot', () => {
  const after = `${HEADER}study("R")\nother = input(99, "Other")\n`;

  const written = `${after}len = input(14, "Length") + 1\nplot(len, "L")\nplot(other, "O")\n`;
  assert.equal(lastValue(written, 'L', { input1: 20 }), 21);
  assert.equal(lastValue(written, 'L', {}), 15, 'the default of 14, plus one');
  assert.equal(lastValue(written, 'O', { input1: 20 }), 99, 'the other input is untouched');

  const first = `${after}len = 1 + input(14, "Length")\nplot(len, "L")\nplot(other, "O")\n`;
  assert.equal(lastValue(first, 'L', { input1: 20 }), 21);

  // The same value one level down, as the length of a library call. Over closes
  // of 1 to 12 the mean of the last four is 10.5 and of the last five is 10, so
  // the number proves the length was the input's value and not the default.
  const nested = `${after}e = sma(close, input(14, "Length") + 1)\nplot(e, "E")\nplot(other, "O")\n`;
  assert.equal(lastValue(nested, 'E', { input1: 3 }), 10.5);
  assert.equal(lastValue(nested, 'E', { input1: 4 }), 10);
  assert.equal(lastValue(nested, 'E', {}), null, 'a length of 15 over twelve bars is absent');
});

/**
 * Catches an emitter that loads the slot in both positions.
 *
 * `len = input(14, "Length")` is the declaration wearing an assignment's
 * clothes: the name and the input share one slot and the engine writes it at
 * step 5 of every bar, so 12.2 is right that there is no instruction for it. An
 * emitter that told the two cases apart by inspecting the call instead of by
 * which caller it arrived through would emit the read here as well, and the
 * extra value would leave the statement with a stack it did not start with.
 */
test('the assignment that is the declaration emits no read of its own', () => {
  const named = programOf(`${HEADER}study("R")\nlen = input(14, "Length")\nplot(len + 1, "L")\n`);
  const slot = named.inputs[0]?.slot ?? -1;
  assert.equal(named.inputs[0]?.key, 'len');
  assert.equal(count(named.code, 'LOAD', slot), 1, 'only the plot reads the slot');

  // The same call with no name at all: a row of the dialog, and still no work.
  const bare = programOf(`${HEADER}study("R")\ninput(14, "Length")\nplot(close, "C")\n`);
  assert.equal(bare.inputs[0]?.key, 'input0');
  assert.equal(count(bare.code, 'LOAD', bare.inputs[0]?.slot ?? -1), 0);
});

/**
 * The same reference, resolved by the engine rather than by this file.
 *
 * Every assertion above resolves the reference the way 2.3 and 2.6 say to,
 * which proves the compiler wrote down the right input and not that an engine
 * makes anything of it. A grid is the one declaration whose resolved option the
 * engine itself acts on before bar 0, so it is where the whole path can be read
 * back: the setting a host passes in, through the reference the field carries,
 * to the shape of the object the script writes cells into.
 *
 * Catches a reference that names the wrong input, which would give a grid of
 * four columns for a script that asked for five.
 */
test('a grid sized by inputs written in place is the size the settings give it', () => {
  const text =
    `${HEADER}study("R")
panel = table("P", rows = input(3, "Rows"), cols = input(2, "Cols"))
` +
    `plot(close, "C")
if bar.isLast
    cell(panel, 0, 0, "x")
`;
  const program = programOf(text);
  assert.deepEqual(
    [program.outputs.tables[0]?.rows, program.outputs.tables[0]?.cols],
    [{ input: 'input0' }, { input: 'input1' }],
  );

  const engine = running(text, { settings: { input0: 4, input1: 5 } });
  assert.equal(engine.run(ramp()).diagnostic, undefined);
  const grid = engine.tables()[0];
  assert.equal(grid?.rows, 4);
  assert.equal(grid?.cols, 5);
});
