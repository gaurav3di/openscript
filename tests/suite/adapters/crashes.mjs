/**
 * An adapter that describes itself and then dies on every case.
 *
 * A process that dies takes any partial document with it, so a crash is
 * reported by the caller and not by the program: section 9's reason for
 * invoking an adapter once per case rather than once for the suite.
 */
const [flag] = process.argv.slice(2);

if (flag === '--describe') {
  process.stdout.write(
    `${JSON.stringify({ name: 'crashes', version: '0', profile: 'strategy', languageVersions: [1], schemaVersion: '1.1' })}\n`,
  );
} else {
  console.error('crashes: the engine fell over');
  process.exit(3);
}
