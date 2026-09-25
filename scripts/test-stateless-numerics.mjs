/** Stateless inputs keep their edge bits and their actual host context. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { bits, decode, validateCases } from './lib/stateful-numerics/index.mjs';
import { buildStatelessCorpus, driveStateless, indexedNumericalKeys, selectNumericalEntries } from './lib/stateless-numerics/index.mjs';

const index = [{ name: 'abs', arity: 1, state: false, file: 'abs.json' }];
const keys = ['abs/1', 'pow/2'];
const column = (values) => ({ name: 'src', kind: 'number', values: values.map((v) => v === null ? null : bits(v)) });
const original = { id: 'ordinary', bars: 2, args: [column([-1, 2])], outputs: [column([1, 2])] };
const corpus = () => buildStatelessCorpus(index, () => ({ cases: [original] }), keys);

test('scalar coverage comes from the vector inventory without an implicit power exemption', () => {
  assert.deepEqual(indexedNumericalKeys(index), ['abs/1']);
  assert.deepEqual(indexedNumericalKeys([...index, { name: 'pow', arity: 2, state: false }]), keys);
  const cases = corpus();
  assert.equal(cases.filter((c) => c.scenario === 'numeric-edges').length, 2);
  assert.equal(cases.find((c) => c.key === 'pow/2').bars, 236);
});

test('all scalar edge calls preserve the original null, sign and magnitude cases', () => {
  const edge = corpus().find((c) => c.scenario === 'numeric-edges' && c.key === 'abs/1');
  assert.deepEqual(edge.args[0].values.slice(0, 7), [null, bits(-0), bits(0), bits(Number.MIN_VALUE),
    bits(-Number.MIN_VALUE), bits(2 ** -1022), bits(-(2 ** -1022))]);
  assert.equal(edge.args[0].values[32], bits(Number.MAX_VALUE));
  assert.equal(edge.args[0].values[33], bits(-Number.MAX_VALUE));
  assert.equal(edge.host.tickSize, bits(0.05));
  assert.equal(edge.bar.high.values[1], bits(-0));
  assert.equal(edge.bar.previousClose.values[0], bits(-0));
  validateCases(corpus(), keys);
});

test('generated arguments stay deterministic and ordered for binary calls', () => {
  const first = corpus(), second = corpus();
  assert.deepEqual(first, second);
  const edge = first.find((c) => c.key === 'pow/2');
  assert.equal(decode(edge.args[1], 0), 1 + Number.EPSILON);
  assert.equal(edge.args.length, 2);
});

test('round precision and clamp bounds remain valid caller inputs', () => {
  const cases = buildStatelessCorpus([], () => { throw new Error('unexpected vector read'); }, ['clamp/3', 'round/2']);
  const clamp = cases.find((c) => c.key === 'clamp/3');
  assert.equal(decode(clamp.args[1], 0), -100);
  assert.equal(decode(clamp.args[2], 0), 100);
  const round = cases.find((c) => c.key === 'round/2');
  assert.equal(decode(round.args[1], 31), 15);
  assert.equal(decode(round.args[1], 32), 0);
});

test('committed baselines are retained without mutating or sharing their cells', () => {
  const saved = structuredClone(original);
  const baseline = corpus()[0];
  assert.deepEqual(baseline.expected, original.outputs);
  baseline.expected[0].values[0] = bits(9);
  assert.deepEqual(original, saved);
});

test('selected entries must exist once and remain stateless without effects', () => {
  const entries = keys.map((key) => ({ name: key.split('/')[0], arity: Number(key.split('/')[1]), state: false, effect: 'none' }));
  assert.equal(selectNumericalEntries(entries, keys).length, 2);
  for (const mutant of [entries.slice(1), [...entries, entries[0]],
    [{ ...entries[0], state: true }, entries[1]], [{ ...entries[0], effect: 'draw' }, entries[1]],
    [{ ...entries[0], state: undefined }, entries[1]]]) {
    assert.throws(() => selectNumericalEntries(mutant, keys), /denominator/);
  }
});

test('driver gives each independent call fresh state and heap with the actual bar index', () => {
  const states = [], heaps = [];
  const built = { Heap: class {}, manifestEntry: () => ({ call: (ctx) => {
    states.push(ctx.state); heaps.push(ctx.heap); return ctx.bar.index;
  } }) };
  const c = { ...corpus()[0], args: [], name: 'trueRange', arity: 0, key: 'trueRange/0' };
  const result = driveStateless(c, built);
  assert.deepEqual(result.rows, [[{ bits: bits(0) }], [{ bits: bits(1) }]]);
  assert.equal(new Set(states).size, 2);
  assert.equal(new Set(heaps).size, 2);
});

test('driver records a host exception as a failure at its exact row', () => {
  const built = { Heap: class {}, manifestEntry: () => ({ call: () => { throw new Error('mutant'); } }) };
  const result = driveStateless(corpus()[0], built);
  assert.equal(result.exception.bar, 0);
  assert.equal(result.exception.message, 'mutant');
  assert.deepEqual(result.rows, []);
});
