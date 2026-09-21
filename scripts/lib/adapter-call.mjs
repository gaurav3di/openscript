/**
 * One invocation of an adapter, in a child process, with a clock on it.
 *
 * `conformance.md` section 9: an adapter is invoked once per case and never
 * for the suite as a whole, because the `error` outcome covers a crash, a
 * hang and a timeout, and none of the three can be reported by the program
 * that suffered it. A process that hangs writes nothing and one that dies
 * takes any partial document with it, so only a caller holding a clock and a
 * child process can turn either into an outcome, and only for one case at a
 * time. This is that caller. Every way an invocation can fail to yield one
 * JSON object comes back as a reason in a sentence, and the runner writes it
 * into the case's row.
 *
 * ## Every adapter is started by this runtime
 *
 * The command a child is started with is `process.execPath`, always, and the
 * adapter is a file that runtime runs. Section 9 makes no requirement about
 * the language an adapter is written in, and this runner meets that through
 * one indirection rather than directly: an adapter in another language is
 * started by a small JavaScript file that starts it and relays its output,
 * which is that engine's to write. The reason is rule one of this repository:
 * a process whose command was computed is refused by the same check that
 * refuses a module whose specifier was, and a runner exempt from it would be
 * the one tool here that could be handed a command line.
 *
 * The child runs under the setting that refuses to build code out of text,
 * on its command line and in its environment, for the reason `runtime.mjs`
 * gives at length.
 */
import { spawnSync } from 'node:child_process';
import { refusingArgs, refusingEnv } from './runtime.mjs';

/** What an adapter may write before it is a document nobody can hold. */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/** How much of a child's own words a reason carries, so a stack trace does not become the report. */
const TAIL_CHARACTERS = 400;

/** The last of what a child wrote, as one line, or nothing. */
function tail(text) {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') return '';
  const last = trimmed.slice(-TAIL_CHARACTERS).replace(/\s+/g, ' ');
  return `: ${last}`;
}

/**
 * The adapter, once, with the given arguments.
 *
 * `{ ok: true, value }` is the one JSON object it wrote. `{ ok: false, reason }`
 * is everything else: it could not be started, it did not finish inside
 * `timeoutMs` and was stopped, it exited non-zero, or it wrote something that
 * is not one JSON object.
 */
export function callAdapter(adapter, args, timeoutMs) {
  const child = spawnSync(process.execPath, refusingArgs([adapter, ...args]), {
    encoding: 'utf8',
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: MAX_OUTPUT_BYTES,
    env: refusingEnv(),
  });
  if (child.error !== undefined && child.error !== null) {
    if (child.error.code === 'ETIMEDOUT') {
      return { ok: false, reason: `the adapter did not finish within ${timeoutMs} ms and was stopped` };
    }
    return { ok: false, reason: `the adapter could not be started: ${child.error.message}` };
  }
  if (child.status !== 0) {
    const how = child.status === null ? `was stopped by ${child.signal}` : `exited with ${child.status}`;
    return { ok: false, reason: `the adapter ${how}${tail(child.stderr)}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(child.stdout);
  } catch {
    return { ok: false, reason: `the adapter wrote something other than one JSON object${tail(child.stdout)}` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'the adapter wrote JSON that is not an object' };
  }
  return { ok: true, value: parsed };
}

/** The field the describe invocation must answer with, and what each has to be. */
const IDENTITY_FIELDS = ['name', 'version', 'profile', 'languageVersions', 'schemaVersion'];

/**
 * `adapter --describe`, held to section 9's row: `name`, `version`,
 * `profile`, `languageVersions` and `schemaVersion`, with the profile one the
 * page lists. The runner copies these into the result document, so an
 * identity with a hole in it is refused here rather than written there.
 */
export function describeAdapter(adapter, timeoutMs, profiles) {
  const called = callAdapter(adapter, ['--describe'], timeoutMs);
  if (!called.ok) return called;
  const identity = called.value;
  for (const field of IDENTITY_FIELDS) {
    if (identity[field] === undefined || identity[field] === null) {
      return { ok: false, reason: `the adapter's identity states no ${field} (conformance.md section 9)` };
    }
  }
  if (!profiles.includes(identity.profile)) {
    return {
      ok: false,
      reason: `the adapter claims the profile ${JSON.stringify(identity.profile)}, and section 8 lists ${profiles.join(', ')}`,
    };
  }
  if (!Array.isArray(identity.languageVersions) || !identity.languageVersions.every(Number.isInteger)) {
    return { ok: false, reason: 'the adapter\'s languageVersions is not a list of integers' };
  }
  return { ok: true, identity };
}
