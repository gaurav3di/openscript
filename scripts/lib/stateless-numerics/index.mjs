/** A declared scalar numerical scope, including power outside the old vectors. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertDenominator, compareResults, parseDriverSummary, parseResults, validateCases, validateScope } from '../stateful-numerics/index.mjs';
import { buildStatelessCorpus, indexedNumericalKeys } from './corpus.mjs';
import { driveStateless, selectNumericalEntries } from './javascript.mjs';

export { buildStatelessCorpus, indexedNumericalKeys } from './corpus.mjs';
export { driveStateless, selectNumericalEntries } from './javascript.mjs';

export async function runStatelessAudit({ root, output }) {
  const read = (file) => JSON.parse(readFileSync(join(root, file), 'utf8'));
  const scopePath = 'spec/vectors/numerical-audit/stateless-scope.json';
  const scope = validateScope(read(scopePath));
  const indexed = read('spec/vectors/library/index.json').functions;
  const declared = indexedNumericalKeys(indexed);
  const library = await import(pathToFileURL(join(root, 'dist/core/engine/library/index.js')).href);
  const { Heap } = await import(pathToFileURL(join(root, 'dist/core/engine/values/index.js')).href);
  const selected = selectNumericalEntries(library.manifestEntries(), scope.keys);
  const live = selected.map((entry) => `${entry.name}/${entry.arity}`).sort();
  assertDenominator(scope, declared, live, scope.keys, scope.keys);
  const corpus = buildStatelessCorpus(indexed, (file) => read(`spec/vectors/library/${file}`), scope.keys);
  const oracles = read('spec/vectors/numerical-audit/stateless-oracles.json');
  if (!Array.isArray(oracles) || !oracles.length || oracles.some((item) => !item.oracle)) {
    throw new Error('case: scalar independent oracles must be a nonempty array');
  }
  const cases = corpus.concat(oracles);
  validateCases(cases, scope.keys);
  const exercised = [...new Set(corpus.filter((c) => c.scenario === 'numeric-edges').map((c) => c.key))].sort();
  const directory = output ?? mkdtempSync(join(tmpdir(), 'stateless-numerics-'));
  mkdirSync(directory, { recursive: true });
  const inputs = join(directory, 'cases.json');
  writeFileSync(inputs, JSON.stringify(cases));
  const records = cases.map((c) => driveStateless(c, { ...library, Heap }));
  const encoded = records.map((record) => JSON.stringify(record)).join('\n') + '\n';
  writeFileSync(join(directory, 'javascript-results.jsonl'), encoded);
  const javascript = parseResults(encoded, cases);
  const pythonOutput = join(directory, 'python-results.jsonl');
  const driverPath = fileURLToPath(new URL('./python.py', import.meta.url));
  const acknowledgement = execFileSync('python', ['-B', driverPath, root, inputs, pythonOutput, join(root, scopePath)], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  const driver = parseDriverSummary(acknowledgement, cases.length);
  assertDenominator(scope, declared, live, driver.keys, exercised);
  const python = parseResults(readFileSync(pythonOutput, 'utf8'), cases);
  const report = compareResults(cases, javascript, python, scope);
  const { caseSummaries, differences, failures, baselineFailures, oracleFailures, ...summary } = report;
  summary.scope = 'Declared scalar numerical calls only. The edge grid is differential evidence; equality is not an independent oracle.';
  summary.denominator = { indexed: declared.length, javascript: live.length, python: driver.keys.length, exercised: exercised.length, keys: scope.keys };
  summary.edgeComparisons = corpus.filter((c) => c.scenario === 'numeric-edges').reduce((sum, c) => sum + c.bars, 0);
  summary.failureCounts = { output: failures.length, oracle: oracleFailures.length, baseline: baselineFailures.length };
  summary.output = directory;
  summary.root = root;
  summary.generatedAt = new Date().toISOString();
  const artifacts = { 'summary.json': summary, 'case-summary.json': caseSummaries, 'differences.json': differences,
    'failures.json': { output: failures, oracle: oracleFailures, baseline: baselineFailures } };
  for (const [name, contents] of Object.entries(artifacts)) writeFileSync(join(directory, name), JSON.stringify(contents, null, 2) + '\n');
  return summary;
}
