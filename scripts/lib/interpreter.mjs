/**
 * Which Python interpreter the second engine's checks run under.
 *
 * Two checks start one, `check-python.mjs` and `check-manifests.mjs`, and each
 * needs the same two facts: the spellings an interpreter answers to, and the
 * oldest version the first host supports. They are written once, here, because
 * a version floor in two files is a floor that moves in one of them.
 */
import { spawnSync } from 'node:child_process';

/** The first host requires this, and `engine/pyproject.toml` states it. */
export const LOWEST = [3, 12];

/**
 * The spellings an interpreter answers to, tried in this order.
 *
 * Both are written down rather than taken from the environment: a command this
 * file computed is a command a reader cannot check, which is the rule
 * `check-no-eval.mjs` holds every launch in this repository to.
 */
export const CANDIDATES = ['python3', 'python'];

/** The script that says what an interpreter is, as one JSON object. */
export const ENVIRONMENT = 'engine/tools/environment.py';

/**
 * Run one Python file under a candidate.
 *
 * Bytecode caching is turned off for every call, so nothing a check does leaves
 * a directory of compiled files behind. `check-no-eval.mjs` reads every file
 * this project holds and refuses one it cannot place, and a compiled bytecode
 * file is code nobody can read.
 */
export const ask = (command, program) =>
  spawnSync(command, [program], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });

/** The first candidate that answers and is new enough, or the sentence refusing the run. */
export function findInterpreter() {
  const tried = [];
  for (const candidate of CANDIDATES) {
    const result = ask(candidate, ENVIRONMENT);
    if (result.error || result.status !== 0) {
      tried.push(`  ${candidate}: ${result.error ? result.error.code : result.stderr.trim().split('\n').pop()}`);
      continue;
    }
    const said = JSON.parse(result.stdout);
    const [major, minor] = said.version;
    if (major < LOWEST[0] || (major === LOWEST[0] && minor < LOWEST[1])) {
      tried.push(`  ${candidate}: Python ${said.version.join('.')}, older than ${LOWEST.join('.')}`);
      continue;
    }
    return { command: candidate, said };
  }
  return {
    refusal:
      `No interpreter answered, so the second engine was not checked and its tests did not\n` +
      `run:\n\n${tried.join('\n')}\n\n` +
      `The gate covers both engines, so a missing interpreter fails it rather than\n` +
      `skipping it: a suite that quietly checks one engine is how two engines drift\n` +
      `apart. Install Python ${LOWEST.join('.')} or later, or put it on the path under one of ` +
      `${CANDIDATES.join(' or ')}.`,
  };
}
