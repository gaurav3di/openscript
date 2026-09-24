/**
 * An adapter that answers with whatever the case expects.
 *
 * Asked for a case result it claims a pass without computing anything, and
 * asked for its actual output it reads `expected.json` and hands it back. That
 * is the engine `conformance.md` section 10 warns about: one that matches the
 * expected file by construction, so that two adapters both reporting `pass`
 * prove nothing. The runner's second mode exists to catch it, and the test
 * that drives this file is the one that shows it does.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readExpectedCsv } from '../../../scripts/lib/case-values.mjs';

const [flag, directory] = process.argv.slice(2);

const write = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

if (flag === '--describe') {
  write({ name: 'echo', version: '0', profile: 'strategy', languageVersions: [1], schemaVersion: '1.1' });
} else if (flag === '--actual') {
  const declared = JSON.parse(readFileSync(join(directory, 'case.json'), 'utf8'));
  const json = join(directory, 'expected.json');
  const expected = existsSync(json) ? JSON.parse(readFileSync(json, 'utf8')) : {};
  const channels = {};
  for (const channel of declared.asserts) channels[channel] = expected[channel];
  // Section 4 puts the values channel in expected.csv. Each cell is echoed as
  // the value it spells, which is what an engine that computed it would answer.
  if (declared.asserts.includes('values')) {
    const read = readExpectedCsv(readFileSync(join(directory, 'expected.csv'), 'utf8'));
    const spelled = (cell) =>
      cell === '' || cell === 'none' ? null : cell === 'true' ? true : cell === 'false' ? false
        : /^[+-]?[0-9.]+(?:[eE][+-]?[0-9]+)?$/.test(cell) ? Number(cell) : cell;
    channels.values = read.rows.map((row) => Object.fromEntries(read.columns.map((name, at) => [name, spelled(row[at])])));
  }
  write({ id: declared.id, channels, unsupported: [] });
} else {
  const declared = JSON.parse(readFileSync(join(flag, 'case.json'), 'utf8'));
  write({ id: declared.id, outcome: 'pass' });
}
