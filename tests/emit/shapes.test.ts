/**
 * The shapes the twelve target scripts do not reach.
 *
 * The targets are a real corpus and they leave holes: none of them writes a
 * `for x in`, a `while`, a `switch` with a subject, a function that reads its
 * parameter's past, or a stateful helper called twice. Each of those has a
 * piece of the format to itself, and a piece of the format nothing exercises is
 * a piece nobody finds out about until an engine refuses a trader's script.
 *
 * So each one is compiled here and put through the same load-time verification
 * the target scripts get, plus the assertion that names the thing the shape is
 * for.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { CompiledProgram, Instruction } from '../../src/core/emit/index.js';
import { channelCounts, compile, instructionLists, targetsOf, walkStack } from './support.js';

function programOf(text: string): CompiledProgram {
  const one = compile('t.oscript', text);
  const errors = one.diagnostics.filter((d) => d.severity === 'error');
  assert.deepEqual(
    errors.map((d) => `${d.code} at ${d.span.line}:${d.span.column}`),
    [],
    'the test script did not compile',
  );
  assert.ok(one.program !== undefined, one.gaps.map((gap) => gap.what).join('; '));
  return one.program;
}

/** Every check of section 3.5 this suite can run from the program alone. */
function verify(program: CompiledProgram, what: string): void {
  const argcOf = (site: number): number => program.callSites[site]?.argc ?? 0;

  for (const list of instructionLists(program)) {
    assert.deepEqual(walkStack(list.code, argcOf).problems, [], `${what} ${list.name}: stack`);
    list.code.forEach((instruction, index) => {
      for (const target of targetsOf(instruction)) {
        assert.ok(target >= 0 && target < list.code.length, `${what} ${list.name}[${index}]`);
        if (target <= index) {
          assert.equal(list.code[target]?.[0], 'TICK', `${what} ${list.name}[${index}]: backward`);
        }
      }
    });
  }

  const counts = channelCounts(program.code, program.channels.length);
  program.channels.forEach((channel, index) => {
    if (!channel.once) return;
    assert.equal(counts.least[index], 1, `${what}: channel ${index} on some path`);
    assert.equal(counts.most[index], 1, `${what}: channel ${index} twice`);
  });

  assert.equal(program.code[program.code.length - 1]?.[0], 'HALT', what);
  for (const fn of program.functions) {
    assert.equal(fn.code[fn.code.length - 1]?.[0], 'RET', `${what} ${fn.name}`);
  }
}

function count(code: readonly Instruction[], opcode: string): number {
  return code.filter((one) => one[0] === opcode).length;
}

const HEADER = 'version 1\nstudy("T")\n';

/**
 * Catches a `for` whose `break` or `continue` lands on the wrong instruction.
 *
 * `break` is a forward jump past the loop and `continue` a forward jump to the
 * `FOR_NEXT` (4.8). A `continue` that jumped to the `TICK` instead would skip
 * the advance and spin until OS5001.
 */
test('a numeric for loop, with break and continue', () => {
  const program = programOf(
    `${HEADER}total = 0.0\nfor i = 0 to 9\n    if i == 5\n        break\n    if i == 2\n        continue\n    total += close[i]\nplot(total, "T")\n`,
  );
  verify(program, 'for');

  assert.equal(program.loops.length, 1);
  assert.equal(program.loops[0]?.kind, 'for');
  assert.equal(program.loops[0]?.line, 4);
  assert.equal(count(program.code, 'FOR_INIT'), 1);
  assert.equal(count(program.code, 'FOR_NEXT'), 1);
  assert.equal(count(program.code, 'TICK'), 1);
  assert.ok(program.requires.includes('loops'));

  const next = program.code.findIndex((one) => one[0] === 'FOR_NEXT');
  const tick = program.code.findIndex((one) => one[0] === 'TICK');
  const continues = program.code.filter((one) => one[0] === 'JUMP' && one[1] === next);
  assert.equal(continues.length, 1, 'continue does not reach the advance');
  assert.equal(program.code[next]?.[5], tick, 'the loop does not jump back to its TICK');
});

/**
 * Catches a `for x in` that re-evaluates its iterable.
 *
 * The element count is read when the loop is entered and re-read each iteration
 * so the loop stops early if the array shrank (4.8). The iterable itself is
 * read once into a hidden slot: an expression evaluated three times would run
 * its calls three times and advance their state three times.
 */
test('a for-in loop reads its iterable once and its size twice', () => {
  const program = programOf(
    `${HEADER}var xs = []\npush(xs, close)\ntotal = 0.0\nfor x in xs\n    total += x\nplot(total, "T")\n`,
  );
  verify(program, 'forIn');

  assert.equal(program.loops.length, 1);
  assert.equal(program.loops[0]?.kind, 'forIn');
  assert.equal(count(program.code, 'TICK'), 1);
  assert.equal(count(program.code, 'ELEM'), 1);
  assert.ok(program.requires.includes('arrays'));
  assert.ok(program.requires.includes('loops'));

  const size = program.lib.functions.findIndex((fn) => fn.name === 'size');
  assert.ok(size >= 0, 'nothing reads the array size');
  const sizeCalls = program.code.filter((one) => one[0] === 'CALL_LIB' && one[1] === size);
  assert.equal(sizeCalls.length, 2, 'the size is read once at entry and once per iteration');
  // Two reads of the array in the whole program: the `push` above the loop and
  // the one the loop makes on the way in. The body reads the hidden slot.
  assert.equal(count(program.code, 'LOADC'), 2, 'the loop re-evaluates its iterable');
});

test('a while loop charges the budget before it tests its condition', () => {
  const program = programOf(`${HEADER}i = 0\nwhile i < 3\n    i += 1\nplot(i, "I")\n`);
  verify(program, 'while');

  assert.equal(program.loops[0]?.kind, 'while');
  const tick = program.code.findIndex((one) => one[0] === 'TICK');
  assert.ok(tick >= 0);
  // Every cycle passes through the TICK, which is the whole of 3.5 check 6.
  const back = program.code.filter((one, index) => targetsOf(one).some((t) => t <= index));
  assert.ok(back.length > 0, 'a while loop with no backward jump is not a loop');
});

/**
 * Catches a `switch` that evaluates its subject once per arm.
 *
 * The subject is one expression and the arms compare against it; evaluating it
 * per arm would advance the state of any call inside it once per arm.
 */
test('a switch with a subject evaluates it once', () => {
  const program = programOf(
    `${HEADER}mode = input("a", "Mode", options = ["a", "b"])\nv = 0.0\nswitch mode\n    case "a"\n        v = close\n    case "b"\n        v = open\n    default\n        v = hl2\nplot(v, "V")\n`,
  );
  verify(program, 'switch');
  assert.equal(count(program.code, 'EQ'), 2, 'one comparison per case value');
  assert.equal(count(program.code, 'TICK'), 0);
});

/**
 * Catches a call site that binds the caller's own register to a series
 * parameter.
 *
 * A series argument is always given a fresh register, even when the argument is
 * a bare series name whose register already exists (4.10). Binding the existing
 * one would give the body history on bars where the call did not execute.
 */
test('a function that reads its parameter past gets a register per call site', () => {
  const program = programOf(
    `${HEADER}fn barChange(src) => src - src[1]\nplot(barChange(close), "A", aqua)\nplot(barChange(hlc3), "B", orange)\n`,
  );
  verify(program, 'histp');

  assert.equal(program.functions.length, 1, 'a leaf body is shared by every call site');
  assert.equal(program.functions[0]?.params, 1);
  assert.equal(count(program.functions[0]?.code ?? [], 'HISTP'), 1);
  assert.equal(count(program.functions[0]?.code ?? [], 'HIST'), 0);

  assert.equal(program.callSites.length, 2);
  const registers = program.callSites.map((site) => site.series[0]);
  assert.notEqual(registers[0], registers[1], 'two call sites share one argument register');
  for (const register of registers) {
    assert.equal(program.series[register ?? -1]?.kind, 'argument');
  }
  // The argument is retained beside the call, which is what DUP and SSTORE are.
  assert.equal(count(program.code, 'DUP'), 2);
  assert.equal(count(program.code, 'CALL_FN'), 2);
  assert.ok(program.requires.includes('functions'));
});

/**
 * Catches state allocated per function rather than per call site.
 *
 * `language.md` 11.4 is explicit: two calls in two places are two independent
 * pieces of state, and that is the rule that makes a stateful helper reusable
 * at all. One shared cell would make the two counters the same counter.
 */
test('a stateful helper called twice keeps two independent cells', () => {
  const program = programOf(
    `${HEADER}fn counter(on) =>\n    var n = 0\n    if on\n        n = n + 1\n    n\n` +
      `a = counter(close > open)\nb = counter(close < open)\nplot(a, "A")\nplot(b, "B")\n`,
  );
  verify(program, 'state');

  assert.equal(program.functions.length, 1);
  assert.equal(program.callSites.length, 2);
  const bases = program.callSites.map((site) => site.cellBase);
  assert.notEqual(bases[0], bases[1], 'two call sites share one cell');
  assert.equal(program.cells.length, 2, 'one cell per call path');
  for (const cell of program.cells) assert.equal(cell.name, 'n');
  // The body names its own cell relative to the base, so the operand is zero.
  assert.ok(program.functions[0]?.code.some((one) => one[0] === 'CELL_INIT' && one[1] === 0));
});

/** Catches a body whose final bare expression is discarded instead of returned. */
test('the last bare expression of a body is its return value', () => {
  const program = programOf(
    `${HEADER}fn mid(a, b) =>\n    total = a + b\n    total / 2\nplot(mid(high, low), "M")\n`,
  );
  verify(program, 'return');

  const body = program.functions[0]?.code ?? [];
  assert.equal(count(body, 'POP'), 0, 'the return value was popped');
  assert.equal(body[body.length - 1]?.[0], 'RET');
  assert.equal(body[body.length - 2]?.[0], 'DIV');
});
