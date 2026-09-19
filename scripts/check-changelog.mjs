/**
 * A release must say what changed.
 *
 * This runs only at release, not on every commit, because between bumping a
 * version and writing its entry there is a legitimate moment where the two
 * disagree. What there is never a good reason for is a published version whose
 * changelog says nothing, and the only reliable time to catch that is the last
 * moment before it becomes permanent.
 *
 * A changelog is the one piece of documentation a consumer reads at the exact
 * moment it matters: they are deciding whether to upgrade. An entry that says
 * "various fixes" answers nothing, and a version with no entry at all tells them
 * to go and diff two tags, which they will not do. They will just not upgrade.
 *
 * Run: node scripts/check-changelog.mjs
 */
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;

let changelog;
try {
  changelog = readFileSync('CHANGELOG.md', 'utf8');
} catch {
  console.error('CHANGELOG.md is missing. A release without one asks a consumer to diff two tags.');
  process.exit(1);
}

// A heading naming this version, in any of the usual shapes.
const heading = new RegExp(`^#{1,3}\\s*\\[?v?${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]?`, 'm');
const match = heading.exec(changelog);

if (!match) {
  console.error(
    `CHANGELOG.md has no entry for ${version}.\n` +
      'Add one before releasing. A consumer reads the changelog at the one moment it ' +
      'matters to them, which is while deciding whether to upgrade.',
  );
  process.exit(1);
}

// An entry that exists but says nothing is the same failure wearing a heading.
const after = changelog.slice(match.index + match[0].length);
const body = after.split(/^#{1,3}\s/m)[0];
const words = body.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);

const MIN_WORDS = 12;
if (words.length < MIN_WORDS) {
  console.error(
    `CHANGELOG.md has a heading for ${version} but only ${words.length} words under it.\n` +
      `Say what changed and why it matters to somebody deciding whether to upgrade. ` +
      `"Various fixes" answers nothing.`,
  );
  process.exit(1);
}

console.log(`Changelog check passed: ${version} has an entry of ${words.length} words.`);
