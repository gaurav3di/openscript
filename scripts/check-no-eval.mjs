/**
 * The no-eval check.
 *
 * Rule one of this project is that nothing here builds code out of text, and
 * until this file existed it was the one rule nothing enforced. Seven checks
 * ran and none of them looked. A reviewer established that the rule held by
 * grepping, which is a statement about one afternoon and about no commit after
 * it.
 *
 * Everything else rests on it. The compiler emits data, so the language runs
 * inside an application whose content security policy refuses code built from
 * text, and a platform can run many customers' scripts in one process with an
 * instruction budget the engine really owns rather than hopes for. A single
 * generated function anywhere in what ships makes every one of those sentences
 * false, quietly, with the whole suite still green.
 *
 * ## What is inspected
 *
 * The source, the built output and the tooling: `src`, `dist`, `scripts` and
 * `tests`, plus the build steps themselves, which are the commands in
 * `package.json` and the workflow files including the programs they feed to a
 * runtime on standard input. A build step that writes a file of code and runs it
 * breaks the guarantee exactly as thoroughly as a compiler that did, and the
 * built output is the only one of these a consumer ever runs: checking the
 * source alone would be checking the one copy nobody installs.
 *
 * `dist` is gitignored, so it is listed by walking the directory rather than by
 * asking version control, for the reason written at the top of `lib/files.mjs`.
 * If it is absent this check fails instead of passing quietly, because a run
 * that inspected no built output is not a run that found it clean.
 *
 * ## Two strictnesses, and where the line is
 *
 * What ships (`src` and `dist`) may not load a module at run time at all: a
 * consumer's bundler has to see the whole graph, and a path decided at run time
 * is a path a review cannot read. The tooling runs on a developer's machine
 * under a shell, and loading a built file is how a test runner and a benchmark
 * work, so a module load is allowed there. What is allowed nowhere, in either
 * place, is turning text into a function: that is the guarantee itself, not a
 * property of where the code happens to sit.
 *
 * ## Why it does not report itself
 *
 * Nothing is exempted from this check, including this file and the masker it
 * uses. That is possible because `lib/javascript.mjs` removes comments, string
 * literals and regular expressions before anything is matched, so prose about a
 * construct is not the construct. A check that had to exclude itself would have
 * a hole in it exactly the shape of a check.
 *
 * Run: node scripts/check-no-eval.mjs
 */
import { readFileSync } from 'node:fs';
import { filesMatching, filesUnder, nothingFound } from './lib/files.mjs';
import { MARK, maskCode } from './lib/javascript.mjs';

/** What ships to a consumer. */
const SHIPPED = ['src', 'dist'];

/** What builds and checks it, and runs nowhere but here. */
const TOOLING = ['scripts', 'tests'];

const SOURCE = /\.(ts|tsx|js|mjs|cjs)$/;
const DECLARATION = /\.d\.ts$/;
const WORKFLOWS = '.github/workflows';

/**
 * The patterns below are written against the marker the masker emits, so a
 * change to that spelling would leave every one of them matching nothing. This
 * repository has already shipped one check that could never match anything, so
 * the assumption is stated rather than assumed.
 */
if (MARK !== '_STR_') {
  console.error(
    `The string marker is now "${MARK}", and the patterns in this file are written against "_STR_".\n` +
      'Refusing to run patterns that would match nothing.',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// What is refused
// ---------------------------------------------------------------------------

/**
 * Each rule is matched against masked code, so it sees code and nothing else.
 *
 * `shippedOnly` marks the two that are about a bundler and a review being able
 * to see the whole graph, rather than about building code out of text.
 */
const RULES = [
  {
    re: /\beval\b|\[\s*_STR_eval_\s*\]/g,
    say: 'reaches for eval, directly or through a name in a string',
    why: 'the compiler emits data, and an application whose content security policy refuses code from text has to be able to run this package as it stands',
  },
  {
    re: /\bnew\s+Function\b|\bFunction\s*\(|\[\s*_STR_Function_\s*\]/g,
    say: 'builds a function out of text',
    why: 'a generated function is code a review never sees and a budget cannot count',
  },
  {
    re: /\.\s*constructor\s*[.([]|\[\s*_STR_constructor_\s*\]/g,
    say: 'reaches through a constructor property, which is the indirect way to the same function builder',
    why: 'any object hands back that builder through its constructor, so forbidding the plain spelling alone forbids nothing',
  },
  {
    re: /\b(?:setTimeout|setInterval)\s*\(\s*_STR_/g,
    say: 'hands a timer a string, which the runtime compiles and runs',
    why: 'it is the same guarantee broken through a different door',
  },
  {
    re: /\bcreateObjectURL\b|\bimportScripts\b/g,
    say: 'builds a script URL at run time',
    why: 'the content security policy allows scripts from the origin and nothing else, so a worker is a served file rather than a blob',
  },
  {
    re: /\bimport\s*\(|\brequire\s*\(/g,
    shippedOnly: true,
    say: 'loads a module at run time',
    why: "what ships has to be a graph a consumer's bundler can see whole, and a path decided at run time is one nobody can read",
  },
];

/** The same question asked of the contents of a string literal. */
const STRING_RULES = [
  {
    re: /^\s*javascript:/i,
    say: 'holds a URL whose body is script',
    why: 'the text becomes code the moment anything follows it',
  },
  {
    re: /^\s*blob:/i,
    say: 'holds a blob URL',
    why: 'a script loaded from a blob is refused by the content security policy the language is meant to run under',
  },
  {
    re: /^\s*data:[^,]*(?:java|ecma)script/i,
    say: 'holds a data URL carrying script',
    why: 'a module built from a data URL is code from text with an import in front of it',
  },
  {
    re: /^(?:node:)?vm$/,
    say: "names the runtime's own module for compiling text",
    why: 'it is the same thing as the plain spelling, with a module boundary in the way',
  },
];

/**
 * A build step handing code to a runtime on the command line.
 *
 * Not a style rule: a command-line program is the one place in this repository
 * that nothing else reads. It is not type checked, not linted and not scanned by
 * the rules above, and it is where a value from the environment turns into
 * source text. A program in `scripts/` is checked by everything, including this.
 */
const COMMAND_LINE_CODE = /\bnode\b[^\n]*?\s(?:-e|--eval|-p|--print)\b/g;

/** A program fed to a runtime on standard input, which is checked as code. */
const HEREDOC = /<<[-~]?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?:\n|$)/g;

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

let hits = 0;

const lineAt = (text, index) => text.slice(0, index).split('\n').length;

function report(file, line, matched, rule) {
  hits++;
  const where = line === null ? file : `${file}:${line}`;
  const why = rule.why[0].toUpperCase() + rule.why.slice(1);
  console.error(`${where}: ${rule.say}: "${matched.trim()}". ${why}.`);
}

/** Every rule, against one piece of code. Line numbers start at `firstLine`. */
function inspect(file, text, { shipped, firstLine = 1 }) {
  const { code, strings } = maskCode(text);

  for (const rule of RULES) {
    // A declaration file states types and runs nothing, so a module reference in
    // one is a type reference rather than a load. Every rule that is about
    // building code out of text still applies to it.
    if (rule.shippedOnly && (!shipped || DECLARATION.test(file))) continue;
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(code)) !== null) {
      report(file, firstLine + lineAt(code, m.index) - 1, m[0], rule);
    }
  }

  for (const { index, value } of strings) {
    for (const rule of STRING_RULES) {
      if (rule.re.test(value)) report(file, firstLine + lineAt(text, index) - 1, value, rule);
    }
  }
}

const sourceFiles = filesMatching(SOURCE, ['src']);
const toolingFiles = filesMatching(SOURCE, TOOLING);
const builtFiles = filesUnder('dist').filter((f) => SOURCE.test(f));

if (sourceFiles.length === 0) {
  console.error(`${nothingFound('source file under src/')}. Refusing to report a clean tree it never read.`);
  process.exit(1);
}

if (builtFiles.length === 0) {
  console.error(
    'No built output under dist/. This check reads what a consumer installs as well as\n' +
      'what the repository holds, so run `npm run build` first. Refusing to report a\n' +
      'guarantee about an artifact that is not there.',
  );
  process.exit(1);
}

for (const file of [...sourceFiles, ...builtFiles]) {
  inspect(file, readFileSync(file, 'utf8'), { shipped: SHIPPED.some((d) => file.startsWith(d + '/')) });
}

for (const file of toolingFiles) {
  inspect(file, readFileSync(file, 'utf8'), { shipped: false });
}

// The build steps: the commands themselves, and the programs they feed in.
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const steps = Object.entries(manifest.scripts ?? {}).map(([name, command]) => ({
  file: `package.json (the ${name} script)`,
  line: null,
  text: command,
}));

const workflows = filesMatching(/\.ya?ml$/, [WORKFLOWS]);
if (workflows.length === 0) {
  console.error(`${nothingFound(`workflow under ${WORKFLOWS}/`)}. The build steps were not inspected.`);
  process.exit(1);
}

for (const file of workflows) {
  const text = readFileSync(file, 'utf8');
  steps.push({ file, line: 0, text });

  HEREDOC.lastIndex = 0;
  let m;
  while ((m = HEREDOC.exec(text)) !== null) {
    const opener = text.slice(text.lastIndexOf('\n', m.index) + 1, m.index);
    if (!/\bnode\b/.test(opener)) continue;
    const body = m[3];
    inspect(`${file} (the program on standard input)`, body, {
      shipped: false,
      firstLine: lineAt(text, m.index + m[0].indexOf(body)),
    });
  }
}

const commandLine = {
  say: 'hands code to a runtime on the command line',
  why: 'a command-line program is read by nothing else here, and it is where a value turns into source text. Put it in scripts/, where every check can see it',
};

for (const step of steps) {
  COMMAND_LINE_CODE.lastIndex = 0;
  let m;
  while ((m = COMMAND_LINE_CODE.exec(step.text)) !== null) {
    report(step.file, step.line === null ? null : step.line + lineAt(step.text, m.index), m[0], commandLine);
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
console.log(
  `No-eval check passed: ${total} files (${sourceFiles.length} source, ${builtFiles.length} built, ` +
    `${toolingFiles.length} tooling), ${commands} build commands and ${workflows.length} workflows, ` +
    'including the programs they feed in. Nothing builds code out of text.',
);
