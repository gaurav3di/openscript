/** Exact changing-control evidence, with independent oracle and replay checks. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertDenominator, compareResults, parseDriverSummary, parseResults, validateScope,
} from '../stateful-numerics/index.mjs';
import { buildVaryingCorpus } from './corpus.mjs';
import { compareExecutions, validateVaryingCases } from './execution.mjs';
import { drive, loadEngine } from './javascript.mjs';

export { buildVaryingCorpus } from './corpus.mjs';
export { compareExecutions, executeCase, validateVaryingCases } from './execution.mjs';

export async function runVaryingAudit({ root, output }) {
  const read = name => JSON.parse(readFileSync(join(root, name), 'utf8'));
  const scope = validateScope(read('spec/vectors/numerical-audit/varying-scope.json'));
  const indexed = read('spec/vectors/library/index.json').functions.filter(row => row.state);
  const indexedKeys = indexed.map(row => `${row.name}/${row.arity}`).sort();
  const built = await loadEngine(root);
  const liveKeys = built.manifestEntries().filter(row => row.state && row.effect === 'none').map(row => `${row.name}/${row.arity}`).sort();
  assertDenominator(scope, indexedKeys, liveKeys, scope.keys, scope.keys);
  const corpus = buildVaryingCorpus(indexed, file => read(`spec/vectors/library/${file}`), built.libraryEntries);
  const oracles = read('spec/vectors/numerical-audit/varying-oracles.json');
  if (!Array.isArray(oracles) || oracles.length === 0 || oracles.some(c => !c.oracle)) {
    throw new Error('case: independent oracles must be a nonempty array');
  }
  const cases = [...corpus.cases, ...oracles];
  validateVaryingCases(cases, scope.keys);
  const exercised = [...new Set(corpus.cases.map(c => c.key))].sort();
  const directory = output ?? mkdtempSync(join(tmpdir(), 'varying-numerics-'));
  mkdirSync(directory, { recursive: true });
  const write = (name, value) => writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + '\n');
  const inputs = join(directory, 'cases.json'), pythonPath = join(directory, 'python-results.jsonl');
  writeFileSync(inputs, JSON.stringify(cases));
  const jsText = cases.map(c => JSON.stringify(drive(c, built))).join('\n') + '\n';
  writeFileSync(join(directory, 'javascript-results.jsonl'), jsText);
  const javascript = parseResults(jsText, cases);
  const driver = fileURLToPath(new URL('./python.py', import.meta.url));
  const text = execFileSync('python', ['-B', driver, root, inputs, pythonPath], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  const meta = parseDriverSummary(text, cases.length);
  assertDenominator(scope, indexedKeys, liveKeys, meta.keys, exercised);
  const python = parseResults(readFileSync(pythonPath, 'utf8'), cases);
  const report = compareResults(cases, javascript, python, scope);
  const execution = compareExecutions(cases, javascript, python);
  const { differences, failures, oracleFailures, baselineFailures, caseSummaries, ...summary } = report;
  const roles = {};
  for (const row of corpus.inventory) for (const parameter of row.parameters) {
    if (parameter.role !== 'source') roles[parameter.role] = (roles[parameter.role] ?? 0) + 1;
  }
  Object.assign(summary, {
    exactAgreement: report.exactAgreement && execution.length === 0,
    root, output: directory, generatedAt: new Date().toISOString(), corpusVersion: 1,
    scope: 'Changing per-call controls and state checkpoints through both actual registries. This supplements the constant-parameter gate; agreement alone is not an oracle.',
    limitations: ['Bounded patterns do not establish every possible input sequence.',
      'Direct checkpoint replay does not validate every public Engine update or host replay API.',
      'Sparse call indices do not prove compiled conditional dispatch.',
      'Invalid-length diagnostics are outside this valid-control corpus.'],
    denominator: { indexed: indexedKeys.length, javascript: liveKeys.length, python: meta.keys.length,
      exercised: exercised.length, keys: scope.keys },
    controls: { count: Object.values(roles).reduce((sum, n) => sum + n, 0), roles,
      keysWithoutConfigurableControls: corpus.inventory.filter(row => row.parameters.every(p => p.role === 'source')).map(row => row.key),
      missingRegistryFamilies: scope.keys.filter(key => !exercised.includes(key)) },
    execution: { restorationCases: cases.filter(c => c.restore).length, replayCases: cases.filter(c => c.replayFrom !== undefined).length,
      comparisons: cases.filter(c => c.comparisonCase).length * 2, failures: execution.length },
    failureCounts: { output: failures.length, oracle: oracleFailures.length, baseline: baselineFailures.length, execution: execution.length },
  });
  write('summary.json', summary);
  write('inventory.json', corpus.inventory);
  write('differences.json', differences);
  write('failures.json', { output: failures, oracle: oracleFailures, baseline: baselineFailures, execution });
  write('case-summary.json', caseSummaries);
  return summary;
}
