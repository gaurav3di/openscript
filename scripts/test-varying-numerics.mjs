/** Execution and protocol mutants for the changing-control audit. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { bits, compareResults, parseResults, validateScope } from './lib/stateful-numerics/index.mjs';
import {
  buildVaryingCorpus, compareExecutions, executeCase, validateVaryingCases,
} from './lib/varying-numerics/index.mjs';

const scope = { schemaVersion: 1, keys: ['probe/2'], platformDiagnostics: [] };
const column = (name, values) => ({ name, kind: 'number', values: values.map(v => v === null ? null : bits(v)) });
const base = () => ({ id: 'probe:combined', key: 'probe/2', name: 'probe', arity: 2, bars: 4,
  outputColumns: 1, args: [column('src', [1, 2, 4, 8]), column('len', [2, 3, 1, 2])], bar: {}, scenario: 'combined' });
const changed = (field) => ({ ...structuredClone(base()), id: `probe:${field}`, comparisonCase: base().id,
  ...(field === 'restored' ? { restore: [{ at: 1, trial: 3 }] } : { replayFrom: 2 }) });
const cases = () => [base(), changed('restored'), changed('replayed')];
const record = (c, values) => ({ id: c.id, key: c.key, rows: values.map(v => [{ bits: bits(v) }]), exception: null });
const values = [1, 3, 7, 15];
const results = () => cases().map(c => record(c, values));
const run = (c, copyState = structuredClone, calls = []) => executeCase(c, {
  newState: () => ({ total: 0 }), copyState,
  invoke: (state, at, input) => {
    calls.push({ at, input });
    state.total += Buffer.from(c.args[0].values[input], 'hex').readDoubleBE();
    return [{ bits: bits(state.total) }];
  },
});

test('restoring a changed same-call contribution leaves later accepted values intact', () => {
  const input = changed('restored');
  const calls = [];
  assert.deepEqual(run(input, structuredClone, calls), record(input, values));
  assert.ok(calls.some(call => call.at === 1 && call.input === 3));
  const wrong = run(input, state => state);
  assert.equal(wrong.rows[3][0].bits, bits(23));
  const accepted = results(); accepted[1] = wrong;
  const failures = compareExecutions(cases(), accepted, results());
  assert.equal(failures.length, 1);
  assert.equal(failures[0].engine, 'javascript');
  assert.ok(failures[0].differences.some(d => d.bar === 3));
});

test('replay replaces a changed suffix and detects a checkpoint that aliases live state', () => {
  const input = changed('replayed');
  assert.deepEqual(run(input), record(input, values));
  const wrong = run(input, state => state);
  assert.notEqual(wrong.rows[3][0].bits, bits(15));
  const records = results(); records[2] = wrong;
  assert.equal(compareExecutions(cases(), records, results()).length, 1);
  // A driver that returns the first, provisional suffix has wrong values even
  // when it reports the expected row count and invokes every first-pass call.
  const skipped = record(input, [1, 3, 11, 12]);
  records[2] = skipped;
  assert.equal(compareExecutions(cases(), records, results()).length, 1);
});

test('restore and replay defects shared by both engines cannot count as agreement', () => {
  const records = results(); records[2] = record(changed('replayed'), [1, 3, 11, 12]);
  assert.equal(compareResults(cases(), records, structuredClone(records), scope).exactAgreement, true);
  assert.equal(compareExecutions(cases(), records, structuredClone(records)).length, 2);
});

test('execution comparison checks bits, absence, columns and every accepted bar', () => {
  for (const replacement of [[null], [], [{ bits: '402e000000000001' }], [null, null]]) {
    const records = results(); records[1].rows[3] = replacement;
    assert.equal(compareExecutions(cases(), records, results()).length, 1);
  }
  assert.deepEqual(compareExecutions(cases(), results(), results()), []);
});

test('one bit and independent oracle mutants fail even when classified as math', () => {
  const item = base(); item.oracle = { expected: [[1], [3], [7], [15]], reason: 'Successive integer cumulative sums.' };
  const wrong = record(item, [1, 3, 7, 16]);
  const policy = { ...scope, platformDiagnostics: ['probe/2'] };
  assert.equal(compareResults([item], [wrong], [wrong], policy).exactAgreement, false);
  const report = compareResults([item], [record(item, values)], [wrong], policy);
  assert.equal(report.exactAgreement, false);
});

test('execution metadata and comparison references are validated before driving', () => {
  assert.doesNotThrow(() => validateVaryingCases(cases(), scope.keys));
  const mutations = [
    c => { c.restore = true; }, c => { c.restore = []; },
    c => { c.restore = [{ at: 1, trial: 1 }]; }, c => { c.restore = [{ at: -1, trial: 2 }]; },
    c => { c.restore = [{ at: 1, trial: 9 }]; }, c => { c.restore = [{ at: 1, trial: 2, extra: 0 }]; },
    c => { c.restore = [{ at: 2, trial: 3 }, { at: 1, trial: 2 }]; },
    c => { c.restore = [{ at: 1.5, trial: 2 }]; }, c => { c.replayFrom = 2; },
    c => { c.comparisonCase = 'missing'; }, c => { c.comparisonCase = c.id; },
    c => { c.comparisonCase = 'probe:replayed'; }, c => { delete c.comparisonCase; },
    c => { c.args[0].values[0] = bits(99); }, c => { c.barIndices = [0, 1]; },
    c => { c.barIndices = [0, 1, 1, 3]; }, c => { c.barIndices = [0, 1, 2, Infinity]; },
    c => { c.extraExecution = true; },
  ];
  for (const mutate of mutations) {
    const all = cases(); mutate(all[1]);
    assert.throws(() => validateVaryingCases(all, scope.keys), /case|execution/);
  }
  for (const invalid of [-1, 0, 4, 1.5, null, '2']) {
    const all = cases(); all[2].replayFrom = invalid;
    assert.throws(() => validateVaryingCases(all, scope.keys), /execution/);
  }
});

test('the same execution index is used for temporary input and its replacement', () => {
  const input = changed('restored'); input.barIndices = [10, 12, 14, 16];
  const seen = [];
  executeCase(input, { newState: () => ({}), copyState: structuredClone,
    invoke: (_state, at, source) => { seen.push([input.barIndices[at], source]); return [null]; } });
  assert.deepEqual(seen.slice(1, 3), [[12, 3], [12, 1]]);
});

test('corpus controls grow, shrink and become absent without compacting source columns', () => {
  const row = { name: 'probe', arity: 2, state: true, file: 'probe.json' };
  const vector = { params: ['src', 'len'], cases: [{ id: 'full-0', args: base().args,
    bar: { volume: column('volume', [2, 3, 4, 5]) }, outputs: [column('out', [null, 2, 3, 4])] }] };
  const before = structuredClone(vector);
  const { cases: corpus, inventory } = buildVaryingCorpus([row], () => vector);
  assert.deepEqual(vector, before);
  assert.equal(inventory[0].parameters[1].role, 'length');
  for (const scenario of ['len:vary', 'len:missing', 'len:large-first-shrink', 'len:late-grow', 'len:alternating',
    'combined-hole:arg.src', 'combined-hole:bar.volume', 'restored', 'replayed', 'sparse-executions']) {
    assert.ok(corpus.some(c => c.scenario === scenario), scenario);
  }
  const missing = corpus.find(c => c.scenario === 'len:missing');
  assert.equal(missing.args[1].values[0], null);
  assert.notEqual(missing.args[0].values[0], null);
  const hole = corpus.find(c => c.scenario === 'combined-hole:arg.src');
  assert.equal(hole.args[0].values[3], null);
  assert.notEqual(hole.bar.volume.values[3], null);
  validateVaryingCases(corpus, scope.keys);
});

test('live inventory has 81 keys, 109 controls, and 950 broad plus 81 replay cases', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const read = name => JSON.parse(readFileSync(root + name, 'utf8'));
  const policy = validateScope(read('spec/vectors/numerical-audit/varying-scope.json'));
  const rows = read('spec/vectors/library/index.json').functions.filter(row => row.state);
  const built = buildVaryingCorpus(rows, file => read(`spec/vectors/library/${file}`));
  assert.deepEqual(built.inventory.map(row => row.key).sort(), policy.keys);
  assert.equal(built.inventory.length, 81);
  assert.equal(built.inventory.reduce((n, row) => n + row.parameters.filter(p => p.role !== 'source').length, 0), 109);
  assert.equal(built.cases.length, 1031);
  assert.equal(built.cases.filter(c => c.replayFrom !== undefined).length, 81);
  assert.equal(built.cases.filter(c => c.restore).length, 81);
  assert.equal(built.inventory.filter(row => row.parameters.every(p => p.role === 'source')).length, 10);
  validateVaryingCases([...built.cases, ...read('spec/vectors/numerical-audit/varying-oracles.json')], policy.keys);
});

test('corrupted protocols and mismatched functions cannot enter execution comparison', () => {
  const input = cases();
  for (const mutate of [r => { r[0].key = 'other/2'; }, r => { r.pop(); },
    r => { r[0].rows[0][0].bits = 'bad'; }, r => { r[0].extra = true; }]) {
    const records = results(); mutate(records);
    assert.throws(() => parseResults(records.map(r => JSON.stringify(r)).join('\n'), input), /protocol/);
  }
});
