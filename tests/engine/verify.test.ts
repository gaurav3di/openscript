/**
 * Load-time verification, `compiled-program.md` 3.5.
 *
 * Every test here takes a program the compiler really emitted, breaks exactly
 * one thing about it, and asserts the engine refuses it. That shape matters:
 * the checks exist for programs no compiler would produce, so a test that built
 * a broken program from nothing would be testing the test's idea of a program
 * rather than the engine's.
 *
 * The wrong implementation each one catches is the same in every case and is
 * worth stating once: an engine that skips verification. Handed one of these it
 * would read past the end of an array, execute a jump into the middle of an
 * expression, or draw a plot column with no value on some bars, and the user
 * would see a wrong number rather than a message.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { load } from '../../src/core/engine/index.js';
import { compile, mutable, refusalOf } from './support.js';

const SOURCE = [
  'version 1',
  '',
  'study("Verified")',
  '',
  'len = input(3, "Length", min = 1, max = 500)',
  'mean = sma(close, len)',
  'var hits = 0',
  '',
  'fn double(x) => x * 2',
  '',
  'for i = 0 to 2',
  '    hits += 1',
  '',
  'if close > mean',
  '    hits += 1',
  '',
  'plot(double(mean), "Mean", aqua)',
].join('\n');

function broken(change: (program: Record<string, unknown>) => void): Record<string, unknown> {
  const program = mutable(compile('verified.oscript', SOURCE).program);
  change(program);
  return program;
}

function code(program: Record<string, unknown>): unknown[][] {
  return program['code'] as unknown[][];
}

test('the program this suite mutates loads unchanged', () => {
  // Without this, every test below could pass because the program was already
  // refused for a reason the test knows nothing about.
  const loaded = load(mutable(compile('verified.oscript', SOURCE).program));
  assert.equal(loaded.ok, true);
});

test('a required field of the wrong type is OS6018 naming the field', () => {
  const refusal = refusalOf(broken((program) => {
    program['limits'] = { loops: 'lots', history: null };
  }));
  assert.equal(refusal.code, 'OS6018');
  assert.equal(refusal.values['location'], 'limits.loops');
});

test('an index outside a table is OS6018 naming the instruction', () => {
  const refusal = refusalOf(broken((program) => {
    const list = code(program);
    const at = list.findIndex((one) => one[0] === 'CONST');
    list[at] = ['CONST', 9999];
  }));
  assert.equal(refusal.code, 'OS6018');
  assert.equal(String(refusal.values['location']).startsWith('instruction '), true);
});

test('an opcode this engine does not implement is OS6018', () => {
  const refusal = refusalOf(broken((program) => {
    code(program)[0] = ['SWAP'];
  }));
  assert.equal(refusal.code, 'OS6018');
  assert.equal(refusal.values['location'], 'instruction 0');
});

test('an instruction with the wrong operand count is OS6018', () => {
  const refusal = refusalOf(broken((program) => {
    code(program)[0] = ['SLOAD', 0, 0];
  }));
  assert.equal(refusal.code, 'OS6018');
  assert.equal(refusal.values['location'], 'instruction 0');
});

test('a jump target outside the list is OS6018', () => {
  const refusal = refusalOf(broken((program) => {
    const list = code(program);
    const at = list.findIndex((one) => one[0] === 'JUMP_FALSE');
    list[at] = ['JUMP_FALSE', list.length + 5];
  }));
  assert.equal(refusal.code, 'OS6018');
});

test('a list that does not end in its terminator is OS6018', () => {
  const refusal = refusalOf(broken((program) => {
    const list = code(program);
    list[list.length - 1] = ['POP'];
  }));
  assert.equal(refusal.code, 'OS6018');
});

test('a stack depth that disagrees at a join is OS6018', () => {
  // Check 5. Duplicating a value on one arm of a branch leaves the two paths
  // reaching the instruction after it one deep and zero deep.
  const refusal = refusalOf(broken((program) => {
    const list = code(program);
    const at = list.findIndex((one) => one[0] === 'JUMP_FALSE');
    list.splice(at, 0, ['DUP']);
    for (const instruction of list) {
      const opcode = instruction[0];
      if (opcode !== 'JUMP' && opcode !== 'JUMP_FALSE' && opcode !== 'CELL_INIT' &&
          opcode !== 'AND_SHORT' && opcode !== 'OR_SHORT') continue;
      const target = instruction[instruction.length - 1];
      if (typeof target === 'number' && target > at) instruction[instruction.length - 1] = target + 1;
    }
  }));
  assert.equal(refusal.code, 'OS6018');
});

test('a backward jump whose target is not a TICK is OS6018', () => {
  // Check 6 is the whole of the loop budget's integrity: it means no cycle in
  // the control flow graph can run without charging the budget. An engine that
  // skipped it could be handed a loop that never ends and never counts.
  const refusal = refusalOf(broken((program) => {
    const list = code(program);
    const at = list.findIndex((one) => one[0] === 'FOR_NEXT');
    const target = list[at]?.[5] as number;
    (list[at] as unknown[])[5] = target - 1;
  }));
  assert.equal(refusal.code, 'OS6018');
  assert.equal(String(refusal.values['reason']).includes('TICK'), true);
});

test('a once channel that is not written on every path is OS6018', () => {
  // Check 7 is what guarantees a plot column has a value, or an explicit
  // absence, for every bar. Removing the write leaves the column undefined on
  // every bar and a host with nothing to draw.
  const refusal = refusalOf(broken((program) => {
    const list = code(program);
    const at = list.findIndex((one) => one[0] === 'EMIT');
    list[at] = ['POP'];
  }));
  assert.equal(refusal.code, 'OS6018');
  assert.equal(String(refusal.values['location']).startsWith('channels['), true);
});

test('a capability the program needs and does not declare is OS6018', () => {
  const refusal = refusalOf(broken((program) => {
    program['requires'] = ['core.1'];
  }));
  assert.equal(refusal.code, 'OS6018');
  assert.equal(refusal.values['location'], 'requires');
});

test('a capability this engine does not have is OS6006 naming the tag', () => {
  const refusal = refusalOf(broken((program) => {
    program['requires'] = ['core.1', 'req.timeframe'];
  }));
  assert.equal(refusal.code, 'OS6006');
  assert.equal(refusal.values['tag'], 'req.timeframe');
});

test('a library entry that disagrees with the manifest is OS6004', () => {
  // 2.5: the entries carry facts the engine already knows precisely so that
  // they can be disagreed with. This catches a program compiled against a newer
  // library before it computes a single wrong number.
  const refusal = refusalOf(broken((program) => {
    const lib = program['lib'] as { functions: { name: string; state: boolean }[] };
    const entry = lib.functions[0];
    if (entry !== undefined) entry.state = !entry.state;
  }));
  assert.equal(refusal.code, 'OS6004');
});

test('a library name this engine does not have is OS6004 rather than a failure per bar', () => {
  const refusal = refusalOf(broken((program) => {
    const lib = program['lib'] as { functions: { name: string }[] };
    const entry = lib.functions[0];
    if (entry !== undefined) entry.name = 'notAFunction';
  }));
  assert.equal(refusal.code, 'OS6004');
  assert.equal(refusal.values['name'], 'notAFunction');
});

test('a compiled format this engine does not implement is OS6016', () => {
  const refusal = refusalOf(broken((program) => {
    program['openscript'] = { format: '9.0', language: 1 };
  }));
  assert.equal(refusal.code, 'OS6016');
  assert.equal(refusal.values['found'], '9.0');
});

test('a language version this engine does not implement is OS6017', () => {
  const refusal = refusalOf(broken((program) => {
    program['openscript'] = { format: '1.0', language: 7 };
  }));
  assert.equal(refusal.code, 'OS6017');
  assert.equal(refusal.values['found'], 7);
});

test('an input reference naming an input that was never declared is OS6018', () => {
  // Check 10's key half, which is decidable from the program alone.
  const refusal = refusalOf(broken((program) => {
    const meta = program['meta'] as Record<string, unknown>;
    meta['precision'] = { input: 'noSuchInput' };
  }));
  assert.equal(refusal.code, 'OS6018');
  assert.equal(refusal.values['location'], 'meta.precision');
});

test('a host setting that fails an input validation is OS6019 naming the key', () => {
  // 2.6: a value that fails validation does not fall back to the default,
  // because a settings dialog that silently ignores what a user typed is worse
  // than one that says the value is out of range.
  const compiled = compile('verified.oscript', SOURCE);
  const refusal = refusalOf(mutable(compiled.program), { settings: { len: 900 } });
  assert.equal(refusal.code, 'OS6019');
  assert.equal(refusal.values['key'], 'len');
});

test('a host that allows a smaller loop budget than the file asks for is OS5003', () => {
  // 2.4: a host refuses rather than silently capping the value, because a
  // program that quietly gets a smaller budget than it asked for produces a
  // wrong number instead of a message.
  const compiled = compile('verified.oscript', SOURCE);
  const refusal = refusalOf(mutable(compiled.program), { limits: { loops: 10 } });
  assert.equal(refusal.code, 'OS5003');
  assert.equal(refusal.values['option'], 'loops');
  assert.equal(refusal.values['max'], 10);
});

test('a host that allows fewer instructions than the program holds is OS5009', () => {
  const compiled = compile('verified.oscript', SOURCE);
  const refusal = refusalOf(mutable(compiled.program), { limits: { instructions: 4 } });
  assert.equal(refusal.code, 'OS5009');
  assert.equal(refusal.values['max'], 4);
});

test('a host that allows fewer state regions than the program needs is OS5004', () => {
  const compiled = compile('verified.oscript', SOURCE);
  const refusal = refusalOf(mutable(compiled.program), { limits: { states: 0 } });
  assert.equal(refusal.code, 'OS5004');
});

test('a call nested deeper than the host allows is OS5005 at load, not mid bar', () => {
  // 3.3: an engine that declares a maximum frame depth refuses the program at
  // load and never discovers the problem halfway through a bar.
  const compiled = compile('verified.oscript', SOURCE);
  const refusal = refusalOf(mutable(compiled.program), { limits: { frames: 1 } });
  assert.equal(refusal.code, 'OS5005');
  assert.equal(refusal.values['max'], 1);
});

test('something that is not a compiled program at all is OS6018', () => {
  assert.equal(refusalOf(null).code, 'OS6018');
  assert.equal(refusalOf(42).code, 'OS6018');
  assert.equal(refusalOf({}).code, 'OS6018');
});
