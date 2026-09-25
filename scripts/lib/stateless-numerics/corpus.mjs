/** The scalar audit's fixed edge grid and committed ordinary baselines. */
import { bits } from '../stateful-numerics/index.mjs';

export function indexedNumericalKeys(indexed) {
  return indexed.filter((row) => !row.state).map((row) => `${row.name}/${row.arity}`).sort();
}

function edgeValues() {
  const values = [null, -0, 0, Number.MIN_VALUE, -Number.MIN_VALUE, 2 ** -1022, -(2 ** -1022),
    0.1, -0.1, 0.5, -0.5, 1, -1, 1 + Number.EPSILON, 2, -2, 3, -3, Math.PI, -Math.PI,
    10, -10, 709, 710, -745, -746, 1e20, -1e20, 1e100, -1e100, 1e308, -1e308,
    Number.MAX_VALUE, -Number.MAX_VALUE, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER];
  let seed = 27092026;
  for (let at = 0; at < 200; at++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    values.push((seed / 2 ** 32 - 0.5) * (at % 2 ? 100 : 1));
  }
  return values;
}

const column = (values, name) => ({ ...(name === undefined ? {} : { name }), kind: 'number',
  values: values.map((value) => value === null ? null : bits(value)) });

function edgesFor(key, edges) {
  const [name, size] = key.split('/'), arity = Number(size);
  const args = Array.from({ length: arity }, (_v, arg) => column(edges.map((value, at) => {
    if (name === 'round' && arity === 2 && arg === 1) return at % 16;
    if (name === 'clamp' && arg > 0) return arg === 1 ? -100 : 100;
    return arg === 0 ? value : edges[(at * 7 + arg * 13) % edges.length];
  }), `arg${arg}`));
  return { id: `${key}:numeric-edges`, key, name, arity, bars: edges.length, outputColumns: 1,
    scenario: 'numeric-edges', args, host: { tickSize: bits(0.05) }, bar: {
      high: column(edges), low: column(edges.map((value) => value === null ? null : -Math.abs(value))),
      previousClose: column(edges.map((_value, at) => edges[(at + 1) % edges.length])),
    } };
}

export function buildStatelessCorpus(indexed, readVector, keys) {
  const cases = [];
  for (const row of indexed.filter((entry) => !entry.state)) {
    const vector = readVector(row.file);
    if (!Array.isArray(vector.cases) || !vector.cases.length) throw new Error(`case: missing stateless vectors for ${row.file}`);
    for (const original of vector.cases) {
      const item = structuredClone(original);
      Object.assign(item, { id: `${row.name}/${row.arity}:baseline:${original.id}`, key: `${row.name}/${row.arity}`,
        name: row.name, arity: row.arity, scenario: `baseline:${original.id}`, outputColumns: item.outputs.length,
        expected: item.outputs });
      delete item.outputs;
      cases.push(item);
    }
  }
  const edges = edgeValues();
  return [...cases, ...keys.map((key) => edgesFor(key, edges))];
}
