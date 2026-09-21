/**
 * This engine's conformance adapter: the program `conformance.md` section 9
 * says an implementation ships.
 *
 * Three invocations, each writing one JSON object to standard output and
 * exiting 0, so a runner in any language can drive it:
 *
 *     node scripts/adapter.mjs --describe
 *     node scripts/adapter.mjs <case-directory>
 *     node scripts/adapter.mjs --actual <case-directory>
 *
 * The first is the engine's identity, which only the engine knows. The second
 * is one case result, the object the result document's `cases` array holds.
 * The third is what the engine computed for the channels the case asserts and
 * no comparison, which section 10 needs to compare two engines exactly.
 *
 * ## What it loads and what it reads
 *
 * The built package, by its door: `dist/core/index.js` and nothing behind it,
 * because that door is what a host is handed and an adapter that reached past
 * it would be measuring something no host can run. So `npm run build` first,
 * and a missing build is refused by name rather than run around.
 *
 * A case directory is read by the names section 2's table gives its files,
 * read out of that page, and a file the table does not name is refused: it is
 * not input. The comparison is section 6's, in `lib/compare.mjs`, which the
 * runner shares. Everything about the engine's answer, including what it
 * cannot answer and why, is in `lib/adapter-case.mjs`.
 *
 * ## Why it exits 0 on a failing case
 *
 * Section 9: the outcome is in the object, and the runner holds the clock and
 * the child process, so a non-zero exit is the one thing left to mean a crash.
 * An invocation that is not one of the three is refused with a non-zero exit,
 * because nothing it could write would be a case result.
 *
 * Run from the repository root, which is where the page and the build are.
 */
import { existsSync, readFileSync } from 'node:fs';
import { caseAnswer, caseResult } from './lib/adapter-case.mjs';
import { CORE_MODULE, fromRoot } from './lib/built.mjs';
import {
  barsHeader,
  caseFileMatcher,
  caseFileNames,
  channelNames,
  conformancePage,
  toleranceCaps,
} from './lib/conformance-page.mjs';
import { frontEndWith } from './lib/example-run.mjs';

const DESCRIBE = '--describe';
const ACTUAL = '--actual';

/** Section 8: what this engine claims. It compiles, runs, places orders and reports. */
const PROFILE = 'strategy';

/** Where the engine's name and version are written once. */
const PACKAGE = new URL('../package.json', import.meta.url);

/** The page whose section 2 names the files and section 6 caps the bounds. */
const PAGE = 'spec/conformance.md';

function refuse(message) {
  console.error(message);
  process.exit(1);
}

const arguments_ = process.argv.slice(2);
const mode =
  arguments_.length === 1 && arguments_[0] === DESCRIBE ? 'describe'
  : arguments_.length === 2 && arguments_[0] === ACTUAL ? 'actual'
  : arguments_.length === 1 && !arguments_[0].startsWith('--') ? 'case'
  : null;
if (mode === null) {
  refuse(
    'Usage: node scripts/adapter.mjs --describe | <case-directory> | --actual <case-directory>\n' +
      'conformance.md section 9 gives an adapter these three invocations and no other.',
  );
}

if (!existsSync(fromRoot(CORE_MODULE))) {
  refuse(
    `${fromRoot(CORE_MODULE)} is not built, so this adapter has no engine to answer with.\n` +
      'Run `npm run build` first. The adapter loads the package by its door rather than reading ' +
      'its source, because the door is what a host is handed.',
  );
}

const core = await import(CORE_MODULE);

// ------------------------------------------------------------- the page's lists

const page = conformancePage();
const fileNames = caseFileNames(page);
const channels = channelNames(page);
const header = barsHeader(page);
const caps = toleranceCaps(page);
for (const [name, value] of [
  ['section 2\'s table of case files', fileNames],
  ['section 2\'s list of channels a case may assert', channels],
  ['section 3\'s bars.csv header', header],
  ['section 6\'s tolerance caps', caps],
]) {
  if (value !== null) continue;
  refuse(
    `${PAGE} no longer prints ${name} in the form this adapter reads, so it cannot say what a ` +
      'case directory may hold or how a value is compared. Read the page against lib/conformance-page.mjs.',
  );
}

const engine = {
  core,
  compile: frontEndWith(core, core),
  page,
  caps,
  vocabulary: { isCaseFile: caseFileMatcher(fileNames), channels, barsHeader: header },
};

// ------------------------------------------------------------------ the answer

/** One JSON object on standard output, through the repository's canonical writer. */
function emit(value) {
  process.stdout.write(`${core.canonicalise(value)}\n`);
}

if (mode === 'describe') {
  const manifest = JSON.parse(readFileSync(PACKAGE, 'utf8'));
  emit({
    name: manifest.name,
    version: manifest.version,
    profile: PROFILE,
    languageVersions: [...core.LANGUAGE_VERSIONS],
    // The compiled program format this engine implements (compiled-program.md
    // section 9), which is the schema an engine is written against. Section 9
    // of conformance.md names the field and fixes no meaning for it.
    schemaVersion: core.COMPILED_FORMAT_VERSION,
  });
} else if (mode === 'actual') {
  const answer = caseAnswer(arguments_[1], engine);
  if (answer.error !== undefined) emit({ id: answer.id, error: answer.error });
  else emit({ id: answer.id, channels: answer.channels, unsupported: answer.unsupported });
} else {
  emit(caseResult(arguments_[0], engine));
}
