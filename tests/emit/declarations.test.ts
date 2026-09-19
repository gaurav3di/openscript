/**
 * A declaration is not a per-bar instruction.
 *
 * This is the distinction the whole emitter turns on and the one that is easy
 * to get subtly wrong. A `plot` call is a fixed entry in `outputs` **plus** one
 * `EMIT` per bar; a `table` call is a fixed entry and **no** instruction at all;
 * an `input` call is a row of the settings dialog and a slot the engine writes.
 * An emitter that treated any of them as a call would put a grid in the object
 * heap on every bar, would name a declaration in `lib.functions` where an engine
 * expects a function it can call, and would break the type system that makes a
 * declaration handle a compile-time value.
 *
 * Each test below names the wrong implementation it exists to catch.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { CompiledProgram, Instruction } from '../../src/core/emit/index.js';
import { compile } from './support.js';

function programOf(text: string): CompiledProgram {
  const one = compile('t.oscript', text);
  const errors = one.diagnostics.filter((d) => d.severity === 'error');
  assert.deepEqual(
    errors.map((d) => `${d.code} at ${d.span.line}:${d.span.column}`),
    [],
    'the test script did not compile',
  );
  assert.ok(one.program !== undefined, `no program: ${one.gaps.map((g) => g.what).join('; ')}`);
  return one.program;
}

function count(code: readonly Instruction[], opcode: string, operand?: number): number {
  return code.filter((i) => i[0] === opcode && (operand === undefined || i[1] === operand)).length;
}

const HEADER = 'version 1\n';

/**
 * Catches an emitter that compiles `plot` to a `CALL_LIB`.
 *
 * `lib.functions` exists to be named by a `CALL_LIB` and by nothing else (2.5),
 * and an engine checks every entry against its manifest at load. A declaration
 * in that table is a program refused with OS6004 by every conforming engine.
 */
test('a plot is one declared entry plus one EMIT, and never a library call', () => {
  const program = programOf(`${HEADER}study("T")\nplot(close, "C", aqua)\n`);

  assert.equal(program.outputs.plots.length, 1);
  const plot = program.outputs.plots[0];
  assert.equal(plot?.key, 'p0');
  assert.equal(plot?.title, 'C');
  assert.equal(count(program.code, 'EMIT', plot?.channel), 1);

  for (const fn of program.lib.functions) {
    assert.notEqual(fn.name, 'plot', 'plot reached the library table');
  }
});

/**
 * Catches a `table` compiled to a per-bar call.
 *
 * One call site returns the same object on every bar (`stdlib.md` 14.3). A call
 * would put a new grid in the object heap on every bar, and the declaration's
 * own `slot` field would then name a slot nothing ever agreed on.
 */
test('a table is a declared grid, a slot, and no instruction of its own', () => {
  const program = programOf(
    `${HEADER}study("T")\npanel = table("P", rows = 1, cols = 1)\nif bar.isLast\n    cell(panel, 0, 0, "x")\n`,
  );

  assert.equal(program.outputs.tables.length, 1);
  const grid = program.outputs.tables[0];
  assert.equal(grid?.key, 't0');
  assert.equal(grid?.rows, 1);
  assert.equal(grid?.cols, 1);
  assert.ok((grid?.slot ?? -1) >= 0 && (grid?.slot ?? 0) < program.frame.slots);

  for (const fn of program.lib.functions) assert.notEqual(fn.name, 'table');
  // The handle is read from the slot the declaration named, by `cell`.
  assert.ok(count(program.code, 'LOAD', grid?.slot) > 0, 'nothing reads the grid handle');
});

/**
 * Catches an emitter that gives `input()` an instruction.
 *
 * The engine writes each input's effective value into its slot at step 5 of
 * every bar (2.6 and 5.1), and section 12.2 says in as many words that there is
 * no instruction for an `input()`.
 */
test('an input is a settings row and a slot, and the bar does no work for it', () => {
  const program = programOf(`${HEADER}study("T")\nlen = input(14, "Length", min = 1, max = 500)\nplot(close, "C")\n`);

  assert.equal(program.inputs.length, 1);
  const input = program.inputs[0];
  assert.equal(input?.key, 'len');
  assert.equal(input?.kind, 'number');
  assert.equal(input?.label, 'Length');
  assert.deepEqual(input?.default, ['n', 14]);
  assert.equal(input?.min, 1);
  assert.equal(input?.max, 500);
  assert.ok((input?.slot ?? -1) >= 0 && (input?.slot ?? 0) < program.frame.slots);

  for (const fn of program.lib.functions) assert.notEqual(fn.name, 'input');
  // Nothing writes the input's slot: the engine does, before the bar runs.
  assert.equal(count(program.code, 'STORE', input?.slot), 0);
});

/**
 * Catches an emitter that omits an option a script left out.
 *
 * 2.3 wants the effective value written, defaults included, so an engine never
 * needs a table of defaults and a default that changes in a later language
 * version cannot silently change an old program.
 */
test('every declaration field carries its effective value, defaults included', () => {
  const program = programOf(`${HEADER}study("T")\nplot(close, "C")\n`);

  assert.equal(program.meta.kind, 'study');
  assert.equal(program.meta.title, 'T');
  assert.equal(program.meta.short, 'T');
  assert.equal(program.meta.overlay, false);
  assert.equal(program.meta.precision, 4);
  assert.equal(program.meta.format, 'price');
  assert.equal(program.meta.range, null);
  assert.equal(program.meta.scale, 'right');
  assert.equal(program.meta.group, '');
  assert.equal(program.meta.onUnconfirmed, false);
  assert.equal(program.meta.strategy, undefined, 'a study carries no strategy object');

  const plot = program.outputs.plots[0];
  assert.equal(plot?.type, 'line');
  assert.equal(plot?.width, 1.5);
  assert.equal(plot?.lineStyle, 'solid');
  assert.equal(plot?.offset, 0);
  assert.equal(plot?.scale, 'right');
  assert.equal(plot?.color, null, 'a plot that named no colour leaves it to the host');
  assert.equal(plot?.colorChannel, null);
  assert.equal(plot?.ohlc, null);

  assert.equal(program.limits.loops, 2_000_000);
  assert.equal(program.limits.history, null);
});

test('a strategy carries every trading option with its effective value', () => {
  const program = programOf(`${HEADER}strategy("S")\nif close > open\n    buy()\n`);

  assert.equal(program.meta.kind, 'strategy');
  assert.deepEqual(program.meta.strategy, {
    capital: 100_000,
    currency: '',
    qty: 1,
    qtyType: 'units',
    product: 'intraday',
    fillOn: 'nextOpen',
    slippage: 0,
    commission: 0,
    commissionType: 'perTrade',
    pyramiding: 1,
    closeOnSessionEnd: false,
  });
  assert.ok(program.requires.includes('orders'));
  assert.ok(program.lib.functions.some((fn) => fn.name === 'buy' && fn.effect === 'order'));
});

/**
 * Catches an emitter that folds an input's default into a declaration field.
 *
 * The reference form is how a tunable corner or a tunable colour reaches a
 * declaration that is otherwise fixed before bar 0 (2.3). Folding the default
 * in its place would ignore what the user typed and would do it silently.
 */
test('an option written with an input is carried as a reference to that input', () => {
  const program = programOf(
    `${HEADER}study("T")\ncorner = input("topRight", "Corner", options = ["topLeft", "topRight"])\n` +
      `panel = table("P", rows = 1, cols = 1, position = corner)\nplot(close, "C")\n`,
  );

  const grid = program.outputs.tables[0];
  assert.deepEqual(grid?.position, { input: 'corner' });
  assert.ok(
    program.inputs.some((one) => one.key === 'corner'),
    'the reference names an input that is not declared',
  );
  assert.deepEqual(program.inputs[0]?.options, [
    ['s', 'topLeft'],
    ['s', 'topRight'],
  ]);
});

/**
 * Catches a band drawn between two expressions rather than two declared columns.
 *
 * `fill` names two plot keys and a band is a field of the chart descriptor
 * holding that pair (2.8), so a key naming nothing is a band the host cannot
 * draw and cannot report.
 */
test('a band names two plot keys that the program declares', () => {
  const program = programOf(
    `${HEADER}study("T")\nhi = plot(high, "H", aqua)\nlo = plot(low, "L", aqua)\nfill(hi, lo, fade(aqua, 88))\n`,
  );

  assert.equal(program.outputs.fills.length, 1);
  const band = program.outputs.fills[0];
  const keys = program.outputs.plots.map((one) => one.key);
  assert.deepEqual(band?.between, ['p0', 'p1']);
  for (const key of band?.between ?? []) assert.ok(keys.includes(key), `${key} is not a plot`);
  // One colour sets both sides, so an engine reads one representation of a band.
  assert.deepEqual(band?.colorUp, band?.colorDown);
  assert.deepEqual(band?.colorUp, [0, 255, 255, 0.12]);
});

/**
 * Catches a marker or an alert whose channel is not held back on a moving bar.
 *
 * `language.md` 7.5: a condition true halfway through a bar and false when it
 * closed must never fire. That rule is carried by one boolean on one channel.
 */
test('a marker and an alert are deferred channels, and a plot column is not', () => {
  const program = programOf(
    `${HEADER}study("T")\nplot(close, "C")\nif close > open\n    signal("UP")\n    alert("up", id = "u")\n`,
  );

  const plot = program.outputs.plots[0];
  assert.equal(program.channels[plot?.channel ?? 0]?.defer, false);
  assert.equal(program.channels[plot?.channel ?? 0]?.once, true);

  const marker = program.outputs.markers[0];
  assert.equal(program.channels[marker?.channel ?? 0]?.defer, true);
  assert.equal(program.channels[marker?.channel ?? 0]?.once, false);
  assert.equal(marker?.position, 'above');
  assert.equal(marker?.shape, 'label');

  const alert = program.outputs.alerts[0];
  assert.equal(alert?.key, 'u');
  assert.equal(alert?.frequency, 'oncePerBar');
  assert.equal(program.channels[alert?.condChannel ?? 0]?.defer, true);
  assert.equal(program.channels[alert?.condChannel ?? 0]?.type, 'bool');
  assert.equal(program.channels[alert?.messageChannel ?? 0]?.type, 'string');
});

/**
 * Catches an emitter that gives a `var` a cell and nothing else.
 *
 * `language.md` 8.3 calls `x[1]` on a `var` both at once: the cell carries the
 * value forward and only a register has history (2.10). With the cell alone the
 * read has nothing to read, and with the register alone the value does not
 * survive the bar.
 */
test('a persistent name whose past is read has a cell and a register', () => {
  const program = programOf(`${HEADER}study("T")\nvar n = 0\nn = n + 1\nplot(n[1], "Prev")\n`);

  assert.equal(program.cells.length, 1);
  assert.equal(program.cells[0]?.kind, 'var');
  assert.equal(program.cells[0]?.name, 'n');

  const register = program.series.findIndex((one) => one.kind === 'computed' && one.name === 'n');
  assert.ok(register >= 0, 'the var has no register to read its past from');
  assert.equal(count(program.code, 'HIST', register), 1);
  // The register's entry for a bar is written from the cell, once, at the end.
  assert.equal(count(program.code, 'SSTORE', register), 1);
  assert.equal(program.code[program.code.length - 2]?.[0], 'SSTORE');
});

/** Catches a `live var` recorded as an ordinary one, which would roll back. */
test('a live var is a cell of its own kind', () => {
  const program = programOf(`${HEADER}study("T")\nlive var ticks = 0\nticks = ticks + 1\nplot(ticks, "T")\n`);
  assert.deepEqual(
    program.cells.map((one) => [one.kind, one.name]),
    [['live', 'ticks']],
  );
});
