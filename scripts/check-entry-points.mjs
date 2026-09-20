/**
 * Entry point check: every door the package declares opens, from an install that
 * holds nothing but the manifest and the built output.
 *
 * `README.md` says of the export map that its entries resolve "from an install
 * holding nothing but the manifest and the built output". That was a sentence in
 * a document, which is worth the attention of whoever reads it next, and there
 * are three ways for it to stop being true without anybody noticing here:
 *
 * 1. **A path that does not exist.** An entry point is resolved by a consumer's
 *    bundler and not by our build, so a tier renamed or a declaration file that
 *    the build stopped emitting fails at their run time and passes every test we
 *    have.
 * 2. **A file that ships and a file that does not.** The `files` list decides
 *    what goes in the tarball. An entry pointing at something outside it
 *    resolves perfectly in this repository, where the whole tree is present, and
 *    not at all once installed.
 * 3. **A peer dependency that is not optional after all.** Both adapters declare
 *    the outside world they target and neither imports it, which is what lets a
 *    platform take the language without the chart and without the editor. An
 *    import added anywhere behind an entry point turns that into a broken
 *    install for everybody who has not got that package.
 *
 * So this builds the install. A temporary directory gets a package holding
 * exactly what `files` would ship, no `node_modules` beside it and no package of
 * any kind installed, and a probe there imports every entry the export map
 * declares. The third failure above is the one this catches that nothing else
 * can: in that directory there is no editor and no chart to be found, so an
 * adapter that reached for one fails to load.
 *
 * Run: node scripts/check-entry-points.mjs
 * Needs `npm run build` first: it imports the built output rather than reading it.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { refusingArgs, refusingEnv } from './lib/runtime.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'package.json');

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const problems = [];

/**
 * The entries the export map declares, as a specifier and the two paths it
 * promises.
 *
 * `./package.json` is a file rather than a module and is checked as one: a
 * consumer reading the version out of it is a real thing to do and it is in the
 * map for that reason.
 */
function entriesOf(exportMap) {
  const found = [];
  for (const [specifier, target] of Object.entries(exportMap ?? {})) {
    if (typeof target === 'string') {
      found.push({ specifier, file: target, types: undefined, importable: false });
      continue;
    }
    found.push({
      specifier,
      file: target.import,
      types: target.types,
      importable: true,
    });
  }
  return found;
}

const entries = entriesOf(manifest.exports);

if (entries.length === 0) {
  console.error(
    'The export map declares no entry points, so this check inspected nothing. A package with ' +
      'no doors is one nobody can import, and a check that reports success over an empty list ' +
      'is the most expensive green there is.',
  );
  process.exit(1);
}

// The tarball, as `files` describes it. A path that is not there is not a
// failure of this check: `files` may name something a build produces later.
const shipped = manifest.files ?? [];
const install = mkdtempSync(join(tmpdir(), 'openscript-entry-'));
const packageDir = join(install, 'node_modules', manifest.name);

try {
  for (const path of shipped) {
    const from = join(ROOT, path);
    if (!existsSync(from)) continue;
    cpSync(from, join(packageDir, path), { recursive: true });
  }
  cpSync(MANIFEST, join(packageDir, 'package.json'));

  for (const entry of entries) {
    if (entry.file === undefined) {
      problems.push(`${entry.specifier}: the export map gives it no "import" path.`);
      continue;
    }
    if (!existsSync(join(packageDir, entry.file))) {
      problems.push(
        `${entry.specifier}: "${entry.file}" is not in an install built from "files", so the ` +
          'entry resolves here and not once installed.',
      );
    }
    if (entry.types !== undefined && !existsSync(join(packageDir, entry.types))) {
      problems.push(
        `${entry.specifier}: "${entry.types}" is not in an install built from "files", so a ` +
          'consumer writing TypeScript gets an untyped import of a typed package.',
      );
    }
  }

  // The probe runs inside the install, so every specifier below is resolved the
  // way a consumer's would be: through node_modules, with nothing else there.
  const importable = entries.filter((one) => one.importable);
  const probe = [
    'const names = [];',
    ...importable.map(
      (one) =>
        `names.push(Object.keys(await import(${JSON.stringify(
          one.specifier.replace(/^\./, manifest.name),
        )})).length);`,
    ),
    'console.log(JSON.stringify(names));',
  ].join('\n');

  writeFileSync(join(install, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
  writeFileSync(join(install, 'probe.mjs'), probe, 'utf8');

  const run = spawnSync(
    process.execPath,
    [...refusingArgs(), join(install, 'probe.mjs')],
    { cwd: install, encoding: 'utf8', env: refusingEnv() },
  );

  if (run.status !== 0) {
    problems.push(
      'An entry point did not load from an install holding nothing but the manifest and the ' +
        `built output:\n${run.stderr.trim()}`,
    );
  } else {
    const counts = JSON.parse(run.stdout.trim());
    importable.forEach((one, index) => {
      if ((counts[index] ?? 0) === 0) {
        problems.push(
          `${one.specifier}: loaded and exported nothing, which is an entry point that resolves ` +
            'to a module with no surface.',
        );
      }
    });
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(`${problem}\n`);
    console.error(
      `${problems.length} entry point problem${problems.length === 1 ? '' : 's'}. Every one of ` +
        'them is an install that fails at a consumer\'s run time while passing every other check ' +
        'here.',
    );
    process.exit(1);
  }

  console.log(
    `Entry point check passed: ${entries.length} entries in the export map, ` +
      `${importable.length} of them imported from a temporary install built from "files" alone ` +
      `(${shipped.join(', ')}), with no package of any kind beside them. That last part is what ` +
      'says the chart and the editor are peer dependencies in fact and not only in the manifest: ' +
      'neither adapter could have loaded if it imported one.',
  );
} finally {
  rmSync(install, { recursive: true, force: true });
}
