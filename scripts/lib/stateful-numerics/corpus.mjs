/** Deterministic constant-parameter mutations of the committed vector inputs. */
import { bits } from './protocol.mjs';

const seriesNames = new Set(['src', 'a', 'b', 'x', 'y', 'price']);
const priceFacts = new Set(['open', 'high', 'low', 'close', 'previousClose']);
const holes = new Set([0, 1, 17, 63, 64, 129, 253, 255]);
const lengths = new Set(['len', 'fast', 'slow', 'signal', 'diLen', 'adxLen', 'atrLen', 'convLen', 'baseLen', 'spanLen',
  'longLen', 'shortLen', 'len1', 'len2', 'len3', 'rsiLen', 'stochLen', 'smoothK', 'smoothD', 'left', 'right', 'n']);
const recoveryValue = (at) => at < 2 ? 1e308 : 1 + (at - 2) % 4;
const numericCell = (value) => value === null ? null : bits(value);
const patterns = [
  ['zero', () => 0],
  ['flat-positive', () => 7],
  ['flat-spread', (_i, name) => name === 'high' ? 9 : name === 'low' ? 5 : 7],
  ['alternating', (i, name) => (name === 'b' ? [2, -3, 4, 1] : [1, -2, 3, -4])[i % 4]],
  ['large-flat', () => Number.MAX_VALUE],
  ['large-cancellation', (i, name) => (name === 'b' ? [Number.MAX_VALUE, 1, -Number.MAX_VALUE, 0] : [Number.MAX_VALUE, -Number.MAX_VALUE, 1, 0])[i % 4]],
  ['large-cancellation-rotated', (i) => [1, Number.MAX_VALUE, -Number.MAX_VALUE, 0][i % 4]],
  ['squared-overflow', (i) => [1e154, -1e154, 0, 2][i % 4]],
  ['large-offset-small-range', (i) => 1e15 + [0, 0.125, 0.5, -0.25, 0.375][i % 5]],
  ['subnormal-flat', () => Number.MIN_VALUE],
  ['subnormal-alternating', (i) => [Number.MIN_VALUE, 2 * Number.MIN_VALUE, 0, -Number.MIN_VALUE][i % 4]],
  ['tiny-normal', (i) => [1e-200, 2e-200, 3e-200, 4e-200][i % 4]],
  ['overflow-then-ordinary', recoveryValue],
  ['overflow-holes-recovery', (i) => [40, 41, 129].includes(i) ? null : recoveryValue(i)],
];

function caseOf(row, original, scenario, bars = original.bars) {
  const value = structuredClone(original);
  Object.assign(value, { id: `${row.name}/${row.arity}:${scenario}`, key: `${row.name}/${row.arity}`,
    name: row.name, arity: row.arity, scenario, originCase: original.id,
    outputColumns: original.outputs.length, bars });
  if (scenario.startsWith('baseline:')) value.expected = value.outputs;
  delete value.outputs;
  for (const column of [...value.args, ...Object.values(value.bar ?? {})]) {
    column.values = Array.from({ length: bars }, (_, at) => column.values[at % original.bars]);
  }
  return value;
}

function numericData(value, transform) {
  for (const column of value.args) {
    if (seriesNames.has(column.name) && column.kind === 'number') {
      column.values = column.values.map((_v, at) => numericCell(transform(at, column.name)));
    }
  }
  for (const [name, column] of Object.entries(value.bar ?? {})) {
    if (!priceFacts.has(name) || column.kind !== 'number') continue;
    column.values = column.values.map((_v, at) => name === 'previousClose' && at === 0
      ? null : numericCell(transform(name === 'previousClose' ? at - 1 : at, name)));
  }
  if (value.bar?.volume) value.bar.volume.values = Array(value.bars).fill(bits(1));
  return value;
}

function boundaryCases(row, original, declarations) {
  const close = at => 100 + at % 4;
  const has = name => original.bar?.[name]?.kind === 'number';
  const scenarios = ['ordinary', ...original.args.filter(c => seriesNames.has(c.name) && c.kind === 'number').map(c => `arg.${c.name}`),
    ...(has('volume') ? ['volume-product', 'volume-product-down', 'volume-sum', 'volume-hole'] : []),
    ...(has('high') ? ['high-only'] : []), ...(has('low') ? ['low-only'] : []),
    ...(has('high') && has('low') ? ['range'] : []),
    ...(has('close') || has('previousClose') ? ['opposite-close'] : [])];
  const declared = declarations?.(row.name).find(entry => entry.parameters.length === row.arity);
  if (declarations && !declared) throw new Error(`case: no declared signature for ${row.name}/${row.arity}`);
  const defaults = new Map();
  for (const parameter of declared?.parameters ?? []) {
    if (parameter.defaultText === undefined || seriesNames.has(parameter.name)) continue;
    let value;
    try { value = parameter.defaultText === 'none' ? null : JSON.parse(parameter.defaultText); }
    catch { throw new Error(`case: unsupported control default ${row.name}.${parameter.name}`); }
    if (value !== null && !['number', 'string', 'boolean'].includes(typeof value)) throw new Error('case: invalid default literal');
    defaults.set(parameter.name, typeof value === 'number' ? bits(value) : value);
  }
  const presets = ['vector', ...(original.args.some(c => lengths.has(c.name)) ? ['length-1', 'length-2'] : []),
    ...(defaults.size ? ['declared-defaults'] : [])];
  const cases = [];
  for (const preset of presets) for (const scenario of scenarios) {
    const c = caseOf(row, original, `boundary:${preset}:${scenario}`, 256);
    numericData(c, (at, name) => close(at) + (name === 'high' ? 1 : name === 'low' ? -1 : 0));
    for (const arg of c.args) {
      if (lengths.has(arg.name) && preset.startsWith('length-')) arg.values.fill(bits(preset === 'length-1' ? 1 : 2));
      if (preset === 'declared-defaults' && defaults.has(arg.name)) arg.values.fill(defaults.get(arg.name));
    }
    const write = (name, at, value) => { if (c.bar?.[name]) c.bar[name].values[at] = numericCell(value); };
    if (scenario.startsWith('arg.')) {
      const arg = c.args.find(column => column.name === scenario.slice(4));
      arg.values[64] = bits(-1e308); arg.values[65] = bits(1e308);
      // A later gap must expire without hiding the ordinary recovery suffix.
      arg.values[69] = null;
    }
    if (scenario === 'volume-product' || scenario === 'volume-hole') write('volume', 65, Number.MAX_VALUE);
    if (scenario === 'volume-product-down') write('volume', 68, Number.MAX_VALUE);
    if (scenario === 'volume-hole') write('volume', 69, null);
    if (scenario === 'volume-sum') for (const at of [65, 66]) write('volume', at, Number.MAX_VALUE / 128);
    if (scenario === 'high-only' || scenario === 'range') for (const at of [65, 66]) write('high', at, Number.MAX_VALUE);
    if (scenario === 'low-only' || scenario === 'range') for (const at of [65, 66]) write('low', at, -Number.MAX_VALUE);
    if (scenario === 'opposite-close') {
      for (const [at, value] of [[64, -1e308], [65, 1e308]]) {
        write('close', at, value); write('previousClose', at + 1, value);
      }
    }
    cases.push(c);
  }
  return cases;
}

/** Independent named-boundary stress with a long ordinary recovery suffix. */
export function buildBoundaryCorpus(indexed, readVector, declarations) {
  return indexed.flatMap(row => {
    const original = readVector(row.file).cases.find(c => c.id === 'full-0');
    if (!original) throw new Error(`case: ${row.file} needs a full-0 boundary seed`);
    return boundaryCases(row, original, declarations);
  });
}

export function buildCorpus(indexed, readVector, declarations) {
  const cases = [];
  for (const row of indexed) {
    const vector = readVector(row.file);
    if (!Array.isArray(vector.cases) || vector.cases.length === 0) throw new Error(`case: no vectors for ${row.file}`);
    for (const original of vector.cases) cases.push(caseOf(row, original, `baseline:${original.id}`));
    const original = vector.cases.find((c) => c.id === 'full-0');
    if (!original) throw new Error(`case: ${row.file} needs a full-0 mutation seed`);
    cases.push(...boundaryCases(row, original, declarations));
    cases.push(caseOf(row, original, 'repeat-512', 512));
    for (const [name, transform] of patterns) cases.push(numericData(caseOf(row, original, name, 256), transform));
    const columns = original.args.filter((c) => seriesNames.has(c.name) || c.name === 'cond').map((c) => ['arg', c.name]);
    for (const fact of Object.keys(original.bar ?? {})) if (priceFacts.has(fact) || fact === 'volume') columns.push(['bar', fact]);
    for (const [kind, name] of columns) {
      const own = (value) => kind === 'arg' ? value.args.find((c) => c.name === name) : value.bar[name];
      const value = caseOf(row, original, `independent-holes:${kind}.${name}`, 256);
      for (const at of holes) own(value).values[at] = null;
      cases.push(value);
      const absent = caseOf(row, original, `all-absent:${kind}.${name}`, 256);
      own(absent).values.fill(null);
      cases.push(absent);
    }
    if (original.bar?.volume) {
      for (const [label, make] of [['zero', () => 0], ['alternating-zero', (i) => i % 2 ? 0 : 5],
        ['subnormal', () => Number.MIN_VALUE], ['large', () => Number.MAX_VALUE]]) {
        const value = caseOf(row, original, `volume:${label}`, 256);
        value.bar.volume.values = value.bar.volume.values.map((_v, at) => bits(make(at)));
        cases.push(value);
      }
    }
    const anchor = original.args.find((c) => c.name === 'resetWhen');
    if (anchor || original.bar?.isSessionFirst) {
      for (const label of ['never', 'every-bar', 'delayed', 'missing-anchor-source', 'missing-reset', 'clustered']) {
        const value = caseOf(row, original, `anchor:${label}`, 256);
        const target = anchor ? value.args.find((c) => c.name === 'resetWhen') : value.bar.isSessionFirst;
        target.values = target.values.map((_v, at) => label === 'never' ? false : label === 'every-bar' ? true
          : label === 'missing-reset' ? null : label === 'clustered' ? [0, 17, 18, 19, 64, 128].includes(at) : [17, 64, 128].includes(at));
        if (label === 'missing-anchor-source') {
          for (const column of value.args.filter((c) => seriesNames.has(c.name))) for (const at of [17, 64, 128]) column.values[at] = null;
        }
        cases.push(value);
      }
    }
  }
  return cases;
}
