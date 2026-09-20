/**
 * Defaults check: a default the specification prints is a default the compiler
 * fills.
 *
 * This exists because of the worst kind of defect this project can produce. The
 * library surface recorded which parameters were optional and not what each one
 * defaulted to, so an omitted argument reached an engine as absence, a lookback
 * of an absent length answers absence on every bar for ever, and `atr()`
 * written exactly as `stdlib.md` prints it compiled with nothing reported,
 * loaded with nothing reported, ran to the last bar and drew nothing at all.
 * Twenty-nine calls out of thirty-one behaved that way. The suite was green
 * throughout, because every example, every gate script and all 101 studies pass
 * their lengths explicitly, which is exactly how a defect that size stays
 * invisible.
 *
 * A crash gets fixed. A silent wrong answer gets traded on. So the fix is not
 * only the defaults: it is that an optional parameter can no longer be in an
 * undecided state. There are two states and this check refuses every third one.
 *
 * 1. **The surface carries the default**, spelled exactly as `stdlib.md` prints
 *    it, so the two can be compared by eye and by this script.
 * 2. **The parameter is recorded in `spec/default-exceptions.json`**, with what
 *    the specification states in place of a value and why that is not one. A
 *    leg the file declares and a size the `strategy()` declaration sets are the
 *    real cases: the library has no value to carry for either.
 *
 * Neither is a defect. Both is a contradiction. A default the surface invented,
 * or one that has drifted from the specification, is a defect as well, and that
 * is the direction that would otherwise go unnoticed: nothing else compares the
 * number a script gets against the number the documentation promises.
 *
 * **What this does not check.** A parameter the specification has and the
 * surface does not is a different defect, in arity rather than in defaults, and
 * a call that reaches for one is already OS3001. This is about the parameters
 * both of them have.
 *
 * Run: node scripts/check-defaults.mjs [--list]
 */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SPEC = 'spec/stdlib.md';
const ALLOW_PATH = 'spec/default-exceptions.json';
const SURFACE = 'dist/core/index.js';
const EMITTER = 'dist/core/emit/index.js';

/** The catalogue sections. 1 and 2 are prose, 18 and 19 are maps of it. */
const FIRST_SECTION = 3;
const LAST_SECTION = 17;

/** A default the compiler writes into the call as a constant. */
const LITERAL = /^(-?\d+(\.\d+)?|"[^"]*"|true|false|none)$/;

/** A default the compiler fills by reading a library name: `hlc3`, `chart.timezone`. */
const NAME = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)?$/;

/** Split a parameter list on the commas that separate parameters. */
function splitTop(text, open, close) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === open) depth += 1;
    else if (ch === close) depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/**
 * Every default `stdlib.md` states, as `name.param` to the text it prints.
 *
 * A row writes `zone = ...` where an earlier row in the same section already
 * said what `zone` is, which is what a reader understands by it, so the
 * ellipsis resolves to the nearest preceding row that stated that parameter.
 * Resolving it by parameter name alone would be wrong: `qty` is stated four
 * different ways in section 17, and `sell(qty = ...)` means the row above it.
 *
 * A row whose parameter list holds a bare `...` is a fragment written to point
 * at one argument rather than a signature, so it is not read here. Sections 18
 * and 19 are made of those, which is why the range stops before them.
 */
function specDefaults(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const stated = new Map();
  let section = 0;
  let recent = new Map();

  for (const line of lines) {
    const heading = /^## (\d+)\./.exec(line);
    if (heading) {
      section = Number(heading[1]);
      recent = new Map();
    }
    if (section < FIRST_SECTION || section > LAST_SECTION) continue;
    if (!line.startsWith('|')) continue;

    const cell = (line.split('|')[1] ?? '').trim();
    const row = /^`([a-zA-Z_][A-Za-z0-9_.]*)\(([^`]*)\)`/.exec(cell);
    if (row === null) continue;

    const parts = splitTop(row[2], '[', ']');
    if (parts.includes('...')) continue;

    for (const part of parts) {
      const equals = part.indexOf('=');
      if (equals < 0) continue;
      const parameter = part.slice(0, equals).trim();
      let text = part.slice(equals + 1).trim();
      if (text === '...') {
        const earlier = recent.get(parameter);
        if (earlier === undefined) continue;
        text = earlier;
      } else {
        recent.set(parameter, text);
      }
      const key = `${row[1]}.${parameter}`;
      const seen = stated.get(key);
      if (seen !== undefined && seen !== text) {
        stated.set(key, { text, conflict: `${seen} and ${text}` });
      } else if (seen === undefined) {
        stated.set(key, { text, conflict: undefined });
      }
    }
  }
  return stated;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(SURFACE) || !existsSync(EMITTER)) {
  fail(
    `${SURFACE} is not built, so this check would inspect nothing. Run \`npm run build\` first.\n` +
      'It reads the parsed surface rather than the signature strings, so that what it checks is ' +
      'what the compiler actually uses.',
  );
}

const core = await import(pathToFileURL(SURFACE).href);
const emitter = await import(pathToFileURL(EMITTER).href);

/**
 * The calls this does not ask about, and why that is not a hole.
 *
 * A `plot` or a `level` is not a function an engine calls: its optional
 * arguments become fields of a declaration in the program's `outputs`, written
 * with the value they resolved to (`compiled-program.md` 2.3), and those values
 * have their one home in `src/core/emit/defaults.ts`. Carrying them here as
 * well would be the same fact in two files. The set is read from the emitter
 * rather than written out, so it cannot quietly grow to cover a call whose
 * defaults nobody recorded anywhere.
 */
const DECLARATIONS = emitter.DECLARATION_CALLS;

const stated = specDefaults(SPEC);
if (stated.size === 0) {
  fail(
    `No defaults were found in ${SPEC}, so this check inspected nothing. Either the catalogue ` +
      'tables changed shape or the section numbering moved, and a check that finds nothing ' +
      'reports success without providing any.',
  );
}

const allowed = existsSync(ALLOW_PATH)
  ? JSON.parse(readFileSync(ALLOW_PATH, 'utf8'))
  : { exceptions: [] };
const exceptions = new Map(
  (allowed.exceptions ?? []).map((one) => [one.parameter, one.reason ?? '']),
);
const usedExceptions = new Set();

const problems = [];
let optional = 0;
let carried = 0;
let declarations = 0;

for (const name of core.libraryNames()) {
  for (const entry of core.libraryEntries(name)) {
    for (const parameter of entry.parameters) {
      if (!parameter.optional) continue;
      if (DECLARATIONS.has(name)) {
        declarations += 1;
        continue;
      }
      optional += 1;

      const key = `${name}.${parameter.name}`;
      const spec = stated.get(key);
      const recorded = parameter.defaultText;
      const excepted = exceptions.has(key);
      if (excepted) usedExceptions.add(key);

      if (spec?.conflict !== undefined) {
        problems.push(
          `${key}: ${SPEC} states two different defaults for it, ${spec.conflict}. One of the ` +
            'two rows is wrong, and until they agree there is nothing for the surface to carry.',
        );
        continue;
      }

      // A literal first: `none`, `true` and `false` are spelled like names and
      // are not read like them, so the order of these two tests is the rule.
      const literal = spec !== undefined && LITERAL.test(spec.text);
      const read = spec !== undefined && !literal && NAME.test(spec.text);
      const fillable = literal || read ? spec.text : undefined;

      if (read && !core.isLibraryName(fillable)) {
        problems.push(
          `${key}: ${SPEC} gives it a default of \`${fillable}\`, which is not a name the ` +
            'library holds, so the compiler has nothing to read at the call. Either the ' +
            'specification has a typo or the library is missing the name.',
        );
        continue;
      }

      if (fillable !== undefined && excepted) {
        problems.push(
          `${key}: recorded in ${ALLOW_PATH} as stating no value, but ${SPEC} states ` +
            `\`${fillable}\`. One of the two is out of date. Carry the default in the surface ` +
            'and delete the exception.',
        );
        continue;
      }

      if (fillable !== undefined && recorded === undefined) {
        problems.push(
          `${key}: ${SPEC} gives it a default of \`${fillable}\` and the surface carries none, ` +
            `so a call that leaves it out is emitted as absent. Write \`${parameter.name}?: ` +
            `<type> = ${fillable}\` into the signature. This is the defect the check exists ` +
            'for: nothing else reports it, at compile, at load or at run.',
        );
        continue;
      }

      if (fillable !== undefined && recorded !== fillable) {
        problems.push(
          `${key}: the surface carries \`${recorded}\` and ${SPEC} states \`${fillable}\`. A ` +
            'script that leaves the argument out gets a different number from the one the ' +
            'documentation promises, and nothing else compares the two.',
        );
        continue;
      }

      if (fillable !== undefined) {
        carried += 1;
        continue;
      }

      // The specification states no value here: words in place of one, as
      // `leg = the only leg` is, or nothing at all.
      if (recorded !== undefined) {
        problems.push(
          `${key}: the surface carries a default of \`${recorded}\` that ${SPEC} does not ` +
            `state${spec === undefined ? '' : ` (it states \`${spec.text}\`)`}. A default this ` +
            'compiler invented is indistinguishable, on the chart, from one the specification ' +
            'meant.',
        );
        continue;
      }

      if (!excepted) {
        problems.push(
          `${key}: optional, with no default in the surface and no value stated in ${SPEC}` +
            `${spec === undefined ? '' : ` (it states \`${spec.text}\`, which is not a value)`}. ` +
            `Either carry the default, or record it in ${ALLOW_PATH} with what the ` +
            'specification says instead and why that is not a value. Leaving it undecided is ' +
            'what let an omitted argument reach an engine as absence.',
        );
      }
    }
  }
}

for (const [key, reason] of exceptions) {
  if (usedExceptions.has(key)) continue;
  problems.push(
    `${ALLOW_PATH} records ${key}, which is not an optional parameter of any library entry. ` +
      `Delete the entry: a stale exception is a rule nobody is under. Its reason read: ${reason}`,
  );
}

if (process.argv.includes('--list')) {
  for (const problem of problems) console.log(problem);
  console.log(
    `\n${optional} optional parameters outside a declaration call, ${carried} carrying the ` +
      `specification's default, ${exceptions.size} recorded as stating no value, ` +
      `${problems.length} problems.`,
  );
  process.exit(0);
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`${problem}\n`);
  console.error(
    `${problems.length} default${problems.length === 1 ? '' : 's'} the library and the ` +
      'specification do not agree about. Each one is a script written exactly as the ' +
      'documentation prints it, compiling clean and computing something else.',
  );
  process.exit(1);
}

console.log(
  `Defaults check passed: ${carried} of ${optional} optional parameters carry the default ` +
    `${SPEC} states, ${usedExceptions.size} are recorded in ${ALLOW_PATH} as stating no value, ` +
    `and ${declarations} belong to declaration calls whose defaults live in the program's ` +
    'outputs.',
);
