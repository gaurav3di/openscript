/**
 * Modularity check: small modules, and no reaching inside one from outside.
 *
 * A compiler is the classic place where this rots. The parser grows a helper the
 * checker needs, the checker imports it directly out of the parser's internals,
 * and six months later nobody can move a file. The damage is not felt at the
 * moment it is done, which is exactly why it needs a check rather than a
 * convention.
 *
 * Three rules, each with a reason that is not tidiness.
 *
 * 1. **A module is a directory, and its index is its only door.** A file may
 *    import a sibling inside its own module freely, and may import another
 *    module only through that module's index. So a module's public surface is a
 *    single file somebody can read, and moving anything behind it breaks
 *    nothing.
 *
 * 2. **Every module has an index.** A directory without one has no declared
 *    surface, so everything in it is public by accident.
 *
 * 3. **A file has a length limit.** Not for neatness: a file that has grown past
 *    it is almost always two things that were never separated, and the moment to
 *    notice is while splitting is still cheap.
 *
 * Exceptions are recorded with a reason, in the file named below, on the same
 * terms as every other check here: the list only shrinks.
 *
 * Run: node scripts/check-modularity.mjs [--list]
 */
import { existsSync, readFileSync } from 'node:fs';
import { filesMatching, nothingFound } from './lib/files.mjs';

/**
 * Past this a file is usually two things. Generous on purpose: the number is
 * meant to catch drift, not to force a split every time something grows.
 */
const MAX_LINES = 500;

const ALLOW_PATH = 'spec/modularity-exceptions.json';

const INDEX = /(^|\/)index\.[tj]s$/;
const SOURCE = /\.(ts|tsx|js|mjs)$/;

const IMPORT =
  /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function sourceFiles() {
  return filesMatching(SOURCE, ['src']);
}

/** The module a file belongs to: its directory. */
function moduleOf(file) {
  return file.slice(0, file.lastIndexOf('/'));
}

/**
 * Resolve a relative import against the importing file, without an extension.
 *
 * The extension is dropped rather than ignored because a module specifier in
 * ECMAScript carries one: `../span/index.js` is how a file has to name its
 * neighbour's door, and comparing that against a directory name would report
 * every legal import as a reach inside.
 */
function resolve(fromFile, spec) {
  const parts = fromFile.split('/').slice(0, -1);
  for (const segment of spec.split('/')) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return parts.join('/').replace(/\.(ts|tsx|js|mjs|cjs)$/, '');
}

const allowed = existsSync(ALLOW_PATH) ? JSON.parse(readFileSync(ALLOW_PATH, 'utf8')) : {};
const longFiles = new Map((allowed.longFiles ?? []).map((e) => [e.file, e.reason]));
const deepImports = new Set((allowed.deepImports ?? []).map((e) => `${e.from} -> ${e.to}`));

const files = sourceFiles();
const modules = new Set(files.map(moduleOf));
const hasIndex = new Set(files.filter((f) => INDEX.test(f)).map(moduleOf));

const problems = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n').length;

  if (lines > MAX_LINES && !longFiles.has(file)) {
    problems.push(
      `${file}: ${lines} lines, over the ${MAX_LINES} limit. A file this long is usually two ` +
        `things that were never separated. Split it, or record it in ${ALLOW_PATH} with the reason.`,
    );
  }

  const mine = moduleOf(file);
  IMPORT.lastIndex = 0;
  let m;
  while ((m = IMPORT.exec(text)) !== null) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (!spec || !spec.startsWith('.')) continue;

    const target = resolve(file, spec);
    const targetModule = modules.has(target) ? target : moduleOf(target);

    // Inside my own module, or the module's own index: both fine.
    if (targetModule === mine || target === mine) continue;

    // Another module: only its index is a legal target.
    const isIndex = modules.has(target) || /(^|\/)index$/.test(target);
    if (!isIndex && !deepImports.has(`${file} -> ${target}`)) {
      problems.push(
        `${file}: imports "${spec}", which reaches inside the ${targetModule} module. ` +
          `Import from that module's index instead, or export it there if it is meant to be public.`,
      );
    }
  }
}

for (const dir of modules) {
  if (dir === 'src') continue;
  if (!hasIndex.has(dir)) {
    problems.push(
      `${dir}: a module with no index. Without one it has no declared surface, so everything ` +
        `inside it is public by accident.`,
    );
  }
}

if (process.argv.includes('--list')) {
  for (const p of problems) console.log(p);
  console.log(`\n${problems.length} modularity problems across ${files.length} source files.`);
  process.exit(0);
}

if (problems.length > 0) {
  for (const p of problems) console.error(p);
  console.error(
    `\n${problems.length} modularity problem${problems.length === 1 ? '' : 's'}. The damage from ` +
      `these is never felt when they are introduced, which is the whole reason this is a check.`,
  );
  process.exit(1);
}

console.log(
  files.length === 0
    ? `Modularity check: ${nothingFound('source file under src/')}. The rules are in place; nothing exercised them.`
    : `Modularity check passed: ${files.length} files in ${modules.size} modules, every cross-module ` +
        `import through an index, none over ${MAX_LINES} lines.`,
);
