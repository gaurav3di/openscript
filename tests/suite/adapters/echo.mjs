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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [flag, directory] = process.argv.slice(2);

const write = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

if (flag === '--describe') {
  write({ name: 'echo', version: '0', profile: 'strategy', languageVersions: [1], schemaVersion: '1.1' });
} else if (flag === '--actual') {
  const declared = JSON.parse(readFileSync(join(directory, 'case.json'), 'utf8'));
  const expected = JSON.parse(readFileSync(join(directory, 'expected.json'), 'utf8'));
  const channels = {};
  for (const channel of declared.asserts) channels[channel] = expected[channel];
  write({ id: declared.id, channels, unsupported: [] });
} else {
  const declared = JSON.parse(readFileSync(join(flag, 'case.json'), 'utf8'));
  write({ id: declared.id, outcome: 'pass' });
}
