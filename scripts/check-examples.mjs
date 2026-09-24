/**
 * Example check: what an example declares, and what its comments claim.
 *
 * Every fenced OpenScript example in the documentation is read the way the
 * checker reads a file, and any name the example declares that already exists
 * in the global scope is reported as OS2002 (`language.md` sections 12.3 and
 * 12.4). A documentation example that does not compile teaches a habit the
 * compiler then refuses, which costs the reader more than the example gave.
 *
 * The second half of the file is about the comments rather than the code, and
 * is there because a wrong sentence beside working code has now cost two rounds.
 * See "What a comment claims about a diagnostic" below.
 *
 * There is no compiler in this repository yet, so this check is the one stage
 * of it that can be run today: the scope pass. It does not type check, it does
 * not resolve warmup, and it makes no claim to. When the compiler lands, this
 * script is the harness to point at it, and the global list below comes from
 * the library manifest instead of from the specification tables.
 *
 * The global list is not hand written. It is read out of `spec/stdlib.md` and
 * `spec/language.md`, so a function added to the library starts failing the
 * examples that took its name without anyone remembering to update a list.
 *
 * Run: node scripts/check-examples.mjs
 * Exit code 1 on any hit, with the file, line and the name that collides.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/**
 * Where examples are read from.
 *
 * `spec/` was held out of this list while its own examples declared names the
 * library owns, on the grounds that editing them quietly to make a check pass
 * would hide the disagreement rather than settle it. Those names have since been
 * renamed, so the specification is checked like everything else. A document that
 * exempts itself from its own rules is the document nobody can trust.
 */
const SOURCES = ['docs', 'examples', 'spec'];
const SCRIPT_EXT = /\.oscript$/i;

// ---------------------------------------------------------------------------
// The global scope, read out of the specification
// ---------------------------------------------------------------------------

/**
 * Library tables in the specification all lead with a `Call` column, and the
 * namespace table in `language.md` 15.2 leads with `Namespace`. Argument tables
 * lead with `Argument` and value tables with `Value`, and those columns hold
 * parameter and option names rather than globals, which is why the header
 * decides whether a table is read at all. Reading every backticked cell instead
 * would put `title` and `group` in the global scope and fail honest examples.
 */
const GLOBAL_TABLE_HEADERS = new Set(['call', 'namespace']);

const IDENT = /`([A-Za-z_][A-Za-z0-9_]*)/g;

function namesFromTables(text) {
  const found = new Set();
  const lines = text.split('\n');
  let reading = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) {
      reading = false;
      continue;
    }
    const cells = line.split('|').slice(1, -1);
    if (!cells.length) continue;

    const first = cells[0].trim();
    // A header row, followed by the dashes row that markdown requires.
    if (!first.startsWith('`') && /^\s*\|[\s:-]+\|/.test(lines[i + 1] || '')) {
      reading = GLOBAL_TABLE_HEADERS.has(first.toLowerCase());
      continue;
    }
    if (/^[\s:|-]+$/.test(line)) continue;
    if (!reading) continue;

    // The cell may hold more than one name, as `arr[i]`, `element(arr, i)` does.
    for (const m of first.matchAll(IDENT)) found.add(m[1]);
  }
  return found;
}

/** The nineteen colour names, listed in `stdlib.md` 11.1 as a block, not a table. */
function namesFromColourBlock(text) {
  const m = text.match(/### 11\.1 Named colours[\s\S]*?```\r?\n([\s\S]*?)```/);
  if (!m) return new Set();
  return new Set(m[1].split(/\s+/).filter((w) => /^[a-z]+$/.test(w)));
}

function loadGlobals() {
  const stdlib = readFileSync(join(ROOT, 'spec', 'stdlib.md'), 'utf8');
  const language = readFileSync(join(ROOT, 'spec', 'language.md'), 'utf8');
  const globals = new Set([
    ...namesFromTables(stdlib),
    ...namesFromTables(language),
    ...namesFromColourBlock(stdlib),
  ]);
  // Declared in `language.md` 13.1 and 15.3 rather than in a library table.
  for (const n of ['study', 'strategy', 'input', 'plot', 'fill', 'level', 'table']) globals.add(n);
  return globals;
}

// ---------------------------------------------------------------------------
// Reading an example
// ---------------------------------------------------------------------------

/** A fence tagged as anything other than OpenScript is somebody else's language. */
const OPENSCRIPT_TAGS = new Set(['', 'openscript', 'os', 'oscript']);

function fencedExamples(text) {
  const out = [];
  const lines = text.split('\n');
  let open = null;

  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(/^\s*```+\s*([A-Za-z0-9_+-]*)\s*$/);
    if (!fence) continue;
    if (open === null) {
      open = { tag: fence[1].toLowerCase(), start: i + 1 };
    } else {
      if (OPENSCRIPT_TAGS.has(open.tag)) {
        out.push({ firstLine: open.start + 1, body: lines.slice(open.start, i) });
      }
      open = null;
    }
  }
  return out;
}

/** Strip a trailing comment and every string literal, so neither can be parsed as code. */
function stripped(line) {
  let out = '';
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += '""'; continue; }
    if (c === '/' && line[i + 1] === '/') break;
    out += c;
  }
  return out;
}

/** The other half of `stripped`: the comment, and nothing else on the line. */
function commentOf(line) {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '/' && line[i + 1] === '/') return line.slice(i + 2);
  }
  return null;
}

const DECL = /^\s*(?:live\s+)?(?:var\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[A-Za-z_][A-Za-z0-9_<>, ]*)?\s*(?:=|\+=|-=|\*=|\/=|%=)(?!=)/;
const FOR_DECL = /^\s*for\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/;
const FN_DECL = /^\s*fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/;
const ERROR_CODE = /\bOS\d{4}\b/;

/**
 * Every name an example declares, with the line it declares it on.
 *
 * Only a line that starts a statement is read. A line that continues an
 * argument list is not, because `qty = 1` on the second line of a call is a
 * named argument and not a declaration, and reading it as one would report the
 * option names of every multi-line `strategy()` call in the documentation.
 */
function declarations(body, firstLine) {
  const out = [];
  let depth = 0;

  for (let i = 0; i < body.length; i++) {
    const raw = body[i];
    const code = stripped(raw);
    const atStatementStart = depth === 0;

    if (atStatementStart) {
      // A line demonstrating an error on purpose, here or on the line above it.
      const deliberate = ERROR_CODE.test(raw) || ERROR_CODE.test(body[i - 1] || '');
      if (!deliberate) {
        const fn = code.match(FN_DECL);
        if (fn) {
          out.push({ name: fn[1], line: firstLine + i, what: 'function' });
          for (const p of fn[2].split(',')) {
            const pm = p.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)/);
            if (pm) out.push({ name: pm[1], line: firstLine + i, what: 'parameter' });
          }
        } else {
          const f = code.match(FOR_DECL);
          const d = f || code.match(DECL);
          if (d && d[1] !== 'fn' && d[1] !== 'var') {
            out.push({ name: d[1], line: firstLine + i, what: 'name' });
          }
        }
      }
    }

    for (const c of code) {
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// What a comment claims about a diagnostic
// ---------------------------------------------------------------------------

/**
 * A comment beside correct code, stating the opposite of what the code does.
 *
 * This has now cost two rounds. A comment is not compiled, nothing tests it, and
 * a reader trusts it precisely because it sits next to code that works. The one
 * shape of it that a machine can settle is a comment that pairs a value with a
 * diagnostic code, because the catalogue says what each code is about: an
 * example claimed that one higher timeframe mode carried a warning that is
 * actually about a declaration option, and the modes and the codes are both in
 * `spec/errors.json`.
 *
 * Two rules, both over comments in example scripts and in the fenced examples of
 * the documentation, which is where such a sentence is read as instruction.
 *
 * **A code an example names exists.** A retired or invented code sends a reader
 * looking for a cause that cannot occur.
 *
 * **A code an example attributes to a value is a code that entry is about.** If
 * a comment says that `"developing"` carries a code, the word `developing` has
 * to appear somewhere in that entry: its message, its cause, its fix or its
 * example. This is deliberately narrow. It settles the sentence that pairs two
 * named things, and it says nothing about prose it cannot check, because a rule
 * that guessed at the rest would be turned off the first week.
 */
const CATALOGUE = JSON.parse(readFileSync(join(ROOT, 'spec', 'errors.json'), 'utf8'));
const ENTRIES = new Map(CATALOGUE.entries.map((entry) => [entry.code, entry]));

const NAMED_CODE = /\bOS\d{4}\b/g;
const ATTRIBUTION = /"([^"\n]{1,48})"\s+(?:carries|raises|gives|reports|produces|means)\s+(OS\d{4})\b/g;

/** Everything one entry is about, as one piece of text to look a word up in. */
function entryText(entry) {
  const example = entry.example ?? {};
  return [
    entry.title,
    entry.message,
    entry.cause,
    entry.fix,
    example.before ?? '',
    example.after ?? '',
    Object.values(entry.placeholders ?? {}).join(' '),
  ]
    .join('\n')
    .toLowerCase();
}

/** Runs of comment lines, flattened, each with the line the run starts on. */
function commentRuns(body, firstLine) {
  const runs = [];
  let held = [];
  let start = 0;
  const close = () => {
    if (held.length > 0) runs.push({ line: start, text: held.join(' ') });
    held = [];
  };
  for (let i = 0; i < body.length; i++) {
    const comment = commentOf(body[i]);
    if (comment === null) {
      close();
      continue;
    }
    if (held.length === 0) start = firstLine + i;
    held.push(comment.trim());
  }
  close();
  return runs;
}

/** What one example's comments claim, and what is wrong with it. */
function claimProblems(body, firstLine) {
  const out = [];
  for (const run of commentRuns(body, firstLine)) {
    NAMED_CODE.lastIndex = 0;
    let m;
    while ((m = NAMED_CODE.exec(run.text)) !== null) {
      if (ENTRIES.has(m[0])) continue;
      out.push({
        line: run.line,
        say:
          `names ${m[0]}, which spec/errors.json does not hold. A code an example quotes has to ` +
          `be one a reader can look up, or the sentence sends them after a cause that cannot occur`,
      });
    }
    ATTRIBUTION.lastIndex = 0;
    while ((m = ATTRIBUTION.exec(run.text)) !== null) {
      const entry = ENTRIES.get(m[2]);
      if (entry === undefined) continue;
      if (entryText(entry).includes(m[1].toLowerCase())) continue;
      out.push({
        line: run.line,
        say:
          `says "${m[1]}" carries ${m[2]}, and nothing in that entry mentions "${m[1]}": its ` +
          `title, message, cause, fix and example are about something else. A comment stating ` +
          `the opposite of what the code does is believed, because it sits beside code that works`,
      });
    }
  }
  return out;
}

/**
 * The claim rules, attacked before they are trusted.
 *
 * Both of the rules above match nothing in a clean tree, which is the state a
 * rule can rot in undetected: this repository has already shipped a pattern that
 * could never match anything and reported a clean result for a year. So each is
 * given a sentence it must refuse and one it must accept, every run.
 */
function claimSelfTest() {
  const cases = [
    { text: ['// "lookahead" carries OS8005 and marks the study as repainting.'], wrong: 0 },
    { text: ['// "confirmed" is the default, and it never repaints.'], wrong: 0 },
    { text: ['// "developing" carries OS8002.'], wrong: 1 },
    { text: ['// See OS0999 for the rule this example breaks.'], wrong: 1 },
  ];
  const broken = [];
  for (const one of cases) {
    const found = claimProblems(one.text, 1).length;
    if (found !== one.wrong) {
      broken.push(`${one.text[0]} (${found} reported, ${one.wrong} expected)`);
    }
  }
  if (broken.length === 0) return;
  console.error(
    'The claim rules in this file no longer do what they say:\n\n' +
      broken.map((line) => `  ${line}`).join('\n') +
      '\n\nA rule that can no longer match is indistinguishable from a clean tree.',
  );
  process.exit(1);
}

claimSelfTest();

// ---------------------------------------------------------------------------
// Walk and report
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.md$/i.test(entry) || SCRIPT_EXT.test(entry)) out.push(full);
  }
  return out;
}

const globals = loadGlobals();
let hits = 0;
let claims = 0;
let examples = 0;

for (const source of SOURCES) {
  for (const file of walk(join(ROOT, source))) {
    const text = readFileSync(file, 'utf8');
    const where = relative(ROOT, file).split(sep).join('/');
    const blocks = SCRIPT_EXT.test(file)
      ? [{ firstLine: 1, body: text.split('\n') }]
      : fencedExamples(text);

    for (const block of blocks) {
      examples++;
      for (const d of declarations(block.body, block.firstLine)) {
        if (!globals.has(d.name)) continue;
        hits++;
        console.error(
          `${where}:${d.line}: OS2002: the ${d.what} \`${d.name}\` already exists in the ` +
            `global scope. Rename it; the library keeps the short name.`,
        );
      }
      for (const claim of claimProblems(block.body, block.firstLine)) {
        claims++;
        console.error(`${where}:${claim.line}: a comment ${claim.say}.`);
      }
    }
  }
}

if (hits > 0 || claims > 0) {
  if (hits > 0) {
    console.error(
      `
${hits} example declaration${hits === 1 ? '' : 's'} shadow${hits === 1 ? 's' : ''} a ` +
        `built-in name. An example that does not compile teaches a habit the compiler refuses.`,
    );
  }
  if (claims > 0) {
    console.error(
      `
${claims} comment${claims === 1 ? '' : 's'} in an example state${claims === 1 ? 's' : ''} ` +
        `something about a diagnostic that the catalogue does not. A wrong sentence beside correct ` +
        `code is read as the authority on it, and it is read as the authority precisely because ` +
        `the code beside it works.`,
    );
  }
  process.exit(1);
}

console.log(
  `Example check passed: ${examples} example${examples === 1 ? '' : 's'} declare no name ` +
    `that the library already owns (${globals.size} globals read from the specification), and ` +
    `every diagnostic code an example comment names is one of the ${ENTRIES.size} the catalogue ` +
    `holds and is about what the comment says it is about.`,
);
