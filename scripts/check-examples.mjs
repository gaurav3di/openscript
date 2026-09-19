/**
 * Example shadowing check.
 *
 * Every fenced OpenScript example in the documentation is read the way the
 * checker reads a file, and any name the example declares that already exists
 * in the global scope is reported as OS2002 (`language.md` sections 12.3 and
 * 12.4). A documentation example that does not compile teaches a habit the
 * compiler then refuses, which costs the reader more than the example gave.
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
 * `spec/` is deliberately absent. Its own examples in sections 5.2 and 8.2
 * declare `change`, `count` and `highest`, all three of which it defines as
 * library functions in `stdlib.md` section 9, so turning this check on over the
 * specification would fail the build on a defect that belongs to the
 * specification and is tracked in `issues/0001-spec-examples-shadow-builtins.md`.
 * Editing those examples quietly, to make a check pass, would hide the
 * disagreement rather than settle it. When the issue closes, delete this
 * comment and add 'spec' to the list.
 */
const SOURCES = ['docs', 'examples'];
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
  const m = text.match(/### 11\.1 Named colours[\s\S]*?```\n([\s\S]*?)```/);
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
    }
  }
}

if (hits > 0) {
  console.error(
    `\n${hits} example declaration${hits === 1 ? '' : 's'} shadow${hits === 1 ? 's' : ''} a ` +
      `built-in name. An example that does not compile teaches a habit the compiler refuses.`,
  );
  process.exit(1);
}

console.log(
  `Example check passed: ${examples} example${examples === 1 ? '' : 's'} declare no name ` +
    `that the library already owns (${globals.size} globals read from the specification).`,
);
