/**
 * The no-eval check: what it enforces, which is less than it used to claim.
 *
 * ## Read this before quoting this check at anybody
 *
 * Two claims live in this repository, they are different sizes, and the larger
 * one must not be allowed to cover the smaller. This file is the smaller one.
 *
 * **The shipped engine cannot build code out of text.** Nothing under `src` may
 * import a module from the runtime's own namespace, so the package a platform
 * installs cannot reach a virtual machine, a worker or a child process at all:
 * not by a spelling this scan missed, and not by one nobody has thought of yet.
 * It is unreachable by construction rather than unmatched by a pattern. The two
 * names that remain, the string evaluator and the function builder, are refused
 * outright by the runtime setting an adopter turns on. That claim is enforced by
 * `check-layering.mjs`, which has refused those imports since before the first
 * source file existed, and by the adopter's own process.
 *
 * **This repository's tooling is a separate and weaker question, and it is the
 * one this file answers.** It reads every file the project holds and reports a
 * form before anybody runs it. It is a scan, it has been beaten four times, and
 * it will be beaten again. It is a first line, not a guarantee.
 *
 * ## What the setting this runs under actually does
 *
 * It refuses two names, wherever a code path really executes and however they
 * were spelled. It does not close a virtual machine module, a data URL import,
 * a module assembled from bytes or a child process handed source text, all of
 * which were measured running under it. `lib/runtime.mjs` has the measurement.
 * So neither this scan nor that setting may say that a generator cannot run
 * here. What can be said is what is written above, and it is stronger.
 *
 * ## Why the scan stays
 *
 * **It answers the other half.** It reads every file, including the ones nothing
 * executes and the branches no test reaches, and it catches a form before
 * anybody runs it rather than when somebody does. A generator on an unreached
 * branch throws for whoever reaches it first, which may be a consumer.
 *
 * **Read this before widening a pattern here.** This file scanned source text
 * for a construct, and it was got past in four consecutive rounds: seven ways,
 * then five, then three more, then a live generator planted in the test runner
 * itself, which executed on every run while this printed that nothing here
 * builds code out of text. Each round was answered with wider patterns and each
 * wider set was beaten. A watched name can be spelled arbitrarily many ways, and
 * a list of spellings only ever has to be beaten once more, so scanning text was
 * never going to be the enforcement.
 *
 * Rule one of this project is that nothing here builds code out of text. Under
 * it the compiler emits data, so the language runs inside an application whose
 * content security policy refuses code built from text, and a platform can run
 * many customers' scripts in one process with an instruction budget the engine
 * really owns rather than hopes for. A single generated function anywhere in
 * what ships makes every one of those sentences false, quietly, with the whole
 * suite still green.
 *
 * ## The check is attacked before it is trusted, and then attacked again
 *
 * The first version of this file was got past seven ways by the first reviewer
 * who tried. The second version was got past five more, which is the more
 * useful number, because the first round had already been answered with five
 * patterns and the second round did not need a new spelling to get in. It
 * needed three things the corpus could not express:
 *
 * 1. **Reach.** The files read were an allow list of two directories, so a
 *    program anywhere else was inspected by nobody, whatever the rules said. The
 *    run now states its own inventory: every file this project has is code, a
 *    build step, or data it names as such, and a file it cannot place is a
 *    failure rather than a file it skips.
 * 2. **The gap between two matchers.** The shell rules ran over workflows and
 *    the code rules over JavaScript, and a program that writes a command line
 *    and hands it to a runtime is both, so it was neither. A string literal in
 *    code is now read as a command as well as a value.
 * 3. **What the masker leaves behind.** A watched name spelled `"\x65val"` was
 *    an ordinary string by the time a rule saw it, and a specifier assembled a
 *    line above the load was outside the brackets the rule read. Both are fixed
 *    where they broke.
 *
 * The lesson, written down because the first round did not learn it: answering a
 * bypass with a pattern answers that bypass. Ask instead which of the three the
 * bypass used, because a list of spellings only ever has to be beaten once more.
 *
 * The fourth round added a fourth thing, and it was not a spelling either. The
 * generator was planted in the test runner, where it executed on every run, and
 * it was invisible twice over: the mask read a legal name as a keyword and
 * erased the rest of the line behind it, and the runtime guard that should have
 * refused it had been turned off in every process by an environment value that
 * merely mentioned the setting's name. Both are fixed where they broke, and both
 * are forms in the corpus now.
 *
 * So the run below does not begin by reading files. It begins by putting every
 * form in `lib/no-eval-attacks.mjs` through the rules in `lib/no-eval-rules.mjs`
 * and refusing to go on unless each one is caught, unless each innocent form
 * beside it is left alone, unless every rule there is the reason some form is
 * caught, and unless every environment value there is read the way the runtime
 * reads it. A rule edited into uselessness, a marker renamed, a pattern that can
 * never match, a guard that says yes to a setting the runtime never saw: all of
 * them stop the build here rather than turning the guarantee off and leaving the
 * tick green. That is `lib/no-eval-selftest.mjs`.
 *
 * ## What is inspected
 *
 * Everything that ships and everything that builds. `src` and `dist` are what a
 * consumer installs; every other JavaScript or TypeScript file the project holds
 * is tooling that a runtime really executes, wherever it sits; `package.json`,
 * `.github` and `.githooks` are the build steps themselves, including the
 * programs they feed to a runtime on standard input. A build step that writes a
 * file of code and runs it breaks the guarantee exactly as thoroughly as a
 * compiler that did.
 *
 * The list comes from walking the tree rather than from asking version control,
 * which is the fourth time a check here inspected less than it claimed and the
 * reason written at the top of `lib/files.mjs`. Built output is walked by name
 * on top of that, and if either directory is absent this check fails instead of
 * passing quietly, because a run that inspected no built output is not a run
 * that found it clean. The count of files read is in the line this prints, so a
 * number that drops is visible rather than something to be suspected.
 *
 * ## Two strictnesses, and where the line is
 *
 * What ships (`src` and `dist`) may not load a module at run time at all: a
 * consumer's bundler has to see the whole graph, and a path decided at run time
 * is a path a review cannot read. The tooling runs on a developer's machine
 * under a shell, and loading a built file is how a test runner and a benchmark
 * work, so a module load is allowed there. What is allowed nowhere, in either
 * place, is turning text into a function, or building the specifier of a load
 * out of text: those are the guarantee itself, not a property of where the code
 * happens to sit.
 *
 * ## Why it does not report itself
 *
 * Nothing is exempted from this check, including this file, the rules, the
 * attack corpus and the masker they share. That is possible because
 * `lib/javascript.mjs` removes comments, string literals and regular
 * expressions before anything is matched, so prose about a construct is not the
 * construct. A check that had to exclude itself would have a hole in it exactly
 * the shape of a check.
 *
 * Run: node scripts/check-no-eval.mjs
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { NOT_THE_PROJECT, filesUnder, projectFiles } from './lib/files.mjs';
import { NO_CODE_FROM_STRINGS, insistOnRefusing } from './lib/runtime.mjs';
import { selfTest } from './lib/no-eval-selftest.mjs';
import { findings, shellFindings } from './lib/no-eval-rules.mjs';

// Under the setting, or started again under it. Everything below reads files,
// and this line is why the two names the setting refuses are refused in the
// program doing the reading, whoever started it and however they spelled them.
insistOnRefusing();

/** What ships to a consumer, and is read at the stricter of the two settings. */
const SHIPPED = ['src', 'dist'];

/** Built output, gitignored by design, listed by walking rather than by asking. */
const BUILT = [
  { dir: 'dist', what: 'the package a consumer installs' },
  { dir: 'dist-test', what: 'the compiled tests a runtime executes' },
];

/** Where a build step lives. Everything under these is read as a command. */
const BUILD_STEPS = ['.github', '.githooks'];

/** Anything a runtime would execute, at any of its spellings. */
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const DECLARATION = /\.d\.ts$/;

/**
 * What is deliberately not code, by extension and by name.
 *
 * This list is the point of the inventory rather than a convenience. Every file
 * the project holds has to land in one of the three kinds, and a file that lands
 * in none stops the run naming itself. So a new extension is a decision somebody
 * takes here, in the open, instead of a file that is quietly read by nothing:
 * the second round of bypasses was found under a directory the check had never
 * been told to open.
 */
const DATA_EXTENSIONS = new Set([
  'md',
  'json',
  'map',
  'oscript',
  'yml',
  'yaml',
  'txt',
  'csv',
  'svg',
  'png',
  'ico',
  'woff',
  'woff2',
]);

const DATA_NAMES = new Set([
  'LICENSE',
  'NOTICE',
  '.gitignore',
  '.gitattributes',
  '.npmrc',
  '.editorconfig',
  '.nvmrc',
]);

// ---------------------------------------------------------------------------
// The inventory: what kind of file is this
// ---------------------------------------------------------------------------

const extensionOf = (file) => {
  const name = basename(file);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
};

const under = (file, dirs) => dirs.some((dir) => file === dir || file.startsWith(dir + '/'));

/** Code, a build step, data, or nothing this check knows how to place. */
function kindOf(file) {
  if (SOURCE.test(file)) return 'code';
  if (under(file, BUILD_STEPS)) return 'command';
  if (DATA_NAMES.has(basename(file))) return 'data';
  if (DATA_EXTENSIONS.has(extensionOf(file))) return 'data';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// The check attacks itself first
// ---------------------------------------------------------------------------

// Every form in `lib/no-eval-attacks.mjs` through the rules in
// `lib/no-eval-rules.mjs`, every innocent form beside it left alone, every rule
// the reason some form is caught, and every environment value read the way the
// runtime reads it. In `lib/no-eval-selftest.mjs`, with what each half proves.
const corpus = selfTest();

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

let hits = 0;

function report(found) {
  for (const one of found) {
    hits++;
    const where = one.line === null ? one.file : `${one.file}:${one.line}`;
    const why = one.rule.why[0].toUpperCase() + one.rule.why.slice(1);
    console.error(`${where}: ${one.rule.say}: "${one.matched.trim()}". ${why}.`);
  }
}

function refuse(message) {
  console.error(message);
  process.exit(1);
}

/** Every file the project has, placed in one of the three kinds or refused. */
const inventory = { code: [], command: [], data: [], unknown: [] };
for (const file of projectFiles()) inventory[kindOf(file)].push(file);

if (inventory.unknown.length > 0) {
  refuse(
    `This check cannot say what these files are, so it did not inspect them:\n\n` +
      inventory.unknown.map((file) => `  ${file}`).join('\n') +
      `\n\nA file nothing opens is a file no rule applies to, which is how the last set of\n` +
      `bypasses got in. Either it runs, in which case give it an extension this reads as\n` +
      `code, or it does not, in which case name its extension in the data list in this\n` +
      `file and say so on purpose.`,
  );
}

const sourceFiles = inventory.code.filter((file) => under(file, ['src']));
const toolingFiles = inventory.code.filter((file) => !under(file, ['src']));

if (sourceFiles.length === 0) {
  refuse(
    `No source file under src/ matched, so this check inspected nothing. Refusing to ` +
      `report a clean tree it never read.`,
  );
}

const builtFiles = [];
let builtWalked = 0;
for (const built of BUILT) {
  const all = filesUnder(built.dir);
  builtWalked += all.length;
  const unknown = all.filter((file) => kindOf(file) === 'unknown');
  if (unknown.length > 0) {
    refuse(
      `Under ${built.dir}/, which is ${built.what}, this check cannot say what these files\n` +
        `are:\n\n` +
        unknown.map((file) => `  ${file}`).join('\n') +
        `\n\nBuilt output is what a runtime really executes, so a file here that nothing\n` +
        `inspects is the worst version of the same gap.`,
    );
  }
  const files = all.filter((file) => kindOf(file) === 'code');
  if (files.length === 0) {
    refuse(
      `No built output under ${built.dir}/, which is ${built.what}. This check reads what a\n` +
        'runtime really executes as well as what the repository holds, so run `npm test`,\n' +
        'which builds both. Refusing to report a guarantee about an artifact that is not there.',
    );
  }
  for (const file of files) builtFiles.push(file);
}

const options = (file) => ({
  shipped: under(file, SHIPPED),
  declaration: DECLARATION.test(file),
});

for (const file of [...sourceFiles, ...toolingFiles, ...builtFiles]) {
  report(findings(file, readFileSync(file, 'utf8'), options(file)));
}

// The build steps: the commands themselves, and the programs they feed in.
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
  report(shellFindings(`package.json (the ${name} script)`, command, null));
}

/**
 * Every build step that starts this runtime, started under the setting.
 *
 * The scripts that must have it insist for themselves, by starting again under
 * it, so nothing here can be turned off by dropping a word from a command line.
 * This is the other half: a command line that says what it does, so a reader of
 * `package.json` sees the guarantee rather than having to know that a module two
 * directories away arranges it.
 */
const SEPARATOR = /&&|\|\||;|\|/;
const STARTS_RUNTIME = /(?:^|\s)node(?:\s|$)/;
const bare = [];
for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
  for (const step of command.split(SEPARATOR)) {
    if (!STARTS_RUNTIME.test(step) || step.includes(NO_CODE_FROM_STRINGS)) continue;
    bare.push(`  ${name}: ${step.trim()}`);
  }
}

if (bare.length > 0) {
  refuse(
    `These build steps start this runtime without ${NO_CODE_FROM_STRINGS}:\n\n` +
      bare.join('\n') +
      `\n\nThat setting is what enforces rule one now: under it a generator throws when its\n` +
      'code path runs, whatever it was spelled as, which is the thing this scan cannot\n' +
      'promise. Add it to the command.',
  );
}

const steps = inventory.command;
for (const dir of BUILD_STEPS) {
  if (steps.some((file) => under(file, [dir]))) continue;
  refuse(`No file under ${dir}/ matched, so this check inspected nothing there. The build steps were not inspected.`);
}

const HEREDOC = /<<[-~]?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?:\n|$)/g;
const lineAt = (text, index) => text.slice(0, index).split('\n').length;

for (const file of steps) {
  const text = readFileSync(file, 'utf8');
  report(shellFindings(file, text, 1));

  HEREDOC.lastIndex = 0;
  let m;
  while ((m = HEREDOC.exec(text)) !== null) {
    const opener = text.slice(text.lastIndexOf('\n', m.index) + 1, m.index);
    if (!/\bnode\b/.test(opener)) continue;
    const body = m[3];
    report(
      findings(`${file} (the program on standard input)`, body, {
        shipped: false,
        firstLine: lineAt(text, m.index + m[0].indexOf(body)),
      }),
    );
  }
}

if (hits > 0) {
  console.error(
    `\n${hits} place${hits === 1 ? '' : 's'} where code is built out of text.\n` +
      'This is the rule the rest of the design rests on: the compiler emits data, so the\n' +
      "language runs under a strict content security policy and a platform can run many\n" +
      "customers' scripts in one process.",
  );
  process.exit(1);
}

const total = sourceFiles.length + builtFiles.length + toolingFiles.length;
const commands = Object.keys(manifest.scripts ?? {}).length;
const walked =
  inventory.code.length + inventory.command.length + inventory.data.length + builtWalked;
console.log(
  `No-eval check passed, over this repository's own text, under ${NO_CODE_FROM_STRINGS}, ` +
    `which refuses two names here and closes no other door. ${corpus.attacks} attack forms ` +
    `caught by its own rules first, every one of ${corpus.rules} rules exercised, ` +
    `${corpus.settings} environment values read the way the runtime reads them, then ` +
    `${walked} files walked, of which ${total} were read as code (${sourceFiles.length} source, ` +
    `${builtFiles.length} built, ${toolingFiles.length} tooling) and ${inventory.data.length} are ` +
    `data and named as such, plus ${commands} build commands and ${steps.length} build steps, ` +
    `including the programs they feed in. The tree is walked rather than asked about, and the ` +
    `only thing left out of it is ${[...NOT_THE_PROJECT].join(' and ')}. ` +
    `No form this scan knows about was found. What is guaranteed about the package a ` +
    `platform installs is checked next door: scripts/check-layering.mjs refuses every import ` +
    `of a module from the runtime's own namespace under src, so the shipped engine has no ` +
    `virtual machine, no worker and no child process to reach.`,
);
