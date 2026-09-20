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
 * ## The check is attacked before it is trusted
 *
 * The first version of this file was got past seven ways by the first reviewer
 * who tried: the function builder reached through `call`, `apply`, `bind` or
 * `Reflect.construct`; the same builder reached through a constructor property
 * taken as a value; a watched name assembled out of pieces and looked up on the
 * global object; code assembled out of bytes; text put into a document; the
 * runtime's own compiler reached through a binding instead of by naming its
 * module; and a module specifier built out of text. None of those is exotic and
 * every one of them really runs.
 *
 * So the run below does not begin by reading files. It begins by putting every
 * form in `lib/no-eval-attacks.mjs` through its own rules and refusing to go on
 * unless each one is caught, and unless each innocent form beside it is left
 * alone. A rule edited into uselessness, a marker renamed, a pattern that can
 * never match: all of them stop the build here rather than turning the
 * guarantee off and leaving the tick green.
 *
 * ## What is inspected
 *
 * Everything that ships and everything that builds. `src` and `dist` are what a
 * consumer installs; `scripts`, `tests` and `dist-test` are the tooling and the
 * compiled tests a runtime really executes; `package.json`, `.github` and
 * `.githooks` are the build steps themselves, including the programs they feed
 * to a runtime on standard input. A build step that writes a file of code and
 * runs it breaks the guarantee exactly as thoroughly as a compiler that did.
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
 * Nothing is exempted from this check, including this file, the attack corpus
 * and the masker they share. That is possible because `lib/javascript.mjs`
 * removes comments, string literals and regular expressions before anything is
 * matched, so prose about a construct is not the construct. A check that had to
 * exclude itself would have a hole in it exactly the shape of a check.
 *
 * Run: node scripts/check-no-eval.mjs
 */
import { readFileSync } from 'node:fs';
import { filesMatching, filesUnder, nothingFound } from './lib/files.mjs';
import { MARK, maskCode } from './lib/javascript.mjs';
import { ATTACKS, INNOCENT, SHELL_ATTACKS, SHELL_INNOCENT, SHIPPED_ONLY } from './lib/no-eval-attacks.mjs';

/** What ships to a consumer. */
const SHIPPED = ['src', 'dist'];

/** What builds and checks it, and runs nowhere but here. */
const TOOLING = ['scripts', 'tests'];

/** Built output, gitignored by design, listed by walking rather than by asking. */
const BUILT = [
  { dir: 'dist', shipped: true, what: 'the package a consumer installs' },
  { dir: 'dist-test', shipped: false, what: 'the compiled tests a runtime executes' },
];

const SOURCE = /\.(ts|tsx|js|mjs|cjs)$/;
const DECLARATION = /\.d\.ts$/;
const WORKFLOWS = '.github';
const HOOKS = '.githooks';

/**
 * The patterns below are written against the marker the masker emits, so a
 * change to that spelling would leave every one of them matching nothing. This
 * repository has already shipped one check that could never match anything, so
 * the assumption is stated rather than assumed. The corpus run underneath it
 * proves the rest.
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
 * `shippedOnly` marks the one that is about a bundler and a review being able to
 * see the whole graph, rather than about building code out of text.
 */
const RULES = [
  {
    re: /\beval\b|_STR_eval_/g,
    say: 'reaches for eval, directly or through a name in a string',
    why: 'the compiler emits data, and an application whose content security policy refuses code from text has to be able to run this package as it stands',
  },
  {
    re: /\bFunction\b|_STR_Function_/g,
    say: 'names the function builder, however it is then reached',
    why: 'call, apply, bind and Reflect.construct all build the same function as new Function, so a pattern that only knew the plain spelling forbade nothing',
  },
  {
    re: /\.\s*constructor\b|_STR_constructor_|\bconstructor\s*:|\{\s*constructor\s*[,}]/g,
    say: 'reaches through a constructor property, which is the indirect way to the same function builder',
    why: 'any object hands back that builder through its constructor, whether it is called there or taken as a value and called later',
  },
  {
    re: /\b(?:setTimeout|setInterval|setImmediate)\s*\(\s*_STR_/g,
    say: 'hands a timer a string, which the runtime compiles and runs',
    why: 'it is the same guarantee broken through a different door',
  },
  {
    re: /\b(?:runInThisContext|runInNewContext|runInContext|compileFunction|createContext|execScript|_compile)\b|\bScript\s*\(|\bSourceTextModule\b/g,
    say: "compiles text in a scope of its own, which is the runtime's own name for the thing",
    why: 'evaluating somewhere else is the same guarantee broken with a scope in the way, and it does not need the module named in a literal to get there',
  },
  {
    re: /\b(?:globalThis|window|self|global)\s*\[/g,
    say: 'looks a name up on the global object by computed key',
    why: 'a watched name assembled out of pieces is invisible to every pattern written against its spelling, and the global object is where that name is reached',
  },
  {
    re: /\bWebAssembly\b/g,
    say: 'assembles a module out of bytes at run time',
    why: 'code built at run time is code a review never sees, whether it was built from characters or from numbers',
  },
  {
    re: /\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b|\bdocument\s*\.\s*write/g,
    say: 'puts text into a document, where a script element inside it runs',
    why: 'markup is another spelling of code from text, and it is refused by the same content security policy',
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

/** A module load whose specifier is built out of text rather than written down. */
const BUILT_SPECIFIER = {
  say: 'builds a module specifier out of text',
  why: 'a specifier assembled at run time is the step that turns a value into source, and it is how a data URL carrying a program reaches a loader without ever being written down',
};

/** Where a loader begins. The argument after it is read by balancing brackets. */
const LOADER = /\b(?:import|require)\s*\(/g;

/** Text inside the specifier that says it was assembled: a join, or a template. */
const ASSEMBLED = /\+|_STR_\s*\(/;

/**
 * A build step handing code to a runtime on the command line.
 *
 * Not a style rule: a command-line program is the one place in this repository
 * that nothing else reads. It is not type checked, not linted and not scanned by
 * the rules above, and it is where a value from the environment turns into
 * source text. A program in `scripts/` is checked by everything, including this.
 */
const COMMAND_LINE_CODE = {
  // The run stops at a separator, so a flag belonging to the next command in the
  // line is not read as one of this runtime's. `node clean.mjs c.json && tsc -p`
  // is two commands, and `-p` is the compiler's.
  re: /\bnode\b[^\n&|;]*?\s(?:-e|--eval|-p|--print)\b/g,
  say: 'hands code to a runtime on the command line',
  why: 'a command-line program is read by nothing else here, and it is where a value turns into source text. Put it in scripts/, where every check can see it',
};

/**
 * The shell's own way of building a command out of a value.
 *
 * Written to require a quote or a variable after it, so that the name of this
 * check, which appears in every workflow that runs it, is not a hit.
 */
const SHELL_EVAL = {
  re: /(?:^|[\s;&|(])eval\s+(?=["'$])/gm,
  say: 'builds a shell command out of a value',
  why: 'a build step that assembles its own command is the same rule broken one layer down, and it is where an environment value becomes something that runs',
};

/** A program fed to a runtime on standard input, which is checked as code. */
const HEREDOC = /<<[-~]?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?:\n|$)/g;

// ---------------------------------------------------------------------------
// Finding
// ---------------------------------------------------------------------------

const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/** The text between a bracket and its partner, or null if it is never closed. */
function balanced(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    const c = code[i];
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  return null;
}

/** Every rule, against one piece of code. Line numbers start at `firstLine`. */
function findings(file, text, { shipped, firstLine = 1 }) {
  const { code, strings } = maskCode(text);
  const found = [];
  const at = (index, matched, rule) => {
    found.push({ file, line: firstLine + lineAt(code, index) - 1, matched, rule });
  };

  for (const rule of RULES) {
    // A declaration file states types and runs nothing, so a module reference in
    // one is a type reference rather than a load. Every rule that is about
    // building code out of text still applies to it.
    if (rule.shippedOnly && (!shipped || DECLARATION.test(file))) continue;
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(code)) !== null) at(m.index, m[0], rule);
  }

  LOADER.lastIndex = 0;
  let loader;
  while ((loader = LOADER.exec(code)) !== null) {
    const open = loader.index + loader[0].length - 1;
    const argument = balanced(code, open);
    if (argument !== null && ASSEMBLED.test(argument)) {
      at(loader.index, `${loader[0]}${argument}`, BUILT_SPECIFIER);
    }
  }

  for (const { index, value } of strings) {
    for (const rule of STRING_RULES) {
      if (rule.re.test(value)) {
        found.push({ file, line: firstLine + lineAt(text, index) - 1, matched: value, rule });
      }
    }
  }
  return found;
}

/** The same question asked of a shell command or a workflow file. */
function shellFindings(file, text, line) {
  const found = [];
  for (const rule of [COMMAND_LINE_CODE, SHELL_EVAL]) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(text)) !== null) {
      // A rule may open on the whitespace before the word it is about, and that
      // whitespace can be the newline above it, so the line is taken from the
      // first character of the match that is not blank.
      const offset = Math.max(m[0].search(/\S/), 0);
      found.push({
        file,
        line: line === null ? null : line + lineAt(text, m.index + offset) - 1,
        matched: m[0],
        rule,
      });
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// The check attacks itself first
// ---------------------------------------------------------------------------

/**
 * Every form in the corpus, through the rules above, before any file is read.
 *
 * An attack that is not caught and an innocent form that is fail the same way,
 * because a pattern loose enough to match everything is not a guard either.
 */
function selfTest() {
  const wrong = [];
  const check = (what, text, opts, expected) => {
    const hit = findings('<corpus>', text, opts).length > 0;
    if (hit !== expected) wrong.push(`${expected ? 'not caught' : 'caught wrongly'}: ${what}`);
  };

  for (const text of ATTACKS) check(text, text, { shipped: false }, true);
  for (const text of INNOCENT) check(text, text, { shipped: false }, false);
  for (const text of SHIPPED_ONLY) {
    check(`${text} (in what ships)`, text, { shipped: true }, true);
    check(`${text} (in the tooling)`, text, { shipped: false }, false);
  }
  for (const text of SHELL_ATTACKS) {
    if (shellFindings('<corpus>', text, null).length === 0) wrong.push(`not caught: ${text}`);
  }
  for (const text of SHELL_INNOCENT) {
    if (shellFindings('<corpus>', text, null).length > 0) wrong.push(`caught wrongly: ${text}`);
  }

  if (wrong.length === 0) return;
  console.error(
    'The no-eval check no longer does what it says. Its own attack corpus disagrees\n' +
      'with its rules in these places:\n\n' +
      wrong.map((line) => `  ${line}`).join('\n') +
      '\n\nEvery form in scripts/lib/no-eval-attacks.mjs really executes code built from\n' +
      'text, or really does not. Fix the rule rather than the corpus: a guard nobody\n' +
      'has attacked is a guard nobody has tested.',
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

const sourceFiles = filesMatching(SOURCE, ['src']);
const toolingFiles = filesMatching(SOURCE, TOOLING);

if (sourceFiles.length === 0) {
  console.error(`${nothingFound('source file under src/')}. Refusing to report a clean tree it never read.`);
  process.exit(1);
}

const builtFiles = [];
for (const built of BUILT) {
  const files = filesUnder(built.dir).filter((f) => SOURCE.test(f));
  if (files.length === 0) {
    console.error(
      `No built output under ${built.dir}/, which is ${built.what}. This check reads what a\n` +
        'runtime really executes as well as what the repository holds, so run `npm test`,\n' +
        'which builds both. Refusing to report a guarantee about an artifact that is not there.',
    );
    process.exit(1);
  }
  for (const file of files) builtFiles.push({ file, shipped: built.shipped });
}

for (const file of sourceFiles) report(findings(file, readFileSync(file, 'utf8'), { shipped: true }));
for (const file of toolingFiles) report(findings(file, readFileSync(file, 'utf8'), { shipped: false }));
for (const { file, shipped } of builtFiles) {
  report(findings(file, readFileSync(file, 'utf8'), { shipped }));
}

// The build steps: the commands themselves, and the programs they feed in.
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
  report(shellFindings(`package.json (the ${name} script)`, command, null));
}

const workflows = filesMatching(/\.ya?ml$/, [WORKFLOWS]);
const hooks = filesMatching(/./, [HOOKS]);

for (const [files, what] of [
  [workflows, `workflow under ${WORKFLOWS}/`],
  [hooks, `hook under ${HOOKS}/`],
]) {
  if (files.length > 0) continue;
  console.error(`${nothingFound(what)}. The build steps were not inspected.`);
  process.exit(1);
}

for (const file of [...workflows, ...hooks]) {
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
  `No-eval check passed: ${attacks} attack forms caught by its own rules first, then ` +
    `${total} files (${sourceFiles.length} source, ${builtFiles.length} built, ` +
    `${toolingFiles.length} tooling), ${commands} build commands, ${workflows.length} workflows and ` +
    `${hooks.length} hooks, including the programs they feed in. Nothing builds code out of text.`,
);
