/** Validate and exercise temporary same-call values and checkpoint replay. */
import { validateCases } from '../stateful-numerics/index.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const own = (object, key) => Object.hasOwn(object, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const reject = text => { throw new Error(`execution: ${text}`); };
const fields = ['id', 'key', 'name', 'arity', 'bars', 'args', 'bar', 'host', 'outputColumns',
  'scenario', 'gaps', 'expected', 'oracle', 'domainQuestion', 'barIndices', 'restore', 'replayFrom', 'comparisonCase'];

export function validateVaryingCases(cases, keys) {
  validateCases(cases, keys);
  const byId = new Map(cases.map(c => [c.id, c]));
  for (const c of cases) {
    if (Object.keys(c).some(key => !fields.includes(key))) reject(`${c.id} has unknown fields`);
    if (own(c, 'domainQuestion') && c.domainQuestion !== false) reject(`${c.id} has an unresolved domain contract`);
    if (own(c, 'barIndices') && (!Array.isArray(c.barIndices) || c.barIndices.length !== c.bars
        || c.barIndices.some((n, at) => !Number.isSafeInteger(n) || n < 0 || at > 0 && n <= c.barIndices[at - 1]))) {
      reject(`${c.id} barIndices must be aligned, increasing nonnegative safe integers`);
    }
    if (own(c, 'restore')) {
      if (!Array.isArray(c.restore) || c.restore.length === 0 || c.restore.length > c.bars
          || c.restore.some((probe, index) => !object(probe)
            || Object.keys(probe).some(key => !['at', 'trial'].includes(key))
            || !Number.isSafeInteger(probe.at) || !Number.isSafeInteger(probe.trial)
            || probe.at < 0 || probe.at >= c.bars || probe.trial < 0 || probe.trial >= c.bars
            || probe.at === probe.trial || index > 0 && probe.at <= c.restore[index - 1].at)) {
        reject(`${c.id} restore probes must contain ordered unique at and distinct trial row indices`);
      }
    }
    if (own(c, 'replayFrom') && (!Number.isSafeInteger(c.replayFrom) || c.replayFrom < 1 || c.replayFrom >= c.bars)) {
      reject(`${c.id} replayFrom must identify a nonempty prefix and suffix`);
    }
    if (own(c, 'restore') && own(c, 'replayFrom')) reject(`${c.id} combines independent execution probes`);
    const probed = own(c, 'restore') || own(c, 'replayFrom');
    if (probed !== own(c, 'comparisonCase')) reject(`${c.id} needs exactly one baseline comparison reference for its probe`);
    if (!probed) continue;
    const baseline = byId.get(c.comparisonCase);
    if (!baseline || baseline === c || own(baseline, 'comparisonCase')) reject(`${c.id} has an invalid baseline reference`);
    for (const key of ['key', 'bars', 'outputColumns', 'args', 'bar', 'host', 'barIndices']) {
      if (!same(c[key], baseline[key])) reject(`${c.id} baseline ${key} differs`);
    }
  }
}

export function executeCase(c, runtime) {
  let state = runtime.newState(), checkpoint, at = 0, exception = null;
  const rows = [], restores = new Map((c.restore ?? []).map(probe => [probe.at, probe.trial]));
  try {
    for (at = 0; at < c.bars; at++) {
      if (at === c.replayFrom) checkpoint = runtime.copyState(state);
      if (restores.has(at)) {
        const saved = runtime.copyState(state);
        runtime.invoke(state, at, restores.get(at));
        state = runtime.copyState(saved);
      }
      // The first suffix is intentionally different. Merely returning it without
      // restoring and rerunning must fail by values, not just an execution count.
      const input = c.replayFrom !== undefined && at >= c.replayFrom ? (at + 1) % c.bars : at;
      rows.push(runtime.invoke(state, at, input));
    }
    if (c.replayFrom !== undefined) {
      state = runtime.copyState(checkpoint);
      rows.length = c.replayFrom;
      for (at = c.replayFrom; at < c.bars; at++) rows.push(runtime.invoke(state, at, at));
    }
  } catch (error) {
    exception = { bar: Math.min(at, c.bars - 1), type: error.name, message: error.message, traceback: error.stack };
  }
  return { id: c.id, key: c.key, rows, exception };
}

export function compareExecutions(cases, javascript, python) {
  const failures = [];
  const indices = new Map(cases.map((c, at) => [c.id, at]));
  for (const [at, c] of cases.entries()) {
    if (c.comparisonCase === undefined) continue;
    const before = indices.get(c.comparisonCase);
    if (before === undefined) reject(`${c.id} has no baseline`);
    for (const [engine, records] of [['javascript', javascript], ['python', python]]) {
      const actual = records[at], expected = records[before];
      if (!actual || !expected || actual.id !== c.id || expected.id !== c.comparisonCase) reject('result identity differs');
      const differences = [];
      for (let bar = 0; bar < Math.max(c.bars, actual.rows.length, expected.rows.length); bar++) {
        const width = Math.max(c.outputColumns, actual.rows[bar]?.length ?? 0, expected.rows[bar]?.length ?? 0);
        for (let column = 0; column < width; column++) {
          const wanted = expected.rows[bar]?.[column] ?? (expected.rows[bar]?.[column] === null ? null : { unreached: true });
          const observed = actual.rows[bar]?.[column] ?? (actual.rows[bar]?.[column] === null ? null : { unreached: true });
          if (!same(wanted, observed)) differences.push({ bar, column, expected: wanted, actual: observed });
        }
      }
      if (differences.length || actual.exception !== null || expected.exception !== null) {
        failures.push({ id: c.id, key: c.key, engine, baseline: c.comparisonCase,
          kind: c.restore ? 'restoration' : 'replay', differences,
          actualException: actual.exception, baselineException: expected.exception });
      }
    }
  }
  return failures;
}
