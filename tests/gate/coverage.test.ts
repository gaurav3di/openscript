/**
 * The gate covers its own scripts, and counts assertions rather than mentions.
 *
 * Both halves of the phase gate work the same way: a directory of scripts, and
 * a suite that names one, runs it and compares every surface against a
 * reference transcribed beside the test. Nothing joined the two. The scripts
 * were a directory listing and the comparisons were a set of files, and the
 * only thing that made them the same set was that somebody had written them in
 * the same afternoon.
 *
 * So a script could be added and never compared, and a comparison could be
 * deleted with its script left behind, and in both cases the suite stays green
 * and the number in the gate stays right. The gate reads "one hundred and one
 * studies reproduced, each matching its reference exactly", and that sentence
 * is a claim about a set, which is exactly the thing nothing measured.
 *
 * This test measures it. It reads the two script directories and the two suites
 * that compare them, and refuses three things:
 *
 * - **a script nothing compares**, which is the failure that reads as a pass:
 *   the file is in the repository, it counts towards the hundred and one, and
 *   nothing ever runs it;
 * - **a name no script answers**, which is a comparison quietly renamed or a
 *   script deleted out from under one;
 * - **a suite that found nothing to read**, because a coverage test that
 *   compared two empty sets would agree with itself for ever.
 *
 * ## Why this counts assertions and not mentions
 *
 * The first version of this test counted a script as covered when its name
 * appeared as a quoted string anywhere in the half's own tests. That reads as
 * the right rule and is not one. Both comparisons for a study were deleted and
 * the name was left behind in a comment line: the suite dropped two tests, the
 * gate went on reporting a hundred and one studies each matching its reference
 * exactly, and this test agreed. Deleting the name as well failed, with a good
 * message, so the check caught a deleted name and not a deleted comparison,
 * which is the failure it was written for. It was passing on prose.
 *
 * A name is therefore counted where an assertion can reach it, and nowhere
 * else:
 *
 * - **Comments are not code.** The text is masked before anything is read out
 *   of it, so a name in a line comment, a block comment or a documentation
 *   comment is not a mention at all.
 * - **A name counts when it sits inside a `test(...)` that asserts something.**
 *   A test with no assertion in it is a test that cannot fail, and a name
 *   inside one is covered by nothing.
 * - **A name written into a top-level binding counts when a comparison reads
 *   that binding.** Two suites here list their studies above the tests and loop
 *   over the list, which is the right way to write those tests, and a rule that
 *   demanded a literal inside the brackets would push them into a worse shape
 *   to satisfy a check. So the binding the name sits in has to be named inside
 *   a test that asserts, which is the same property one step removed.
 *
 * An assertion is a call to `assert`, to any helper whose name begins with it,
 * or to one of the `matches` comparisons, because a comparison helper in this
 * suite is named for what it does.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { GATE_ROOT } from './support.js';

const SCRIPT = '.oscript';
const SUITE = '.test.ts';

/** A call that compares something. Everything else in a test is arrangement. */
const ASSERTION = /\b(?:assert|matches)[A-Za-z0-9]*\s*(?:\.\s*[A-Za-z][A-Za-z0-9]*\s*)?\(/;

/** A binding written at the top level of a suite, which a test may then read. */
const BINDING = /\b(?:const|let|var|function)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;

/** Every quoted string in a file, used only to word a failure. */
const QUOTED = /'([^'\n]*)'|"([^"\n]*)"/g;

/**
 * A script handed to one of the two harnesses by name, where the name is
 * written in the brackets rather than passed in from a list above.
 */
const HARNESS =
  /\b(?:runStudy|loadStudy|compileStudy|studySource|loadGate|compileGate|plotsOf|gateSource)\s*\(\s*$/;

/** Where a `/` starts a regular expression rather than a division. */
const OPENS = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '^', '~', '<', '>',
]);

/** One string literal the file really holds, and where it sits in the code. */
interface Literal {
  readonly value: string;
  readonly at: number;
}

/** A file with everything that is not code blanked out, and its literals. */
interface Masked {
  /** The same length as the file, with comments, strings and patterns blanked. */
  readonly code: string;
  readonly literals: readonly Literal[];
}

/**
 * Blank everything a name can hide in, and keep every offset.
 *
 * Comments, the contents of strings and template literals, and regular
 * expressions all become spaces, so what is left is text in which a bracket is
 * a bracket and a call is a call. The literals are collected on the way past,
 * each with the offset it started at, because where a name is written is the
 * whole question here.
 */
function mask(text: string): Masked {
  const out: string[] = [];
  const literals: Literal[] = [];
  let i = 0;

  const previous = (): string => {
    for (let k = out.length - 1; k >= 0; k -= 1) {
      const ch = out[k] as string;
      if (!/\s/.test(ch)) return ch;
    }
    return '';
  };
  const blank = (ch: string): string => (ch === '\n' ? '\n' : ' ');

  while (i < text.length) {
    const ch = text[i] as string;

    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') {
        out.push(' ');
        i += 1;
      }
      continue;
    }

    if (ch === '/' && text[i + 1] === '*') {
      out.push(' ', ' ');
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        out.push(blank(text[i] as string));
        i += 1;
      }
      if (i < text.length) {
        out.push(' ', ' ');
        i += 2;
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      const at = i;
      let value = '';
      out.push(' ');
      i += 1;
      while (i < text.length && text[i] !== ch && text[i] !== '\n') {
        if (text[i] === '\\') {
          value += text[i + 1] ?? '';
          out.push(' ', ' ');
          i += 2;
          continue;
        }
        value += text[i];
        out.push(' ');
        i += 1;
      }
      if (text[i] === ch) {
        out.push(' ');
        i += 1;
      }
      literals.push({ value, at });
      continue;
    }

    if (ch === '`') {
      out.push(' ');
      i += 1;
      let depth = 0;
      while (i < text.length) {
        if (text[i] === '\\') {
          out.push(' ', ' ');
          i += 2;
          continue;
        }
        if (depth === 0 && text[i] === '`') {
          out.push(' ');
          i += 1;
          break;
        }
        if (text[i] === '$' && text[i + 1] === '{') {
          depth += 1;
          out.push(' ', ' ');
          i += 2;
          continue;
        }
        if (depth > 0 && text[i] === '}') {
          depth -= 1;
          out.push(' ');
          i += 1;
          continue;
        }
        out.push(blank(text[i] as string));
        i += 1;
      }
      continue;
    }

    if (ch === '/' && OPENS.has(previous())) {
      out.push(' ');
      i += 1;
      let inClass = false;
      while (i < text.length && text[i] !== '\n') {
        if (text[i] === '\\') {
          out.push(' ', ' ');
          i += 2;
          continue;
        }
        if (text[i] === '[') inClass = true;
        else if (text[i] === ']') inClass = false;
        else if (text[i] === '/' && !inClass) {
          out.push(' ');
          i += 1;
          break;
        }
        out.push(' ');
        i += 1;
      }
      continue;
    }

    out.push(ch);
    i += 1;
  }

  return { code: out.join(''), literals };
}

/** Where one `test(...)` call begins and ends, over masked code. */
interface Block {
  readonly from: number;
  readonly to: number;
}

function blocksIn(code: string): readonly Block[] {
  const found: Block[] = [];
  const opener = /\btest\s*\(/g;
  let call;
  while ((call = opener.exec(code)) !== null) {
    let depth = 0;
    let i = call.index + call[0].length - 1;
    for (; i < code.length; i += 1) {
      const ch = code[i] as string;
      if (ch === '(' || ch === '[' || ch === '{') depth += 1;
      else if (ch === ')' || ch === ']' || ch === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const to = Math.min(i + 1, code.length);
    found.push({ from: call.index, to });
    opener.lastIndex = to;
  }
  return found;
}

/** Every name one file compares, by the rule the header states. */
function comparedIn(text: string): ReadonlySet<string> {
  const { code, literals } = mask(text);
  const blocks = blocksIn(code);
  const asserts = (block: Block): boolean => ASSERTION.test(code.slice(block.from, block.to));
  const comparisons = blocks.filter(asserts);
  const holding = (at: number): Block | undefined =>
    blocks.find((block) => at >= block.from && at < block.to);

  const bindings: { name: string; at: number }[] = [];
  BINDING.lastIndex = 0;
  let written;
  while ((written = BINDING.exec(code)) !== null) {
    if (holding(written.index) === undefined) {
      bindings.push({ name: written[1] as string, at: written.index });
    }
  }
  const ends = [...bindings.map((one) => one.at), ...blocks.map((one) => one.from)].sort(
    (a, b) => a - b,
  );
  const read = new Set(
    bindings
      .filter((one) =>
        comparisons.some((block) =>
          new RegExp(`\\b${one.name}\\b`).test(code.slice(block.from, block.to)),
        ),
      )
      .map((one) => one.name),
  );

  const compared = new Set<string>();
  for (const literal of literals) {
    const block = holding(literal.at);
    if (block !== undefined) {
      if (asserts(block)) compared.add(literal.value);
      continue;
    }
    // A name above the tests belongs to the binding it was written into, and
    // counts only where a test that asserts something reads that binding.
    let found: { name: string; at: number } | undefined;
    for (const one of bindings) if (one.at < literal.at) found = one;
    if (found === undefined) continue;
    const owner = found;
    const next = ends.find((end) => end > owner.at);
    if (next !== undefined && literal.at > next) continue;
    if (read.has(owner.name)) compared.add(literal.value);
  }
  return compared;
}

interface Half {
  /** What this half of the gate is, for a failure that names it. */
  readonly what: string;
  /** Where its scripts live, and where its comparisons live. */
  readonly scripts: string;
  readonly suite: string;
  /** The fewest scripts this half may hold, which is its own gate. */
  readonly least: number;
}

/**
 * The two halves, and the floor under each.
 *
 * The floor is the phase gate itself: `ROADMAP.md` Phase 2 names five studies
 * matched to the last decimal, and Phase 3 names one hundred. A count that
 * drops below one of those has not failed a test, it has failed the phase, and
 * the suite should say so in those words rather than pass with less.
 */
const HALVES: readonly Half[] = [
  {
    what: "the Phase 2 gate's studies",
    scripts: 'tests/gate/scripts/',
    suite: 'tests/gate/',
    least: 5,
  },
  {
    what: "the Phase 3 gate's studies",
    scripts: 'tests/gate/studies/scripts/',
    suite: 'tests/gate/studies/',
    least: 100,
  },
];

function entriesOf(directory: string): readonly string[] {
  return readdirSync(new URL(directory, GATE_ROOT), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

function suiteFiles(half: Half): readonly string[] {
  return entriesOf(half.suite).filter((name) => name.endsWith(SUITE));
}

function textOf(half: Half, file: string): string {
  return readFileSync(new URL(file, new URL(half.suite, GATE_ROOT)), 'utf8');
}

/** The scripts one half holds, by the name a comparison would call them. */
function scriptsOf(half: Half): readonly string[] {
  const entries = entriesOf(half.scripts);
  const strays = entries.filter((name) => !name.endsWith(SCRIPT));
  assert.deepEqual(
    strays,
    [],
    `${half.scripts} holds ${strays.join(', ')}, which is not a script. Every file in a ` +
      `script directory is one the gate can run, or the count the gate quotes is not a count ` +
      `of anything.`,
  );
  return entries.map((name) => name.slice(0, -SCRIPT.length)).sort();
}

/** Every name a comparison in this half reaches. */
function comparedBy(half: Half): ReadonlySet<string> {
  const files = suiteFiles(half);
  assert.notEqual(
    files.length,
    0,
    `${half.suite} holds no ${SUITE} file, so this check compared a directory against nothing. ` +
      `A coverage test that reads no tests agrees with itself for ever.`,
  );

  const compared = new Set<string>();
  for (const file of files) {
    for (const name of comparedIn(textOf(half, file))) compared.add(name);
  }
  return compared;
}

/** Every quoted word anywhere in this half, comments included. */
function mentionedBy(half: Half): ReadonlySet<string> {
  const mentioned = new Set<string>();
  for (const file of suiteFiles(half)) {
    const text = textOf(half, file);
    QUOTED.lastIndex = 0;
    let found;
    while ((found = QUOTED.exec(text)) !== null) {
      const value = found[1] ?? found[2];
      if (value !== undefined && value.length > 0) mentioned.add(value);
    }
  }
  return mentioned;
}

/** Every script named in the brackets of a harness call, with its file. */
function calledIn(half: Half): readonly { file: string; name: string }[] {
  const out: { file: string; name: string }[] = [];
  for (const file of suiteFiles(half)) {
    const { code, literals } = mask(textOf(half, file));
    for (const literal of literals) {
      if (HARNESS.test(code.slice(Math.max(0, literal.at - 40), literal.at))) {
        out.push({ file, name: literal.value });
      }
    }
  }
  return out;
}

for (const half of HALVES) {
  test(`every one of ${half.what} is compared, and every comparison answered by a script`, () => {
    const scripts = scriptsOf(half);
    const compared = comparedBy(half);

    assert.equal(
      scripts.length >= half.least,
      true,
      `${half.scripts} holds ${scripts.length} scripts and the phase gate is ${half.least}. ` +
        `A gate quotes a number, so the number has to be countable from the tree.`,
    );

    const uncompared = scripts.filter((name) => !compared.has(name));
    const mentioned = uncompared.length === 0 ? new Set<string>() : mentionedBy(half);
    assert.deepEqual(
      uncompared,
      [],
      `${half.scripts} holds ${uncompared.length} script(s) nothing in ${half.suite} compares: ` +
        `${uncompared.map((name) => (mentioned.has(name) ? `${name} (named, never asserted on)` : name)).join(', ')}. ` +
        `A script nothing runs still counts towards the number the gate quotes, which is the ` +
        `one failure this suite exists to make impossible. A name in a comment, or in a test ` +
        `with no assertion in it, is not a comparison. Compare it, or delete it and say the ` +
        `smaller number.`,
    );

    // The same rule read backwards, over the call sites rather than over every
    // literal: a name handed to the harness that no script answers. It would
    // fail anyway, as a file that could not be read partway through a run, and
    // this says it at the listing instead, with the file it is in.
    const held = new Set(scripts);
    const unanswered = calledIn(half).filter((call) => !held.has(call.name));
    assert.deepEqual(
      unanswered.map((call) => `${call.file}: ${call.name}`),
      [],
      `a comparison in ${half.suite} runs a script that ${half.scripts} does not hold. Either ` +
        `the script was renamed or deleted and the comparison was left behind, or the name is ` +
        `a typo that would have been a missing file halfway through the run.`,
    );
  });
}
