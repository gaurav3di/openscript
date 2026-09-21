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
 * The first two rules are about `src`, because a module with a door is what
 * `src` is made of and a test directory is not.
 *
 * **The third is about every file of code this project has**, wherever it sits:
 * source, tooling, or test. It used to be about `src` alone while the
 * conventions stated it without a scope, and the gap did exactly what a gap
 * does. Four test files were over the limit, two of them written in the phase
 * that found this, and the rule everybody believed was in force was in force
 * over none of them. A document and a check that disagree are worse than either
 * alone: the document is read as a promise and the check is trusted to keep it.
 *
 * A document is not code and is not counted. A specification section runs as
 * long as the thing it specifies, and a limit on prose would be a limit on
 * saying the whole of something once.
 *
 * ## An exception is a ceiling, not a pass
 *
 * Exceptions are recorded with a reason, in the file named below, and each one
 * carries the length it was recorded at. Over that length the build fails, so a
 * file already past the limit cannot grow further while it waits to be split.
 * Under the limit the build fails too, so a row that has been earned out has to
 * be deleted rather than left behind as cover. That is what "the list only
 * shrinks" has to mean if it is to be a check rather than an intention.
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
// The second engine counts too. CLAUDE.md's rule is "no code file over 500
// lines, wherever it sits", and a rule enforced on one language and not the
// other is a rule the next long file is written in the other language.
const SOURCE = /\.(ts|tsx|js|mjs|py)$/;

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
const longFiles = new Map((allowed.longFiles ?? []).map((e) => [e.file, e]));
const deepImports = new Set((allowed.deepImports ?? []).map((e) => `${e.from} -> ${e.to}`));

const files = sourceFiles();
const codeFiles = filesMatching(SOURCE);
const modules = new Set(files.map(moduleOf));
const hasIndex = new Set(files.filter((f) => INDEX.test(f)).map(moduleOf));

const problems = [];

/** Every code file the project has, against the length limit and its ceilings. */
const measured = new Map();

for (const file of codeFiles) {
  const lines = readFileSync(file, 'utf8').split('\n').length;
  measured.set(file, lines);
  const recorded = longFiles.get(file);

  if (recorded === undefined) {
    if (lines <= MAX_LINES) continue;
    problems.push(
      `${file}: ${lines} lines, over the ${MAX_LINES} limit. A file this long is usually two ` +
        `things that were never separated. Split it, or record it in ${ALLOW_PATH} with the reason.`,
    );
    continue;
  }

  if (typeof recorded.lines !== 'number') {
    problems.push(
      `${file}: its row in ${ALLOW_PATH} states no length. An exception without one is a pass ` +
        `rather than a ceiling, and the file can then grow for ever. Record the length it is at.`,
    );
    continue;
  }
  if (lines > recorded.lines) {
    problems.push(
      `${file}: ${lines} lines, and its exception in ${ALLOW_PATH} was recorded at ` +
        `${recorded.lines}. An exception is a ceiling: a file already over the limit does not ` +
        `grow further while it waits to be split. Split it, or take the ${lines - recorded.lines} ` +
        `added line${lines - recorded.lines === 1 ? '' : 's'} back out.`,
    );
    continue;
  }
  if (lines <= MAX_LINES) {
    problems.push(
      `${file}: ${lines} lines, inside the ${MAX_LINES} limit, and still recorded in ` +
        `${ALLOW_PATH}. Delete the row: an exception nobody needs is cover for the next file ` +
        `that does, and the list only shrinks.`,
    );
  }
}

for (const [file] of longFiles) {
  if (measured.has(file)) continue;
  problems.push(
    `${ALLOW_PATH} records ${file}, which is not a code file this check reads. A row for a file ` +
      `that moved or went is an exception guarding nothing. Delete it, or correct the path.`,
  );
}

for (const file of files) {
  const text = readFileSync(file, 'utf8');
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

if (codeFiles.length === 0) {
  console.error(
    `Modularity check: ${nothingFound('code file')}. The length rule is over every file of ` +
      `code this project has, so a run that found none read nothing. Refusing to report a pass.`,
  );
  process.exit(1);
}

if (process.argv.includes('--list')) {
  for (const p of problems) console.log(p);
  console.log(
    `\n${problems.length} modularity problems across ${files.length} source files and ` +
      `${codeFiles.length} code files.`,
  );
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

const ceilings = longFiles.size;
console.log(
  files.length === 0
    ? `Modularity check: ${nothingFound('source file under src/')}. The rules are in place; nothing exercised them.`
    : `Modularity check passed: ${files.length} files in ${modules.size} modules, every cross-module ` +
        `import through an index; ${codeFiles.length} code files under the ${MAX_LINES} line limit` +
        (ceilings === 0
          ? '.'
          : `, bar ${ceilings} recorded in ${ALLOW_PATH} and held at the length each was recorded at.`),
);
