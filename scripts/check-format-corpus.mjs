/**
 * Format corpus check: the canonical bytes of every shipped example are a
 * golden, and a compiler that emits different bytes fails the build.
 *
 * `compiled-program.md` 9.5 promises that a program that ran yesterday runs
 * today and produces the same numbers, and 2.14 makes the hash of the canonical
 * encoding the name a host records a run under. Both promises rest on the
 * compiler being a function of its input across releases, not only within one
 * run: `tests/emit/canonical.test.ts` proves the same source compiles to the
 * same bytes twice on one afternoon, and nothing proved it across a commit. An
 * emitter change that moved one field, renumbered one channel or spelled one
 * number differently would have passed every check and changed the hash of
 * every stored run in the world.
 *
 * So `spec/corpus/` holds the canonical encoding and the `programHash` of every
 * shipped example, and this recompiles each one, canonicalises it and compares
 * the bytes. A difference is reported as the first differing byte offset and
 * the field path at that byte, with an excerpt of both sides, because "the
 * bytes differ" is a sentence nobody can act on.
 *
 * ## The compiler stamp
 *
 * A program carries `compiler.name` and `compiler.version`, and the version is
 * the package's, which moves on every release. Compared as bytes, a package
 * bump alone would fail this check, which is a check that fails for the one
 * reason that is not a defect and is then turned off. `compiler` is never read
 * by an engine (section 2's table) and a minor may add anything under it (9.2),
 * so the recompiled program is given the corpus's own `compiler` object before
 * it is canonicalised: the comparison is over everything an engine reads, and
 * the stored `programHash` is a real hash of a real program, the one the corpus
 * holds. A change to the stamp's shape is `check-format-additive.mjs`'s to catch,
 * as a field gained or lost.
 *
 * ## Two modes
 *
 * Run bare it compares and refuses. Run with `--write` it recompiles every
 * shipped example and writes the corpus from the compiler as it is now, which
 * is the deliberate act a format change requires; the diff is what a reviewer
 * reads, and a corpus rewritten without one is a golden that proves nothing.
 * It deletes nothing: a file in the corpus that no example produces is
 * reported by the bare run, and removing it is a decision.
 *
 * Run: node scripts/check-format-corpus.mjs [--write]
 * Needs `npm run build` first: it runs the compiler, not a reading of its source.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { CORE_MODULE, EMITTER_MODULE, fromRoot } from './lib/built.mjs';
import { frontEndWith } from './lib/example-run.mjs';
import { shippedExamples } from './lib/strategy-drive.mjs';

const CORPUS = 'spec/corpus';
const INDEX = `${CORPUS}/index.json`;
const WRITE = process.argv.includes('--write');

/** How much of each side is shown around a differing byte. */
const EXCERPT = 40;

function refuse(message) {
  console.error(message);
  process.exit(1);
}

// ----------------------------------------------------------- comparing bytes

/**
 * The field path at one character of a canonical text.
 *
 * A walk over the text rather than a parse of it, tracking the key under each
 * open object and the index under each open array, so the answer is where the
 * character sits in the document and not where a parser gave up.
 */
function pathAt(text, offset) {
  const stack = [];
  let i = 0;
  const readString = () => {
    let out = '';
    i += 1;
    while (i < text.length) {
      const c = text[i];
      if (c === '\\') {
        out += text[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === '"') {
        i += 1;
        return out;
      }
      out += c;
      i += 1;
    }
    return out;
  };
  while (i < text.length && i < offset) {
    const c = text[i];
    const top = stack[stack.length - 1];
    if (c === '{') {
      stack.push({ kind: 'object', key: null, expectKey: true });
      i += 1;
    } else if (c === '[') {
      stack.push({ kind: 'array', index: 0 });
      i += 1;
    } else if (c === '}' || c === ']') {
      stack.pop();
      i += 1;
    } else if (c === '"') {
      const start = i;
      const held = readString();
      if (top !== undefined && top.kind === 'object' && top.expectKey) {
        top.key = held;
        top.expectKey = false;
      }
      if (start < offset && offset < i) break;
    } else if (c === ',') {
      if (top !== undefined && top.kind === 'array') top.index += 1;
      else if (top !== undefined && top.kind === 'object') top.expectKey = true;
      i += 1;
    } else {
      i += 1;
    }
  }
  return stack
    .map((frame) => (frame.kind === 'object' ? frame.key ?? '' : `[${frame.index}]`))
    .join('.')
    .replace(/\.\[/g, '[');
}

/** Where two canonical texts part, as a character, a UTF-8 byte and a path, or null. */
function firstDifference(stored, fresh) {
  const shorter = Math.min(stored.length, fresh.length);
  let at = shorter;
  for (let i = 0; i < shorter; i += 1) {
    if (stored[i] !== fresh[i]) {
      at = i;
      break;
    }
  }
  if (at === shorter && stored.length === fresh.length) return null;
  return {
    character: at,
    byte: Buffer.byteLength(stored.slice(0, at), 'utf8'),
    path: pathAt(at < stored.length ? stored : fresh, at),
  };
}

const excerpt = (text, at) =>
  JSON.stringify(text.slice(Math.max(0, at - EXCERPT / 2), at + EXCERPT / 2));

/**
 * What one corpus entry and the compiler disagree about, as sentences.
 *
 * `fresh` is the program the compiler emits now; the corpus's own `compiler`
 * stamp is put on it before the comparison, as the file comment says.
 */
function entryProblems(entry, storedText, fresh, emitter) {
  const where = `${CORPUS}/${entry.file}`;
  const out = [];
  const storedHash = `sha256:${emitter.sha256(storedText)}`;
  if (storedHash !== entry.programHash) {
    out.push(
      `${where}: the file hashes to ${storedHash} and ${INDEX} records ${entry.programHash} for it. ` +
        'The corpus was edited by hand or the index was, and a golden that disagrees with its own ' +
        'hash stands behind nothing.',
    );
  }
  let stored;
  try {
    stored = JSON.parse(storedText);
  } catch {
    out.push(`${where}: the file does not parse, so nothing can be compared with it.`);
    return out;
  }
  const stamped = { ...fresh, compiler: stored.compiler };
  const freshText = emitter.canonicalise(stamped);
  const parted = firstDifference(storedText, freshText);
  if (parted !== null) {
    out.push(
      `${entry.example}: the compiler now emits different bytes, first at byte ${parted.byte} ` +
        `(character ${parted.character}), at ${parted.path || 'the root'}.\n` +
        `    corpus:   ${excerpt(storedText, parted.character)}\n` +
        `    compiler: ${excerpt(freshText, parted.character)}\n` +
        '    If the format changed on purpose, the change is recorded in spec/format-history.json ' +
        'and the corpus is rewritten with --write and reviewed as a diff.',
    );
  }
  const freshHash = emitter.programHash(stamped);
  if (parted === null && freshHash !== entry.programHash) {
    out.push(
      `${entry.example}: the bytes agree and the hash does not: ${freshHash} against the recorded ` +
        `${entry.programHash}. The hash is taken over these bytes and nothing else, so one of the ` +
        'two is not what it says it is.',
    );
  }
  return out;
}

// ------------------------------------------------------------- the self test

/**
 * The comparison, attacked before the corpus is read: the two assertions that
 * prove this check can fail, a byte that drifted and a hash that does not
 * match, beside the one that proves a stamp bump alone does not.
 *
 * A fabricated pair rather than a real entry, so that rewriting the corpus
 * cannot disarm the check.
 */
function selfTest(emitter) {
  const text = '{"a":[1,2],"b":{"c":"xy"}}';
  const same = firstDifference(text, text);
  const inString = firstDifference(text, '{"a":[1,2],"b":{"c":"xz"}}');
  const inArray = firstDifference(text, '{"a":[1,3],"b":{"c":"xy"}}');
  const longer = firstDifference(text, `${text} `);
  const readers =
    same === null &&
    inString !== null &&
    inString.character === 22 &&
    inString.byte === 22 &&
    inString.path === 'b.c' &&
    inArray !== null &&
    inArray.character === 8 &&
    inArray.path === 'a[1]' &&
    longer !== null &&
    longer.character === text.length;
  const bytes = firstDifference('{"k":"éx"}', '{"k":"éy"}');
  const utf8 = bytes !== null && bytes.character === 7 && bytes.byte === 8;

  const program = { compiler: { name: 'x', version: '1' }, one: 1 };
  const stored = emitter.canonicalise(program);
  const good = { example: 'e', file: 'f', programHash: emitter.programHash(program) };
  const bumped = { one: 1, compiler: { name: 'x', version: '2' } };
  const clean = entryProblems(good, stored, bumped, emitter);
  const drifted = entryProblems(good, stored, { ...bumped, one: 2 }, emitter);
  const wrongHash = entryProblems({ ...good, programHash: 'sha256:0' }, stored, program, emitter);
  const refusals = [drifted.length === 1 && drifted[0].includes('at one'), wrongHash.length === 2];
  if (readers && utf8 && clean.length === 0 && refusals.every(Boolean)) return;
  refuse(
    'The comparison in this file no longer does what it says: ' +
      `the readers ${readers ? 'read' : 'do not read'} a fabricated difference, bytes ` +
      `${utf8 ? 'are' : 'are not'} counted as UTF-8, a stamp bump produced ${clean.length} ` +
      `problems, and ${refusals.filter(Boolean).length} of ${refusals.length} drifts were refused. ` +
      'A golden that cannot fail is a corpus and an empty promise.',
  );
}

// ------------------------------------------------------------------- the run

const CORE = fromRoot(CORE_MODULE);
if (!existsSync(CORE) || !existsSync(fromRoot(EMITTER_MODULE))) {
  refuse(`${CORE} is not built, so this check would compile nothing. Run \`npm run build\` first.`);
}
const core = await import(CORE_MODULE);
const emitter = await import(EMITTER_MODULE);
const compile = frontEndWith(core, emitter);

selfTest(emitter);

/** Every shipped example, compiled, or the reason it could not be. */
const fresh = [];
const problems = [];
for (const { name, path, text } of shippedExamples()) {
  const compiled = compile(name, text);
  if (compiled.program === undefined || compiled.diagnostics.some((one) => one.severity === 'error')) {
    problems.push(`${path}: does not compile, so the corpus cannot hold it.`);
    continue;
  }
  fresh.push({ example: path, file: `${name.replace(/\.oscript$/, '')}.json`, program: compiled.program });
}
if (fresh.length === 0) {
  refuse(
    'No shipped example compiled, so this check would compare nothing. A golden over an empty ' +
      'list passes for ever.',
  );
}

if (WRITE) {
  mkdirSync(CORPUS, { recursive: true });
  const programs = fresh.map((one) => {
    writeFileSync(`${CORPUS}/${one.file}`, `${emitter.canonicalise(one.program)}\n`, 'utf8');
    return { example: one.example, file: one.file, programHash: emitter.programHash(one.program) };
  });
  const index = {
    what:
      'The canonical encoding (compiled-program.md 2.14) and programHash of every shipped example, ' +
      'as the compiler emitted them. scripts/check-format-corpus.mjs recompiles each example on ' +
      'every build and compares the bytes; a program file holds the canonical text and one ' +
      'trailing newline, and the hash is over the text. Rewritten only with --write, on purpose, ' +
      'and reviewed as a diff.',
    programs,
  };
  writeFileSync(INDEX, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  for (const problem of problems) console.error(problem);
  console.log(
    `Corpus written: ${programs.length} program${programs.length === 1 ? '' : 's'} under ${CORPUS}/ ` +
      `and ${INDEX}, from the compiler as it is now. Review the diff before committing it: a ` +
      'golden rewritten without one proves nothing.',
  );
  process.exit(problems.length > 0 ? 1 : 0);
}

if (!existsSync(INDEX)) {
  refuse(
    `${INDEX} does not exist, so this check has no golden to compare with. Run with --write once, ` +
      'and review what it wrote.',
  );
}
const index = JSON.parse(readFileSync(INDEX, 'utf8'));
const entries = index.programs ?? [];
if (entries.length === 0) {
  refuse(`${INDEX} records no programs, so this check inspected nothing.`);
}

const byExample = new Map(entries.map((entry) => [entry.example, entry]));
let compared = 0;
for (const one of fresh) {
  const entry = byExample.get(one.example);
  if (entry === undefined) {
    problems.push(
      `${one.example}: a shipped example the corpus does not hold. Add it with --write and review ` +
        'the diff, so the bytes it compiles to are a golden like the others.',
    );
    continue;
  }
  byExample.delete(one.example);
  const where = `${CORPUS}/${entry.file}`;
  if (!existsSync(where)) {
    problems.push(`${INDEX} records ${where} and there is no such file.`);
    continue;
  }
  const storedText = readFileSync(where, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
  problems.push(...entryProblems(entry, storedText, one.program, emitter));
  compared += 1;
}
for (const [example, entry] of byExample) {
  problems.push(
    `${INDEX} records ${example} as ${CORPUS}/${entry.file}, and no shipped example compiles to it. ` +
      'Either the example was removed, which 9.5 does not allow a program to be, or it was ' +
      'renamed and the corpus was not.',
  );
}
const recorded = new Set(entries.map((entry) => entry.file));
for (const file of readdirSync(CORPUS).filter((name) => name.endsWith('.json') && name !== 'index.json')) {
  if (!recorded.has(file)) {
    problems.push(`${CORPUS}/${file} is a file the index does not record, so nothing stands behind it.`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  refuse(
    `\n${problems.length} failure${problems.length === 1 ? '' : 's'} of the format corpus. A ` +
      'compiler that emits different bytes for the same source changes the hash of every stored ' +
      'run, and 9.5 promises that never happens.',
  );
}

console.log(
  `Format corpus check passed: ${compared} shipped example${compared === 1 ? '' : 's'} recompiled, ` +
    `canonicalised and compared byte for byte with ${CORPUS}/, hash and all, each given the ` +
    "corpus's own compiler stamp first so a package bump is not a format change. Not reached: a " +
    'program no shipped example compiles to; a field only such a program reaches is compared by ' +
    'nothing here.',
);
