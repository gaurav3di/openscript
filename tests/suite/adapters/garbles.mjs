/**
 * An adapter that exits 0 and writes something that is not one JSON object.
 *
 * The one failure a clean exit code hides. A runner that trusted the exit
 * code would count this as whatever it guessed, so the test holds it to the
 * error outcome with the reason naming what was written.
 */
const [flag] = process.argv.slice(2);

if (flag === '--describe') {
  process.stdout.write(
    `${JSON.stringify({ name: 'garbles', version: '0', profile: 'strategy', languageVersions: [1], schemaVersion: '1.1' })}\n`,
  );
} else {
  process.stdout.write('outcome: pass\n');
}
