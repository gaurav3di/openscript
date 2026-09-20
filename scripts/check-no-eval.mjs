/**
 * The no-eval check.
 *
 * Rule one of this project is that nothing here builds code out of text, and
 * until this file existed it was the one rule nothing enforced. A reviewer
 * established that the rule held by grepping, which is a statement about one
 * afternoon and about no commit after it.
 *
 * Everything else rests on it. The compiler emits data, so the language runs
 * inside an application whose content security policy refuses code built from
 * text, and a platform can run many customers' scripts in one process with an
 * instruction budget the engine really owns rather than hopes for. A single
 * generated function anywhere in what ships makes every one of those sentences
 * false, quietly, with the whole suite still green.
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
 * So the run below does not begin by reading files. It begins by putting every
 * form in `lib/no-eval-attacks.mjs` through the rules in `lib/no-eval-rules.mjs`
 * and refusing to go on unless each one is caught, unless each innocent form
 * beside it is left alone, and unless every rule there is the reason some form
 * is caught. A rule edited into uselessness, a marker renamed, a pattern that
 * can never match: all of them stop the build here rather than turning the
 * guarantee off and leaving the tick green.
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
 * `dist` and `dist-test` are gitignored, so they are listed by walking the
 * directory rather than by asking version control, for the reason written at the
 * top of `lib/files.mjs`. If either is absent this check fails instead of
 * passing quietly, because a run that inspected no built output is not a run
 * that found it clean.
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
import { filesUnder, projectFiles } from './lib/files.mjs';
import {
  ATTACKS,
  INNOCENT,
  SHELL_ATTACKS,
  SHELL_INNOCENT,
  SHIPPED_ONLY,
} from './lib/no-eval-attacks.mjs';
import {
  BUILT_COMMAND,
  BUILT_SPECIFIER,
  EXPECTED_MARK,
  RULES,
  SHELL_RULES,
  STRING_RULES,
  findings,
  markerAsWritten,
  shellFindings,
} from './lib/no-eval-rules.mjs';

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

/**
 * The patterns are written against the marker the masker emits, so a change to
 * that spelling would leave every one of them matching nothing. This repository
 * has already shipped one check that could never match anything, so the
 * assumption is stated rather than assumed. The corpus run underneath it proves
 * the rest.
 */
if (!markerAsWritten()) {
  console.error(
    `The string marker has changed, and the patterns in scripts/lib/no-eval-rules.mjs are\n` +
      `written against "${EXPECTED_MARK}".\nRefusing to run patterns that would match nothing.`,
  );
  process.exit(1);
}

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

/** Every rule this check has, so the corpus can be asked to exercise each one. */
const EVERY_RULE = [...RULES, ...STRING_RULES, ...SHELL_RULES, BUILT_SPECIFIER, BUILT_COMMAND];

/**
 * Every form in the corpus, through the rules above, before any file is read.
 *
 * An attack that is not caught and an innocent form that is fail the same way,
 * because a pattern loose enough to match everything is not a guard either. And
 * a rule that catches nothing in the corpus fails too: a pattern that can never
 * match is the exact failure this repository has already shipped once, and it
 * looks identical to a rule that works until somebody tests it.
 */
function selfTest() {
  const wrong = [];
  const fired = new Set();

  const run = (text, opts) => {
    const found = findings('<corpus>', text, opts);
    for (const one of found) fired.add(one.rule);
    return found.length > 0;
  };
  const check = (what, text, opts, expected) => {
    if (run(text, opts) !== expected) {
      wrong.push(`${expected ? 'not caught' : 'caught wrongly'}: ${what}`);
    }
  };

  for (const text of ATTACKS) check(text, text, { shipped: false }, true);
  for (const text of INNOCENT) check(text, text, { shipped: false }, false);
  for (const text of SHIPPED_ONLY) {
    check(`${text} (in what ships)`, text, { shipped: true }, true);
    check(`${text} (in the tooling)`, text, { shipped: false }, false);
  }
  for (const text of SHELL_ATTACKS) {
    const found = shellFindings('<corpus>', text, null);
    for (const one of found) fired.add(one.rule);
    if (found.length === 0) wrong.push(`not caught: ${text}`);
  }
  for (const text of SHELL_INNOCENT) {
    if (shellFindings('<corpus>', text, null).length > 0) wrong.push(`caught wrongly: ${text}`);
  }

  for (const rule of EVERY_RULE) {
    if (fired.has(rule)) continue;
    wrong.push(`no form in the corpus is caught by the rule that says it "${rule.say}"`);
  }

  if (wrong.length === 0) return;
  console.error(
    'The no-eval check no longer does what it says. Its own attack corpus disagrees\n' +
      'with its rules in these places:\n\n' +
      wrong.map((line) => `  ${line}`).join('\n') +
      '\n\nEvery form in scripts/lib/no-eval-attacks.mjs really executes code built from\n' +
      'text, or really does not. Fix the rule rather than the corpus: a guard nobody\n' +
      'has attacked is a guard nobody has tested. A rule that catches nothing in the\n' +
      'corpus needs a form written for it, because until one exists nothing says the\n' +
      'pattern can match at all.',
  );
  process.exit(1);
}

selfTest();

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
for (const built of BUILT) {
  const all = filesUnder(built.dir);
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

const attacks = ATTACKS.length + SHIPPED_ONLY.length + SHELL_ATTACKS.length;
const total = sourceFiles.length + builtFiles.length + toolingFiles.length;
const commands = Object.keys(manifest.scripts ?? {}).length;
console.log(
  `No-eval check passed: ${attacks} attack forms caught by its own rules first, every one of ` +
    `${EVERY_RULE.length} rules exercised, then ${total} files (${sourceFiles.length} source, ` +
    `${builtFiles.length} built, ${toolingFiles.length} tooling), ${commands} build commands and ` +
    `${steps.length} build steps, including the programs they feed in. ` +
    `${inventory.data.length} further files are data and are named as such. ` +
    `Nothing builds code out of text.`,
);
