/**
 * An adapter that describes itself and then never answers a case.
 *
 * A hang writes nothing, so the program suffering it cannot report it; only
 * the caller's clock can. This file is what the runner's timeout is tested
 * against, and the interval keeps the process alive until it is stopped.
 */
const [flag] = process.argv.slice(2);

if (flag === '--describe') {
  process.stdout.write(
    `${JSON.stringify({ name: 'hangs', version: '0', profile: 'strategy', languageVersions: [1], schemaVersion: '1.1' })}\n`,
  );
} else {
  setInterval(() => {}, 1000);
}
