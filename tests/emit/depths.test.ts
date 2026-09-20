/**
 * The compiler's own copy of `compiled-program.md` 3.5 check 5.
 *
 * Check 5 is three sentences: the depth agrees on every path, it never goes
 * below zero, and **it is zero at the terminator**. The walk in `emit/code.ts`
 * is what stops this compiler emitting a program an engine would refuse at
 * load with OS6018, a code whose own message tells the reader their script came
 * from a broken compiler, so a hole in it is a hole in the one thing that
 * catches every other pass.
 *
 * It had one. Only the first two sentences were walked, and the third is not a
 * restatement of the second: a `RET` reaches nothing after it, so an expression
 * that left the stack one value short took it to minus one exactly at the
 * `RET`, where the walk asked nothing and finished clean. That is how a read's
 * expression with an `input()` in it came to be emitted as a body whose stack
 * does not add up, and it was found by an engine rather than here.
 *
 * The lists below are written by hand, because every one of them is a list this
 * compiler must never produce and a test that could only build one through the
 * compiler could not build one at all.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { walkDepths } from '../../src/core/emit/index.js';
import type { Instruction } from '../../src/core/emit/index.js';

/** No call site in any list here, so nothing asks after one. */
const NO_SITES = (): number => 0;

function walk(code: readonly Instruction[]): ReturnType<typeof walkDepths> {
  return walkDepths(code, NO_SITES);
}

/** Whether the walk found anything at all, which is what `emit.ts` acts on. */
function found(code: readonly Instruction[]): number | undefined {
  const report = walk(code);
  return report.conflict ?? report.underflow ?? report.terminal;
}

/**
 * The defect itself: a body one value short, landing exactly on `RET`.
 *
 * `CONST` then `ADD` then `RET` is `high + input(...)` with the input emitting
 * nothing: the addition pops two and there is one, so the stack is at minus one
 * when `RET` runs. Before the third sentence was walked this list was reported
 * clean and emitted.
 */
test('a body one value short at RET is found', () => {
  const short: readonly Instruction[] = [['CONST', 0], ['ADD'], ['RET']];
  assert.equal(walk(short).terminal, 2, 'the RET is where the stack does not add up');
  assert.equal(found(short), 2);

  // The same list with the missing value supplied is the program the compiler
  // does emit, and it is clean.
  const whole: readonly Instruction[] = [['CONST', 0], ['CONST', 1], ['ADD'], ['RET']];
  assert.equal(found(whole), undefined);
});

/**
 * A body with a value left over, which is the same sentence from the other
 * side: the stack is not empty at the terminator, so the engine would be handed
 * a body that grows the stack by one every time it is executed.
 */
test('a body with a value left over at RET is found', () => {
  assert.equal(found([['CONST', 0], ['CONST', 1], ['RET']]), 2);
  assert.equal(found([['CONST', 0], ['CONST', 1], ['POP'], ['RET']]), undefined);
});

/**
 * An early `return` owes the same debt as the last one.
 *
 * `language.md` 11.3 lets a body return from inside a branch, so a list may
 * hold more than one `RET` and the last instruction is not the only terminator.
 * A walk that checked the last one alone would pass the wrong half of a body
 * whose early return is the one that is short.
 */
test('an early RET inside a branch is checked as well as the last one', () => {
  const early: readonly Instruction[] = [
    ['CONST', 0],
    ['JUMP_FALSE', 3],
    ['RET'],
    ['CONST', 1],
    ['RET'],
  ];
  assert.equal(found(early), 2, 'the RET reached with an empty stack is the one at fault');
});

/** `HALT` is a terminator too, and the bar's own list ends at one. */
test('a bar list that does not end empty is found', () => {
  assert.equal(found([['CONST', 0], ['HALT']]), 1);
  assert.equal(found([['CONST', 0], ['EMIT', 0], ['HALT']]), undefined);
});

/**
 * The two sentences that were already walked, so that a change to the third
 * cannot quietly take one of them away.
 */
test('a disagreement at a join and a depth below zero are still found', () => {
  const join: readonly Instruction[] = [
    ['CONST', 0],
    ['JUMP_FALSE', 4],
    ['CONST', 1],
    ['JUMP', 4],
    ['HALT'],
  ];
  assert.equal(walk(join).conflict, 4, 'two paths reach the HALT at two depths');

  const below: readonly Instruction[] = [['ADD'], ['CONST', 0], ['POP'], ['HALT']];
  assert.equal(walk(below).underflow, 1, 'the add took it below zero before anything else');
});
