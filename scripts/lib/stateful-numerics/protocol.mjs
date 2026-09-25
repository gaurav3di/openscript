/** Finite inputs and lossless output cells shared by the audit drivers. */
const hex = /^[0-9a-f]{16}$/;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value, names) => object(value) && Object.keys(value).every((key) => names.includes(key));
const fail = (area, text) => { throw new Error(`${area}: ${text}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function bits(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeDoubleBE(value);
  return buffer.toString('hex');
}

export const fromBits = (value) => Buffer.from(value, 'hex').readDoubleBE(0);
export const decode = (column, at) => column.values[at] === null || column.kind !== 'number'
  ? column.values[at] : fromBits(column.values[at]);

export function encode(value) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? { bits: bits(value) } : { nonfinite: String(value) };
  return { unexpectedType: typeof value, value: String(value) };
}

export function validateScope(scope) {
  if (!fields(scope, ['schemaVersion', 'keys', 'platformDiagnostics']) || scope.schemaVersion !== 1
      || !Array.isArray(scope.keys) || scope.keys.length === 0 || !Array.isArray(scope.platformDiagnostics)) {
    fail('scope', 'expected schemaVersion 1, nonempty keys and platformDiagnostics only');
  }
  const keys = scope.keys;
  if (keys.some((key) => typeof key !== 'string' || !/^[A-Za-z][A-Za-z0-9]*\/[0-9]+$/.test(key))
      || new Set(keys).size !== keys.length || !same([...keys].sort(), keys)) {
    fail('scope', 'keys must be sorted unique name/arity strings');
  }
  const diagnostics = scope.platformDiagnostics;
  if (diagnostics.some((key) => !keys.includes(key)) || new Set(diagnostics).size !== diagnostics.length) {
    fail('scope', 'platformDiagnostics must contain unique known keys');
  }
  return scope;
}

export function assertDenominator(scope, indexed, javascript, python, exercised) {
  validateScope(scope);
  for (const [name, keys] of Object.entries({ indexed, javascript, python, exercised })) {
    if (!Array.isArray(keys) || !same([...keys].sort(), scope.keys)) {
      const actual = Array.isArray(keys) ? keys : [];
      const missing = scope.keys.filter((key) => !actual.includes(key));
      const extra = actual.filter((key) => !scope.keys.includes(key));
      const duplicates = actual.filter((key, at) => actual.indexOf(key) !== at);
      fail('denominator', `${name} keys differ: ${JSON.stringify({ missing, extra, duplicates })}`);
    }
  }
}

function validateColumn(column, bars, location) {
  if (!object(column) || !['number', 'bool', 'string', 'none'].includes(column.kind)
      || !Array.isArray(column.values) || column.values.length !== bars) {
    fail('case', `${location} must be a typed column aligned to bars`);
  }
  for (const value of column.values) {
    if (value === null) continue;
    if (column.kind === 'number' && typeof value === 'string' && hex.test(value) && Number.isFinite(fromBits(value))) continue;
    if (column.kind === 'bool' && typeof value === 'boolean') continue;
    if (column.kind === 'string' && typeof value === 'string') continue;
    fail('case', `${location} has an invalid or nonfinite cell`);
  }
}

export function validateCases(cases, keys) {
  if (!Array.isArray(cases) || cases.length === 0) fail('case', 'the corpus must be nonempty');
  const seen = new Set();
  for (const c of cases) {
    if (!object(c) || typeof c.id !== 'string' || c.id.length === 0 || seen.has(c.id)
        || c.key !== `${c.name}/${c.arity}` || !keys.includes(c.key) || !Number.isSafeInteger(c.arity)
        || c.arity < 0 || !Number.isSafeInteger(c.bars) || c.bars < 1 || c.bars > 512
        || !Number.isSafeInteger(c.outputColumns) || c.outputColumns < 1
        || !Array.isArray(c.args) || c.args.length !== c.arity || (c.bar !== undefined && !object(c.bar))) {
      fail('case', `invalid identity, size or arguments for ${c?.id ?? 'unknown'}`);
    }
    seen.add(c.id);
    for (const [index, column] of c.args.entries()) validateColumn(column, c.bars, `${c.id}.args[${index}]`);
    for (const [name, column] of Object.entries(c.bar ?? {})) validateColumn(column, c.bars, `${c.id}.bar.${name}`);
    if (c.host !== undefined) {
      if (!object(c.host)) fail('case', `${c.id}.host must be an object`);
      for (const value of Object.values(c.host)) {
        if (value !== null && (typeof value !== 'string' || !hex.test(value) || !Number.isFinite(fromBits(value)))) {
          fail('case', `${c.id}.host contains invalid bits`);
        }
      }
    }
    if (c.expected !== undefined) {
      if (!Array.isArray(c.expected) || c.expected.length !== c.outputColumns) fail('case', `${c.id} baseline width differs`);
      c.expected.forEach((column) => validateColumn(column, c.bars, `${c.id}.expected`));
    }
    if (c.oracle !== undefined) {
      const oracle = c.oracle;
      if (!fields(oracle, ['expected', 'reason']) || typeof oracle.reason !== 'string' || !oracle.reason.trim()
          || !Array.isArray(oracle.expected) || oracle.expected.length !== c.bars
          || oracle.expected.some((row) => !Array.isArray(row) || row.length !== c.outputColumns
            || row.some((value) => value !== null && typeof value !== 'boolean'
              && (typeof value !== 'number' || !Number.isFinite(value))))) {
        fail('case', `${c.id} needs a reason and aligned finite oracle rows`);
      }
    }
  }
}

function validCell(cell) {
  if (cell === null || typeof cell === 'boolean') return true;
  if (fields(cell, ['bits']) && Object.hasOwn(cell, 'bits')) return typeof cell.bits === 'string' && hex.test(cell.bits);
  if (fields(cell, ['nonfinite']) && Object.hasOwn(cell, 'nonfinite')) return ['Infinity', '-Infinity', 'NaN'].includes(cell.nonfinite);
  return fields(cell, ['unexpectedType', 'value']) && typeof cell.unexpectedType === 'string' && typeof cell.value === 'string';
}

export function parseResults(text, cases) {
  let records;
  try { records = text.trim().split(/\r?\n/).map((line) => JSON.parse(line)); }
  catch { fail('protocol', 'driver output must contain one JSON record per case'); }
  if (records.length !== cases.length) fail('protocol', 'driver record count differs from input');
  for (const [at, record] of records.entries()) {
    if (!fields(record, ['id', 'key', 'rows', 'exception']) || record.id !== cases[at].id || record.key !== cases[at].key
        || !Array.isArray(record.rows) || record.rows.some((row) => !Array.isArray(row) || row.some((cell) => !validCell(cell)))) {
      fail('protocol', `invalid identity or cells at record ${at}`);
    }
    const error = record.exception;
    if (error !== null && (!fields(error, ['bar', 'type', 'message', 'traceback'])
        || !Number.isSafeInteger(error.bar) || error.bar < 0 || error.bar >= cases[at].bars
        || typeof error.type !== 'string' || typeof error.message !== 'string'
        || (error.traceback !== undefined && typeof error.traceback !== 'string'))) {
      fail('protocol', `invalid exception at record ${at}`);
    }
  }
  return records;
}
