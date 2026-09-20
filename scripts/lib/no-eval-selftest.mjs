/**
 * The no-eval check attacked with its own corpus, before it reads a file.
 *
 * A guard nobody has attacked is a guard nobody has tested. This repository has
 * already shipped one check whose own pattern was malformed, so it could never
 * match anything and reported a clean tree for a year, and the no-eval check
 * itself has been got past in four consecutive rounds by forms that really
 * executed.
 *
 * So the check does not begin by reading files. It begins here: every form in
 * `no-eval-attacks.mjs` through the rules in `no-eval-rules.mjs`, every innocent
 * form beside it left alone, every rule the reason some form is caught, and
 * every environment value read the way the runtime reads it. A rule edited into
 * uselessness, a marker renamed, a pattern that can never match, a guard that
 * says yes to a value the runtime never saw: all of them stop the build here
 * rather than turning the guarantee off and leaving the tick green.
 *
 * Split out of the check so that the check stays a length somebody reads, and so
 * that this can be run on its own while a rule is being written.
 */
import {
  ATTACKS,
  INNOCENT,
  SETTING_ABSENT,
  SETTING_PRESENT,
  SHELL_ATTACKS,
  SHELL_INNOCENT,
  SHIPPED_ONLY,
} from './no-eval-attacks.mjs';
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
} from './no-eval-rules.mjs';
import { refusesIn, settingTokens } from './runtime.mjs';

/** Every rule the check has, so the corpus can be asked to exercise each one. */
export const EVERY_RULE = [...RULES, ...STRING_RULES, ...SHELL_RULES, BUILT_SPECIFIER, BUILT_COMMAND];

/** How many forms each corpus holds, for the line the check prints at the end. */
export const CORPUS_SIZE = {
  attacks: ATTACKS.length + SHIPPED_ONLY.length + SHELL_ATTACKS.length,
  rules: EVERY_RULE.length,
  settings: SETTING_ABSENT.length + SETTING_PRESENT.length,
};

/**
 * The patterns are written against the marker the masker emits, so a change to
 * that spelling would leave every one of them matching nothing. This repository
 * has already shipped one check that could never match anything, so the
 * assumption is stated rather than assumed. The corpus run underneath it proves
 * the rest.
 */
function markerUnchanged(wrong) {
  if (markerAsWritten()) return;
  wrong.push(
    `the string marker has changed, and every pattern in no-eval-rules.mjs is written ` +
      `against "${EXPECTED_MARK}", so none of them can match`,
  );
}

/**
 * Every form in the corpus, through the rules, and every rule exercised by one.
 *
 * An attack that is not caught and an innocent form that is fail the same way,
 * because a pattern loose enough to match everything is not a guard either. And
 * a rule that catches nothing in the corpus fails too: a pattern that can never
 * match is the exact failure this repository has already shipped once, and it
 * looks identical to a rule that works until somebody tests it.
 */
function corpusAgainstRules(wrong) {
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
}

/**
 * The other guard, asked the same way: does this environment value turn the
 * setting on, and does the answer match what the runtime does with it.
 *
 * A value that merely mentions the setting answered yes for a round, and every
 * program here then believed it was refusing while it was not. Both directions
 * are asserted, because a guard tightened until it always says no is a guard
 * that starts a second process on every run and never stops doing it.
 */
function corpusAgainstTheSetting(wrong) {
  for (const value of SETTING_ABSENT) {
    if (refusesIn(settingTokens(value))) {
      wrong.push(`read as turning the setting on, which it does not: NODE_OPTIONS=${value}`);
    }
  }
  for (const value of SETTING_PRESENT) {
    if (!refusesIn(settingTokens(value))) {
      wrong.push(`read as leaving the setting off, which it does not: NODE_OPTIONS=${value}`);
    }
  }
}

/**
 * All of it. Returns the corpus sizes, or stops the build saying what disagreed.
 */
export function selfTest() {
  const wrong = [];
  markerUnchanged(wrong);
  corpusAgainstRules(wrong);
  corpusAgainstTheSetting(wrong);
  if (wrong.length === 0) return CORPUS_SIZE;

  console.error(
    'The no-eval check no longer does what it says. Its own attack corpus disagrees\n' +
      'with its rules in these places:\n\n' +
      wrong.map((line) => `  ${line}`).join('\n') +
      '\n\nEvery form in scripts/lib/no-eval-attacks.mjs really executes code built from\n' +
      'text, or really does not, and every environment value there really does turn the\n' +
      'runtime setting on, or really does not. Fix the rule rather than the corpus: a\n' +
      'guard nobody has attacked is a guard nobody has tested. A rule that catches\n' +
      'nothing in the corpus needs a form written for it, because until one exists\n' +
      'nothing says the pattern can match at all.',
  );
  process.exit(1);
}
