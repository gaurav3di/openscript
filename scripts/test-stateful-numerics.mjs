/** Mutants that the stateful numerical gate must reject before reading engines. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertDenominator, bits, buildCorpus, compareResults, parseDriverSummary, parseResults,
  validateCases, validateScope,
} from './lib/stateful-numerics/index.mjs';

const scope = { schemaVersion: 1, keys: ['probe/1'], platformDiagnostics: [] };
const column = (values) => ({ name: 'src', kind: 'number', values: values.map((n) => n === null ? null : bits(n)) });
const fixture = () => ({
  id: 'probe:ordinary', key: 'probe/1', name: 'probe', arity: 1, bars: 2,
  args: [column([1, 2])], bar: {}, outputColumns: 1,
  oracle: { expected: [[null], [2]], reason: 'The first observation warms up; the second reports two.' },
});
const record = () => ({ id: 'probe:ordinary', key: 'probe/1', rows: [[null], [{ bits: bits(2) }]], exception: null });
const compare = (js = record(), python = record(), policy = scope, item = fixture()) =>
  compareResults([item], [js], [python], policy);

test('identical outputs must also satisfy the independent oracle', () => {
  assert.equal(compare().exactAgreement, true);
  const wrong = record();
  wrong.rows[1][0] = { bits: bits(3) };
  const report = compare(wrong, structuredClone(wrong));
  assert.equal(report.exactAgreement, false);
  assert.equal(report.oracleFailures.length, 2);
});

test('one last-bit mutation is an exact disagreement', () => {
  const wrong = record();
  wrong.rows[1][0] = { bits: '4000000000000001' };
  const report = compare(record(), wrong);
  assert.equal(report.exactAgreement, false);
  assert.equal(report.differences[0].differences[0].ulps, '1');
});

test('platform classification never allows a numerical mismatch', () => {
  const wrong = record();
  wrong.rows[1][0] = { bits: bits(3) };
  const report = compare(record(), wrong, { ...scope, platformDiagnostics: ['probe/1'] });
  assert.equal(report.exactAgreement, false);
  assert.equal(report.differences[0].classification, 'platform-diagnostic');
});

test('a missing value cannot become zero or a missing column', () => {
  for (const replacement of [[{ bits: bits(0) }], []]) {
    const wrong = record();
    wrong.rows[0] = replacement;
    assert.equal(compare(record(), wrong).exactAgreement, false);
  }
});

test('matching missing columns and extra columns still fail the shape contract', () => {
  for (const row of [[], [null, null]]) {
    const wrong = record();
    wrong.rows[0] = row;
    assert.equal(compare(wrong, structuredClone(wrong)).exactAgreement, false);
  }
});

test('matching host exceptions do not count as agreement', () => {
  const wrong = record();
  wrong.rows = [];
  wrong.exception = { bar: 0, type: 'Error', message: 'bad divisor' };
  assert.equal(compare(wrong, structuredClone(wrong)).exactAgreement, false);
});

test('matching truncated rows do not count as agreement', () => {
  const wrong = record();
  wrong.rows.pop();
  assert.equal(compare(wrong, structuredClone(wrong)).exactAgreement, false);
});

test('matching nonfinite and negative-zero results violate the output contract', () => {
  for (const cell of [{ nonfinite: 'Infinity' }, { bits: '8000000000000000' }]) {
    const wrong = record();
    wrong.rows[1][0] = cell;
    assert.equal(compare(wrong, structuredClone(wrong)).exactAgreement, false);
  }
});

test('committed baseline columns are checked independently of agreement', () => {
  const item = fixture();
  delete item.oracle;
  item.expected = [{ kind: 'number', values: [null, bits(3)] }];
  const report = compare(record(), record(), scope, item);
  assert.equal(report.exactAgreement, false);
  assert.equal(report.baselineFailures.length, 2);
});

test('each denominator is required and duplicate names do not disappear into sets', () => {
  const keys = ['probe/1'];
  assert.doesNotThrow(() => assertDenominator(scope, keys, keys, keys, keys));
  for (let at = 0; at < 4; at++) {
    for (const mutation of [[], ['other/1'], ['probe/1', 'probe/1']]) {
      const lists = [keys, keys, keys, keys];
      lists[at] = mutation;
      assert.throws(() => assertDenominator(scope, ...lists), /denominator/);
    }
  }
});

test('scope accepts only its declared schema and fields', () => {
  assert.doesNotThrow(() => validateScope(scope));
  for (const invalid of [
    { ...scope, schemaVersion: 2 }, { ...scope, tolerance: 2 },
    { ...scope, keys: [] }, { ...scope, keys: ['z/1', 'a/1'] },
    { ...scope, platformDiagnostics: ['unknown/1'] },
    { ...scope, platformDiagnostics: ['probe/1', 'probe/1'] },
  ]) assert.throws(() => validateScope(invalid), /scope/);
});

test('protocol rejects malformed, missing, duplicated and shuffled records', () => {
  const line = JSON.stringify(record());
  assert.deepEqual(parseResults(line + '\n', [fixture()]), [record()]);
  for (const text of ['', '{', line + '\n' + line, JSON.stringify({ ...record(), id: 'other' }),
    JSON.stringify({ ...record(), key: 'other/1' }),
    JSON.stringify({ ...record(), rows: [[null], [{ bits: 'wrong' }]] }),
    JSON.stringify({ ...record(), rows: [[null], [2]] }),
    JSON.stringify({ ...record(), rows: [[null], [{ bits: bits(2), extra: 1 }]] }),
    JSON.stringify({ ...record(), extra: true }),
    JSON.stringify({ ...record(), exception: false }),
  ]) assert.throws(() => parseResults(text, [fixture()]), /protocol/);
});

test('driver summary is versioned and bound to the requested case count', () => {
  const summary = { schemaVersion: 1, cases: 1, keys: ['probe/1'] };
  assert.deepEqual(parseDriverSummary(JSON.stringify(summary), 1), summary);
  for (const value of [null, {}, { ...summary, schemaVersion: 2 }, { ...summary, cases: 0 },
    { ...summary, extra: true }, { ...summary, keys: [1] }]) {
    assert.throws(() => parseDriverSummary(JSON.stringify(value), 1), /protocol/);
  }
  assert.throws(() => parseDriverSummary('broken', 1), /protocol/);
});

test('oracle rows and inputs must be aligned, finite and unambiguous', () => {
  assert.doesNotThrow(() => validateCases([fixture()], scope.keys));
  const variants = [
    (c) => { c.oracle.expected = [[null]]; },
    (c) => { c.oracle.expected[1] = [Infinity]; },
    (c) => { c.args[0].values[0] = '7ff0000000000000'; },
    (c) => { c.args[0].values.pop(); },
    (c) => { c.arity = 2; },
    (c) => { c.outputColumns = 0; },
  ];
  for (const mutate of variants) {
    const item = fixture(); mutate(item);
    assert.throws(() => validateCases([item], scope.keys), /case/);
  }
  assert.throws(() => validateCases([fixture(), fixture()], scope.keys), /case/);
});

test('mutations preserve baselines and create separate holes in paired inputs', () => {
  const row = { name: 'probe', arity: 2, state: true, file: 'probe.json' };
  const original = { id: 'full-0', bars: 2, gaps: [], args: [column([1, 2]), { ...column([3, 4]), name: 'b' }],
    bar: { volume: column([2, 3]) }, outputs: [column([null, 2])] };
  original.args[0].name = 'a';
  const saved = structuredClone(original);
  const corpus = buildCorpus([row], () => ({ cases: [original] }));
  assert.deepEqual(original, saved);
  assert.deepEqual(corpus[0].expected, original.outputs);
  corpus[0].expected[0].values[0] = bits(9);
  assert.deepEqual(original, saved);
  const a = corpus.find((c) => c.scenario === 'independent-holes:arg.a');
  const b = corpus.find((c) => c.scenario === 'independent-holes:arg.b');
  assert.equal(a.args[0].values[0], null);
  assert.notEqual(a.args[1].values[0], null);
  assert.notEqual(b.args[0].values[0], null);
  assert.equal(b.args[1].values[0], null);
  assert.equal(corpus.find((c) => c.scenario === 'repeat-512').bars, 512);
});
