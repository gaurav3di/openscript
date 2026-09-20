/**
 * Rule one enforced by the runtime rather than by reading source text.
 *
 * ## Why this exists
 *
 * The textual check next door has now been got past in three consecutive
 * rounds: seven ways, then five, then three more. Each round was answered with
 * wider patterns, and each wider set was beaten by a spelling nobody had
 * thought of. That is not bad luck. A watched name can be written arbitrarily
 * many ways, and a scanner has to know all of them while an attacker needs one.
 * A list of spellings only ever has to be beaten once more.
 *
 * The runtime has no such problem. Whatever a generator is spelled as, the name
 * is resolved at run time and the builder is reached, and this setting makes the
 * builder refuse:
 *
 *     --disallow-code-generation-from-strings
 *
 * Under it, both the string evaluator and the function builder throw the moment
 * they are called, however they were written down and however they were
 * reached: through the global object, through a constructor property, through a
 * name assembled out of pieces, through an identifier spelled with an escape.
 * None of those touch the thing this setting turns off, which is the runtime's
 * own permission to compile text.
 *
 * ## What it guarantees, and what it does not
 *
 * It guarantees that **a code path that really runs cannot build code out of
 * text**. That is a stronger promise than any pattern, and it is the one the
 * rest of this project's design rests on.
 *
 * It does not read a line that never executes. A generator on a branch no test
 * reaches throws for whoever reaches it first, which may be a consumer. That is
 * exactly why the textual scan stays: it reads every file, executed or not, and
 * it catches a form before anybody runs it. The two answer different halves and
 * neither replaces the other.
 *
 * It also says nothing about a *child* process this repository starts, which
 * gets its own settings.
 *
 * ## Why it travels in the environment and not only on the command line
 *
 * That last sentence is not a footnote, and it nearly cost the whole guarantee
 * on the day this was written. The test runner puts each test file in a process
 * of its own, and a setting on the runner's command line does not reach them: a
 * probe inside a test reported that the runtime would still compile text, with
 * the setting plainly visible on the command that started the run. A guarantee
 * that is on the command line and not in the process doing the work is the
 * green tick without the safety, which is the failure this repository has now
 * paid for four times in another form.
 *
 * So it goes in the environment as well, where it is inherited by every
 * descendant however deep, and the same probe then passed. `refusingArgs` and
 * `refusingEnv` are used together, and a child started with only one of them is
 * a child that may not be covered.
 *
 * ## Why it insists rather than asks
 *
 * A setting that lives only on a command line is a setting somebody drops, and
 * this repository has already shipped three checks that silently inspected
 * less than they claimed. So a program that must have it does not check for it
 * and complain: it starts itself again with it. Continuous integration calls
 * some of these scripts directly, a developer calls them by hand, and both get
 * the guarantee without anybody having to remember.
 */
import { spawnSync } from 'node:child_process';

/** The one place this setting's name is written. */
export const NO_CODE_FROM_STRINGS = '--disallow-code-generation-from-strings';

/**
 * Whether this process really was started with it, either way it can arrive.
 *
 * A setting from the environment is in effect and is not in `execArgv`, so
 * reading the command line alone would report a refusing process as an open one
 * and start it again for nothing.
 */
export const refusesCodeFromStrings = () =>
  process.execArgv.includes(NO_CODE_FROM_STRINGS) ||
  (process.env.NODE_OPTIONS ?? '').includes(NO_CODE_FROM_STRINGS);

/** Whether this runtime knows the setting at all, so a typo cannot pass quietly. */
export const knowsTheSetting = () => process.allowedNodeEnvironmentFlags.has(NO_CODE_FROM_STRINGS);

/** Arguments for a child that must not be able to build code out of text. */
export const refusingArgs = (rest = []) => [NO_CODE_FROM_STRINGS, ...rest];

/**
 * An environment that carries the setting to a child and to its children.
 *
 * The command line covers the process it starts. This covers everything that
 * process starts, which is the half that was missing: see the note above about
 * a test runner that puts each file in a process of its own.
 */
export function refusingEnv(from = process.env) {
  const already = from.NODE_OPTIONS ?? '';
  if (already.includes(NO_CODE_FROM_STRINGS)) return { ...from };
  const options = already.length === 0 ? NO_CODE_FROM_STRINGS : `${already} ${NO_CODE_FROM_STRINGS}`;
  return { ...from, NODE_OPTIONS: options };
}

/**
 * Run this program under the setting, starting it again if it is not already.
 *
 * Returns only in a process that refuses. Otherwise it starts a second one that
 * does, passes it the same arguments, and exits with whatever that one exits
 * with, so a caller sees no difference beyond one more process.
 */
export function insistOnRefusing() {
  if (refusesCodeFromStrings()) return;

  // The listing is of what may be set in the environment, which is the half
  // that reaches a descendant. A runtime that refuses it there cannot cover a
  // test runner's per-file processes, and saying so beats running unprotected.
  if (!knowsTheSetting()) {
    console.error(
      `This runtime does not know ${NO_CODE_FROM_STRINGS}, so rule one cannot be\n` +
        'enforced by the runtime here. Use a runtime that has it: the whole point of the\n' +
        'setting is that it does not depend on how a generator was spelled.',
    );
    process.exit(1);
  }

  const entry = process.argv[1];
  if (entry === undefined) {
    console.error('Refusing to continue: there is no entry file to start again under the setting.');
    process.exit(1);
  }

  const again = spawnSync(
    process.execPath,
    refusingArgs([...process.execArgv, entry, ...process.argv.slice(2)]),
    { stdio: 'inherit', env: refusingEnv() },
  );
  if (again.error !== undefined && again.error !== null) {
    console.error(`Could not start this program again under ${NO_CODE_FROM_STRINGS}.`);
    console.error(String(again.error.message));
    process.exit(1);
  }
  process.exit(again.status ?? 1);
}
