/**
 * The runtime setting this repository's own tooling runs under, and the exact
 * size of what it promises.
 *
 * ## Why this exists
 *
 * The textual check next door has now been got past in four consecutive rounds:
 * seven ways, then five, then three more, then a live generator planted in the
 * test runner itself, which executed on every run while the scan printed that
 * nothing here builds code out of text. Each round was answered with wider
 * patterns, and each wider set was beaten by a spelling nobody had thought of.
 * That is not bad luck. A watched name can be written arbitrarily many ways, and
 * a scanner has to know all of them while an attacker needs one. A list of
 * spellings only ever has to be beaten once more.
 *
 * The runtime has no such problem, for the two names it covers. However a
 * generator is spelled, the name is resolved at run time and the builder is
 * reached, and this setting makes the builder refuse:
 *
 *     --disallow-code-generation-from-strings
 *
 * Under it, the string evaluator and the function builder throw the moment they
 * are called, however they were written down and however they were reached:
 * through the global object, through a constructor property, through a name
 * assembled out of pieces, through an identifier spelled with an escape. None of
 * those touch the thing this setting turns off, which is the runtime's own
 * permission to compile text.
 *
 * ## What it does not cover, measured rather than assumed
 *
 * This is the part that was claimed wrongly for four rounds, so it is written
 * here as a measurement. On the runtime this project pins, in a process started
 * with the setting, every one of these still ran:
 *
 *   - the whole of the runtime's virtual machine module: text run in a new
 *     context, a function compiled from source, a script object built and run
 *   - a module imported from a data URL, whose body is source text
 *   - a module assembled out of bytes
 *   - a child process, handed source text on its command line
 *
 * A worker refused on that runtime, because a worker inherits the setting, but
 * one runtime's behaviour is not a promise and the next release may inherit
 * differently.
 *
 * So **"a generator cannot run under this setting" is false**, and neither this
 * module nor the scan next door may say it. Two names are refused. Everything
 * above is a third name, reached through a module, and the setting has nothing
 * to say about any of them.
 *
 * ## Where the guarantee about the shipped engine actually lives
 *
 * Not here, and it is stronger than anything here. `check-layering.mjs` refuses
 * any import of a module from the runtime's own namespace anywhere under `src`,
 * and has enforced that since before the first source file existed. Every door
 * in the list above is one of those modules, so the package a platform installs
 * cannot open one: not by a spelling a scan missed, and not by one nobody has
 * thought of yet. It is unreachable by construction rather than unmatched by a
 * pattern.
 *
 * That gives two claims of two different sizes, and the larger one must not be
 * allowed to cover the smaller:
 *
 *   - **The shipped engine cannot build code out of text.** It cannot import
 *     the modules that would let it, and the two names that remain are refused
 *     by the setting an adopter turns on. Enforced by `check-layering.mjs`,
 *     plus the setting in the adopter's own process.
 *   - **This repository's tooling is a separate and weaker question.** It runs
 *     under the setting, so the two names are refused wherever a code path
 *     really executes, and the scan reads every file including the branches
 *     nothing runs. Neither of those is the artifact's guarantee, and neither
 *     closes the doors listed above.
 *
 * ## Why the setting travels in the environment and not only on the command line
 *
 * The test runner puts each test file in a process of its own, and a setting on
 * the runner's command line does not reach them: a probe inside a test reported
 * that the runtime would still compile text, with the setting plainly visible on
 * the command that started the run. A guarantee that is on the command line and
 * not in the process doing the work is the green tick without the safety.
 *
 * So it goes in the environment as well, where it is inherited by every
 * descendant however deep, and the same probe then passed. `refusingArgs` and
 * `refusingEnv` are used together, and a child started with only one of them is
 * a child that may not be covered.
 *
 * ## Why the environment is parsed rather than searched
 *
 * A round of this check asked whether the environment value **contained** the
 * setting's spelling. One variable whose value merely mentions it, say a process
 * title or the path of a file named after it, answered yes, and then every
 * program here believed it was refusing while it was not, and handed that same
 * environment to every child. The setting is a token in a list the runtime
 * parses, so it is read as one: split the way the runtime splits it, compared
 * whole, and with the runtime's own negation of it counted, which is a token
 * that also contains the spelling and turns the setting off.
 */
import { spawnSync } from 'node:child_process';

/** The one place this setting's name is written. */
export const NO_CODE_FROM_STRINGS = '--disallow-code-generation-from-strings';

/**
 * The runtime's own way of turning the same setting off.
 *
 * It contains the setting's spelling, which is why a search for a substring
 * reports a refusing process where the runtime has been told the opposite.
 */
export const CODE_FROM_STRINGS_AGAIN = '--no-disallow-code-generation-from-strings';

/**
 * One environment value split into tokens the way the runtime splits it.
 *
 * Measured against the runtime rather than guessed: it separates on whitespace,
 * it reads a double quote as grouping and strips it, and it does nothing with a
 * single quote or a backslash, both of which stay part of the token. That last
 * part matters in the direction that costs something: a tokeniser that helpfully
 * unescaped a backslash would report a setting the runtime never saw.
 */
export function settingTokens(value) {
  const tokens = [];
  let token = '';
  let quoted = false;
  let started = false;
  for (const c of value) {
    if (quoted) {
      if (c === '"') quoted = false;
      else token += c;
      started = true;
      continue;
    }
    if (c === '"') {
      quoted = true;
      started = true;
      continue;
    }
    if (/\s/.test(c)) {
      if (started) tokens.push(token);
      token = '';
      started = false;
      continue;
    }
    token += c;
    started = true;
  }
  if (started) tokens.push(token);
  return tokens;
}

/**
 * Whether an ordered list of runtime arguments leaves the setting on.
 *
 * Ordered because the runtime lets the last one win, so a list holding both the
 * setting and its negation says whichever came second. The whole list is read
 * for that reason rather than stopping at the first match.
 */
export function refusesIn(tokens) {
  let refuses = false;
  for (const token of tokens) {
    if (token === NO_CODE_FROM_STRINGS) refuses = true;
    else if (token === CODE_FROM_STRINGS_AGAIN) refuses = false;
  }
  return refuses;
}

/**
 * Every runtime argument a process was given, in the order the runtime read them.
 *
 * The environment first and the command line second, because that is the order
 * the runtime reads them in and therefore the order in which the last one wins.
 */
export const settingsOf = (env = process.env, argv = process.execArgv) => [
  ...settingTokens(env.NODE_OPTIONS ?? ''),
  ...argv,
];

/** Whether this process really was started with it, either way it can arrive. */
export const refusesCodeFromStrings = () => refusesIn(settingsOf());

/** Whether this runtime knows the setting at all, so a typo cannot pass quietly. */
export const knowsTheSetting = () => process.allowedNodeEnvironmentFlags.has(NO_CODE_FROM_STRINGS);

/**
 * Arguments for a child that must not be able to build code out of text.
 *
 * A negation anywhere in the list is dropped rather than carried through. This
 * list's whole contract is a child that refuses, and passing on an argument that
 * undoes it would break that contract silently. It also makes a restart loop
 * impossible: a program that starts itself again cannot hand itself the argument
 * that made it start again.
 */
export const refusingArgs = (rest = []) => [
  NO_CODE_FROM_STRINGS,
  ...rest.filter((arg) => arg !== CODE_FROM_STRINGS_AGAIN),
];

/**
 * An environment that carries the setting to a child and to its children.
 *
 * The command line covers the process it starts. This covers everything that
 * process starts, which is the half that was missing: see the note above about
 * a test runner that puts each file in a process of its own.
 *
 * Appended rather than prepended, so that a value which already turns the
 * setting off is overridden rather than obeyed.
 */
export function refusingEnv(from = process.env) {
  const already = from.NODE_OPTIONS ?? '';
  if (refusesIn(settingTokens(already))) return { ...from };
  const options = already.trim().length === 0 ? NO_CODE_FROM_STRINGS : `${already} ${NO_CODE_FROM_STRINGS}`;
  return { ...from, NODE_OPTIONS: options };
}

/**
 * Run this program under the setting, starting it again if it is not already.
 *
 * Returns only in a process that refuses. Otherwise it starts a second one that
 * does, passes it the same arguments, and exits with whatever that one exits
 * with, so a caller sees no difference beyond one more process.
 *
 * A setting that lives only on a command line is a setting somebody drops, and
 * this repository has already shipped several checks that silently inspected
 * less than they claimed. So a program that must have it does not check for it
 * and complain: it starts itself again with it.
 */
export function insistOnRefusing() {
  if (refusesCodeFromStrings()) return;

  // The listing is of what may be set in the environment, which is the half
  // that reaches a descendant. A runtime that refuses it there cannot cover a
  // test runner's per-file processes, and saying so beats running unprotected.
  if (!knowsTheSetting()) {
    console.error(
      `This runtime does not know ${NO_CODE_FROM_STRINGS}, so the two names it refuses\n` +
        'are not refused here. Use a runtime that has it: the point of the setting is that\n' +
        'it does not depend on how a generator was spelled.',
    );
    process.exit(1);
  }

  const entry = process.argv[1];
  if (entry === undefined) {
    console.error('Refusing to continue: there is no entry file to start again under the setting.');
    process.exit(1);
  }

  const runtimeArgs = refusingArgs(process.execArgv);
  const env = refusingEnv();

  // What is about to be started, asked the same question this program was asked.
  // Without it, a list that says one thing and its opposite would start a process
  // that starts a process, for as long as anybody let it run.
  if (!refusesIn(settingsOf(env, runtimeArgs))) {
    console.error(
      `Refusing to start this program again: the arguments it would be given do not turn\n` +
        `${NO_CODE_FROM_STRINGS} on. Look for ${CODE_FROM_STRINGS_AGAIN}\n` +
        'in NODE_OPTIONS, which is the runtime\'s own way of turning it back off.',
    );
    process.exit(1);
  }

  const again = spawnSync(process.execPath, [...runtimeArgs, entry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env,
  });
  if (again.error !== undefined && again.error !== null) {
    console.error(`Could not start this program again under ${NO_CODE_FROM_STRINGS}.`);
    console.error(String(again.error.message));
    process.exit(1);
  }
  process.exit(again.status ?? 1);
}
