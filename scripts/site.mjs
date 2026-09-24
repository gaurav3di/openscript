/**
 * Writes the documentation site into `site/`.
 *
 * The pages are built by `lib/site/build.mjs` from `docs/`, `spec/` and
 * `spec/errors.json`, the same function `check-site.mjs` builds and proves, and
 * written here as they are. Every address in them is relative, so the directory
 * can be served from anywhere, copied into another application's static files,
 * or opened straight from disk. `docs/integrating/the-documentation-site.md`
 * says how.
 *
 * The directory is emptied first, so a page whose document was deleted does not
 * outlive it. It is ignored by version control and left out of the walk every
 * check makes: it is built output, and each file it is built from is read by
 * those checks at its source.
 *
 * The site is written even when the rules find a problem, so the page can be
 * opened and looked at, and the run then exits 1 with the problems listed.
 *
 * Run: node scripts/site.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectFiles } from './lib/files.mjs';
import { buildSite } from './lib/site/build.mjs';
import { CATALOGUE } from './lib/site/codes.mjs';
import { HOME, repositoryOf } from './lib/site/sources.mjs';
import { verifySite } from './lib/site/verify.mjs';

/** The repository's root, so the site lands in one place whatever directory this is run from. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'site';

process.chdir(ROOT);

const catalogue = JSON.parse(readFileSync(CATALOGUE, 'utf8'));
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const repository = repositoryOf(projectFiles(), (path) => readFileSync(path));
const built = buildSite(repository, catalogue, version);

rmSync(OUT, { recursive: true, force: true });
for (const [path, file] of built.files) {
  const target = join(OUT, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, file.content);
}

const problems = [
  ...built.problems,
  ...verifySite(built.files, catalogue.entries.map((entry) => entry.code)).problems,
];
console.log(`Wrote ${built.files.size} files to ${OUT}/. Open ${OUT}/${HOME}, or serve the directory from anywhere.`);
if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'} on the site. npm run check:site says the same.`);
  process.exit(1);
}
