/**
 * The suite revision of `conformance.md` section 11: which cases a result was
 * made against, in a form anybody holding those cases can recompute.
 *
 * The package version alone named a release and not a suite. Cases are added
 * between releases, so two runs a month apart carried one revision and meant two
 * different suites, and a badge naming that revision named neither. The digest
 * is taken over every file under the suite root, so a result names exactly the
 * cases it was run against, and a copy of the suite that differs by one byte
 * has a different revision rather than borrowing this one's.
 *
 * **The spelling is the page's, and this is its only implementation.** Section
 * 11 fixes it: the package version, a plus sign, and the first twelve
 * hexadecimal digits of a SHA-256 over the files in sorted path order, each
 * contributing its path relative to the root with forward slashes, a zero
 * byte, its length in bytes written in decimal, a zero byte, and its bytes.
 * The length is there so that no file's bytes can be mistaken for the next
 * file's path.
 *
 * A digest is tooling and not the language, so this uses the runtime's own hash
 * rather than the one the compiler carries for a program's source.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** How many hexadecimal digits of the digest a revision carries. */
export const DIGITS = 12;

/** A revision as section 11 spells it, for a reader to hold a document to. */
export const REVISION_PATTERN = new RegExp(`^[^\\s+]+\\+[0-9a-f]{${DIGITS}}$`);

/** Every file under the root, as paths relative to it with forward slashes, sorted by code unit. */
export function suiteFiles(root) {
  const out = [];
  const walk = (relative) => {
    const entries = readdirSync(relative === '' ? root : join(root, relative), { withFileTypes: true });
    for (const entry of entries) {
      const path = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else out.push(path);
    }
  };
  walk('');
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The digest of the files under the root, in full. */
export function suiteDigest(root) {
  const hash = createHash('sha256');
  const zero = Buffer.from([0]);
  for (const path of suiteFiles(root)) {
    const bytes = readFileSync(join(root, ...path.split('/')));
    hash.update(Buffer.from(path, 'utf8'));
    hash.update(zero);
    hash.update(Buffer.from(String(bytes.length), 'utf8'));
    hash.update(zero);
    hash.update(bytes);
  }
  return hash.digest('hex');
}

/** The revision of the suite under the root, released with this package version. */
export function suiteRevision(root, version) {
  return `${version}+${suiteDigest(root).slice(0, DIGITS)}`;
}
