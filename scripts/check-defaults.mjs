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
 * ## Why a declaration call is no longer excluded
 *
 * A `plot`, a `fill` or a `level` used to be counted and passed over, because
 * its defaults are not in the library surface: they become fields of a
 * declaration in the program's `outputs` (`compiled-program.md` 2.3) and their
 * one home is `src/core/emit/defaults.ts`. That is a reason to open the second
 * file, and it was taken as a reason to skip the category. The next instance of
 * this check's own defect was in it: the documentation printed a band's
 * `opacity` as twelve percent, the emitter wrote 1, and a band a reader was
 * promised at twelve percent drew solid with nothing reporting it. **A check
 * that carves out a category tends to be wrong in exactly that category.** So
 * both files are read, and a declaration call's option is held to the same three
 * states as everything else. An argument the specification marks planned has
 * nothing written yet to disagree with, and is counted and named instead.
 *
 * **What this does not check.** A parameter the specification has and the
 * surface does not is a different defect, in arity rather than in defaults, and
 * a call that reaches for one is already OS3001. This is about the parameters
 * both of them have.
 *
 * Run: node scripts/check-defaults.mjs [--list]
 */
import { existsSync, readFileSync } from 'node:fs';
import { COLOURS_MODULE, CORE_MODULE as SURFACE_MODULE, DEFAULTS_MODULE, EMITTER_MODULE, fromRoot } from './lib/built.mjs';

const SPEC = 'spec/stdlib.md';
const ALLOW_PATH = 'spec/default-exceptions.json';

/** The four built files this reads, as the working directory sees them. */
const SURFACE = fromRoot(SURFACE_MODULE);
const EMITTER = fromRoot(EMITTER_MODULE);
const DEFAULTS = fromRoot(DEFAULTS_MODULE);
const COLOURS = fromRoot(COLOURS_MODULE);

/** The catalogue sections. 1 and 2 are prose, 18 and 19 are maps of it. */
const FIRST_SECTION = 3;
const LAST_SECTION = 17;

/** A default the compiler writes into the call as a constant. */
const LITERAL = /^(-?\d+(\.\d+)?|"[^"]*"|true|false|none)$/;

/** A default the compiler fills by reading a library name: `hlc3`, `chart.timezone`. */
const NAME = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)?$/;

/** A table cell without the backticks a document quotes a value with. */
function bare(cell) {
  const text = cell.trim();
  return text.startsWith('`') && text.endsWith('`') && text.length > 1
    ? text.slice(1, -1).trim()
    : text;
}

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
 *
 * **A table of arguments counts as a signature too.** Section 13's rows name the
 * control each `input` kind produces rather than a signature, so every one of
 * them is a fragment, and the arguments they all share are stated once in a
 * table of their own instead. A section whose call rows all name one call is
 * unambiguous about whose arguments those are, which is what makes reading them
 * a reading of the document rather than a list kept in this file. An argument
 * the table marks planned is returned separately: there is no compiler to
 * compare it against yet, and calling that agreement would be inventing one.
 */
function specDefaults(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const stated = new Map();
  const planned = [];
  let section = 0;
  let recent = new Map();

  /** The calls one section names, and the shared arguments it tables. */
  let calls = new Set();
  let shared = [];
  /** Which cell of the argument table holds the default, while one is open. */
  let defaultCell = -1;

  const state = (key, text) => {
    const seen = stated.get(key);
    if (seen !== undefined && seen.text !== text) {
      stated.set(key, { text, conflict: `${seen.text} and ${text}` });
    } else if (seen === undefined) {
      stated.set(key, { text, conflict: undefined });
    }
  };

  const closeSection = () => {
    if (calls.size === 1) {
      const [call] = calls;
      for (const one of shared) {
        if (one.planned) planned.push(`${call}.${one.parameter}`);
        else state(`${call}.${one.parameter}`, one.text);
      }
    }
    calls = new Set();
    shared = [];
  };

  for (const line of lines) {
    const heading = /^## (\d+)\./.exec(line);
    if (heading) {
      closeSection();
      section = Number(heading[1]);
      recent = new Map();
    }
    if (section < FIRST_SECTION || section > LAST_SECTION) continue;
    if (!line.startsWith('|')) {
      defaultCell = -1;
      continue;
    }

    const cells = line.split('|').map((one) => one.trim());
    const header = cells.indexOf('Default');
    if (cells[1] === 'Argument') {
      defaultCell = header;
      continue;
    }
    if (defaultCell > 0) {
      const parameter = bare(cells[1] ?? '');
      const text = bare(cells[defaultCell] ?? '');
      if (/^[a-z][A-Za-z0-9]*$/.test(parameter) && text.length > 0) {
        shared.push({ parameter, text, planned: (cells[2] ?? '').includes('(planned)') });
      }
      continue;
    }

    const cell = cells[1] ?? '';
    const row = /^`([a-zA-Z_][A-Za-z0-9_.]*)\(([^`]*)\)`/.exec(cell);
    if (row === null) continue;
    calls.add(row[1]);

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
      state(`${row[1]}.${parameter}`, text);
    }
  }
  closeSection();
  return { stated, planned };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(SURFACE) || !existsSync(EMITTER) || !existsSync(DEFAULTS) || !existsSync(COLOURS)) {
  fail(
    `${SURFACE} is not built, so this check would inspect nothing. Run \`npm run build\` first.\n` +
      'It reads the parsed surface rather than the signature strings, so that what it checks is ' +
      'what the compiler actually uses.',
  );
}

const core = await import(SURFACE_MODULE);
const emitter = await import(EMITTER_MODULE);
const written = await import(DEFAULTS_MODULE);
const colours = await import(COLOURS_MODULE);

/**
 * The calls whose defaults are in the emitter rather than in the surface.
 *
 * A `plot` or a `level` is not a function an engine calls: its optional
 * arguments become fields of a declaration in the program's `outputs`, written
 * with the value they resolved to (`compiled-program.md` 2.3). The set is read
 * from the emitter rather than written out, so it cannot quietly grow to cover a
 * call nobody thought about.
 */
const DECLARATIONS = emitter.DECLARATION_CALLS;

/**
 * Which map holds each of them, which is the one association written here.
 *
 * The emitter makes it in code, at the call sites in `outputs.ts`, `events.ts`
 * and `inputs.ts`, and there is nothing to read it off. So it is written down,
 * and then held to the file: a declaration call with optional parameters and no
 * map is a failure, and a key in a map that is not an optional parameter of its
 * call is a failure. Neither side can drift without saying so.
 */
const DECLARATION_DEFAULTS = new Map([
  ['plot', written.PLOT_DEFAULTS],
  ['plotCandles', written.CANDLE_DEFAULTS],
  ['fill', written.FILL_DEFAULTS],
  ['level', written.LEVEL_DEFAULTS],
  ['table', written.TABLE_DEFAULTS],
  ['signal', written.MARKER_DEFAULTS],
  ['alert', written.ALERT_DEFAULTS],
  ['input', written.INPUT_DEFAULTS],
]);

/** A colour as a comparable string, so a name and a value meet in one spelling. */
function hexOf(colour) {
  const byte = (channel) => Math.round(channel).toString(16).padStart(2, '0');
  return `#${byte(colour[0])}${byte(colour[1])}${byte(colour[2])}${byte(colour[3] * 255)}`;
}

/** What the specification would print for a value the emitter writes. */
function spelling(value) {
  if (value === undefined) return undefined;
  switch (value.kind) {
    case 'absent':
      return 'none';
    case 'bool':
    case 'number':
      return String(value.value);
    case 'string':
      return JSON.stringify(value.value);
    case 'colour':
      return hexOf(value.value);
    default:
      return `a ${value.kind}`;
  }
}

/** The one spelling a colour has, so `lime` and its channels compare equal. */
function normal(text) {
  if (text === undefined) return undefined;
  const colour = colours.isColourName(text) ? colours.namedColour(text) : undefined;
  return colour === undefined ? text : hexOf(colour);
}

const { stated, planned } = specDefaults(SPEC);
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
const unplanned = new Set(planned);
let optional = 0;
let carried = 0;
let declarations = 0;

// The association above, held to the file it names. A declaration call that
// grew an optional parameter with nowhere to record its default would otherwise
// land back in the state this check exists to refuse.
for (const name of DECLARATIONS) {
  const held = new Set();
  for (const entry of core.libraryEntries(name)) {
    for (const parameter of entry.parameters) if (parameter.optional) held.add(parameter.name);
  }
  const map = DECLARATION_DEFAULTS.get(name);
  if (held.size === 0) continue;
  if (map === undefined) {
    problems.push(
      `${name} is a declaration call with optional parameters and no map in ${DEFAULTS}, so ` +
        'nothing compares what a script that leaves one out is given against what the ' +
        'specification promises. Add its defaults, and name the map in this check.',
    );
    continue;
  }
  for (const key of Object.keys(map)) {
    if (held.has(key)) continue;
    problems.push(
      `${DEFAULTS} writes a default for ${name}.${key}, which is not an optional parameter of ` +
        `${name}. Either the parameter was renamed and the default left behind, or the default ` +
        'is for a call that no longer takes it.',
    );
  }
}

for (const name of core.libraryNames()) {
  for (const entry of core.libraryEntries(name)) {
    for (const parameter of entry.parameters) {
      if (!parameter.optional) continue;

      const key = `${name}.${parameter.name}`;
      const declared = DECLARATIONS.has(name);
      if (declared && unplanned.has(key)) {
        // The specification marks it planned, so there is nothing written yet
        // for it to disagree with. Counted below rather than passed over.
        continue;
      }
      if (declared) declarations += 1;
      else optional += 1;

      const spec = stated.get(key);
      const recorded = declared
        ? spelling(DECLARATION_DEFAULTS.get(name)?.[parameter.name])
        : parameter.defaultText;
      const excepted = exceptions.has(key);
      if (excepted) usedExceptions.add(key);

      // Where the compiler's own answer lives, which is not the same file for a
      // declaration call as for a call an engine makes.
      const home = declared ? DEFAULTS : SURFACE;
      const carries = declared ? `${DEFAULTS} writes` : 'the surface carries';

      if (spec?.conflict !== undefined) {
        problems.push(
          `${key}: ${SPEC} states two different defaults for it, ${spec.conflict}. One of the ` +
            `two rows is wrong, and until they agree there is nothing for ${home} to answer.`,
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
            `\`${fillable}\`. One of the two is out of date. Answer the default in ${home} ` +
            'and delete the exception.',
        );
        continue;
      }

      if (fillable !== undefined && recorded === undefined) {
        problems.push(
          `${key}: ${SPEC} gives it a default of \`${fillable}\` and ${home} answers none, so a ` +
            `call that leaves it out is ${declared ? 'declared with nothing where that value belongs' : 'emitted as absent'}. ` +
            `Write the value into ${home}. This is the defect the check exists for: nothing ` +
            'else reports it, at compile, at load or at run.',
        );
        continue;
      }

      if (fillable !== undefined && normal(recorded) !== normal(fillable)) {
        problems.push(
          `${key}: ${carries} \`${recorded}\` and ${SPEC} states \`${fillable}\`. A script that ` +
            'leaves the argument out gets something other than what the documentation promises, ' +
            'and nothing else compares the two.',
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
          `${key}: ${carries} a default of \`${recorded}\` that ${SPEC} does not ` +
            `state${spec === undefined ? '' : ` (it states \`${spec.text}\`)`}. A default this ` +
            'compiler invented is indistinguishable, on the chart, from one the specification ' +
            'meant.',
        );
        continue;
      }

      if (!excepted) {
        problems.push(
          `${key}: optional, with no default in ${home} and no value stated in ${SPEC}` +
            `${spec === undefined ? '' : ` (it states \`${spec.text}\`, which is not a value)`}. ` +
            `Either answer the default in ${home}, or record it in ${ALLOW_PATH} with what the ` +
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
    `\n${optional} optional parameters of calls an engine makes and ${declarations} of ` +
      `declaration calls, ${carried} answering the specification's default, ${exceptions.size} ` +
      `recorded as stating no value, ${planned.length} planned (${planned.join(', ')}), ` +
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
  `Defaults check passed: ${carried} of ${optional + declarations} optional parameters answer ` +
    `the default ${SPEC} states, ${usedExceptions.size} are recorded in ${ALLOW_PATH} as ` +
    `stating no value, and ${planned.length} are arguments ${SPEC} marks planned. ` +
    `${declarations} of the ${optional + declarations} belong to declaration calls, whose ` +
    `values are read from ${DEFAULTS} rather than from the surface.`,
);
