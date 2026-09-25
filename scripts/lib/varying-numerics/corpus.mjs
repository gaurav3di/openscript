/** Deterministic changing controls, using committed vector argument shapes. */
import { bits } from '../stateful-numerics/index.mjs';

const lengths = new Set(['len', 'fast', 'slow', 'signal', 'diLen', 'adxLen', 'atrLen', 'convLen', 'baseLen', 'spanLen',
  'longLen', 'shortLen', 'len1', 'len2', 'len3', 'rsiLen', 'stochLen', 'smoothK', 'smoothD', 'left', 'right', 'n']);
const sources = new Set(['src', 'a', 'b']);
const averages = ['sma', 'ema', 'wma', 'rma', 'hma', 'vwma'];
const count = 128;
const encode = value => typeof value === 'number' ? bits(value) : value;
const close = i => 10 + (i * 7 % 13) + i / 8;
const source = (i, name) => name === 'b' ? 5 + (i * 3 % 11) + i / 16 : close(i);

function rule(name, fn) {
  if (sources.has(name)) return { role: 'source', domain: 'finite number or none' };
  if (lengths.has(name)) return { role: 'length', domain: 'whole integer >= 1 or none',
    missing: 'Contribution retained; maximum readiness retained. Recursive seed policy is specified separately.' };
  if (['cond', 'resetWhen'].includes(name)) return { role: 'condition', domain: 'bool or none', missing: 'Only true records an event or anchor.' };
  if (name === 'sample') return { role: 'sample', domain: 'bool or none', missing: 'The binding selects sample only for true.' };
  if (['type', 'maType'].includes(name)) return { role: 'selector', domain: [...averages], missing: 'No selected recurrence is executed.' };
  if (name === 'occurrence') return { role: 'occurrence', domain: 'whole integer >= 0 or none', missing: 'Declared default zero.' };
  if (name === 'p') return { role: 'percentile', domain: 'finite number in [0,100] or none', missing: 'Source history continues.' };
  if (['offset', 'sigma', 'mult', 'factor', 'periodsPerYear', 'start', 'step', 'max'].includes(name)) {
    return { role: name === 'offset' ? 'offset' : name === 'sigma' ? 'sigma' : 'numeric-control',
      domain: name === 'offset' && fn === 'alma' ? 'offsets in [0,1] selected here' : 'finite controls; nonnegative or positive values selected here',
      missing: 'Absent operand tested independently from source holes.' };
  }
  throw new Error(`corpus: unclassified parameter ${fn}.${name}`);
}

function fixed(name, fn, original) {
  if (lengths.has(name)) return name === 'slow' || name === 'spanLen' ? 5 : 3;
  if (name === 'p') return 50;
  if (name === 'occurrence') return 0;
  if (name === 'sample') return false;
  if (name === 'type' || name === 'maType') return 'sma';
  if (name === 'offset') return fn === 'alma' ? 0.5 : 0;
  if (name === 'sigma') return 6;
  if (name === 'periodsPerYear') return 252;
  if (name === 'start' || name === 'step') return 0.02;
  if (name === 'max') return 0.2;
  if (name === 'mult' || name === 'factor') return 2;
  return typeof original === 'boolean' ? original : 1;
}

function varied(name, fn, at, offset = 0) {
  const i = at + offset;
  if (lengths.has(name)) return [2, 5, 1, 13, 3, 8, 2, 4][Math.floor(i / 7) % 8];
  if (name === 'p') return [0, 25, 50, 75, 100][i % 5];
  if (name === 'occurrence') return [0, 3, 1, 7, 0][i % 5];
  if (name === 'type' || name === 'maType') return averages[Math.floor(i / 5) % averages.length];
  if (name === 'cond' || name === 'resetWhen') return i % 7 === 0 || i % 11 === 0;
  if (name === 'sample') return i % 3 === 0;
  if (name === 'offset') return (fn === 'alma' ? [0, 0.5, 1, 0.25, 0.85] : [-2, -0.5, 0, 1.5, 3])[i % 5];
  if (name === 'sigma') return [0.5, 2, 6, 9, 3][i % 5];
  if (name === 'periodsPerYear') return [1, 4, 252, 365][i % 4];
  if (['start', 'step', 'max'].includes(name)) return [0, 0.02, 0.2, 0.1][i % 4];
  return [0.5, 1, 2, 3, 0][i % 5];
}

function base(row, vector, scenario) {
  const seed = vector.cases.find(c => c.id === 'full-0') ?? vector.cases[0];
  const args = vector.params.map((name, n) => ({ name,
    kind: ['cond', 'resetWhen', 'sample'].includes(name) ? 'bool' : ['type', 'maType'].includes(name) ? 'string' : 'number',
    values: Array.from({ length: count }, (_, i) => encode(sources.has(name) ? source(i, name)
      : ['cond', 'resetWhen'].includes(name) ? i % 7 === 0 : fixed(name, row.name, seed.args[n].values[0]))),
  }));
  const bar = Object.fromEntries(Object.keys(seed.bar ?? {}).map(name => {
    const bool = name.startsWith('isSession');
    const values = Array.from({ length: count }, (_, i) => bool ? i % 32 === 0 : name === 'volume' ? 2 + i % 7
      : name === 'high' ? close(i) + 1 + i % 3 / 2 : name === 'low' ? close(i) - 1.5
        : name === 'previousClose' ? i === 0 ? null : close(i - 1) : close(i));
    return [name, { kind: bool ? 'bool' : 'number', values: values.map(encode) }];
  }));
  return { id: `${row.name}/${row.arity}:${scenario}`, key: `${row.name}/${row.arity}`, name: row.name, arity: row.arity,
    bars: count, outputColumns: seed.outputs.length, args, bar, scenario, gaps: seed.gaps ?? [],
    ...(seed.host ? { host: structuredClone(seed.host) } : {}) };
}

export function buildVaryingCorpus(indexed, read) {
  const cases = [], inventory = [];
  for (const row of indexed) {
    const vector = read(row.file);
    if (!Array.isArray(vector.params) || vector.params.length !== row.arity) throw new Error(`corpus: parameter shape differs for ${row.name}`);
    const parameters = vector.params.map((name, index) => ({ name, index, ...rule(name, row.name) }));
    const controls = parameters.filter(p => p.role !== 'source');
    inventory.push({ key: `${row.name}/${row.arity}`, file: row.file, parameters, barFacts: Object.keys(vector.cases[0].bar ?? {}),
      controlCoverage: controls.length ? 'changing controls' : 'no configurable control; source and execution probes only' });
    cases.push(base(row, vector, 'ordinary'));
    const all = base(row, vector, 'combined');
    controls.forEach((p, n) => { all.args[p.index].values = Array.from({ length: count }, (_, i) => encode(varied(p.name, row.name, i, n * 3))); });
    cases.push(all);
    for (const p of controls) {
      const scenarios = ['vary', 'missing', ...(p.role === 'length' ? ['large-first-shrink', 'late-grow', 'alternating'] : []),
        ...(['numeric-control', 'sigma', 'offset'].includes(p.role) ? ['finite-extremes'] : [])];
      for (const scenario of scenarios) {
        if (scenario === 'finite-extremes' && p.name === 'offset' && row.name === 'alma') continue;
        const c = base(row, vector, `${p.name}:${scenario}`);
        c.args[p.index].values = Array.from({ length: count }, (_, i) => encode(
          scenario === 'large-first-shrink' ? i === 0 ? 13 : 2 : scenario === 'late-grow' ? i < 48 ? 2 : 13
            : scenario === 'alternating' ? i % 2 ? 13 : 2 : scenario === 'missing' && [0, 1, 8, 9, 40, 87].includes(i) ? null
              : scenario === 'finite-extremes' ? [1, 1e308, 2, 1e-200, 3][i % 5] : varied(p.name, row.name, i)));
        cases.push(c);
      }
    }
    const inputs = [...parameters.filter(p => p.role === 'source').map(p => ['arg', p.name]),
      ...Object.keys(all.bar).filter(name => !name.startsWith('isSession')).map(name => ['bar', name])];
    for (const [kind, name] of inputs) {
      const c = structuredClone(all);
      c.id = `${c.key}:combined-hole:${kind}.${name}`; c.scenario = `combined-hole:${kind}.${name}`;
      const target = kind === 'arg' ? c.args.find(a => a.name === name) : c.bar[name];
      for (const at of [0, 3, 16, 17, 47, 98]) target.values[at] = null;
      cases.push(c);
    }
    const restored = structuredClone(all);
    restored.id = `${all.key}:restored`; restored.scenario = 'restored'; restored.comparisonCase = all.id;
    restored.restore = Array.from({ length: count }, (_, at) => ({ at, trial: (at + 1) % count })).filter(p => p.at % 7 === 3);
    cases.push(restored);
    const sparse = structuredClone(all);
    sparse.id = `${all.key}:sparse-executions`; sparse.scenario = 'sparse-executions';
    sparse.barIndices = Array.from({ length: count }, (_, i) => i * 2);
    cases.push(sparse);
    const replayed = structuredClone(all);
    replayed.id = `${all.key}:replayed`; replayed.scenario = 'replayed'; replayed.replayFrom = count / 2;
    replayed.comparisonCase = all.id;
    cases.push(replayed);
  }
  return { cases, inventory };
}
