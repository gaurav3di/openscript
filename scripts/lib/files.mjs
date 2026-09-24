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
 * ## Why version control is not asked any more
 *
 * That first fix asked version control a better question: tracked files plus
 * untracked ones, with anything ignored left out. It was still the wrong
 * question, and it produced the same failure twice more.
 *
 * The generated error catalogue is ignored, so two source files carrying every
 * diagnostic message in the language were inspected by nothing, and the checks
 * reported "50 source files" against a tree holding 52. That was patched by
 * walking `src` as well. Then a file under an ignored directory was inspected by
 * nobody again, because the list was a version control query plus a walk of the
 * three directories somebody had remembered, and a bare generator in such a file
 * passed every check in the repository.
 *
 * Four times now. The shape of the bug does not change: **whatever is not in the
 * list is enforced by nothing, and asking version control produces a list whose
 * contents are decided by a file nobody reads when they add a check.** Being
 * ignored by version control says where a file came from. It says nothing about
 * whether a rule applies to it, and a generated, built or scratch file runs
 * exactly as well as a committed one.
 *
 * So the tree is walked. Everything in it is in the list, and the only things
 * left out are named below, in the open, with the reason. A check that wants
 * less asks for less, by matching a pattern or naming its directories.
 *
 * Every check that uses this says in its output how many files it read, so that
 * a number which drops is something somebody sees rather than something they
 * have to suspect.
 */
import { existsSync, readdirSync } from 'node:fs';

/**
 * Not this project, at any depth.
 *
 * The dependency tree belongs to whoever wrote it and is not subject to rules
 * about how this project is written, and version control's own store is not
 * source at all. Both are enormous, and reading either would make every check
 * too slow to run, which is its own way of turning a check off.
 *
 * `__pycache__` is the third for a different reason, and the reason matters
 * because the rule these checks enforce is that nothing goes unread. It holds
 * the interpreter's own bytecode for the Python files beside it, written the
 * moment the engine is imported and derived from source this walk does read.
 * Reading it would add nothing: it is binary, it is generated, and every rule
 * that could apply to it applies to the `.py` file it came from. Leaving it in
 * was worse than useless: the second engine's own documented command wrote 40
 * of them and the next `npm test` refused the tree, so the gate failed for
 * having been used.
 */
export const NOT_THE_PROJECT = new Set(['.git', 'node_modules', '__pycache__']);

/**
 * Whether a directory below the root is a checkout of its own.
 *
 * A directory holding its own `.git`, a directory for a clone and a file for a
 * second working copy of this repository, is another tree: version control will
 * not commit its files into this one, so no rule of this project can be broken
 * there that reaches a release. Walking it was not harmless either. A second
 * working copy kept inside this one, which is how a branch is worked on beside
 * another, made every check read the project twice and fail the copy against
 * ceilings recorded by path for the original.
 */
export function isAnotherCheckout(dir) {
  return dir !== '' && existsSync(`${dir}/.git`);
}

/**
 * Built output, which is the project's but is built rather than written.
 *
 * Left out of this list and walked by name instead, by the checks that want it:
 * the no-eval check reads it because it is what a runtime really executes, and
 * refuses to pass if it is not there. The rules about how a file is written
 * apply to the file somebody wrote, not to the compiler's rendering of it.
 */
export const BUILT_OUTPUT = new Set(['dist', 'dist-test']);

/**
 * Every file in the project: written or generated, committed or not.
 *
 * Sorted, so two runs and two machines produce the same order and a report can
 * be compared with the one before it.
 */
export function projectFiles() {
  return walk('', []).sort();
}

/**
 * Every file under one directory, sorted, whatever version control thinks of it.
 *
 * For the one thing `projectFiles` leaves out: built output, which is also what
 * a consumer installs, so a check that only ever read the source would have the
 * same blind spot from the other side.
 */
export function filesUnder(dir) {
  return walk(dir, []).sort();
}

/** Every file under a directory, with the named exclusions and any nested checkout left out. */
function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir === '' ? '.' : dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = dir === '' ? entry.name : `${dir}/${entry.name}`;
    if (!entry.isDirectory()) {
      out.push(full);
      continue;
    }
    if (NOT_THE_PROJECT.has(entry.name)) continue;
    if (dir === '' && BUILT_OUTPUT.has(entry.name)) continue;
    if (isAnotherCheckout(full)) continue;
    walk(full, out);
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
