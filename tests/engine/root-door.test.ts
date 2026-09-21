/**
 * The package root, as a host is handed it: `load` and `loadText` are both on
 * the door, and the text one refuses text that is not the canonical encoding.
 *
 * `scripts/check-entry-points.mjs` proves every entry of the export map loads
 * from an install holding nothing but the manifest and the built output, and
 * counts what each exports. What it does not ask is whether a named door is
 * there and does its job: `loadText` was written behind the engine's door and
 * exported through neither it nor the root, so a host handed the canonical
 * text of a program had no entry that required canonicity, and every check
 * passed. The wrong implementations these catch: a root that exports `load`
 * and not `loadText`; a `loadText` on the root that is some other function;
 * and a build whose root no longer carries the export the source root does.
 *
 * Two proofs. The source root is imported here, typed, and driven. The built
 * root is what a host imports, so a probe runs in a process of its own and
 * imports the file the manifest's root entry names, statically, the way a
 * consumer's bundler would.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { canonicalise } from '../../src/core/emit/index.js';
import { load, loadText } from '../../src/core/index.js';
import { compile } from './support.js';

const ROOT = new URL('../../../', import.meta.url);

/** The probe beside this test, which imports the built root by its path. */
const PROBE = fileURLToPath(new URL('../../../tests/engine/probes/built-root.mjs', import.meta.url));

/** The file the probe imports, which has to be the one the manifest's root names. */
const BUILT_ROOT = './dist/core/index.js';

const SOURCE = ['version 1', '', 'study("Door")', '', 'plot(close, "Close")'].join('\n');
const CANONICAL = canonicalise(compile('door.oscript', SOURCE).program);

/** The same program spelled with whitespace, which is not the encoding its hash names. */
const PRETTY = JSON.stringify(JSON.parse(CANONICAL), null, 2);

test('the source root exports a loadText that loads canonical text and refuses the rest', () => {
  assert.equal(typeof loadText, 'function');
  assert.equal(loadText(CANONICAL).ok, true);
  const refused = loadText(PRETTY);
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false && refused.diagnostic.code, 'OS6018');
  // The object entry stands beside it and is not held to canonicity.
  assert.equal(load(JSON.parse(PRETTY)).ok, true);
});

test('the built root the manifest names exports the same door, and it refuses non-canonical text', () => {
  const manifest = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8')) as {
    exports: Record<string, { import?: string }>;
  };
  assert.equal(manifest.exports['.']?.import, BUILT_ROOT, 'the probe imports the file the root entry names');
  // And the probe actually imports it. Comparing the manifest with a constant
  // says nothing about the file that runs: a probe pointed at a deeper door
  // passes this test while the root lacks the export it exists to find, which
  // is the one failure it is here to catch.
  assert.equal(
    readFileSync(PROBE, 'utf8').includes(BUILT_ROOT.replace('./', '')),
    true,
    `the probe does not import ${BUILT_ROOT}, so it proves nothing about the root door`,
  );
  assert.equal(
    existsSync(new URL(BUILT_ROOT, ROOT)),
    true,
    `${BUILT_ROOT} is not built, so the built root cannot be probed: run npm run build first`,
  );

  const ask = (text: string): { callable: boolean; ok: boolean | null; code: string | null } => {
    const child = spawnSync(process.execPath, [PROBE, text], { cwd: fileURLToPath(ROOT), encoding: 'utf8' });
    assert.equal(child.status, 0, `the probe did not run: ${child.stderr}`);
    return JSON.parse(child.stdout) as { callable: boolean; ok: boolean | null; code: string | null };
  };

  const accepted = ask(CANONICAL);
  assert.equal(accepted.callable, true, 'loadText is not a function on the built root');
  assert.equal(accepted.ok, true, 'the built root refused the canonical encoding');

  const refused = ask(PRETTY);
  assert.equal(refused.ok, false, 'the built root loaded text that is not the canonical encoding');
  assert.equal(refused.code, 'OS6018');
});
