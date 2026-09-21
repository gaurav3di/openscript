/**
 * Colour channel check: the named colours are the page's channels, in both
 * tables that carry them.
 *
 * `stdlib.md` 11.1 says the exact channel values of the named colours are fixed
 * in the library manifest and are part of the conformance suite, so that a
 * study looks the same on every engine. For as long as that sentence has
 * existed the values lived in two source files and nowhere a second engine
 * could read them from: the compiler's table, for the colours it writes into a
 * declaration field before bar 0, and the engine's table, for the colours a
 * script computes on a bar. A test holds the two tables to each other, which
 * proves they agree and proves nothing about what they agree on. Two copies
 * that drift together are still a conformance contract nobody published.
 *
 * `spec/colours.json` is now that part of the manifest in machine form, and
 * this check holds both tables to it. It states no value of its own: the page
 * is the input, the names are read from 11.1's own block the way the example
 * check reads them, and the alpha is the full opacity 11.1 states, which
 * `compiled-program.md` 2.9 writes as 1.
 *
 * ## What it does not reach
 *
 * A name the compiler's table holds that the page does not. That table is not
 * enumerable through its door, only asked about one name at a time, so the
 * check can prove every page name is there and every engine name is a page
 * name, and says so rather than claiming the third direction.
 *
 * Run: node scripts/check-colour-channels.mjs
 * Needs `npm run build` first: it asks the built tables, not their source.
 */
import { existsSync, readFileSync } from 'node:fs';
import { COLOURS_MODULE, fromRoot } from './lib/built.mjs';

const PAGE = 'spec/colours.json';
const NAMES_PAGE = 'spec/stdlib.md';

/**
 * The engine behind its own door, from the build. Written where a loader takes
 * it, for the reason `lib/built.mjs` gives: a specifier is a literal, resolved
 * against the file doing the loading, and this file is the one loading it.
 */
const ENGINE_MODULE = '../dist/core/engine/index.js';

/** Full opacity, as 2.9 writes the alpha of a colour that hides nothing. */
const OPAQUE = 1;

function refuse(message) {
  console.error(message);
  process.exit(1);
}

/**
 * The names 11.1 lists as a block, not a table, read as `check-examples.mjs`
 * reads them, after the line endings a checkout on one machine carries and
 * another does not are put aside.
 */
function namesFromColourBlock(text) {
  const m = text.replace(/\r\n/g, '\n').match(/### 11\.1 Named colours[\s\S]*?```\n([\s\S]*?)```/);
  if (!m) return null;
  return m[1].split(/\s+/).filter((w) => /^[a-z]+$/.test(w));
}

/**
 * What the page, the names block and the two tables disagree about.
 *
 * `emitterOf(name)` answers `[r, g, b, a]` or undefined, `engineOf(name)`
 * answers `{ r, g, b, a }` or null, and `engineNames` is the engine's whole
 * list, which is the one list that can be enumerated.
 */
function channelProblems(channels, blockNames, emitterOf, engineOf, engineNames) {
  const out = [];
  const pageNames = Object.keys(channels);
  for (const name of pageNames) {
    if (!blockNames.includes(name)) {
      out.push(`${PAGE} fixes channels for ${name}, and ${NAMES_PAGE} 11.1 does not list the name.`);
    }
  }
  for (const name of blockNames) {
    if (!pageNames.includes(name)) {
      out.push(`${NAMES_PAGE} 11.1 lists ${name}, and ${PAGE} fixes no channels for it.`);
    }
  }
  for (const name of engineNames) {
    if (!pageNames.includes(name)) {
      out.push(`The engine's table holds ${name}, and ${PAGE} fixes no channels for it.`);
    }
  }

  for (const name of pageNames) {
    const page = channels[name];
    const whole = (one) => Number.isInteger(one) && one >= 0 && one <= 255;
    if (!Array.isArray(page) || page.length !== 3 || !page.every(whole)) {
      out.push(`${PAGE}: ${name} is not three whole numbers from 0 to 255.`);
      continue;
    }
    const want = [...page, OPAQUE].join(', ');

    const written = emitterOf(name);
    if (written === undefined) {
      out.push(`${name}: the compiler's table has no such colour, and ${PAGE} fixes it.`);
    } else if ([...written].join(', ') !== want) {
      out.push(
        `${name}: the compiler's table writes [${[...written].join(', ')}] and ${PAGE} fixes ` +
          `[${want}]. A declaration written with this name draws something other than the ` +
          'colour the specification promises.',
      );
    }

    const computed = engineOf(name);
    if (computed === null || computed === undefined || typeof computed !== 'object') {
      out.push(`${name}: the engine's table has no such colour, and ${PAGE} fixes it.`);
    } else if ([computed.r, computed.g, computed.b, computed.a].join(', ') !== want) {
      out.push(
        `${name}: the engine's table computes [${[computed.r, computed.g, computed.b, computed.a].join(', ')}] ` +
          `and ${PAGE} fixes [${want}]. A script that computes with this name gets a colour the ` +
          'specification does not promise.',
      );
    }
  }
  return out;
}

/**
 * The rule, attacked before a real page is read.
 *
 * Fabricated tables rather than the real ones, so that correcting a value in
 * the tree cannot disarm the check.
 */
function selfTest() {
  const channels = { one: [1, 2, 3], two: [4, 5, 6] };
  const agree = (name) => (channels[name] === undefined ? undefined : [...channels[name], OPAQUE]);
  const agreeEngine = (name) =>
    channels[name] === undefined
      ? null
      : { r: channels[name][0], g: channels[name][1], b: channels[name][2], a: OPAQUE };
  const clean = channelProblems(channels, ['one', 'two'], agree, agreeEngine, ['one', 'two']);

  const offByOne = (name) => (name === 'two' ? [4, 5, 7, OPAQUE] : agree(name));
  const faded = (name) => (name === 'one' ? { r: 1, g: 2, b: 3, a: 0.5 } : agreeEngine(name));
  const refusals = [
    channelProblems(channels, ['one', 'two'], offByOne, agreeEngine, ['one', 'two']).length === 1,
    channelProblems(channels, ['one', 'two'], agree, faded, ['one', 'two']).length === 1,
    channelProblems(channels, ['one'], agree, agreeEngine, ['one', 'two']).length === 1,
    channelProblems(channels, ['one', 'two', 'three'], agree, agreeEngine, ['one', 'two']).length === 1,
    channelProblems(channels, ['one', 'two'], agree, agreeEngine, ['one', 'two', 'four']).length === 1,
    channelProblems(channels, ['one', 'two'], () => undefined, agreeEngine, ['one', 'two']).length === 2,
  ];
  const block = namesFromColourBlock('### 11.1 Named colours\n\ntext\n\n```\naqua  black\nblue\n```\n');
  const blockOk = block !== null && block.join(',') === 'aqua,black,blue';
  if (clean.length === 0 && refusals.every(Boolean) && blockOk) return;
  refuse(
    'The rule in this file no longer does what it says: an agreeing pair produced ' +
      `${clean.length} problems, ${refusals.filter(Boolean).length} of ${refusals.length} ` +
      `disagreements were refused, and the names block ${blockOk ? 'read' : 'did not read'}. ` +
      'A rule that cannot fail is a clean page and an empty promise.',
  );
}

selfTest();

const COLOURS = fromRoot(COLOURS_MODULE);
const ENGINE = fromRoot(ENGINE_MODULE);
if (!existsSync(COLOURS) || !existsSync(ENGINE)) {
  refuse(
    `${COLOURS} or ${ENGINE} is not built, so this check would compare the page with nothing. ` +
      'Run `npm run build` first.',
  );
}
const compiler = await import(COLOURS_MODULE);
const engine = await import(ENGINE_MODULE);

const page = JSON.parse(readFileSync(PAGE, 'utf8'));
const channels = page.channels ?? {};
if (Object.keys(channels).length === 0) {
  refuse(`${PAGE} fixes no channels, so this check inspected nothing.`);
}
const blockNames = namesFromColourBlock(readFileSync(NAMES_PAGE, 'utf8'));
if (blockNames === null || blockNames.length === 0) {
  refuse(`${NAMES_PAGE} 11.1 has no block of names this check can read, so it inspected nothing.`);
}

const problems = channelProblems(
  channels,
  blockNames,
  (name) => compiler.namedColour(name),
  (name) => engine.namedColour(name),
  [...engine.COLOUR_NAMES],
);

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  refuse(
    `\n${problems.length} disagreement${problems.length === 1 ? '' : 's'} about a named colour. ` +
      `${PAGE} is the value a second engine implements, and a table here that answers something ` +
      'else is a study that looks different on this engine than the specification says it does.',
  );
}

const count = Object.keys(channels).length;
console.log(
  `Colour channel check passed: ${count} named colours in ${PAGE}, the same ${blockNames.length} ` +
    `names ${NAMES_PAGE} 11.1 lists, and the compiler's table and the engine's table both answer ` +
    "the page's channels at full opacity for every one. Not reached: a name the compiler's " +
    'table holds that the page does not, because that table is asked one name at a time and ' +
    "cannot be enumerated through its door; the engine's can, and it holds exactly the page's names.",
);
