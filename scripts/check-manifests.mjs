/**
 * Manifest check: the two engines hold the same library, or say which part not.
 *
 * Both engines run one compiled program, and a program names every library call
 * it makes in `lib.functions`, which an engine holds against its own manifest at
 * load (`compiled-program.md` 9.4 step 6). A call one engine holds and the other
 * does not is a program the first runs and the second refuses with OS6004. That
 * is honest on the day it happens and invisible until then: issue 0020 found the
 * second engine had no array calls and no `print` only because a case happened
 * to reach them, while the gate that compares the engines was green.
 *
 * So the manifests are compared on every build. The first engine's is read from
 * its built library; the second's is asked of the second engine itself, through
 * `engine/tools/manifest.py`, because a list of what it holds written down here
 * would be a copy of a fact that one of the two would stop matching.
 *
 * `spec/engine-gaps.json` records every entry the second engine lacks, each with
 * its reason, and the check fails on a gap it does not record, on a recorded gap
 * that has closed, and on a row with no reason. An entry the second engine holds
 * and the first does not fails outright: the first engine is the reference, and
 * a call only the second answers is a call nothing checks it against.
 *
 * Run: node scripts/check-manifests.mjs
 * Needs `npm run build` first, and a Python interpreter.
 */
import { existsSync, readFileSync } from 'node:fs';
import { LIBRARY_MODULE, fromRoot } from './lib/built.mjs';
import { ask, findInterpreter } from './lib/interpreter.mjs';

const RECORD = 'spec/engine-gaps.json';
const TOOL = 'engine/tools/manifest.py';

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(fromRoot(LIBRARY_MODULE))) {
  fail(`${fromRoot(LIBRARY_MODULE)} is not built. Run \`npm run build\` first.`);
}

const found = findInterpreter();
if (found.refusal !== undefined) fail(found.refusal);

const first = new Set((await import(LIBRARY_MODULE)).manifestKeys());
const asked = ask(found.command, TOOL);
if (asked.error || asked.status !== 0) {
  fail(`${TOOL} did not answer under ${found.command}:\n${asked.stderr}`);
}
const second = new Set(JSON.parse(asked.stdout));
const record = JSON.parse(readFileSync(RECORD, 'utf8'));
const recorded = new Map((record.missing ?? []).map((one) => [one.entry, one.reason ?? '']));

const problems = [];
for (const entry of [...first].sort()) {
  if (second.has(entry)) continue;
  if (!recorded.has(entry)) {
    problems.push(
      `the first engine holds ${entry} and the second does not, and ${RECORD} does not record it. ` +
        'Implement it in the second engine, or record the gap with its reason.',
    );
  }
}
for (const [entry, reason] of recorded) {
  if (!first.has(entry)) problems.push(`${RECORD} records ${entry}, which the first engine does not hold either.`);
  else if (second.has(entry)) problems.push(`${RECORD} records ${entry} as missing and the second engine holds it now. Delete the row.`);
  if (reason.trim().length < 20) problems.push(`${RECORD} records ${entry} with no reason worth the name.`);
}
for (const entry of [...second].sort()) {
  if (!first.has(entry)) {
    problems.push(
      `the second engine holds ${entry} and the first does not. The first engine is the reference, ` +
        'so a call only the second answers is a call nothing is checked against.',
    );
  }
}

if (problems.length > 0) {
  fail(`Manifest check failed with ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n- ${problems.join('\n- ')}`);
}

console.log(
  `Manifest check passed: the first engine holds ${first.size} library entries and the second ` +
    `${second.size}, asked of each engine rather than listed here, and every one of the ` +
    `${recorded.size} the second lacks is recorded in ${RECORD} with its reason.`,
);
