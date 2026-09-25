/** Bounded differential evidence plus independent oracles, never a golden generator. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCorpus } from './corpus.mjs';
import { compareResults } from './compare.mjs';
import { drive, loadEngine } from './javascript.mjs';
import { assertDenominator, parseResults, validateCases, validateScope } from './protocol.mjs';

export { buildCorpus } from './corpus.mjs';
export { compareResults } from './compare.mjs';
export { assertDenominator, bits, decode, encode, fromBits, parseResults, validateCases, validateScope } from './protocol.mjs';

export function parseDriverSummary(text, caseCount) {
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('protocol: invalid driver summary JSON'); }
  if (!value || value.schemaVersion !== 1 || value.cases !== caseCount || !Array.isArray(value.keys)
      || value.keys.some((key) => typeof key !== 'string')
      || Object.keys(value).some((key) => !['schemaVersion', 'cases', 'keys'].includes(key))) {
    throw new Error('protocol: invalid driver summary');
  }
  return value;
}

export async function runStatefulAudit({ root, output }) {
  const read = (file) => JSON.parse(readFileSync(join(root, file), 'utf8'));
  const scope = validateScope(read('spec/vectors/numerical-audit/stateful-scope.json'));
  const indexed = read('spec/vectors/library/index.json').functions.filter((row) => row.state);
  const indexedKeys = indexed.map((row) => `${row.name}/${row.arity}`).sort();
  const built = await loadEngine(root);
  const liveKeys = built.manifestEntries().filter((row) => row.state && row.effect === 'none').map((row) => `${row.name}/${row.arity}`).sort();
  // Refuse incomplete registries before spending time on the corpus.
  assertDenominator(scope, indexedKeys, liveKeys, scope.keys, scope.keys);
  const corpus = buildCorpus(indexed, (file) => read(`spec/vectors/library/${file}`));
  const oracles = read('spec/vectors/numerical-audit/stateful-oracles.json');
  if (!Array.isArray(oracles) || oracles.length === 0 || oracles.some((item) => !item.oracle)) {
    throw new Error('case: independent oracle cases must be a nonempty array');
  }
  const cases = [...corpus, ...oracles];
  validateCases(cases, scope.keys);
  const exercised = [...new Set(corpus.map((c) => c.key))].sort();
  const directory = output ?? mkdtempSync(join(tmpdir(), 'stateful-numerics-'));
  mkdirSync(directory, { recursive: true });
  const write = (name, value) => writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + '\n');
  const inputs = join(directory, 'cases.json'), pythonPath = join(directory, 'python-results.jsonl');
  writeFileSync(inputs, JSON.stringify(cases));
  const javascript = cases.map((c) => drive(c, built));
  const jsText = javascript.map((record) => JSON.stringify(record)).join('\n') + '\n';
  writeFileSync(join(directory, 'javascript-results.jsonl'), jsText);
  parseResults(jsText, cases);
  const driver = fileURLToPath(new URL('./python.py', import.meta.url));
  const text = execFileSync('python', ['-B', driver, root, inputs, pythonPath], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  const driverSummary = parseDriverSummary(text, cases.length);
  assertDenominator(scope, indexedKeys, liveKeys, driverSummary.keys, exercised);
  const python = parseResults(readFileSync(pythonPath, 'utf8'), cases);
  const report = compareResults(cases, javascript, python, scope);
  const { differences, failures, oracleFailures, baselineFailures, caseSummaries, ...summary } = report;
  Object.assign(summary, { root, output: directory, generatedAt: new Date().toISOString(),
    scope: 'Constant-parameter calls through both actual registries. Agreement alone is not an oracle.',
    denominator: { indexed: indexedKeys.length, javascript: liveKeys.length, python: driverSummary.keys.length,
      exercised: exercised.length, keys: scope.keys },
    failureCounts: { output: failures.length, oracle: oracleFailures.length, baseline: baselineFailures.length } });
  write('summary.json', summary);
  write('differences.json', differences);
  write('failures.json', { output: failures, oracle: oracleFailures, baseline: baselineFailures });
  write('case-summary.json', caseSummaries);
  return summary;
}
