/**
 * Removes the files in a build's output that no source produces any more.
 *
 * A compiler writes what its sources emit and leaves everything else where it
 * is, so a file whose source was renamed or deleted stays in the output for as
 * long as nobody looks. This repository had one: `dist` carried a module from a
 * layout two refactors old, compiled from a source that no longer existed, and
 * `package.json` lists `dist` in `files`, so it was published.
 *
 * That is worse than clutter. A stale module is real code with a real name that
 * a consumer can import, and it does what the source did before it was deleted.
 * Nothing in the repository explains it, nothing tests it, and every check that
 * reads the built output, the no-eval check among them, reports on it as though
 * it were part of the package, which it is.
 *
 * ## Why it is not `rm -rf` on the directory
 *
 * Emptying the output would be shorter and would also be a lie about what the
 * step is for. The rule is that every file in the output is one a source makes,
 * and a step that states the rule can say which files broke it; a step that
 * deletes everything says nothing and cannot be wrong, which also means it can
 * never tell you anything. It leaves the output missing for as long as the
 * compiler takes, which is long enough for anything else reading it to fail.
 *
 * ## Where it gets the directories
 *
 * From the compiler's own configuration: `outDir` is the output and `rootDir` is
 * what the source paths are relative to. Written here instead, they would be a
 * second copy of two facts that already have a home, and a project whose output
 * moved would clean the wrong directory while reporting success.
 *
 * Run: node scripts/clean-output.mjs tsconfig.json
 *      node scripts/clean-output.mjs tsconfig.test.json
 */
import { existsSync, readFileSync, readdirSync, rmSync, rmdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * The configurations this may clean, by name.
 *
 * A script that deletes files takes its target from a command line, which is the
 * one input nothing else in this repository checks. So the target is matched
 * against this list rather than resolved, and a typo, a variable that expanded
 * to nothing, and a path that climbs out of the project all fail the same way,
 * which is by deleting nothing.
 */
const CONFIGURATIONS = new Set(['tsconfig.json', 'tsconfig.test.json']);

/**
 * What the compiler emits for one source file, longest suffix first so that
 * `.d.ts.map` is not read as a file named `.d` with a `.ts.map` after it.
 */
const EMITTED = ['.d.ts.map', '.d.ts', '.js.map', '.js'];

/** What a source is spelled with. */
const SOURCES = ['.ts', '.tsx'];

const named = process.argv.slice(2);

if (named.length === 0) {
  console.error(
    `Nothing to clean. Name the compiler configuration whose output to tidy, one of: ${[
      ...CONFIGURATIONS,
    ].join(', ')}.\nRefusing to guess, because the guess would be a directory to delete from.`,
  );
  process.exit(1);
}

for (const name of named) {
  if (CONFIGURATIONS.has(name)) continue;
  console.error(
    `${name} is not a configuration this may clean. The list is: ${[...CONFIGURATIONS].join(', ')}.\n` +
      'Add it there, in the open, rather than passing a path this script has never seen.',
  );
  process.exit(1);
}

/** `outDir` and `rootDir`, following `extends` so an override wins over its base. */
function settingsOf(name, seen = new Set()) {
  if (seen.has(name)) {
    console.error(`${name} extends itself, so it states no output directory.`);
    process.exit(1);
  }
  seen.add(name);

  const config = JSON.parse(readFileSync(name, 'utf8'));
  const options = config.compilerOptions ?? {};
  const base =
    typeof config.extends === 'string'
      ? settingsOf(join(dirname(name), config.extends), seen)
      : { outDir: undefined, rootDir: undefined };

  return {
    outDir: options.outDir ?? base.outDir,
    rootDir: options.rootDir ?? base.rootDir,
  };
}

/** Every file under a directory, deepest last, ignoring version control. */
function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** The source path an emitted file came from, or nothing when it is not an emit. */
function sourceOf(relative, rootDir) {
  const suffix = EMITTED.find((end) => relative.endsWith(end));
  if (suffix === undefined) return undefined;
  const stem = relative.slice(0, -suffix.length);
  const under = rootDir === '.' || rootDir === undefined ? stem : `${rootDir}/${stem}`;
  return SOURCES.map((end) => `${under}${end}`);
}

/** Directories left holding nothing, removed from the deepest upwards. */
function pruneEmpty(dir, root) {
  let here = dir;
  while (here.startsWith(root) && here !== root) {
    try {
      rmdirSync(here);
    } catch {
      return;
    }
    here = here.slice(0, here.lastIndexOf('/'));
  }
}

let removed = 0;

for (const name of named) {
  const { outDir, rootDir } = settingsOf(name);
  if (typeof outDir !== 'string') {
    console.error(`${name} names no outDir, so there is no output to clean.`);
    process.exit(1);
  }

  const stale = [];
  for (const file of walk(outDir)) {
    const relative = file.slice(outDir.length + 1);
    const sources = sourceOf(relative, rootDir);
    // A file the compiler does not emit, or one whose source has gone: either
    // way nothing in this repository makes it, and nothing here explains it.
    if (sources !== undefined && sources.some((source) => existsSync(source))) continue;
    stale.push(file);
  }

  for (const file of stale) {
    rmSync(file, { force: true });
    pruneEmpty(dirname(file).split('\\').join('/'), outDir);
    console.log(`Removed ${file}: no source makes it.`);
  }
  removed += stale.length;
}

console.log(
  removed === 0
    ? `Output is clean: every file under ${named.join(' and ')}'s outDir is one a source makes.`
    : `${removed} file${removed === 1 ? '' : 's'} removed that no source makes.`,
);
