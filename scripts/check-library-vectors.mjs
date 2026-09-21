/**
 * The library vectors, held to the engine that wrote them.
 *
 * `spec/vectors/library/` is what the second engine's author loads to know
 * their arithmetic is this engine's to the last bit, and a vector file is worth
 * exactly as much as the claim that this engine still produces it. A directory
 * of bit patterns written once and never regenerated would go on reading as
 * the library's arithmetic after the arithmetic changed, and an engine written
 * against it would agree with a version of this one that no longer exists.
 *
 * So the vectors are regenerated on every run of the gate and compared with
 * the committed copy byte for byte, the way `check-reproducible.mjs` holds a
 * run to its own record and `harvest-cases.mjs --check` holds a case to the
 * run that wrote it. Three things fail it, each named in the report:
 *
 * - **A file whose bytes differ**, which is the arithmetic having changed, or
 *   the fixture, or the generator. Any of the three is a change to what a
 *   second engine is measured against, and it is committed on purpose by
 *   running the generator, never absorbed.
 * - **A function in the manifest with no vector file.** The generator writes
 *   one file per arithmetic entry it finds, so an entry the manifest gained
 *   is a file the directory lacks until somebody regenerates.
 * - **A vector file with no manifest function.** An entry the manifest lost
 *   leaves a file behind that describes a function no engine can call.
 *
 * A change to the vectors is a change to what a second engine is held to, and
 * `spec/decisions.md` 56 says what a regeneration has to be accompanied by.
 *
 * ## What the comparison is proved able to do first
 *
 * The comparison is handed four fabricated pairs every run: two identical
 * trees, which it must pass, and one of each defect above, which it must
 * refuse. A check whose rule can no longer match reports a clean directory,
 * which this repository has had four times, and a comparison that passed two
 * trees that differ would be the fifth.
 *
 * ## What this does not prove
 *
 * That a second engine reproduces the vectors, which is Phase 6, and that the
 * cases marked as reaching a gap of `stdlib.md` 20.11 are arithmetic any
 * document fixes: they are this engine's and are written down as such. The
 * manifest entries the generator does not reach are counted and named here,
 * with the reason, on every run.
 *
 * Run: node scripts/check-library-vectors.mjs [--list]
 * Needs `npm run build` and `npm run build:test` first, for the reason the
 * generator does.
 */
import { readFileSync } from 'node:fs';
import { filesUnder, nothingFound } from './lib/files.mjs';
import { INDEX_FILE, VECTORS_DIR, generateLibraryVectors } from './generate-library-vectors.mjs';

const GENERATOR = 'scripts/generate-library-vectors.mjs';
const LIST = process.argv.includes('--list');

function refuse(message) {
  console.error(message);
  process.exit(1);
}

// ---------------------------------------------------------- the comparison

/**
 * Every way the committed directory and a fresh generation disagree.
 *
 * Both are maps from a path to its bytes. The generated side is what the
 * manifest produces, so a path only there is a manifest function with no file
 * and a path only in the directory is a file with no manifest function.
 */
export function driftBetween(committed, generated) {
  const problems = [];
  for (const [path, text] of generated) {
    const held = committed.get(path);
    if (held === undefined) {
      problems.push(
        `${path}: the manifest produces this file and the directory does not hold it. A function ` +
          `with no vector file is one a second engine cannot check itself against.`,
      );
    } else if (!held.equals(Buffer.from(text, 'utf8'))) {
      problems.push(
        `${path}: the committed bytes differ from what the engine produces now. The arithmetic, the ` +
          `fixture or the generator changed, and what a second engine is measured against changed with it.`,
      );
    }
  }
  for (const path of committed.keys()) {
    if (!generated.has(path)) {
      problems.push(
        `${path}: the directory holds this file and no manifest function produces it. It describes a ` +
          `function no engine can call, and a reader has no way to tell it from one that exists.`,
      );
    }
  }
  return problems.sort();
}

/** The comparison, given the four pairs it must answer, every run. */
function selfTest() {
  const bytes = (text) => Buffer.from(text, 'utf8');
  const generated = new Map([[`${VECTORS_DIR}/a-1.json`, 'a'], [`${VECTORS_DIR}/${INDEX_FILE}`, 'i']]);
  const same = new Map([[`${VECTORS_DIR}/a-1.json`, bytes('a')], [`${VECTORS_DIR}/${INDEX_FILE}`, bytes('i')]]);
  const drifted = new Map([[`${VECTORS_DIR}/a-1.json`, bytes('b')], [`${VECTORS_DIR}/${INDEX_FILE}`, bytes('i')]]);
  const missing = new Map([[`${VECTORS_DIR}/${INDEX_FILE}`, bytes('i')]]);
  const stray = new Map([...same, [`${VECTORS_DIR}/b-1.json`, bytes('b')]]);

  const pairs = [
    { committed: same, refusals: 0, what: 'two identical trees' },
    { committed: drifted, refusals: 1, what: 'a file whose bytes differ' },
    { committed: missing, refusals: 1, what: 'a manifest function with no file' },
    { committed: stray, refusals: 1, what: 'a file no manifest function produces' },
  ];
  const broken = pairs
    .map((pair) => ({ ...pair, found: driftBetween(pair.committed, generated).length }))
    .filter((pair) => pair.found !== pair.refusals);
  if (broken.length === 0) return pairs.length;
  refuse(
    'The comparison in this file no longer does what it says:\n' +
      broken.map((pair) => `  ${pair.what}: ${pair.found} refused, ${pair.refusals} expected`).join('\n') +
      '\n\nA comparison that cannot refuse is a clean directory and an empty promise.',
  );
  return 0;
}

// ------------------------------------------------------------------- the run

const probed = selfTest();

const made = await generateLibraryVectors();
if (made.functions.length === 0) refuse(nothingFound('arithmetic function in the library manifest'));

const committed = new Map(filesUnder(VECTORS_DIR).map((path) => [path, readFileSync(path)]));
if (committed.size === 0) {
  refuse(
    `${nothingFound(`file under ${VECTORS_DIR}/`)}. Run node ${GENERATOR} and commit what it writes: ` +
      'a directory that is not there is every function of the manifest with no vector file.',
  );
}

const problems = driftBetween(committed, made.files);

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(
    `\n${problems.length} problem${problems.length === 1 ? '' : 's'} with ${VECTORS_DIR}/. A vector ` +
      'file the engine no longer produces is a bit pattern a second engine will be written to match ' +
      `and this one will not. If the change is meant, run node ${GENERATOR}, read the diff, and commit ` +
      'it with the change to the arithmetic that caused it.',
  );
  process.exit(1);
}

const marked = made.functions.filter((one) => one.gaps.length > 0);
const skipped = made.notReached.reduce((sum, group) => sum + group.functions.length, 0);
const names = (list) => list.map((one) => `${one.name}/${one.arity}`).join(', ');

console.log(
  `Library vectors check passed: ${made.functions.length} functions of the manifest, ${made.cases} ` +
    `cases over the ${made.bars} bars of the fixture, regenerated and identical byte for byte to the ` +
    `${committed.size} files under ${VECTORS_DIR}/, one per function and the index. The comparison ` +
    `was handed ${probed} fabricated pairs first and refused the three it had to.`,
);
console.log(
  `\n${marked.length} functions have a case that reaches a gap of stdlib.md 20.11 (${made.gapRows} gaps ` +
    `read), marked in the index and in the case, because a second engine is not held to them: ` +
    `${names(marked)}.`,
);
console.log(
  `\n${skipped} manifest entries in ${made.notReached.length} groups hold no arithmetic and have no ` +
    `vector, named in the index with the reason${LIST ? '' : ' (--list prints them)'}:`,
);
for (const group of made.notReached) {
  console.log(`  ${group.functions.length}: ${group.why}${LIST ? `\n      ${group.functions.join(', ')}` : ''}`);
}
console.log(
  '\nWhat this does not prove: that a second engine reproduces these vectors, which is Phase 6. It ' +
    'proves that this engine still does.',
);
