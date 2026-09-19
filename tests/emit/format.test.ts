/**
 * The compiled program against `compiled-program.md`, check by check.
 *
 * Every test here is one of section 3.5's load-time verifications, run over the
 * programs the target scripts compile to. That is deliberate: an engine written
 * in another language performs exactly these before it executes a bar, and a
 * program that fails one of them is refused with OS6018 and no source line at
 * all. Finding it here costs a test run; finding it there costs somebody else's
 * afternoon and a defect report against a format they cannot change.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { COMPILED_FORMAT_VERSION } from '../../src/core/index.js';
import { OPCODES, isOpcode, operandCount } from '../../src/core/emit/index.js';
import type { CompiledProgram } from '../../src/core/emit/index.js';
import {
  channelCounts,
  compileTarget,
  emittedTargets,
  instructionLists,
  scriptNames,
  targetsOf,
  walkStack,
} from './support.js';

const EMITTED = emittedTargets();

test('a target script compiles with nothing reported, or is refused with a gap', () => {
  for (const name of scriptNames()) {
    const one = compileTarget(name);
    const errors = one.diagnostics.filter((d) => d.severity === 'error');
    assert.deepEqual(
      errors.map((d) => `${d.code} at ${d.span.line}:${d.span.column}`),
      [],
      `${name} reported an error`,
    );
    // Either there is a program, or there is a gap saying why there is not.
    const blocked = one.gaps.some((gap) => gap.blocking);
    assert.equal(one.program === undefined, blocked, `${name}: a missing program with no gap`);
  }
});

/**
 * The phase gate, and the one test that would notice the emitter going quiet.
 *
 * A defect inside the emitter shows up as a blocking gap and therefore as no
 * program, which every other test in this file would then skip rather than
 * fail. So the scripts that must compile are named, and the scripts that must
 * not are named with the reason, and a compiler that stops emitting one of them
 * fails here rather than passing everywhere.
 */
test('the target scripts that can be carried by the format all compile', () => {
  const emitted = new Set(EMITTED.map((one) => one.name));
  const refused = scriptNames().filter((name) => !emitted.has(name));

  for (const name of refused) {
    const gaps = compileTarget(name).gaps.filter((gap) => gap.blocking);
    assert.deepEqual(
      gaps.map((gap) => gap.specification),
      ['stdlib.md 15.4, against compiled-program.md 2 and 4'],
      `${name}: refused for a reason that is not the one known format gap`,
    );
  }

  assert.equal(
    emitted.size + refused.length,
    scriptNames().length,
    'a target script neither compiled nor was refused',
  );
  assert.ok(emitted.size >= scriptNames().length - 3, 'more targets are refused than the gap explains');
});

/** Catches a defect in the emitter that hides behind the gap report. */
test('no program is refused because the compiler disagreed with its own stack walk', () => {
  for (const name of scriptNames()) {
    for (const gap of compileTarget(name).gaps) {
      assert.notEqual(
        gap.specification,
        'compiled-program.md 3.5 check 5',
        `${name}: ${gap.what}`,
      );
    }
  }
});

/**
 * Catches an emitter that omits an empty table instead of writing `[]`.
 *
 * Section 2 is explicit that uniform presence costs three characters and removes
 * a whole class of "is it missing or is it empty" from every engine.
 */
test('every field section 2 requires is present, and an empty table is an empty array', () => {
  const required = [
    'openscript',
    'requires',
    'compiler',
    'source',
    'meta',
    'limits',
    'lib',
    'inputs',
    'channels',
    'outputs',
    'consts',
    'series',
    'frame',
    'cells',
    'states',
    'functions',
    'callSites',
    'loops',
    'code',
    'debug',
  ];
  for (const one of EMITTED) {
    const program = one.program as unknown as Record<string, unknown>;
    for (const field of required) {
      assert.ok(field in program, `${one.name}: ${field} is missing`);
      assert.notEqual(program[field], undefined, `${one.name}: ${field} is undefined`);
    }
    for (const table of ['requires', 'inputs', 'channels', 'consts', 'series', 'cells', 'states', 'functions', 'callSites', 'loops', 'code']) {
      assert.ok(Array.isArray(program[table]), `${one.name}: ${table} is not an array`);
    }
  }
});

/**
 * Catches a literal `"1.0"` in the emitter.
 *
 * The release refuses to publish if the compiler and the specification disagree
 * about the format version, and a literal is how they come to.
 */
test('the format version is the generated constant, not a literal', () => {
  for (const one of EMITTED) {
    assert.equal(one.program?.openscript.format, COMPILED_FORMAT_VERSION);
    assert.equal(typeof one.program?.openscript.language, 'number');
  }
});

/** Catches an emitter that interns absence lazily, so `CONST 0` is not absent. */
test('constant pool entries 0, 1 and 2 are absent, false and true', () => {
  for (const one of EMITTED) {
    assert.deepEqual(one.program?.consts[0], ['z', null], one.name);
    assert.deepEqual(one.program?.consts[1], ['b', false], one.name);
    assert.deepEqual(one.program?.consts[2], ['b', true], one.name);
  }
});

/** Section 3.5 check 2. Catches an invented opcode and a missing operand. */
test('every opcode is one section 4 defines, with exactly its operand count', () => {
  for (const one of EMITTED) {
    for (const list of instructionLists(one.program as CompiledProgram)) {
      list.code.forEach((instruction, index) => {
        const [opcode, ...operands] = instruction;
        assert.ok(isOpcode(opcode), `${one.name} ${list.name}[${index}]: ${opcode} is not an opcode`);
        if (!isOpcode(opcode)) return;
        assert.equal(
          operands.length,
          operandCount(opcode),
          `${one.name} ${list.name}[${index}]: ${opcode} operand count`,
        );
        for (const operand of operands) {
          assert.equal(typeof operand, 'number', `${one.name} ${list.name}[${index}]: operand`);
        }
      });
    }
  }
});

test('the instruction set is forty-one instructions', () => {
  assert.equal(OPCODES.length, 41);
  assert.equal(new Set(OPCODES).size, 41);
});

/** Section 3.5 check 4. Catches an instruction list that could be fallen off. */
test('code ends in HALT and every function body ends in RET, and nothing else does', () => {
  for (const one of EMITTED) {
    const program = one.program as CompiledProgram;
    assert.equal(program.code[program.code.length - 1]?.[0], 'HALT', one.name);
    assert.equal(program.code.filter((i) => i[0] === 'HALT').length, 1, one.name);
    for (const fn of program.functions) {
      assert.equal(fn.code[fn.code.length - 1]?.[0], 'RET', `${one.name} ${fn.name}`);
      assert.equal(fn.code.filter((i) => i[0] === 'HALT').length, 0, `${one.name} ${fn.name}`);
    }
  }
});

/**
 * Section 3.5 check 1.
 *
 * Catches the whole family of allocation faults at once: a cell base that
 * overlaps another call path's, a channel emitted before it was declared, a
 * `CALL_LIB` naming an index past the library table.
 */
test('every index into a table is in range', () => {
  const limits = (program: CompiledProgram, frameSlots: number): Readonly<Record<string, number>> => ({
    CONST: program.consts.length,
    LOAD: frameSlots,
    STORE: frameSlots,
    CELL_INIT: program.cells.length,
    LOADC: program.cells.length,
    STOREC: program.cells.length,
    SLOAD: program.series.length,
    SSTORE: program.series.length,
    HIST: program.series.length,
    EMIT: program.channels.length,
    TICK: program.loops.length,
    CALL_FN: program.callSites.length,
  });

  for (const one of EMITTED) {
    const program = one.program as CompiledProgram;
    const lists = [
      { name: 'code', code: program.code, slots: program.frame.slots, params: 0 },
      ...program.functions.map((fn, index) => ({
        name: `functions[${index}]`,
        code: fn.code,
        slots: fn.slots,
        params: fn.params,
      })),
    ];

    for (const list of lists) {
      const bound = limits(program, list.slots);
      list.code.forEach((instruction, index) => {
        const [opcode, ...operands] = instruction;
        const where = `${one.name} ${list.name}[${index}] ${opcode}`;
        const limit = bound[opcode];
        const first = operands[0] ?? 0;
        if (limit !== undefined) {
          assert.ok(first >= 0 && first < limit, `${where}: ${first} outside 0 to ${limit - 1}`);
        }
        if (opcode === 'HISTP') {
          assert.ok(first >= 0 && first < list.params, `${where}: parameter ${first}`);
        }
        if (opcode === 'CALL_LIB') {
          assert.ok(first < program.lib.functions.length, `${where}: library index`);
          assert.equal(operands[1], program.lib.functions[first]?.arity, `${where}: arity`);
          const state = operands[2] ?? -1;
          assert.equal(
            state >= 0,
            program.lib.functions[first]?.state === true,
            `${where}: a state region on a pure call, or none on a stateful one`,
          );
        }
        if (opcode === 'FOR_INIT' || opcode === 'FOR_NEXT') {
          for (const slot of [operands[1], operands[2], operands[3]]) {
            assert.ok((slot ?? -1) >= 0 && (slot ?? 0) < list.slots, `${where}: slot ${slot}`);
          }
          assert.ok((operands[0] ?? -1) < program.loops.length, `${where}: loop`);
        }
      });
    }

    program.cells.forEach((cell, index) => assert.equal(cell.id, index, `${one.name}: cell id`));
    program.states.forEach((state, index) => {
      assert.equal(state.id, index, `${one.name}: state id`);
      assert.ok(state.fn < program.lib.functions.length, `${one.name}: state owner`);
    });
    program.series.forEach((r, index) => assert.equal(r.id, index, `${one.name}: register id`));
    program.channels.forEach((c, index) => assert.equal(c.id, index, `${one.name}: channel id`));
    for (const site of program.callSites) {
      assert.ok(site.fn < program.functions.length, `${one.name}: call site function`);
      assert.equal(site.argc, program.functions[site.fn]?.params, `${one.name}: call site argc`);
      assert.ok(site.cellBase <= program.cells.length, `${one.name}: cell base`);
      assert.ok(site.stateBase <= program.states.length, `${one.name}: state base`);
      for (const register of site.series) {
        assert.ok(register === -1 || register < program.series.length, `${one.name}: bound register`);
      }
    }
  }
});

/** Section 3.5 check 3. Catches a jump left at its placeholder of zero. */
test('every jump target is inside its own list and no target is past the terminator', () => {
  for (const one of EMITTED) {
    for (const list of instructionLists(one.program as CompiledProgram)) {
      list.code.forEach((instruction, index) => {
        for (const target of targetsOf(instruction)) {
          assert.ok(
            target >= 0 && target < list.code.length,
            `${one.name} ${list.name}[${index}]: target ${target}`,
          );
        }
      });
    }
  }
});

/**
 * Section 3.5 check 6, and the whole of the loop budget's integrity.
 *
 * Catches a loop compiled so that its body can run without charging the budget,
 * which is a script that freezes a browser tab rather than raising OS5001.
 */
test('the target of every backward jump is a TICK', () => {
  for (const one of EMITTED) {
    for (const list of instructionLists(one.program as CompiledProgram)) {
      list.code.forEach((instruction, index) => {
        for (const target of targetsOf(instruction)) {
          if (target > index) continue;
          assert.equal(
            list.code[target]?.[0],
            'TICK',
            `${one.name} ${list.name}[${index}]: a backward jump to ${target}`,
          );
        }
      });
    }
  }
});

/**
 * Section 3.5 check 5.
 *
 * Catches a statement-level call whose value was never popped, a branch that
 * leaves a different number of values than its sibling, and an expression
 * emitted in the wrong order.
 */
test('the stack depth agrees on every path, never goes below zero and is zero at HALT', () => {
  for (const one of EMITTED) {
    const program = one.program as CompiledProgram;
    const argcOf = (site: number): number => program.callSites[site]?.argc ?? 0;
    for (const list of instructionLists(program)) {
      const walk = walkStack(list.code, argcOf);
      assert.deepEqual(walk.problems, [], `${one.name} ${list.name}`);
    }
  }
});

/**
 * Section 3.5 check 7.
 *
 * Catches a channel declared `once` that a condition can skip, which would let
 * a plot column have no value at all on some bars while the program claims to
 * an engine that it cannot.
 */
test('every channel declared once is written exactly once on every path', () => {
  for (const one of EMITTED) {
    const program = one.program as CompiledProgram;
    const counts = channelCounts(program.code, program.channels.length);
    program.channels.forEach((channel, index) => {
      if (!channel.once) return;
      assert.equal(counts.least[index], 1, `${one.name}: channel ${index} on some path`);
      assert.equal(counts.most[index], 1, `${one.name}: channel ${index} more than once`);
    });
  }
});

/**
 * Section 2.2, both halves of it.
 *
 * Catches a spurious tag, which turns an engine that could have run the program
 * into an engine that refuses it, and a missing one, which lets an engine
 * without the capability start and fail partway through.
 */
test('requires holds every tag the program needs and no tag it does not', () => {
  const known = new Set([
    'core.1',
    'arrays',
    'functions',
    'loops',
    'orders',
    'objects',
    'tables',
    'alerts',
    'req.timeframe',
    'req.symbol',
  ]);

  for (const one of EMITTED) {
    const program = one.program as CompiledProgram;
    const tags = new Set(program.requires);
    for (const tag of tags) assert.ok(known.has(tag), `${one.name}: unknown tag ${tag}`);
    assert.ok(tags.has('core.1'), `${one.name}: core.1 is always required`);

    const uses = (opcode: string): boolean =>
      instructionLists(program).some((list) => list.code.some((i) => i[0] === opcode));

    // The tag may also come from an array library function with no instruction
    // of its own, so the instructions imply the tag and not the other way round.
    if (uses('ARRAY') || uses('ELEM')) {
      assert.ok(tags.has('arrays'), `${one.name}: an array instruction without the tag`);
    }
    assert.equal(uses('TICK'), tags.has('loops'), `${one.name}: the loops tag`);
    assert.equal(program.functions.length > 0, tags.has('functions'), `${one.name}: functions tag`);
    assert.equal(program.outputs.tables.length > 0, tags.has('tables'), `${one.name}: tables tag`);
    assert.equal(program.outputs.alerts.length > 0, tags.has('alerts'), `${one.name}: alerts tag`);
    assert.equal(
      program.lib.functions.some((fn) => fn.effect === 'order'),
      tags.has('orders'),
      `${one.name}: orders tag`,
    );
  }
});
