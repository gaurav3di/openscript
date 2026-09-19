import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readFileSync, readdirSync } from 'node:fs';

import { DiagnosticBag, check, parse, sourceFile } from '../../src/core/index.js';
import { checkBody, checkStrategy, storageOfName } from './check-support.js';

/**
 * The checked tree: what the code generator is handed.
 *
 * Every test here is about the generator not having to work something out a
 * second time. A question the checker already answered and did not record is a
 * question two stages will answer differently one day.
 */

// Catches a checker that resolves names and throws the answer away, leaving the
// generator to walk the scopes again and reach a different conclusion.
test('every name used as a value is bound to its declaration', () => {
  // A library name such as `close` has no declaration in the file and is not
  // here: it is looked up in the library, which is the same answer everywhere.
  const { script } = checkBody('basis = sma(close, 20)\nplot(basis, "B")\nplot(basis[1], "P")');
  const references = [...script.references.entries()];
  assert.equal(references.length, 2);
  assert.deepEqual(
    references.map(([node, binding]) => `${node.name} -> ${binding.name}:${binding.kind}`),
    ['basis -> basis:file', 'basis -> basis:file'],
  );
});

// Catches a checker that types expressions only where it needed a type for a
// diagnostic, leaving holes the generator would have to fill by guessing.
test('every expression the checker reached carries a type', () => {
  const { script } = checkBody('x = close > open ? high : low\nplot(x, "X")');
  const types = [...script.types.values()].map((one) => one.kind);
  assert.equal(types.includes('unknown'), false);
  assert.equal(types.length > 5, true);
});

// Catches a checker that leaves storage to the generator, where the rule about
// which names need a series register would be decided twice.
test('a top-level name gets a register only when its history is read', () => {
  assert.equal(storageOfName('diff = close - open\nplot(diff, "D")', 'diff'), 'slot');
  assert.equal(storageOfName('diff = close - open\nplot(diff[1], "D")', 'diff'), 'register');
});

// Catches a checker that treats var like any other name, which would lose the
// one thing that makes a value survive the bar.
test('a var is a cell and a live var is a live cell', () => {
  const { script } = checkBody('var a = 0\nlive var b = 0\nplot(a + b, "S")');
  const a = script.bindings.find((one) => one.name === 'a');
  const b = script.bindings.find((one) => one.name === 'b');
  assert.equal(a?.storage, 'cell');
  assert.equal(a?.persistence, 'var');
  assert.equal(b?.persistence, 'live');
});

// Catches a checker that allocates state per function rather than per call
// site, which would make two calls to one helper share a counter.
test('every stateful call site gets a state region of its own', () => {
  const { script } = checkBody('a = ema(close, 9)\nb = ema(close, 21)\nplot(a - b, "D")');
  assert.equal(script.stateCount, 2);
  const states = script.calls.filter((one) => one.stateful).map((one) => one.stateId);
  assert.deepEqual(states, [0, 1]);
});

// Catches a checker that does not carry statefulness through a user function,
// which would leave a helper holding a var with no region to hold it in.
test('a user function that holds a var makes its call sites stateful', () => {
  const body =
    'fn sinceTrue(cond) =>\n' +
    '    var n = 0\n' +
    '    n = cond ? 0 : n + 1\n' +
    '    n\n' +
    'a = sinceTrue(close > open)\n' +
    'b = sinceTrue(high > low)\n' +
    'plot(a - b, "D")';
  const { script } = checkBody(body);
  const calls = script.calls.filter((one) => one.name === 'sinceTrue');
  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map((one) => one.stateful),
    [true, true],
  );
  assert.notEqual(calls[0]?.stateId, calls[1]?.stateId);
});

// Catches a checker that leaves the arguments in the order they were written,
// which would make the generator match labels to parameters a second time.
test('a call site holds its arguments in the callee parameter order', () => {
  const { script } = checkBody('plot(close, color = aqua, title = "C")');
  const call = script.calls.find((one) => one.name === 'plot');
  assert.equal(call?.arguments[0]?.label, undefined);
  assert.equal(call?.arguments[1]?.label?.text, 'title');
  assert.equal(call?.arguments[2]?.label?.text, 'color');
  // width was not given, so its slot is a hole the library default fills.
  assert.equal(call?.arguments[3], undefined);
});

// Catches a checker that records inputs without the name and title the host
// builds the settings row from.
test('an input carries its kind, its title and the name it was assigned to', () => {
  const { script } = checkBody(
    'len = input(14, "Length")\nsrc = input(close, "Source")\nmode = input("a", "Mode", options = ["a", "b"])\nplot(ema(src, len), mode)',
  );
  assert.deepEqual(
    script.inputs.map((one) => `${one.name}:${one.kind}:${one.title}`),
    ['len:number:Length', 'src:source:Source', 'mode:select:Mode'],
  );
});

// Catches a checker that gives a source input the number type, which would lose
// the history the study reads from it.
test('a source input is a series and a time input is a number', () => {
  const { script } = checkBody(
    'src = input(close, "Source")\nat = input("2025-01-01", "At", kind = "time")\nplot(src, "S")\nprint(at)',
  );
  assert.deepEqual(
    script.inputs.map((one) => one.type.kind),
    ['series', 'number'],
  );
});

// Catches a checker that does not record the fixed shape, leaving the generator
// to find the declaration calls by walking the tree again.
test('the outputs are the file fixed shape, in declaration order', () => {
  const { script } = checkBody(
    'a = plot(high, "High")\nb = plot(low, "Low")\nfill(a, b)\nlevel(0, "Zero")',
  );
  assert.deepEqual(
    script.outputs.map((one) => `${one.form}:${one.title}`),
    ['plot:High', 'plot:Low', 'fill:', 'level:Zero'],
  );
});

// Catches a checker that does not record what the declaration said, which every
// later rule and the compiled program's meta both need.
test('the declaration carries its form, title and the two options rules read', () => {
  const { script } = checkStrategy('plot(close, "C")');
  assert.equal(script.declaration?.form, 'strategy');
  assert.equal(script.declaration?.title, 'T');
  assert.equal(script.declaration?.onUnconfirmed, false);
});

/**
 * The gate: the twelve target scripts are the specification's own claim about
 * what the language can express, and a script of them that does not check is
 * the most valuable thing this phase can find.
 */
const EXAMPLES = new URL('../../../examples/', import.meta.url);

test('the twelve target scripts check with nothing reported', () => {
  const names = readdirSync(EXAMPLES)
    .filter((name) => name.endsWith('.oscript'))
    .sort();
  assert.equal(names.length, 12, `examples/ holds ${names.length} scripts`);

  for (const name of names) {
    const bag = new DiagnosticBag();
    const file = sourceFile(name, readFileSync(new URL(name, EXAMPLES), 'utf8'));
    check(file, parse(file, bag), bag);
    assert.deepEqual(
      bag.ordered().map((one) => `${one.code} ${one.span.line}: ${one.message}`),
      [],
      name,
    );
  }
});
