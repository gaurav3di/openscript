/**
 * An adapter that claims the narrowest profile and can answer no case.
 *
 * Every case in the suite is outside `core`, so a runner that reads profiles
 * the way section 8 says never hands this file a case. One that does gets an
 * exit code that is not zero and a reason on standard error, which the runner
 * then has to report as an error rather than as anything the test expects.
 */
const [flag] = process.argv.slice(2);

if (flag === '--describe') {
  process.stdout.write(
    `${JSON.stringify({ name: 'narrow', version: '0', profile: 'core', languageVersions: [1], schemaVersion: '1.1' })}\n`,
  );
} else {
  console.error('narrow was handed a case outside its profile');
  process.exit(3);
}
