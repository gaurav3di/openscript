/**
 * Section 20 check: a count the arithmetic manifest prints is a count a test
 * measures again.
 *
 * `stdlib.md` section 20 is the page a second engine implements its arithmetic
 * from, and the way it goes wrong is always the same. A sentence names an
 * arrangement it refuses, prints a figure beside the refusal, and is then
 * believed forever. Five sentences there have had to be withdrawn or corrected
 * across four rounds, by four different readers, and every one of them had been
 * measured once and by nobody since: two said "most" of a population that was
 * nothing like most, one said a carried sum differs on every bar when it agrees
 * on a couple of hundred in twenty thousand, and two fixed a spelling that
 * cannot change a value at all.
 *
 * 20.1 states the test a sentence has to pass: name the second arrangement it
 * refuses, and print the count of where the two differ. Half of that test is
 * attention and half of it is mechanical, and this check is the mechanical half.
 * **Every count section 20 prints must be read back out of the page by a test
 * that measures it again.** `tests/stdlib/section-20.ts` provides `figuresIn`,
 * which reads a figure out of the page by pattern, so a test that uses it is
 * asserting against the document rather than against a constant typed twice:
 * reword the claim, move the figure or change its population, and the test
 * fails instead of the figure going on being quoted.
 *
 * ## What this check cannot do, which 20.1 also says
 *
 * It cannot decide whether a sentence is vacuous. Deciding that means
 * implementing both readings and running them, and a vacuous sentence is
 * precisely one that names no second reading to implement, so there is nothing
 * for a checker to read. A check that scanned the prose for the withdrawn
 * phrasings would catch a sentence coming back word for word, which is not how
 * any of the five arrived.
 *
 * ## And what it does not reach
 *
 * A count is recognised by the shapes below: "70 of the 72", "differs on 5281",
 * "over 25176 values", "from 1 to 100000", "first at a length of 15", "4.5
 * ulps", "gives x against y". A figure written in a shape nobody listed is not
 * caught, exactly as a name that is not on the list in `check-names.mjs` is not
 * caught. The shapes are the mechanical half stated truthfully rather than a
 * claim to read English, and a new shape is one line here.
 *
 * Coverage is positional, not by value: a claim counts as read only when it
 * sits inside the span of the page that a test's own pattern matched. Matching
 * by value alone would let a new "differs on 31" ride on the 31 an unrelated
 * sentence already has.
 *
 * What it sees is that a test **reads** the figure, not that it asserts
 * anything with it. A test that read a count and threw it away would pass here
 * and is the same defect one step along, which is why the rule in `CLAUDE.md`
 * about a test that cannot fail applies to these tests like any other.
 *
 * Run: node scripts/check-section-20.mjs [--list]
 */
import { readFileSync } from 'node:fs';

import { filesMatching, nothingFound } from './lib/files.mjs';

/** The page the section lives in, and the directory the tests live in. */
const PAGE = 'spec/stdlib.md';
const TESTS = ['tests'];

/** The heading section 20 opens with. Everything up to the next one is it. */
const OPENS = '## 20. The arithmetic';

/**
 * The shapes a count is written in.
 *
 * Each is matched against the page with its line breaks turned into spaces,
 * because a claim that sits across two lines is one sentence to a reader. A
 * shape captures every figure in the claim: all of them have to be read by a
 * test, because a population nobody measured over is as empty as a count
 * nobody measured.
 */
const SHAPES = [
  { name: 'n of the m', pattern: /\b(\d[\d,]*) of (?:the|its) (\d[\d,]*)\b/ },
  { name: 'differs on n', pattern: /\bdiffers? on (\d[\d,]*)\b/ },
  { name: 'part company on n', pattern: /\bparts? company on (\d[\d,]*)\b/ },
  {
    name: 'over n of a population',
    pattern:
      /\bover (?:the |those same |every whole |the first )*(\d[\d,]*) (?:values|lengths|windows|exponents|percentages|arguments|weights|kernels|bars)\b/,
  },
  { name: 'from 1 to n', pattern: /\bfrom 1 to (\d[\d,]*)\b/ },
  { name: 'first at n', pattern: /\bfirst at (?:a length of )?(\d[\d,]*)\b/ },
  { name: 'n ulps', pattern: /\b(\d+(?:\.\d+)?) ulps\b/ },
  { name: 'gives x against y', pattern: /\bgives (\d+(?:\.\d+)?) against (\d+(?:\.\d+)?)\b/ },
];

/**
 * A `figuresIn` call in a test, as a regular expression literal.
 *
 * The literal is read out of the test source rather than by importing the
 * tests, because this check runs before the tests are built and a check that
 * needed a build to run would be a check nobody runs first.
 */
const CALL = /figuresIn\(\s*\/((?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+)\/([gimsuy]*)/g;

const problems = [];

function read(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

const raw = read(PAGE);
if (raw === undefined) {
  console.error(
    `Section 20 check: ${PAGE} was not found, and it is the page the counts are printed on. ` +
      `That is a failure rather than a pass: a check with nothing to read inspects nothing.`,
  );
  process.exit(1);
}

// Newlines become spaces one character at a time, so every offset below is an
// offset into the file as well, and a line number can be recovered from it.
const page = raw.replace(/\r\n/g, '\n');
const flat = page.replace(/\n/g, ' ');

const opens = page.indexOf(OPENS);
if (opens === -1) {
  console.error(
    `Section 20 check: ${PAGE} has no heading "${OPENS}". Either the section was renumbered, in ` +
      `which case this check follows it, or it is gone, in which case so is this check.`,
  );
  process.exit(1);
}
const nextHeading = page.indexOf('\n## ', opens + OPENS.length);
const closes = nextHeading === -1 ? page.length : nextHeading;

/** The fenced blocks, whose numbers are the arithmetic rather than a count. */
const fenced = [];
for (const block of page.matchAll(/```[\s\S]*?```/g)) {
  fenced.push([block.index, block.index + block[0].length]);
}
const insideFence = (at) => fenced.some(([from, to]) => at >= from && at < to);

/** The line a file offset falls on, for a message somebody has to act on. */
function lineAt(offset) {
  let line = 1;
  for (let at = 0; at < offset; at += 1) if (page[at] === '\n') line += 1;
  return line;
}

/** Every count the section prints, as a span of the page and its figures. */
const claims = [];
for (const shape of SHAPES) {
  const all = new RegExp(shape.pattern.source, `${shape.pattern.flags}g`);
  let found;
  while ((found = all.exec(flat)) !== null) {
    if (found.index < opens || found.index >= closes) continue;
    if (insideFence(found.index)) continue;
    claims.push({
      shape: shape.name,
      text: found[0],
      from: found.index,
      to: found.index + found[0].length,
      figures: found.slice(1).filter((one) => one !== undefined),
    });
  }
}

/** Every span of the page a test reads a figure out of. */
const testFiles = filesMatching(/\.ts$/i, TESTS);
if (testFiles.length === 0) {
  console.error(
    `Section 20 check: ${nothingFound('test file under tests/')}. The counts are checked against ` +
      `the tests that measure them, so an empty list is a failure.`,
  );
  process.exit(1);
}

const spans = [];
let calls = 0;
for (const file of testFiles) {
  const source = read(file);
  if (source === undefined) continue;
  CALL.lastIndex = 0;
  let call;
  while ((call = CALL.exec(source)) !== null) {
    calls += 1;
    let pattern;
    try {
      pattern = new RegExp(call[1], call[2]);
    } catch (why) {
      problems.push(`${file}: figuresIn is passed /${call[1]}/, which is not a pattern: ${why.message}`);
      continue;
    }
    const everywhere = [...flat.matchAll(new RegExp(call[1], `${call[2]}g`))];
    if (everywhere.length === 0) {
      problems.push(
        `${file}: figuresIn is passed /${call[1]}/ and ${PAGE} has no sentence matching it. Either ` +
          `the claim was reworded, in which case measure it again and bring the pattern with it, ` +
          `or the claim is gone, in which case the test goes with it.`,
      );
      continue;
    }
    if (everywhere.length > 1) {
      problems.push(
        `${file}: figuresIn is passed /${call[1]}/, which matches ${everywhere.length} sentences ` +
          `of ${PAGE}, so which figures it reads is decided by whichever comes first. Narrow it ` +
          `to the one claim it is about.`,
      );
      continue;
    }
    const at = pattern.exec(flat);
    spans.push({ file, from: at.index, to: at.index + at[0].length });
  }
}

const covered = [];
const uncovered = [];
for (const claim of claims) {
  const by = spans.find((span) => claim.from >= span.from && claim.to <= span.to);
  if (by === undefined) uncovered.push(claim);
  else covered.push({ claim, by: by.file });
}

for (const claim of uncovered) {
  problems.push(
    `${PAGE}:${lineAt(claim.from)}: "${claim.text}" prints a count that no test reads back out of ` +
      `the page. Measure it in a test with figuresIn, so that rewording the claim or moving the ` +
      `figure fails the build. A figure quoted here and measured nowhere is how five sentences in ` +
      `section 20 went wrong.`,
  );
}

if (process.argv.includes('--list')) {
  console.log(`Counts printed by section 20 of ${PAGE}:`);
  for (const { claim, by } of covered) {
    console.log(`    ${lineAt(claim.from)}: ${claim.text}  [${claim.shape}]  read by ${by}`);
  }
  for (const claim of uncovered) {
    console.log(`    ${lineAt(claim.from)}: ${claim.text}  [${claim.shape}]  READ BY NOTHING`);
  }
  console.log(`\n${claims.length} counts, ${calls} figuresIn calls across ${testFiles.length} test files.`);
  process.exit(0);
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(
    `\n${problems.length} section 20 problem${problems.length === 1 ? '' : 's'}. This check is the ` +
      `mechanical half of 20.1's test: whether a sentence is worth making is attention, and ` +
      `whether its figure is still true is this.`,
  );
  process.exit(1);
}

console.log(
  `Section 20 check passed: ${claims.length} counts printed by ${PAGE}, every one of them read ` +
    `back out of the page and measured again by ${calls} figuresIn calls across ` +
    `${testFiles.length} test files.`,
);
