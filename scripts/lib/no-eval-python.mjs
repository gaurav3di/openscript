/**
 * What the no-eval check refuses in a Python file, and the two doors it looks
 * through.
 *
 * The check already had an arm for JavaScript and a classifier that called a
 * `.py` file "unknown" and stopped the build on it, deliberately, because code
 * that nothing scans is the one thing that file refuses to allow. This is the
 * arm that was missing, so a Python file is read rather than merely refused.
 *
 * ## The two doors
 *
 * A file is read as **code**, and a string literal inside it is read as **text
 * with a meaning**: a module name, or a flag that carries a program. There is
 * no third door here. The build-step door next door exists because a JavaScript
 * file can write a command line and hand it to a runtime; a Python file that
 * did the same is refused at the code door for starting a process at all.
 *
 * ## Everything is matched against masked code
 *
 * `python-source.mjs` removes comments, replaces every string literal with a
 * marker, normalises every identifier the way the interpreter normalises it,
 * and reads a formatted string's substitutions as code. So a name appears in
 * what a rule sees only where the interpreter would really read it as a name,
 * which is what lets this file, its corpus and the check itself be inspected by
 * their own rules with nothing exempted.
 *
 * ## What is allowed, said out loud
 *
 * `ast.literal_eval` is safe and is allowed. It reads one literal, builds the
 * value it denotes and runs nothing: no name is resolved, no call is made, no
 * module is loaded. A rule that refused it would be refusing the honest way to
 * read a number out of a document, and the dishonest way, which is the string
 * evaluator, would be the one left standing. The rules below reach it by not
 * reaching for it: a watched name is matched at a word boundary, and the
 * character before that name here is an underscore.
 */
import { ATTACKS, INNOCENT } from './no-eval-python-attacks.mjs';
import { MARK, maskPython } from './python-source.mjs';

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

/** Each rule is matched against masked code, so it sees code and nothing else. */
export const RULES = [
  {
    re: /\b(?:eval|exec)\b|_STR_eval_|_STR_exec_/g,
    say: 'reaches for the string evaluator or the statement executor, by name or through a name in a string',
    why: 'the compiled program is data, and an engine that turns text into code is an engine a host cannot run many people\'s scripts in. The name is matched at a word boundary, so ast.literal_eval is not this and is allowed',
  },
  {
    re: /(?<![.\w])compile\b|_STR_compile_/g,
    say: 'names the compiler that both of those are built on',
    why: 'it needs neither of their names to turn text into a code object, and a pattern builder reached through its module is not this: the rule is written so that re.compile passes and a bare call does not',
  },
  {
    re: /\b__import__\b|\bimportlib\b/g,
    say: 'loads a module by a name the file never writes down',
    why: 'an import statement names what it loads and a reviewer can read it. This is refused outright rather than read for whether its argument is a literal, because an engine that runs a compiled program has no plugin to load, so there is nothing here the narrower rule would protect',
  },
  {
    re: /\b(?:SourceFileLoader|SourcelessFileLoader|ExtensionFileLoader|spec_from_file_location|module_from_spec|exec_module|create_module)\b/g,
    say: 'drives the import machinery by hand',
    why: 'a module assembled from a path or from bytes is code a review never saw, and none of these spellings has to name the module that provides them',
  },
  {
    re: /\b(?:marshal|pickle|shelve)\b|_STR_marshal_|_STR_pickle_/g,
    say: 'builds objects out of bytes, code objects among them',
    why: 'loading one of these calls whatever the bytes say to call, so it is the same guarantee broken with the text taken away. A compiled program is read as data and its shape is checked; this is the opposite of that',
  },
  {
    re: /\b(?:FunctionType|CodeType|LambdaType|CellType)\b|__code__|__globals__|__closure__/g,
    say: 'builds or replaces a function object',
    why: 'a function whose body was swapped at run time is the function builder under another name, and the review that read the original is worth nothing afterwards',
  },
  {
    re: /\bbuiltins\b|\b__builtins__\b|_STR_builtins_/g,
    say: 'names the namespace the string evaluator lives in',
    why: 'a watched name assembled out of pieces is invisible to every pattern written against its spelling, and this is the namespace such a name is looked up in. Nothing in an engine needs to reach it',
  },
  {
    re: /\b(?:globals|locals|vars)\s*\(\s*\)/g,
    say: 'takes a namespace as a dictionary',
    why: 'any name can then be read or written without either spelling appearing anywhere. The same builtins with an argument, which is how anybody inspects an object, is left alone',
  },
  {
    re: /\bsys\s*\.\s*modules\b/g,
    say: 'reaches into the table of loaded modules',
    why: 'a module installed there is a module nobody imported and no import statement names',
  },
  {
    re: /\b(?:subprocess|multiprocessing)\b|\bos\s*\.\s*(?:system|popen|exec[a-z]*|spawn[a-z]*|fork)\b/g,
    say: 'starts a process',
    why: 'a process is where text becomes a program that no scan here ever read, and the engine is started by its host rather than starting anything itself',
  },
  {
    re: /\bctypes\b/g,
    say: 'calls into machine code',
    why: 'a call through it is a call into bytes, which no review here can read and no content security policy reaches',
  },
  {
    re: /\b(?:runpy|codeop|timeit|doctest|pdb|bdb)\b|\bcode\s*\.\s*Interactive[A-Za-z]*\b/g,
    say: 'names a module whose whole purpose is running text handed to it',
    why: 'each of these takes a string and executes it, and none of them needs a watched name to do it. A test that needs one of them is a test written the wrong way round',
  },
];

/**
 * The same question asked of the contents of a string literal, decoded the way
 * the interpreter would build it rather than as the characters between the
 * quotes.
 *
 * `whenLaunching` marks a rule that is only a finding in a file that knows
 * where an interpreter is. A lone `-c` is a flag and plenty of programs have
 * one; a lone `-c` beside the path of an interpreter is a program being handed
 * source text.
 */
export const STRING_RULES = [
  {
    re: /^(?:importlib|ctypes|subprocess|runpy|codeop|shelve)$/,
    say: 'names a module as text',
    why: 'a name in a literal is how a module reaches an interpreter without an import statement anybody can read, and the name can be assembled out of pieces on the way',
  },
  {
    re: /^-{1,2}(?:c|command)$/,
    whenLaunching: true,
    say: 'is the flag that hands an interpreter source text, beside the path of an interpreter',
    why: 'an argument list is a command line with the quoting taken away, and the flag carries the program whether or not a shell ever sees it',
  },
  {
    re: /^\s*(?:python|py)[0-9.]*\s+-{1,2}(?:c|command)\b/,
    say: 'holds a command line that hands an interpreter source text',
    why: 'the text becomes a program the moment anything runs it, and a command line is read by nothing else here',
  },
];

/** Where a file knows how to start an interpreter, which is what arms the flag rule. */
const KNOWS_AN_INTERPRETER = /\bsys\s*\.\s*executable\b|\b(?:subprocess|multiprocessing)\b/;

const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/** Every rule, against one piece of Python. Line numbers start at `firstLine`. */
export function findings(file, text, { firstLine = 1 } = {}) {
  const { code, strings } = maskPython(text);
  const launches = KNOWS_AN_INTERPRETER.test(code);
  const found = [];

  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(code)) !== null) {
      found.push({ file, line: firstLine + lineAt(code, m.index) - 1, matched: m[0], rule });
    }
  }

  for (const { index, value, decoded } of strings) {
    const line = firstLine + lineAt(text, index) - 1;
    for (const rule of STRING_RULES) {
      if (rule.whenLaunching === true && !launches) continue;
      if (rule.re.test(decoded)) found.push({ file, line, matched: value, rule });
    }
  }

  return found;
}

// ---------------------------------------------------------------------------
// The rules, attacked with the corpus before a file is read
// ---------------------------------------------------------------------------

/** Every rule this arm has, so the corpus can be asked to exercise each one. */
export const EVERY_RULE = [...RULES, ...STRING_RULES];

/**
 * Every form in the corpus, through the rules, and every rule exercised by one.
 *
 * An attack that is not caught and an innocent form that is fail the same way,
 * because a pattern loose enough to match everything is not a guard either. And
 * a rule that catches nothing in the corpus fails too: a pattern that can never
 * match is the exact failure this repository has already shipped once, and it
 * looks identical to a rule that works until somebody tests it.
 *
 * Returns the corpus sizes, or stops the build saying what disagreed.
 */
export function selfTest() {
  const wrong = [];
  const fired = new Set();

  if (!markerAsWritten()) {
    wrong.push(
      `the string marker has changed, and every pattern here is written against ` +
        `"${EXPECTED_MARK}", so none of them can match`,
    );
  }

  for (const text of ATTACKS) {
    const found = findings('<corpus>', text);
    for (const one of found) fired.add(one.rule);
    if (found.length === 0) wrong.push(`not caught: ${text}`);
  }
  for (const text of INNOCENT) {
    const found = findings('<corpus>', text);
    if (found.length > 0) wrong.push(`caught wrongly: ${text} (${found[0].rule.say})`);
  }
  for (const rule of EVERY_RULE) {
    if (fired.has(rule)) continue;
    wrong.push(`no form in the corpus is caught by the rule that says it "${rule.say}"`);
  }

  if (wrong.length === 0) return { attacks: ATTACKS.length, innocent: INNOCENT.length, rules: EVERY_RULE.length };

  console.error(
    'The Python arm of the no-eval check no longer does what it says. Its own attack\n' +
      'corpus disagrees with its rules in these places:\n\n' +
      wrong.map((line) => `  ${line}`).join('\n') +
      '\n\nEvery form in scripts/lib/no-eval-python-attacks.mjs really does build code out of\n' +
      'text, or really does not, and three of them were run under an interpreter before\n' +
      'they were written down. Fix the rule rather than the corpus: a guard nobody has\n' +
      'attacked is a guard nobody has tested. A rule that catches nothing in the corpus\n' +
      'needs a form written for it, because until one exists nothing says the pattern can\n' +
      'match at all.',
  );
  process.exit(1);
}
