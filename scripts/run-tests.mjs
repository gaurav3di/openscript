/**
 * Runs the compiled unit tests.
 *
 * This exists because of a version skew that cost a failed release. The test
 * script passed a glob to `node --test`, which expands it on a recent runtime
 * and treats it as a literal path on an older one. It worked on the machine it
 * was written on and failed in continuous integration, where the runtime is
 * pinned lower on purpose, and it failed at the one moment it mattered: a
 * release that had already passed every other gate.
 *
 * So discovery happens here, in code, with the filesystem. No glob, no shell
 * quoting, no assumption about which runtime expands what. The same files are
 * found on every platform and every version, and a failure is a real failure
 * rather than a difference of opinion about a string.
 *
 * Run: node scripts/run-tests.mjs
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'dist-test/tests';

/** Every compiled test file under a directory. */
function testFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) testFiles(full, out);
    else if (entry.name.endsWith('.test.js')) out.push(full);
  }
  return out;
}

const files = testFiles(ROOT);

// Finding nothing is a failure, not a pass. A suite that silently runs zero
// tests reports success, which is the most expensive green there is: the checks
// in this repository already had that bug once, in a different form.
if (files.length === 0) {
  console.error(
    `No test files under ${ROOT}. Either the build did not run or the tests moved.\n` +
      'Refusing to report success for a suite that ran nothing.',
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
