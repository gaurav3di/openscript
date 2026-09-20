/**
 * The file list every check reads from.
 *
 * This exists because of a real failure, and the failure is worth keeping in
 * front of whoever reads this next. Three checks listed their files with
 * `git ls-files`, which lists **tracked** files only. Phase 1 landed 78 source
 * files, none of them committed yet, and all three checks inspected zero of them
 * and printed that they had passed. The suite said "no source files yet" against
 * a tree with 78. Three rules the project calls non-negotiable were, for a day,
 * enforced by nothing.
 *
 * A check that silently inspects nothing is worse than no check, because it
 * produces the evidence of safety without the safety. And the moment it does
 * this is precisely the moment it was needed: new code, not yet committed, is
 * exactly what a rule is for.
 *
 * So the listing is here, once, and every check uses it. `--cached --others
 * --exclude-standard` is tracked files plus untracked ones, with anything
 * gitignored left out, which is "every file that is really part of this project"
 * and is the question a check actually wants answered.
 *
 * It is a shared module rather than a copied function for the same reason: the
 * bug was fixed in one check before the others, and a copy is how a fix stops
 * halfway.
 */
import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

/**
 * Every file in the project: tracked or not, gitignored never.
 *
 * `-z` and the null split because a path may contain anything, and a filename
 * with a newline in it would otherwise split into two paths that do not exist.
 */
export function projectFiles() {
  const listed = execSync('git ls-files --cached --others --exclude-standard -z', {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .map((s) => s.trim())
    .filter(Boolean);

  // Plus everything under src/, gitignored or not.
  //
  // This is the same class of gap as the one this module was written for, found
  // again in a new place. The generated error catalogue is gitignored, so two
  // source files carrying every diagnostic message in the language were
  // inspected by nothing, and the checks reported "50 source files" against a
  // tree holding 52.
  //
  // A generated file still ships, still has to obey the layering, still must not
  // exceed the size limit and still must not name anybody. "Not in version
  // control" is the wrong reason to skip a file that ends up in the artifact.
  //
  // The lesson the first bug should have taught and did not: a check's blind
  // spot is wherever its file list disagrees with what actually ships.
  return Array.from(new Set([...listed, ...walk('src')])).sort();
}

/**
 * Every file under a directory, sorted, ignoring version control entirely.
 *
 * `projectFiles` is the right list for anything that is part of the project as
 * written. This is for the one thing that is not: built output, which is
 * gitignored by design and is also what a consumer actually installs, so a check
 * that only ever reads the source has the same blind spot twice over.
 */
export function filesUnder(dir) {
  return walk(dir).sort();
}

/** Every file under a directory, ignoring version control entirely. */
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

/** Those matching `pattern`, optionally restricted to the given top directories. */
export function filesMatching(pattern, roots) {
  return projectFiles().filter(
    (f) => pattern.test(f) && (!roots || roots.some((d) => f === d || f.startsWith(d + '/'))),
  );
}

/**
 * What a check prints when it found nothing to inspect.
 *
 * Never say "none exist". Say that none were found, which is a statement about
 * the check rather than about the tree, and is the sentence that would have made
 * the original failure obvious the first time anybody read the output.
 */
export function nothingFound(what) {
  return `no ${what} matched, so this check inspected nothing`;
}
