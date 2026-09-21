/**
 * Format tables check: the instruction table and the tag table on the page are
 * the compiler's tables.
 *
 * `compiled-program.md` 4.13 prints every instruction with its operands and its
 * stack effect, and 2.2 prints every capability tag. Both are what a second
 * engine is written from, and until this check both were compared with the
 * compiler by nothing: `tests/emit/format.test.ts` counts the instructions and
 * holds the compiler to its own table, so a row edited on the page changed
 * what a stranger implemented while every check stayed green. A page that
 * says an instruction takes two operands when the compiler emits one is a
 * page that costs somebody else's afternoon and a defect report against a
 * format they cannot change.
 *
 * ## What is read, and from where
 *
 * The rows come out of the page, never from a list kept here. The compiler's
 * side is the built emitter, through the three names its door exports: the
 * opcode list, the operand count and the depth change. The tag side is read
 * three times over, because a tag has three homes and the check holds all
 * three together: the page's table, the list the emitter filters `requires`
 * through, and the capabilities the reference engine declares with every
 * host-supplied tag granted.
 *
 * ## A depth is probed, not read
 *
 * Three rows write their depth as a formula, `1 - n` or `1 - argc`, and the
 * compiler answers those from an operand or from a call site. Reading the
 * formula as arithmetic would be building code out of text, which rule one
 * forbids even here, so the compiler is asked several times with the named
 * count set to several values and each answer is held to the formula. A row
 * that writes a number is probed the same way: a fixed depth has to be the
 * same answer whatever the operands are, which is what catches a page that
 * wrote `+1` against an instruction whose depth really varies.
 *
 * ## What it does not reach, said plainly
 *
 * The Group column and the prose of section 4, which say what an instruction
 * does. Whether `ADD` adds is the conformance suite's to prove. This check is
 * about the shape of the table, and it says so in its passing line.
 *
 * Run: node scripts/check-format-tables.mjs
 * Needs `npm run build` first: it asks the built emitter, not its source.
 */
import { existsSync, readFileSync } from 'node:fs';
import { CORE_MODULE, EMITTER_MODULE, fromRoot } from './lib/built.mjs';

const PAGE = 'spec/compiled-program.md';
const REQUIRES = 'src/core/emit/requires.ts';

/** The counts a formula row is probed with. Zero is in so `1 - 0` is one of them. */
const PROBES = [0, 1, 2, 5];

function refuse(message) {
  console.error(message);
  process.exit(1);
}

// ------------------------------------------------------------- reading the page

/** The text of one section, from its heading line to the next heading of any level. */
function sectionOf(page, heading) {
  const lines = page.split('\n');
  const start = lines.findIndex((line) => line.startsWith(heading));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !/^#{2,6} /.test(lines[end])) end += 1;
  return lines.slice(start + 1, end).join('\n');
}

/** The body rows of the first table in a section whose header row opens with `first`. */
function tableRows(section, first) {
  const rows = [];
  let reading = false;
  for (const line of section.split('\n')) {
    if (!line.startsWith('|')) {
      if (reading) break;
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((one) => one.trim());
    if (!reading) {
      if (cells[0] === first) reading = true;
      continue;
    }
    if (/^[\s:|-]+$/.test(line)) continue;
    rows.push(cells);
  }
  return rows;
}

const bare = (cell) => cell.replace(/^`|`$/g, '');

/** The instruction rows of 4.13: opcode, operand names, and the depth as written. */
function instructionRows(page) {
  const section = sectionOf(page, '### 4.13 ');
  if (section === null) return null;
  return tableRows(section, 'Opcode').map((cells) => ({
    opcode: bare(cells[0] ?? ''),
    operands: (cells[1] ?? '')
      .split(',')
      .map((one) => bare(one.trim()))
      .filter((one) => one !== ''),
    depth: bare(cells[2] ?? ''),
  }));
}

/** The tags of 2.2, in the page's order. */
function tagRows(page) {
  const section = sectionOf(page, '### 2.2 ');
  if (section === null) return null;
  return tableRows(section, 'Tag').map((cells) => bare(cells[0] ?? ''));
}

/** The list the emitter filters `requires` through, read out of its source. */
function emitterTags(source) {
  const block = /const ORDER[^=]*=\s*\[([^\]]*)\]/.exec(source);
  if (block === null) return null;
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

// ---------------------------------------------------------------- the rules

/** Every operand set to one count, for a probe. */
const allAt = (count, k) => new Array(count).fill(k);

/** What one row and the compiler disagree about, as sentences, or nothing. */
function rowProblems(row, compiler) {
  const { opcode, operands, depth } = row;
  if (!compiler.isOpcode(opcode)) {
    return [
      `${PAGE} 4.13 has a row for ${opcode} and the compiler's opcode table has no entry for it. ` +
        'A row without an entry is an instruction a second engine implements and no program uses.',
    ];
  }
  const out = [];
  const count = compiler.operandCount(opcode);
  if (count !== operands.length) {
    out.push(
      `${opcode}: the page gives ${operands.length} operand${operands.length === 1 ? '' : 's'} ` +
        `(${operands.join(', ') || 'none'}) and the compiler emits ${count}.`,
    );
  }

  const fixed = /^[+-]?\d+$/.test(depth);
  const formula = /^1 - ([A-Za-z]+)$/.exec(depth);
  if (fixed) {
    for (const k of PROBES) {
      const found = compiler.depthChange(opcode, allAt(count, k), () => k);
      if (found === Number(depth)) continue;
      out.push(
        `${opcode}: the page gives a depth of ${depth} and the compiler answers ${found} when ` +
          `every operand is ${k}. A fixed depth is the same answer whatever the operands are.`,
      );
      break;
    }
  } else if (formula !== null) {
    const name = formula[1];
    const at = operands.indexOf(name);
    for (const k of PROBES) {
      const given = allAt(count, 0);
      if (at >= 0) given[at] = k;
      const found = compiler.depthChange(opcode, given, () => (at >= 0 ? 0 : k));
      if (found === 1 - k) continue;
      out.push(
        `${opcode}: the page gives a depth of ${depth} and the compiler answers ${found} with ` +
          `${name} at ${k}, where the formula gives ${1 - k}.`,
      );
      break;
    }
  } else {
    out.push(
      `${opcode}: the page gives a depth of ${depth}, which this check cannot read. A depth is a ` +
        'signed whole number or the form 1 - <name>.',
    );
  }
  return out;
}

/** Two lists that should hold the same names, each side's strays named. */
function setProblems(what, pageTags, other, otherName) {
  const out = [];
  for (const tag of pageTags) {
    if (!other.includes(tag)) out.push(`${what}: the page lists ${tag} and ${otherName} does not have it.`);
  }
  for (const tag of other) {
    if (!pageTags.includes(tag)) out.push(`${what}: ${otherName} has ${tag} and the page does not list it.`);
  }
  return out;
}

// ------------------------------------------------------------- the self test

/**
 * The readers and the rules, attacked before a real page is read.
 *
 * A reader that matches nothing reports a clean page, which this repository
 * has shipped before; the fabricated page and compiler below are what stops
 * that here, and correcting the real page cannot disarm them.
 */
function selfTest() {
  const page = [
    '### 2.2 requires',
    '',
    '| Tag | Required when the program |',
    '|---|---|',
    '| `core.1` | Always |',
    '| `extra` | Sometimes |',
    '',
    '### 2.3 meta',
    '',
    '### 4.13 The whole set',
    '',
    '| Opcode | Operands | Depth | Group |',
    '|---|---|---|---|',
    '| `PUSH` | `k` | `+1` | Stack |',
    '| `GATHER` | `n` | `1 - n` | Arrays |',
    '| `INVOKE` | `site` | `1 - argc` | Calls |',
    '| `TWO` | `a`, `b` | `-1` | Stack |',
    '',
    '## 5. Next',
  ].join('\n');
  const rows = instructionRows(page);
  const tags = tagRows(page);
  const readOk =
    rows !== null &&
    rows.length === 4 &&
    rows[0].opcode === 'PUSH' &&
    rows[0].operands.length === 1 &&
    rows[0].depth === '+1' &&
    rows[3].operands.join(',') === 'a,b' &&
    tags !== null &&
    tags.join(',') === 'core.1,extra' &&
    instructionRows('nothing here') === null &&
    emitterTags("const ORDER: readonly string[] = [\n  'core.1',\n  'extra',\n];")?.join(',') ===
      'core.1,extra';

  const shapes = {
    PUSH: { operands: 1, depth: 1 },
    GATHER: { operands: 1, depth: 'arrayCount' },
    INVOKE: { operands: 1, depth: 'callSite' },
    TWO: { operands: 1, depth: -1 },
  };
  const compiler = {
    isOpcode: (name) => name in shapes,
    operandCount: (name) => shapes[name].operands,
    depthChange: (name, operands, argcOf) => {
      const shape = shapes[name];
      if (shape.depth === 'arrayCount') return 1 - operands[0];
      if (shape.depth === 'callSite') return 1 - argcOf(operands[0]);
      return shape.depth;
    },
  };
  const refusals = [
    rowProblems({ opcode: 'GONE', operands: [], depth: '0' }, compiler).length === 1,
    rowProblems(rows[3], compiler).length === 1,
    rowProblems({ opcode: 'GATHER', operands: ['n'], depth: '+1' }, compiler).length === 1,
    rowProblems({ opcode: 'PUSH', operands: ['k'], depth: '1 - k' }, compiler).length === 1,
    rowProblems({ opcode: 'PUSH', operands: ['k'], depth: 'varies' }, compiler).length === 1,
    setProblems('tags', ['a', 'b'], ['a', 'c'], 'it').length === 2,
  ];
  const acceptances = [
    rowProblems(rows[0], compiler).length === 0,
    rowProblems(rows[1], compiler).length === 0,
    rowProblems(rows[2], compiler).length === 0,
    setProblems('tags', ['a'], ['a'], 'it').length === 0,
  ];
  if (readOk && refusals.every(Boolean) && acceptances.every(Boolean)) return;
  refuse(
    'The rules in this file no longer do what they say: ' +
      `readers ${readOk ? 'read' : 'do not read'} the fabricated page, ` +
      `${refusals.filter(Boolean).length} of ${refusals.length} bad rows were refused and ` +
      `${acceptances.filter(Boolean).length} of ${acceptances.length} good rows accepted. ` +
      'A rule that cannot fail is a clean page and an empty promise.',
  );
}

// ------------------------------------------------------------------- the run

selfTest();

const EMITTER = fromRoot(EMITTER_MODULE);
if (!existsSync(EMITTER) || !existsSync(fromRoot(CORE_MODULE))) {
  refuse(`${EMITTER} is not built, so this check would compare the page with nothing. Run \`npm run build\` first.`);
}
const emitter = await import(EMITTER_MODULE);
const core = await import(CORE_MODULE);

const page = readFileSync(PAGE, 'utf8');
const rows = instructionRows(page);
if (rows === null || rows.length === 0) {
  refuse(`${PAGE} has no 4.13 instruction table this check can read, so it inspected nothing.`);
}
const pageTags = tagRows(page);
if (pageTags === null || pageTags.length === 0) {
  refuse(`${PAGE} has no 2.2 tag table this check can read, so it inspected nothing.`);
}
const orderTags = emitterTags(readFileSync(REQUIRES, 'utf8'));
if (orderTags === null) {
  refuse(`${REQUIRES} no longer holds the ORDER list this check reads the compiler's tags from.`);
}

const problems = [];
const seen = new Set();
for (const row of rows) {
  if (seen.has(row.opcode)) problems.push(`${PAGE} 4.13 has two rows for ${row.opcode}.`);
  seen.add(row.opcode);
  problems.push(...rowProblems(row, emitter));
}
for (const opcode of emitter.OPCODES) {
  if (seen.has(opcode)) continue;
  problems.push(
    `The compiler's opcode table has ${opcode} and ${PAGE} 4.13 has no row for it. An entry ` +
      'without a row is an instruction the compiler can emit and a second engine has never heard of.',
  );
}
const formulas = rows.filter((row) => /^1 - /.test(row.depth)).length;

if (orderTags.join(',') !== pageTags.join(',')) {
  problems.push(
    `${REQUIRES} filters requires through [${orderTags.join(', ')}] and ${PAGE} 2.2 lists ` +
      `[${pageTags.join(', ')}]. The two are one list in one order: the order decides the bytes ` +
      'of every program, and a tag on one side only is a tag with a home missing.',
  );
}
const engineTags = core.capabilitiesFor(true, true);
problems.push(...setProblems('2.2 against the engine', pageTags, [...engineTags], 'the reference engine'));

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  refuse(
    `\n${problems.length} disagreement${problems.length === 1 ? '' : 's'} between ${PAGE} and the ` +
      'compiler. The page is what a second engine is written from, so a row the compiler does ' +
      'not honour is a program that engine refuses, and an entry the page does not print is one ' +
      'it never implemented.',
  );
}

console.log(
  `Format tables check passed: ${rows.length} instruction rows of ${PAGE} 4.13 agree with the ` +
    `compiler's ${emitter.OPCODES.length} entries in opcode, operand count and depth, ${formulas} of ` +
    `them probed as formulas, and the ${pageTags.length} tags of 2.2 are the ${orderTags.length} ` +
    `the compiler can emit, in that order, and the ${engineTags.length} the reference engine ` +
    'declares. Not reached: the Group column and the prose of section 4, which say what an ' +
    "instruction does; that is the conformance suite's to prove.",
);
