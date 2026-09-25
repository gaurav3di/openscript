/** Exact row comparison. Diagnostic labels never waive a differing bit. */
import { encode, fromBits } from './protocol.mjs';

const missing = { unreached: true };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const cellAt = (rows, bar, column) => rows[bar]?.[column] === undefined ? missing : rows[bar][column];

function distance(a, b) {
  if (!a?.bits || !b?.bits || !Number.isFinite(fromBits(a.bits)) || !Number.isFinite(fromBits(b.bits))) return null;
  const ordered = (value) => {
    const n = BigInt(`0x${value}`);
    return n >> 63n ? ~n & ((1n << 64n) - 1n) : n | (1n << 63n);
  };
  const delta = ordered(a.bits) - ordered(b.bits);
  return String(delta < 0n ? -delta : delta);
}

function counts(rows) {
  const tally = { cells: 0, none: 0, finite: 0, bool: 0, nonfinite: 0, unexpected: 0, negativeZero: 0 };
  for (const row of rows) for (const cell of row) {
    tally.cells++;
    if (cell === null) tally.none++;
    else if (typeof cell === 'boolean') tally.bool++;
    else if (cell?.bits && Number.isFinite(fromBits(cell.bits))) {
      tally.finite++;
      if (cell.bits === '8000000000000000') tally.negativeZero++;
    } else if (cell?.bits || cell?.nonfinite) tally.nonfinite++;
    else tally.unexpected++;
  }
  return tally;
}

function expectedFailures(c, record, rows, engine, reason) {
  const failures = [];
  for (let bar = 0; bar < c.bars; bar++) for (let column = 0; column < c.outputColumns; column++) {
    const wanted = rows[bar][column];
    const actual = cellAt(record.rows, bar, column);
    if (!same(wanted, actual)) failures.push({ bar, column, expected: wanted, actual });
  }
  return failures.length ? { id: c.id, key: c.key, engine, reason, differences: failures } : null;
}

function baselineRows(c) {
  return Array.from({ length: c.bars }, (_, bar) => c.expected.map((column) => {
    const value = column.values[bar];
    return value === null ? null : column.kind === 'number' ? { bits: value } : value;
  }));
}

export function compareResults(cases, javascript, python, scope) {
  if (javascript.length !== cases.length || python.length !== cases.length) throw new Error('protocol: result count differs');
  const differences = [], failures = [], oracleFailures = [], baselineFailures = [], caseSummaries = [];
  for (const [index, c] of cases.entries()) {
    const js = javascript[index], py = python[index];
    if (js.id !== c.id || py.id !== c.id || js.key !== c.key || py.key !== c.key) {
      throw new Error(`protocol: result identity differs at case ${index}`);
    }
    const changed = [];
    for (let bar = 0; bar < Math.max(c.bars, js.rows.length, py.rows.length); bar++) {
      const width = Math.max(c.outputColumns, js.rows[bar]?.length ?? 0, py.rows[bar]?.length ?? 0);
      for (let column = 0; column < width; column++) {
        const a = cellAt(js.rows, bar, column), b = cellAt(py.rows, bar, column);
        if (!same(a, b)) changed.push({ bar, column, javascript: a, python: b, ulps: distance(a, b) });
      }
    }
    const classification = scope.platformDiagnostics.includes(c.key) ? 'platform-diagnostic' : 'deterministic';
    if (changed.length) differences.push({ id: c.id, key: c.key, classification, differences: changed });
    const tallies = {};
    for (const [engine, record] of [['javascript', js], ['python', py]]) {
      const tally = counts(record.rows);
      tallies[engine] = tally;
      if (record.exception !== null) failures.push({ id: c.id, engine, kind: 'exception', detail: record.exception });
      if (record.rows.length !== c.bars || record.rows.some((row) => row.length !== c.outputColumns)) {
        failures.push({ id: c.id, engine, kind: 'shape', expectedRows: c.bars, expectedColumns: c.outputColumns,
          actualRows: record.rows.length, widths: [...new Set(record.rows.map((row) => row.length))] });
      }
      if (tally.nonfinite || tally.unexpected || tally.negativeZero) failures.push({ id: c.id, engine, kind: 'invalid-output', counts: tally });
      if (c.oracle) {
        const failure = expectedFailures(c, record, c.oracle.expected.map((row) => row.map(encode)), engine, c.oracle.reason);
        if (failure) oracleFailures.push(failure);
      }
      if (c.expected) {
        const failure = expectedFailures(c, record, baselineRows(c), engine, 'Committed baseline vector');
        if (failure) baselineFailures.push(failure);
      }
    }
    caseSummaries.push({ id: c.id, key: c.key, scenario: c.scenario ?? 'oracle', bars: c.bars,
      outputColumns: c.outputColumns, ...tallies, differingCells: changed.length,
      firstDifference: changed[0] ?? null, javascriptException: js.exception, pythonException: py.exception });
  }
  const byFunction = scope.keys.map((key) => {
    const records = caseSummaries.filter((record) => record.key === key);
    return { key, cases: records.length, bars: records.reduce((total, row) => total + row.bars, 0),
      differingCells: records.reduce((total, row) => total + row.differingCells, 0),
      differingCases: records.filter((row) => row.differingCells).length };
  });
  const outputCounts = {};
  for (const engine of ['javascript', 'python']) {
    outputCounts[engine] = caseSummaries.reduce((total, row) => {
      for (const [key, value] of Object.entries(row[engine])) total[key] = (total[key] ?? 0) + value;
      return total;
    }, {});
  }
  const platform = differences.filter((row) => row.classification === 'platform-diagnostic');
  let maximumUlps = 0n;
  for (const row of platform) for (const cell of row.differences) {
    if (cell.ulps !== null && BigInt(cell.ulps) > maximumUlps) maximumUlps = BigInt(cell.ulps);
  }
  return { schemaVersion: 1, exactAgreement: !differences.length && !failures.length && !oracleFailures.length && !baselineFailures.length,
    counts: { cases: cases.length, bars: cases.reduce((total, c) => total + c.bars, 0),
      baselineCases: cases.filter((c) => c.expected).length, oracleCases: cases.filter((c) => c.oracle).length,
      differingCases: differences.length, differingCells: differences.reduce((total, c) => total + c.differences.length, 0),
      deterministicDifferenceCases: differences.length - platform.length, platformDiagnosticCases: platform.length },
    platformDiagnostics: { keys: scope.platformDiagnostics, maximumObservedUlps: String(maximumUlps), classificationOnly: true },
    outputCounts, byFunction, caseSummaries, differences, failures, oracleFailures, baselineFailures };
}
