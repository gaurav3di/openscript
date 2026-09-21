/**
 * Format additive check: every field, opcode and tag the compiler defines has
 * a version in the history that defined it, and every one the history records
 * is still there.
 *
 * `compiled-program.md` 9.2 says what a minor bump may do and 9.3 what a major
 * may, and a second engine plans its work from that: it reads the version a
 * program carries and knows which fields it will meet. The page said which
 * version added `requests` in one paragraph of prose and nothing checked that
 * the emitter agreed, so a field could be added to the emitter under the same
 * version number and no document would say it had. `spec/format-history.json`
 * is now the record, one entry per released format version with the field
 * paths, opcodes and tags it defined and the sentence in section 9 that
 * justified the bump, and this holds the compiler to it in both directions.
 *
 * ## The two readings of "what the compiler defines"
 *
 * The **type** is `src/core/emit/program.ts`, which is the artifact's shape and
 * nothing else, and its interfaces are read here into field paths. That is the
 * complete list: a field a shipped example never reaches is still in it.
 *
 * The **evidence** is every shipped example, compiled and walked. It proves
 * the emitter writes what the type declares, and a path in a program that the
 * type does not declare is a field the compiler gained that no document knows
 * about. The walk descends only where the type says an object or a list of
 * objects is, so a declaration field holding `{ "input": key }` is a leaf and
 * not a gained field.
 *
 * Both are compared with the history. A type path the history does not record
 * is a field gained without a version; a history path the type does not have
 * is a field lost, which 9.2 and 9.3 both forbid short of a new major. The
 * type paths no example reaches are printed, because they are what this check
 * proves the shape of and not the presence of.
 *
 * ## The additive rule itself
 *
 * A minor may not add an instruction (9.2). So an entry whose major is its
 * predecessor's and whose opcode list is not empty fails, whatever the emitter
 * says: the history is where that rule is stated in a form a check can read.
 *
 * Run: node scripts/check-format-additive.mjs
 * Needs `npm run build` first: it runs the compiler and asks the built engine.
 */
import { existsSync, readFileSync } from 'node:fs';
import { CORE_MODULE, EMITTER_MODULE, fromRoot } from './lib/built.mjs';
import { frontEndWith } from './lib/example-run.mjs';
import { shippedExamples } from './lib/strategy-drive.mjs';

const HISTORY = 'spec/format-history.json';
const TYPE = 'src/core/emit/program.ts';
const PAGE = 'spec/compiled-program.md';
const ROOT_TYPE = 'CompiledProgram';

function refuse(message) {
  console.error(message);
  process.exit(1);
}

// --------------------------------------------------------- reading the type

/** Every exported interface in the type file, as its fields' names and types. */
function interfacesIn(source) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const found = new Map();
  for (const m of text.matchAll(/export interface (\w+) \{([\s\S]*?)\n\}/g)) {
    const fields = [];
    for (const line of m[2].split('\n')) {
      const f = /^\s*readonly (\w+)\??: (.+);\s*$/.exec(line);
      if (f) fields.push({ name: f[1], type: f[2] });
    }
    found.set(m[1], fields);
  }
  return found;
}

/**
 * Whether a field's type is a list, and which interface it holds, if any.
 *
 * `| null` is dropped, a `readonly X[]` is a list of X, and anything that is
 * not the name of an interface in the file is a leaf: a primitive, a union of
 * literals, a tuple or a type alias such as a constant pool entry.
 */
function shapeOf(type, interfaces) {
  let t = type.trim().replace(/\s*\|\s*null$/, '');
  let list = false;
  if (/^readonly [A-Za-z]+\[\]$/.test(t)) {
    list = true;
    t = t.slice('readonly '.length, -'[]'.length);
  }
  return { list, holds: interfaces.has(t) ? t : null };
}

/** Every field path under one interface, stopping where the type recurses. */
function pathsOfType(interfaces, name, prefix = '', stack = [name], out = new Set()) {
  for (const field of interfaces.get(name) ?? []) {
    const path = prefix === '' ? field.name : `${prefix}.${field.name}`;
    out.add(path);
    const shape = shapeOf(field.type, interfaces);
    if (shape.holds === null || stack.includes(shape.holds)) continue;
    pathsOfType(interfaces, shape.holds, shape.list ? `${path}[]` : path, [...stack, shape.holds], out);
  }
  return out;
}

// ------------------------------------------------------- walking a program

const hasChildren = (known, prefix) => [...known].some((path) => path.startsWith(prefix));

/** Every field path a program holds, descending only where the type has children. */
function pathsOfProgram(value, known, path = '', out = new Set()) {
  if (path !== '') out.add(path);
  if (value === null || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    if (!hasChildren(known, `${path}[].`)) return out;
    for (const one of value) {
      if (one === null || typeof one !== 'object' || Array.isArray(one)) continue;
      for (const key of Object.keys(one)) pathsOfProgram(one[key], known, `${path}[].${key}`, out);
    }
    return out;
  }
  if (path !== '' && !hasChildren(known, `${path}.`)) return out;
  for (const key of Object.keys(value)) {
    pathsOfProgram(value[key], known, path === '' ? key : `${path}.${key}`, out);
  }
  return out;
}

// ------------------------------------------------------------ the history

/** Markup and spacing removed, so a sentence in the file matches its line on the page. */
const normal = (text) => text.replace(/[`*]/g, '').replace(/\s+/g, ' ').trim();

/** The text of section 9, from its heading to the next top-level heading. */
function sectionNine(page) {
  const start = page.indexOf('\n## 9. ');
  if (start < 0) return null;
  const end = page.indexOf('\n## ', start + 1);
  return page.slice(start, end < 0 ? page.length : end);
}

const versionOf = (format) => {
  const m = /^(\d+)\.(\d+)$/.exec(format);
  return m === null ? null : [Number(m[1]), Number(m[2])];
};

/** What is wrong with the history as a document, before the compiler is asked. */
function historyProblems(history, pageNine, current) {
  const out = [];
  const versions = history.versions ?? [];
  if (versions.length === 0) return [`${HISTORY} records no versions.`];
  let previous = null;
  const seenPaths = new Map();
  for (const entry of versions) {
    const at = versionOf(entry.format ?? '');
    if (at === null) {
      out.push(`${HISTORY}: ${JSON.stringify(entry.format)} is not a format version of the form major.minor.`);
      continue;
    }
    if (previous !== null && (at[0] < previous[0] || (at[0] === previous[0] && at[1] <= previous[1]))) {
      out.push(`${HISTORY}: ${entry.format} does not follow ${previous.join('.')}; versions are ascending.`);
    }
    if (previous !== null && at[0] === previous[0] && (entry.opcodes ?? []).length > 0) {
      out.push(
        `${HISTORY}: ${entry.format} is a minor of ${previous[0]} and records ${entry.opcodes.length} ` +
          `opcode${entry.opcodes.length === 1 ? '' : 's'}. ${PAGE} 9.2 says a minor may not add an instruction.`,
      );
    }
    if (typeof entry.justified !== 'string' || entry.justified.trim() === '') {
      out.push(`${HISTORY}: ${entry.format} carries no sentence justifying it.`);
    } else if (!pageNine.includes(normal(entry.justified))) {
      out.push(
        `${HISTORY}: ${entry.format} is justified by "${entry.justified}", and ${PAGE} section 9 ` +
          'does not say that sentence. The history quotes the page; it does not add to it.',
      );
    }
    for (const kind of ['fields', 'opcodes', 'tags']) {
      if (!Array.isArray(entry[kind])) out.push(`${HISTORY}: ${entry.format} has no ${kind} list.`);
    }
    for (const path of entry.fields ?? []) {
      if (seenPaths.has(path)) {
        out.push(`${HISTORY}: ${path} is defined by ${seenPaths.get(path)} and again by ${entry.format}.`);
      }
      seenPaths.set(path, entry.format);
    }
    previous = at;
  }
  const last = versions[versions.length - 1]?.format;
  if (last !== current) {
    out.push(
      `${HISTORY}'s last entry is ${last} and the compiler stamps ${current}. A version the ` +
        'compiler emits has an entry saying what it defined, even when that is nothing new.',
    );
  }
  return out;
}

/** The two directions, over one kind of thing. */
function driftProblems(what, defined, recorded, lostWhy) {
  const out = [];
  for (const one of defined) {
    if (!recorded.has(one)) {
      out.push(
        `${what} ${one} is defined by the compiler and no version in ${HISTORY} records it. A ${what} ` +
          'gained without a version is one a second engine cannot plan for.',
      );
    }
  }
  for (const one of recorded) {
    if (!defined.has(one)) {
      out.push(`${what} ${one} is recorded in ${HISTORY} and the compiler has lost it. ${lostWhy}`);
    }
  }
  return out;
}

// ------------------------------------------------------------- the self test

/**
 * The readers and the rules, attacked before a real file is read.
 *
 * A fabricated type, program and history, so that correcting the real ones
 * cannot disarm the check.
 */
function selfTest() {
  const source = [
    'export type Leaf = readonly [string, number];',
    '/** A comment with readonly stray: number; in it. */',
    'export interface Child {',
    '  readonly id: number;',
    '  readonly tail: Leaf;',
    '  // readonly hidden: number;',
    '  readonly again: readonly Root[];',
    '}',
    'export interface Root {',
    '  readonly name: string;',
    '  readonly kids: readonly Child[];',
    '  readonly one?: Child | null;',
    '  readonly leaf: Leaf;',
    '}',
  ].join('\n');
  const interfaces = interfacesIn(source);
  const typed = pathsOfType(interfaces, 'Root');
  const typedOk =
    [...typed].sort().join(' ') ===
    'kids kids[].again kids[].id kids[].tail leaf name one one.again one.id one.tail';

  const program = {
    name: 'x',
    kids: [{ id: 1, tail: ['a', 2], again: [{ extra: 1 }] }],
    one: null,
    leaf: ['b', 3],
    stray: 1,
  };
  const walked = pathsOfProgram(program, typed);
  const walkedOk =
    [...walked].sort().join(' ') === 'kids kids[].again kids[].id kids[].tail leaf name one stray';

  const nine = normal('\n## 9. Versioning\n\nThe **first** sentence, with `code`.\n\n## 10. Next');
  const first = { format: '1.0', justified: 'The first sentence, with code.', fields: ['a'], opcodes: ['X'], tags: ['t'] };
  const second = { format: '1.1', justified: 'The first sentence, with code.', fields: ['b'], opcodes: [], tags: [] };
  const history = { versions: [first, second] };
  const clean = historyProblems(history, nine, '1.1');
  const refusals = [
    historyProblems({ versions: [first, { ...second, opcodes: ['Y'] }] }, nine, '1.1').length === 1,
    historyProblems({ versions: [first, { ...second, justified: 'Not there.' }] }, nine, '1.1').length === 1,
    historyProblems({ versions: [first, { ...second, fields: ['a'] }] }, nine, '1.1').length === 1,
    historyProblems(history, nine, '1.2').length === 1,
    historyProblems({ versions: [second, { ...first, opcodes: [] }] }, nine, '1.0').length === 1,
    driftProblems('field', new Set(['a', 'b']), new Set(['a', 'c']), 'why').length === 2,
  ];
  if (typedOk && walkedOk && clean.length === 0 && refusals.every(Boolean)) return;
  refuse(
    'The rules in this file no longer do what they say: the type reader ' +
      `${typedOk ? 'reads' : 'does not read'} a fabricated interface, the walk ` +
      `${walkedOk ? 'finds' : 'does not find'} a stray field, a clean history produced ` +
      `${clean.length} problems, and ${refusals.filter(Boolean).length} of ${refusals.length} bad ` +
      'histories were refused. A rule that cannot fail is a clean history and an empty promise.',
  );
}

// ------------------------------------------------------------------- the run

selfTest();

const CORE = fromRoot(CORE_MODULE);
if (!existsSync(CORE) || !existsSync(fromRoot(EMITTER_MODULE))) {
  refuse(`${CORE} is not built, so this check would compile nothing. Run \`npm run build\` first.`);
}
const core = await import(CORE_MODULE);
const emitter = await import(EMITTER_MODULE);

const interfaces = interfacesIn(readFileSync(TYPE, 'utf8'));
if (!interfaces.has(ROOT_TYPE)) {
  refuse(`${TYPE} no longer declares ${ROOT_TYPE}, so this check has no shape to read.`);
}
const typed = pathsOfType(interfaces, ROOT_TYPE);

const compile = frontEndWith(core, emitter);
const evidence = new Set();
const emittedTags = new Set();
let compiled = 0;
const problems = [];
for (const { name, path, text } of shippedExamples()) {
  const one = compile(name, text);
  if (one.program === undefined || one.diagnostics.some((d) => d.severity === 'error')) {
    problems.push(`${path}: does not compile, so it is evidence of nothing.`);
    continue;
  }
  compiled += 1;
  for (const found of pathsOfProgram(one.program, typed)) evidence.add(found);
  for (const tag of one.program.requires) emittedTags.add(tag);
}
if (compiled === 0) refuse('No shipped example compiled, so this check walked nothing.');

const history = JSON.parse(readFileSync(HISTORY, 'utf8'));
const nine = sectionNine(readFileSync(PAGE, 'utf8'));
if (nine === null) {
  refuse(`${PAGE} has no section 9 this check can read the justifying sentences against.`);
}
problems.push(...historyProblems(history, normal(nine), core.COMPILED_FORMAT_VERSION));

const recorded = { fields: new Set(), opcodes: new Set(), tags: new Set() };
for (const entry of history.versions ?? []) {
  for (const kind of Object.keys(recorded)) {
    for (const one of entry[kind] ?? []) recorded[kind].add(one);
  }
}

for (const found of evidence) {
  if (typed.has(found)) continue;
  problems.push(
    `field ${found} is written by the compiler and ${TYPE} does not declare it, so no version in ` +
      `${HISTORY} could have recorded it. The type is the artifact's shape and nothing else.`,
  );
}
problems.push(
  ...driftProblems(
    'field',
    typed,
    recorded.fields,
    `${PAGE} 9.2 forbids a minor to remove one and 9.3 says a major is a different format.`,
  ),
);
problems.push(
  ...driftProblems(
    'opcode',
    new Set(emitter.OPCODES),
    recorded.opcodes,
    `${PAGE} 9.3 says removing an instruction is a new major.`,
  ),
);
const definedTags = new Set([...core.capabilitiesFor(true, true), ...emittedTags]);
problems.push(
  ...driftProblems(
    'tag',
    definedTags,
    recorded.tags,
    'A program carrying that tag is refused by an engine that no longer has it.',
  ),
);

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  refuse(
    `\n${problems.length} disagreement${problems.length === 1 ? '' : 's'} between the compiler and ` +
      `${HISTORY}. A second engine plans from the version a program carries, and a field, an ` +
      'opcode or a tag with no version that defined it is one it cannot plan for.',
  );
}

const unreached = [...typed].filter((path) => !evidence.has(path)).sort();
console.log(
  `Format additive check passed: ${typed.size} field paths of ${TYPE}, ${emitter.OPCODES.length} ` +
    `opcodes and ${definedTags.size} tags each have the version in ${HISTORY} that defined them, ` +
    `every one the history records is still defined, every justifying sentence is on ${PAGE}, and ` +
    `the ${compiled} shipped examples write ${evidence.size} of those paths and no other.`,
);
if (unreached.length > 0) {
  console.log(
    `${unreached.length} recorded paths are reached by no shipped example, so their shape is ` +
      `proved by the type and their presence by nothing here:\n  ${unreached.join('\n  ')}`,
  );
}
