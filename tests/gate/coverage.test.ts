/**
 * The gate covers its own scripts, and says so out of the directory.
 *
 * Both halves of the phase gate work the same way: a directory of scripts, and
 * a suite that names one, runs it and compares every surface against a
 * reference transcribed beside the test. Nothing joined the two. The scripts
 * were a directory listing and the comparisons were a set of files, and the
 * only thing that made them the same set was that somebody had written them in
 * the same afternoon.
 *
 * So a script could be added and never compared, and a comparison could be
 * deleted with its script left behind, and in both cases the suite stays green
 * and the number in the gate stays right. The gate reads "one hundred studies
 * reproduced, each matching its reference exactly", and that sentence is a claim
 * about a set, which is exactly the thing nothing measured.
 *
 * This test measures it. It reads the two script directories and the two suites
 * that compare them, and refuses three things:
 *
 * - **a script no comparison names**, which is the failure that reads as a pass:
 *   the file is in the repository, it counts towards the hundred, and nothing
 *   ever runs it;
 * - **a name no script answers**, which is a comparison quietly renamed or a
 *   script deleted out from under one;
 * - **a suite that found nothing to read**, because a coverage test that
 *   compared two empty sets would agree with itself for ever.
 *
 * A name counts as compared when it appears as a written-down string in the
 * half's own tests. Not at a call site: two suites here already loop over a list
 * of names and call the harness with the loop variable, which is the right way
 * to write those tests, and a rule that demanded a literal in the brackets would
 * push them into a worse shape to satisfy a check. The property that matters is
 * that the name is written in the suite at all, because that is the thing that
 * disappears when a comparison is deleted.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { GATE_ROOT } from './support.js';

const SCRIPT = '.oscript';
const SUITE = '.test.ts';

/** Every quoted string in a file, which is where a script is named. */
const QUOTED = /'([^'\n]*)'|"([^"\n]*)"/g;

/**
 * A script handed to one of the two harnesses by name, where the name is
 * written in the brackets rather than passed in from a list above.
 */
const CALLED =
  /\b(?:runStudy|loadStudy|compileStudy|studySource|loadGate|compileGate|plotsOf|gateSource)\s*\(\s*(?:'([^'\n]*)'|"([^"\n]*)")/g;

interface Half {
  /** What this half of the gate is, for a failure that names it. */
  readonly what: string;
  /** Where its scripts live, and where its comparisons live. */
  readonly scripts: string;
  readonly suite: string;
  /** The fewest scripts this half may hold, which is its own gate. */
  readonly least: number;
}

/**
 * The two halves, and the floor under each.
 *
 * The floor is the phase gate itself: `ROADMAP.md` Phase 2 names five studies
 * matched to the last decimal, and Phase 3 names one hundred. A count that
 * drops below one of those has not failed a test, it has failed the phase, and
 * the suite should say so in those words rather than pass with less.
 */
const HALVES: readonly Half[] = [
  {
    what: "the Phase 2 gate's studies",
    scripts: 'tests/gate/scripts/',
    suite: 'tests/gate/',
    least: 5,
  },
  {
    what: "the Phase 3 gate's studies",
    scripts: 'tests/gate/studies/scripts/',
    suite: 'tests/gate/studies/',
    least: 100,
  },
];

function entriesOf(directory: string): readonly string[] {
  return readdirSync(new URL(directory, GATE_ROOT), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

/** The scripts one half holds, by the name a comparison would call them. */
function scriptsOf(half: Half): readonly string[] {
  const entries = entriesOf(half.scripts);
  const strays = entries.filter((name) => !name.endsWith(SCRIPT));
  assert.deepEqual(
    strays,
    [],
    `${half.scripts} holds ${strays.join(', ')}, which is not a script. Every file in a ` +
      `script directory is one the gate can run, or the count the gate quotes is not a count ` +
      `of anything.`,
  );
  return entries.map((name) => name.slice(0, -SCRIPT.length)).sort();
}

/** Every name written down in one half's comparisons. */
function namedBy(half: Half): ReadonlySet<string> {
  const files = entriesOf(half.suite).filter((name) => name.endsWith(SUITE));
  assert.notEqual(
    files.length,
    0,
    `${half.suite} holds no ${SUITE} file, so this check compared a directory against nothing. ` +
      `A coverage test that reads no tests agrees with itself for ever.`,
  );

  const named = new Set<string>();
  for (const file of files) {
    const text = readFileSync(new URL(file, new URL(half.suite, GATE_ROOT)), 'utf8');
    QUOTED.lastIndex = 0;
    let found;
    while ((found = QUOTED.exec(text)) !== null) {
      const value = found[1] ?? found[2];
      if (value !== undefined && value.length > 0) named.add(value);
    }
  }
  return named;
}

/** Every script named in the brackets of a harness call, with its file. */
function calledIn(half: Half): readonly { file: string; name: string }[] {
  const out: { file: string; name: string }[] = [];
  for (const file of entriesOf(half.suite).filter((name) => name.endsWith(SUITE))) {
    const text = readFileSync(new URL(file, new URL(half.suite, GATE_ROOT)), 'utf8');
    CALLED.lastIndex = 0;
    let found;
    while ((found = CALLED.exec(text)) !== null) {
      const name = found[1] ?? found[2];
      if (name !== undefined) out.push({ file, name });
    }
  }
  return out;
}

for (const half of HALVES) {
  test(`every one of ${half.what} is named by a comparison, and every comparison by a script`, () => {
    const scripts = scriptsOf(half);
    const named = namedBy(half);

    assert.equal(
      scripts.length >= half.least,
      true,
      `${half.scripts} holds ${scripts.length} scripts and the phase gate is ${half.least}. ` +
        `A gate quotes a number, so the number has to be countable from the tree.`,
    );

    const uncompared = scripts.filter((name) => !named.has(name));
    assert.deepEqual(
      uncompared,
      [],
      `${half.scripts} holds ${uncompared.length} script(s) no test in ${half.suite} names: ` +
        `${uncompared.join(', ')}. A script nothing runs still counts towards the number the ` +
        `gate quotes, which is the one failure this suite exists to make impossible. Compare ` +
        `it, or delete it and say the smaller number.`,
    );

    // The same rule read backwards, over the call sites rather than over every
    // quoted word: a name handed to the harness that no script answers. It
    // would fail anyway, as a file that could not be read partway through a
    // run, and this says it at the listing instead, with the file it is in.
    const held = new Set(scripts);
    const unanswered = calledIn(half).filter((call) => !held.has(call.name));
    assert.deepEqual(
      unanswered.map((call) => `${call.file}: ${call.name}`),
      [],
      `a comparison in ${half.suite} runs a script that ${half.scripts} does not hold. Either ` +
        `the script was renamed or deleted and the comparison was left behind, or the name is ` +
        `a typo that would have been a missing file halfway through the run.`,
    );
  });
}
