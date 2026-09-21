/**
 * The second engine's conformance adapter, as the runner can start one.
 *
 * `conformance.md` section 9 makes no requirement about the language an adapter
 * is written in, and `scripts/lib/adapter-call.mjs` meets that through one
 * indirection rather than directly: every child is started with the runtime the
 * runner itself runs on, so "an adapter in another language is started by a
 * small JavaScript file that starts it and relays its output, which is that
 * engine's to write". This is that file, and it lives beside the engine it
 * starts rather than in `scripts/`, because it is the Python distribution's
 * adapter and not the repository's.
 *
 *     node engine/adapter.mjs --describe
 *     node engine/adapter.mjs cases/order/buy
 *     node engine/adapter.mjs --actual cases/order/buy
 *
 * ## What it adds, and why that is not cheating
 *
 * It compiles `script.os` and hands the compiled program to the engine on
 * standard input. The Python engine implements no compiler, and section 1
 * provides for exactly that: "An implementation that only has an engine (it
 * reads compiled programs produced elsewhere) runs the engine half and says
 * so." So the compiler here is this repository's, the engine under test is the
 * one in `engine/`, and what a result says is that the second engine ran the
 * program the first one emitted. That is the production arrangement as well: a
 * container with no runtime for this language is handed a compiled program as
 * data, which is the decision the whole second engine rests on.
 *
 * Two things follow and are reported rather than hidden. A case whose assertion
 * is the compiler's own diagnostics is answered `unsupported` by the engine, not
 * passed, because those diagnostics are not the engine's to claim. And the
 * program travels as the canonical text, so the engine's own text boundary,
 * including the canonicity check a recorded hash depends on, is exercised on
 * every case.
 *
 * ## What it refuses
 *
 * A missing build, because the compiler is loaded by the door a host is handed
 * rather than read out of source. An interpreter it cannot find, by name and
 * with what each candidate said. Anything else it exits with the child's own
 * status, so a crash stays a crash and the runner reports it as `error`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_MODULE, fromRoot } from '../scripts/lib/built.mjs';
import { frontEndWith } from '../scripts/lib/example-run.mjs';

const DESCRIBE = '--describe';
const ACTUAL = '--actual';

/** The name section 2 fixes for the source inside a case. */
const SCRIPT_NAME = 'script.os';

/**
 * The spellings an interpreter answers to, tried in this order.
 *
 * Written down rather than taken from the environment, for the reason
 * `no-eval-rules.mjs` gives: a command this file computed is a command a reader
 * cannot check. `scripts/check-python.mjs` holds the same two spellings for the
 * same reason, and the two lists are one fact in two files until something
 * exports it; the stage's report names the move.
 */
const CANDIDATES = ['python3', 'python'];

/** The package directory, which is what puts `openscript` on the import path. */
const ENGINE = fileURLToPath(new URL('.', import.meta.url));

function refuse(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const argv = process.argv.slice(2);
const mode =
  argv.length === 1 && argv[0] === DESCRIBE ? 'describe'
  : argv.length === 2 && argv[0] === ACTUAL ? 'actual'
  : argv.length === 1 && !argv[0].startsWith('--') ? 'case'
  : null;
if (mode === null) {
  refuse(
    'Usage: node engine/adapter.mjs --describe | <case-directory> | --actual <case-directory>\n' +
      'conformance.md section 9 gives an adapter these three invocations and no other.',
  );
}

/**
 * The compiled program for a case, as the canonical text the engine is handed,
 * or the diagnostics that stopped it being one.
 */
async function envelopeFor(directory) {
  if (!existsSync(fromRoot(CORE_MODULE))) {
    refuse(
      `${fromRoot(CORE_MODULE)} is not built, so this adapter has no compiler to hand the engine ` +
        'a program from. Run `npm run build` first. The compiler is loaded by the door a host is ' +
        'handed rather than read out of source, because the door is what a host runs.',
    );
  }
  const core = await import(CORE_MODULE);
  const path = resolve(directory, SCRIPT_NAME);
  if (!existsSync(path)) {
    refuse(`${path} does not exist, and section 2 requires script.os of every case.`);
  }
  const compiled = frontEndWith(core, core)(SCRIPT_NAME, readFileSync(path, 'utf8'));
  const errors = compiled.diagnostics.filter((one) => one.severity === 'error');
  if (errors.length > 0 || compiled.program === undefined) {
    return core.canonicalise({
      diagnostics: errors.map((one) => ({
        code: one.code,
        line: one.span.line,
        column: one.span.column,
        severity: one.severity,
      })),
    });
  }
  return core.canonicalise({ program: core.canonicalise(compiled.program) });
}

/** The engine, once, with what it was handed on standard input. */
function start(args, input) {
  const tried = [];
  for (const command of CANDIDATES) {
    const child = spawnSync(command, ['-m', 'openscript', ...args], {
      cwd: ENGINE,
      encoding: 'utf8',
      input,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    if (child.error !== undefined && child.error !== null) {
      tried.push(`  ${command}: ${child.error.code ?? child.error.message}`);
      continue;
    }
    return child;
  }
  refuse(
    `No interpreter answered, so the second engine was not asked about this case:\n\n${tried.join('\n')}\n\n` +
      'Install Python at the version engine/pyproject.toml requires, or put it on the path under ' +
      `one of ${CANDIDATES.join(' or ')}.`,
  );
  return null;
}

const directory = mode === 'actual' ? argv[1] : argv[0];
const input = mode === 'describe' ? '' : await envelopeFor(directory);
const args = mode === 'describe' ? [DESCRIBE] : mode === 'actual' ? [ACTUAL, resolve(directory)] : [resolve(directory)];
const child = start(args, input);

if (child.stderr !== '') process.stderr.write(child.stderr);
process.stdout.write(child.stdout);
process.exit(child.status === null ? 1 : child.status);
