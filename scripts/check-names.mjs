/**
 * Independence check.
 *
 * OpenScript names no other product, platform or company anywhere: not in
 * source, not in comments, not in documentation, not in commit messages. The
 * project is an independent language, and a file that leans on somebody else's
 * name to explain itself is a file that has not explained itself.
 *
 * The denylist is stored encoded rather than in plain text, because a checker
 * that spells out the very words it forbids would be the one file in the
 * repository breaking the rule it exists to enforce.
 *
 * Run: node scripts/check-names.mjs [--staged]
 * Exit code 1 on any hit, with the file, line and column of each one.
 */
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const ENCODED = [
  'dHJhZGluZ3ZpZXc=', 'cGluZXNjcmlwdA==', 'cGluZSBzY3JpcHQ=', 'cGluZS1zY3JpcHQ=',
  'cGluZXRz', 'cGluZSB0cw==', 'bHV4YWxnbw==', 'bXVsdGljaGFydHM=',
  'dHJhZGVzdGF0aW9u', 'ZWFzeWxhbmd1YWdl', 'cG93ZXJsYW5ndWFnZQ==', 'bmluamF0cmFkZXI=',
  'YW1pYnJva2Vy', 'bWV0YXRyYWRlcg==', 'dGhpbmtvcnN3aW0=', 'c2llcnJhIGNoYXJ0',
  'cXVhbnRjb25uZWN0', 'dmVsYQ==',
];

const terms = ENCODED.map((e) => Buffer.from(e, 'base64').toString('utf8'));

// Word boundaries on both ends, and a run of whitespace or a hyphen where the
// term has a space, so a name split across a line wrap is still caught. Without
// the boundaries an ordinary English word that happens to contain a short term
// as a substring would fail the build.
const patterns = terms.map(
  (t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&').replace(/ /g, '[\\s-]+')}\\b`, 'i'),
);

const BINARY = /\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|pdf|zip|gz|mp4|wasm)$/i;
const SKIP_DIRS = /(^|\/)(node_modules|dist|build|coverage|\.git)(\/|$)/;

function listFiles() {
  const staged = process.argv.includes('--staged');
  const cmd = staged
    ? 'git diff --cached --name-only --diff-filter=ACMR'
    : 'git ls-files';
  return execSync(cmd, { encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => !BINARY.test(f) && !SKIP_DIRS.test(f))
    // This file holds the denylist by definition.
    .filter((f) => f !== 'scripts/check-names.mjs');
}

let hits = 0;

for (const file of listFiles()) {
  let text;
  try {
    if (statSync(file).size > 4_000_000) continue;
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const re of patterns) {
      const m = re.exec(lines[i]);
      if (m) {
        hits++;
        console.error(
          `${file}:${i + 1}:${m.index + 1}: names another product or company. ` +
            `Describe it generically instead.`,
        );
      }
    }
  }
}

if (hits > 0) {
  console.error(
    `\n${hits} reference${hits === 1 ? '' : 's'} to name. OpenScript is an independent ` +
      `language and explains itself without pointing at anyone else.`,
  );
  process.exit(1);
}

console.log('Independence check passed: no outside product or company named.');
