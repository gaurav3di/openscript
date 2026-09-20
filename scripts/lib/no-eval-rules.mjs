/**
 * What the no-eval check refuses, and the three doors it looks through.
 *
 * Split out of the check itself so that one set of rules answers both the run
 * over the repository and the run over the attack corpus. While the two lived
 * in one file it was still one set, but nothing else could ask them a question,
 * and a rule nobody else can ask is a rule nobody else can attack.
 *
 * ## The three doors, and why the count matters
 *
 * A file is read as **code**, a build step is read as a **command**, and a
 * string literal inside code is read as **both**: as a value, and as a command,
 * because a program that hands a command line to a runtime is a build step
 * written in JavaScript and had, for a round, no door of its own. Every rule
 * below says which door it stands in, and the corpus says which door each form
 * must be caught at, so a form that is caught for the wrong reason fails as
 * loudly as one that is not caught at all.
 *
 * ## Everything is matched against masked code
 *
 * `javascript.mjs` removes comments, replaces every string literal with a
 * marker and every regular expression with another, so a name appears in what a
 * rule sees only where the runtime would really read it as a name. That is what
 * lets this file, the corpus and the check itself be inspected by their own
 * rules with nothing exempted.
 */
import { MARK, maskCode } from './javascript.mjs';

/**
 * The spelling every pattern below is written against.
 *
 * Stated rather than assumed: this repository has already shipped one check
 * whose pattern could never match anything, and a renamed marker would turn
 * every rule here into one of those without changing a line of it.
 */
export const EXPECTED_MARK = '_STR_';

/** Whether the masker still spells a string the way these patterns expect. */
export const markerAsWritten = () => MARK === EXPECTED_MARK;

// ---------------------------------------------------------------------------
// Door one: code
// ---------------------------------------------------------------------------

/**
 * Each rule is matched against masked code, so it sees code and nothing else.
 *
 * `shippedOnly` marks the one that is about a bundler and a review being able to
 * see the whole graph, rather than about building code out of text.
 */
export const RULES = [
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
    re: /\b(?:runInThisContext|runInNewContext|runInContext|compileFunction|createContext|execScript|_compile)\b|\bScript\s*\(|\.\s*Script\b|\bSourceTextModule\b/g,
    say: "compiles text in a scope of its own, which is the runtime's own name for the thing",
    why: 'evaluating somewhere else is the same guarantee broken with a scope in the way, and it does not need the module named in a literal to get there',
  },
  {
    re: /\b(?:globalThis|window|self|global)\s*\[/g,
    say: 'looks a name up on the global object by computed key',
    why: 'a watched name assembled out of pieces is invisible to every pattern written against its spelling, and the global object is where that name is reached',
  },
  {
    // The rule above watches the spelling `globalThis[`. One `const g =
    // globalThis` above it, or one pair of brackets around it, and the spelling
    // is gone while the reach is not, so the object itself is refused as a
    // value. A member read through a name, `globalThis.foo`, is left alone: the
    // name is written down there, and every other rule can see it.
    re: /\bglobalThis\b(?!\s*[.[])/g,
    say: 'takes the global object as a value, where any name can then be looked up on it',
    why: 'the global object held in a local name is the same door with the sign taken down, and it is how a watched name assembled out of pieces is reached without either spelling appearing',
  },
  {
    // The same rule for the other three spellings, and only in what ships.
    //
    // `window`, `self` and `global` are the global object in some runtime and
    // ordinary words everywhere else: a rolling window has a length, a checker
    // looks for a direct self call, and a counter is global to a program. A rule
    // that fired on those in the tests would be turned off inside a week, which
    // is worse than a narrower rule that is obeyed. Under `src` and `dist` none
    // of the three has an innocent reading: nothing there may touch a browser
    // global at all, so taking one as a value is refused outright.
    re: /\b(?:window|self|global)\b(?!\s*[.[])/g,
    shippedOnly: true,
    say: 'takes a runtime global as a value, in code that ships',
    why: 'nothing that ships may touch a browser or a runtime global, and the object held in a local name is where a watched name assembled out of pieces is looked up',
  },
  {
    re: /\[\s*_STR_\s*\+|\+\s*_STR_\s*\]/g,
    say: 'indexes an object with a name built out of pieces',
    why: 'a member read whose key is assembled is invisible to every pattern written against the name, whatever the object turns out to be',
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

/**
 * The same question asked of the contents of a string literal.
 *
 * Asked of the decoded contents, which is what the runtime builds, rather than
 * of the characters between the quotes.
 *
 * `whenLaunching` marks a rule that is only a finding in a file that starts a
 * process. A lone `-e` is a flag, and plenty of programs have one; a lone `-e`
 * in a file that launches a runtime is a program being handed source text.
 */
export const STRING_RULES = [
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
  {
    re: /^(?:node:)?(?:repl|inspector)$/,
    say: "names a runtime module whose whole purpose is evaluating text handed to it",
    why: 'a read-eval-print loop and a debugger protocol both take a string and run it, and neither needs the watched spellings to do it',
  },
  {
    re: /^-{1,2}(?:e|eval|p|print)$/,
    whenLaunching: true,
    say: 'is the flag that hands a runtime source text, in a file that starts a process',
    why: 'an argument list is a command line with the quoting taken away, and the flag carries the program whether or not a shell ever sees it',
  },
];

// ---------------------------------------------------------------------------
// Door two: commands, wherever they are written
// ---------------------------------------------------------------------------

/**
 * A build step handing code to a runtime on the command line.
 *
 * Not a style rule: a command-line program is the one place in this repository
 * that nothing else reads. It is not type checked, not linted and not scanned by
 * the rules above, and it is where a value from the environment turns into
 * source text. A program in `scripts/` is checked by everything, including this.
 */
export const COMMAND_LINE_CODE = {
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
export const SHELL_EVAL = {
  re: /(?:^|[\s;&|(])eval\s+(?=["'$])/gm,
  say: 'builds a shell command out of a value',
  why: 'a build step that assembles its own command is the same rule broken one layer down, and it is where an environment value becomes something that runs',
};

/** Both of them, which is what a shell command and a string literal each get. */
export const SHELL_RULES = [COMMAND_LINE_CODE, SHELL_EVAL];

/** A program fed to a runtime on standard input, which is checked as code. */
export const HEREDOC =
  /<<[-~]?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?:\n|$)/g;

// ---------------------------------------------------------------------------
// Doors that need the argument read rather than the spelling matched
// ---------------------------------------------------------------------------

/** A module load whose specifier is not written down in the file that loads it. */
export const BUILT_SPECIFIER = {
  say: 'loads a module whose specifier is not written down',
  why: 'a specifier that is anything but a literal or a name holding one is a value turned into source at run time, and a reviewer cannot read where it points. This rule used to list the ways text gets assembled, and a chain of method calls was on none of the lists, so it now asks the opposite question: is this written down',
};

/** Starting a process whose command is not written down in the file that starts it. */
export const BUILT_COMMAND = {
  say: 'starts a process whose command is not written down',
  why: 'a runtime started with a command this file computed is this rule broken one layer down, and the same inversion applies: the command is a literal or a name holding one, or it is built',
};

/** Where a loader begins. The argument after it is read by balancing brackets. */
export const LOADER = /\b(?:import|require)\s*\(/g;

/**
 * Where a process begins. Not preceded by a dot, so that `PATTERN.exec(text)`,
 * which every check here writes, is not read as starting one.
 */
export const LAUNCH = /(?<![.\w$])(?:execSync|execFileSync|spawnSync|exec|execFile|spawn|fork)\s*\(/g;

/**
 * Written down: a literal, or a name that holds one.
 *
 * This is the inversion, and it is the point of this round. The rule here used
 * to list the shapes that mean text was assembled, a `+` and a template, and it
 * was beaten by `import(pieces.join(""))`, which is on neither list and is
 * every bit as assembled. There is no end to that list: a join, a decode from
 * base sixty-four, a replace, a reduce, a character at a time. So the question
 * is asked the other way round. A specifier and a command are **a string
 * literal, or a name or a dotted path holding one**, and everything else is
 * built, including a shape nobody has thought of yet.
 *
 * The cost is real and is the right way round: an innocent conversion in front
 * of a loader now has to be moved into a name, which is a sentence in a report
 * and a two line change, against a spelling that would otherwise have walked
 * through.
 */
const WRITTEN_DOWN = /^(?:_STR_[A-Za-z]*_?|[A-Za-z_$][A-Za-z0-9_$]*(?:\s*\.\s*[A-Za-z_$][A-Za-z0-9_$]*)*)$/;

/** Whether a masked argument is one of those two shapes and nothing else. */
export const writtenDown = (argument) => WRITTEN_DOWN.test(argument.trim());

/** A name bound to something that is not written down, the other half of it. */
const BINDING = /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([^;\n]*)/g;

/**
 * Every name in this file that holds something this file built.
 *
 * The rules above read the brackets of the call in front of them, which sees
 * `import(base + "/x.js")` and misses `const s = base + "/x.js"` with
 * `import(s)` a line below it. One line of indirection is not an exotic attack,
 * it is how anybody would write the same thing, so the name is followed. One
 * step only, and that limit is stated rather than left to be discovered: a value
 * that travels through a function is past what a pattern can follow, and the
 * honest answer to that is the rules above, which do not care where the value
 * came from.
 */
function builtBindings(code) {
  const names = new Set();
  BINDING.lastIndex = 0;
  let m;
  while ((m = BINDING.exec(code)) !== null) {
    if (!writtenDown(m[2])) names.add(m[1]);
  }
  return names;
}

/**
 * The first argument of a call, from the text between its brackets.
 *
 * A loader takes import attributes after the specifier and a launch takes an
 * argument list and options after the command, so the question "is this written
 * down" is about the first argument and not about everything in the brackets.
 * String literals are already markers by the time this reads them, so only
 * nesting has to be counted.
 */
export function firstArgument(argument) {
  let depth = 0;
  for (let i = 0; i < argument.length; i += 1) {
    const c = argument[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth -= 1;
    else if (c === ',' && depth === 0) return argument.slice(0, i);
  }
  return argument;
}

/** The text between a bracket and its partner, or null if it is never closed. */
export function balanced(code, open) {
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

const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/** Whether an argument was built by this file, here or one binding above. */
function wasBuilt(argument, built) {
  const one = firstArgument(argument).trim();
  if (!writtenDown(one)) return true;
  const root = one.split('.')[0].trim();
  return built.has(root);
}

// ---------------------------------------------------------------------------
// Finding
// ---------------------------------------------------------------------------

/** Every rule, against one piece of code. Line numbers start at `firstLine`. */
export function findings(file, text, { shipped, firstLine = 1, declaration = false }) {
  const { code, strings } = maskCode(text);
  const built = builtBindings(code);
  const launches = new RegExp(LAUNCH.source, LAUNCH.flags).test(code);
  const found = [];
  const at = (index, matched, rule) => {
    found.push({ file, line: firstLine + lineAt(code, index) - 1, matched, rule });
  };

  for (const rule of RULES) {
    // A declaration file states types and runs nothing, so a module reference in
    // one is a type reference rather than a load. Every rule that is about
    // building code out of text still applies to it.
    if (rule.shippedOnly && (!shipped || declaration)) continue;
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(code)) !== null) at(m.index, m[0], rule);
  }

  for (const [start, what] of [
    [LOADER, BUILT_SPECIFIER],
    [LAUNCH, BUILT_COMMAND],
  ]) {
    start.lastIndex = 0;
    let m;
    while ((m = start.exec(code)) !== null) {
      const open = m.index + m[0].length - 1;
      const argument = balanced(code, open);
      if (argument !== null && wasBuilt(argument, built)) at(m.index, `${m[0]}${argument}`, what);
    }
  }

  for (const { index, value, decoded } of strings) {
    const line = firstLine + lineAt(text, index) - 1;
    for (const rule of STRING_RULES) {
      if (rule.whenLaunching === true && !launches) continue;
      if (rule.re.test(decoded)) found.push({ file, line, matched: value, rule });
    }
    // A string literal is also a command, in a file that starts a process,
    // because a program that hands one to a runtime is a build step with a
    // different file extension. Only in such a file: a check that read every
    // literal as a command would report the corpus that documents the attack,
    // and an exemption for that file is a hole exactly the shape of the rule.
    if (!launches) continue;
    for (const one of shellFindings(file, decoded, null)) {
      found.push({ ...one, line, matched: value });
    }
  }
  return found;
}

/** The same question asked of a shell command or a workflow file. */
export function shellFindings(file, text, line) {
  const found = [];
  for (const rule of SHELL_RULES) {
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
