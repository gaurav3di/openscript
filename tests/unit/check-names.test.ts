import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  checkBody,
  codes,
  parseCodes,
  spans,
  strategyCodes,
  values,
  valuesFor,
} from './check-support.js';

/**
 * Name resolution and scope, language.md section 12.
 *
 * Each test below names the wrong implementation it exists to catch, because a
 * test that cannot fail is documentation with a green tick on it.
 */

// Catches a checker that resolves names against one flat table, which would
// find `scratch` outside the block that declared it.
test('a name declared inside a block is not visible outside it', () => {
  // The block's own name is never read either, which is the same mistake seen
  // from the other end, so both are reported and the reader gets both lines.
  assert.deepEqual(codes('if close > open\n    scratch = high - low\nplot(scratch, "S")'), [
    'OS8010',
    'OS2001',
  ]);
});

// Catches a checker that declares a name on any assignment, which would make
// the block assignment a second variable and lose the outer one's update.
test('an assignment inside a block updates the enclosing name', () => {
  const { script, diagnostics } = checkBody(
    'threshold = 70\nif close > open\n    threshold = 80\nplot(threshold, "T")',
  );
  assert.deepEqual(
    diagnostics.map((one) => one.code),
    [],
  );
  assert.equal(script.bindings.filter((one) => one.name === 'threshold').length, 1);
});

// Catches a checker that reads the whole file before resolving, which would let
// a name be read above the line that assigns it.
test('a file-scope name read before its assignment is not defined', () => {
  assert.deepEqual(codes('plot(later, "L")\nlater = close'), ['OS2001', 'OS8010']);
});

// Catches a checker that collects functions in the same pass, which would make
// a call above a declaration OS2001 instead of legal.
test('a function may be called above its declaration', () => {
  assert.deepEqual(codes('plot(helper(close), "H")\nfn helper(src) => sma(src, 9)'), []);
});

// Catches a checker that lets `var` shadow, which is the shortest path to two
// variables with one name.
test('a var declared over an enclosing name is refused', () => {
  const body = 'len = 20\nplot(len, "Outer")\nif close > open\n    var len = 9';
  assert.deepEqual(codes(body), ['OS2002', 'OS8010']);
  // The message names the line of the declaration that already exists, which is
  // the line the reader has to look at to choose a new name.
  assert.deepEqual(valuesFor(body, 'OS2002'), { name: 'len', line: 3 });
});

// Catches a checker that treats the library as an ordinary outer scope, which
// would let a script quietly replace `close` for the rest of the file.
test('assigning to a built-in is refused, and says it is a built-in', () => {
  assert.deepEqual(codes('close = 5'), ['OS2002']);
  assert.deepEqual(values('close = 5')[0], { name: 'close', line: 'built-in' });
});

// Catches a checker that checks a parameter list against nothing, which would
// let a helper hide a file-scope name from every line of its body.
test('a parameter named after a file-scope name is refused', () => {
  assert.deepEqual(
    codes('len = 20\nplot(len, "L")\nfn helper(len) => len\nplot(helper(9), "H")'),
    ['OS2002'],
  );
});

// Catches a checker that allows a parameter list to repeat a name, which would
// silently bind the second one and leave the first unreachable.
test('a parameter list that repeats a name is refused', () => {
  assert.deepEqual(codes('fn helper(a, a) => a\nplot(helper(1, 2), "H")'), ['OS2018']);
});

// Catches a checker that registers functions by overwriting, which would make
// the second declaration win and the first vanish.
test('two functions with one name are refused', () => {
  assert.deepEqual(
    codes('fn helper(a) => a\nfn helper(b) => b\nplot(helper(1), "H")'),
    ['OS2017'],
  );
});

// Catches a checker with no call graph, which would recurse until the stack
// ran out rather than reporting the cycle.
test('a function that calls itself is refused, and the cycle is named', () => {
  const body = 'fn loopy(x) => loopy(x)\nplot(loopy(1), "L")';
  assert.deepEqual(codes(body), ['OS2005']);
  assert.deepEqual(values(body)[0], { name: 'loopy', cycle: 'loopy calls loopy' });
});

// Catches a checker that only looks for direct self calls.
test('a cycle through a second function is refused', () => {
  const body = 'fn a(x) => b(x)\nfn b(x) => a(x)\nplot(a(1), "A")';
  assert.deepEqual(codes(body), ['OS2005']);
  assert.equal(values(body)[0]?.cycle, 'a calls b calls a');
});

// Catches a checker that treats a loop variable as an ordinary block name,
// which would let the body move the loop's own counter.
test('assigning to a loop variable is refused', () => {
  assert.deepEqual(codes('for i = 0 to 3\n    i = 5'), ['OS2006']);
});

// Catches a checker that resolves a bare function name as a value, which would
// give version 1 function values it does not have.
test('a function used as a value is refused', () => {
  assert.deepEqual(codes('plot(ema, "E")'), ['OS2014']);
});

// Catches a checker that accepts any dotted name as a namespace read.
test('an unknown member of a namespace is refused, with a near member', () => {
  const body = 'plot(bar.indx, "I")';
  assert.deepEqual(codes(body), ['OS2009']);
  assert.deepEqual(values(body)[0], { namespace: 'bar', member: 'indx', suggestion: 'index' });
  assert.deepEqual(spans(body), ['3:10+4']);
});

// Catches a checker that reports the whole call rather than the callee, which
// would put the caret under an argument list that is not the mistake.
test('an unknown function is reported under its name', () => {
  assert.deepEqual(codes('plot(emaa(close, 9), "E")'), ['OS2001']);
  assert.deepEqual(spans('plot(emaa(close, 9), "E")'), ['3:6+4']);
});

// Catches a checker that reports OS7001 from the library table alone, which
// would refuse `pos.size` in a strategy as readily as in a study.
test('a position read is refused in a study and allowed in a strategy', () => {
  assert.deepEqual(codes('plot(pos.size, "P")'), ['OS7001']);
  assert.deepEqual(strategyCodes('plot(pos.size, "P")'), []);
});

// Catches a checker that treats `close()` as the series rather than the order
// function, which would let a study flatten a position it cannot hold.
test('close written as a call is the order function', () => {
  assert.deepEqual(codes('close()'), ['OS7001']);
  assert.deepEqual(strategyCodes('close()'), []);
  assert.deepEqual(parseCodes('close()'), []);
});

// Catches a checker that reports a planned name as undefined, which tells a
// reader the name is not defined at this point in the file and offers them a
// different function as the fix. The library holds the name and holds no
// behaviour for it yet, and those are two different sentences. All three
// spellings are covered because each takes its own branch: a call, a member of
// a namespace, and a bare name read as a value.
test('a name the library lists as planned is refused as planned', () => {
  const call = 'plot(math.tanh(close), "T")';
  assert.deepEqual(codes(call), ['OS2020']);
  assert.deepEqual(valuesFor(call, 'OS2020'), { name: 'math.tanh' });

  assert.deepEqual(codes('plot(chart.strike, "S")'), ['OS2020']);
  assert.deepEqual(valuesFor('plot(chart.strike, "S")', 'OS2020'), { name: 'chart.strike' });

  assert.deepEqual(codes('plot(timeClose, "C")'), ['OS2020']);
  assert.deepEqual(valuesFor('plot(timeClose, "C")', 'OS2020'), { name: 'timeClose' });
});

// Catches a checker that never notices an unread name, which is the commonest
// shape of a line that was edited and left behind.
test('a name nothing reads is reported once, at its declaration', () => {
  const body = 'spare = close - open';
  assert.deepEqual(codes(body), ['OS8010']);
  assert.deepEqual(values(body)[0], { name: 'spare', line: 3 });
});
