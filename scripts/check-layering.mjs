/**
 * Layering check.
 *
 * OpenScript is meant to be picked up by a trading platform that already has its
 * own chart, its own editor and its own broker connection, and by one that has
 * none of them. Both are only possible while the pieces stay separable, and a
 * single convenient import in the wrong direction ends that quietly: the core
 * gains a chart dependency, and from then on nobody can take the language on its
 * own.
 *
 * So the direction is a check rather than a convention. The rule reads:
 *
 *   core     imports nothing outside itself. No packages, no DOM.
 *   editor   imports core. Still no packages, still no DOM.
 *   adapters import core or editor, plus exactly one named outside world.
 *
 *   Nothing imports an adapter except an application.
 *
 * An adapter is the only place that is allowed to know two worlds at once, which
 * is what makes it the piece a broker replaces rather than the piece they patch.
 *
 * ## And one rule about the machine rather than the module graph
 *
 * `compiled-program.md` section 8.4 says there is no locale: number formatting,
 * string comparison and case conversion are defined by the manifest and by
 * Unicode, never by an environment setting. It is the same kind of rule as the
 * layering, enforced here because it is the same kind of damage: a machine
 * configured differently produces a different answer, and the machine that is
 * configured differently is the one nobody is looking at.
 *
 * It was not a hypothetical. Diagnostics were ordered with a locale comparison
 * as the tie after the offset, so two engines in two locales could print the
 * same diagnostics in two orders, and the generated error catalogue was sorted
 * the same way, which decides the bytes of a generated source file.
 *
 * Run: node scripts/check-layering.mjs
 */
import { readFileSync } from 'node:fs';
import { filesMatching, nothingFound } from './lib/files.mjs';
import { maskCode } from './lib/javascript.mjs';

/**
 * What each layer may reach for. `outside` names the bare package specifiers a
 * layer may import; anything else that is not a relative path is refused.
 */
const LAYERS = [
  {
    dir: 'src/core',
    name: 'core',
    mayImportLayers: [],
    outside: [],
    dom: false,
    why: 'the compiler and the engine run in a worker, on a server, and inside somebody else\'s application',
  },
  {
    dir: 'src/editor',
    name: 'editor',
    mayImportLayers: ['core'],
    outside: [],
    dom: false,
    why: 'language intelligence is six pure functions so any editor component can drive them',
  },
  {
    dir: 'src/adapters/charts',
    name: 'adapter:charts',
    mayImportLayers: ['core'],
    outside: ['openalgo-charts'],
    dom: false,
    why: 'the only place that knows both the compiled program and a chart',
  },
  {
    dir: 'src/adapters/codemirror',
    name: 'adapter:codemirror',
    mayImportLayers: ['editor', 'core'],
    outside: ['@codemirror/', '@lezer/'],
    dom: true,
    why: 'the only place that knows both the language intelligence and an editor component',
  },
];

const DOM_GLOBALS = /\b(document|window|navigator|localStorage|HTMLElement)\b/;

/**
 * Where the no-locale rule applies: what ships, and what generates what ships.
 *
 * The tooling is in because a generated source file has to be the same bytes on
 * every machine that builds it, and a sort is where that stops being true.
 */
const DETERMINISM = ['src', 'scripts'];

/**
 * Operations whose answer is a machine setting, with no way to say otherwise.
 *
 * Both of these read the ambient locale and neither takes a written-down one at
 * the call site in any form worth relying on, so they are refused rather than
 * argued about.
 */
const AMBIENT_LOCALE = /\blocaleCompare\b|\btoLocale[A-Z][A-Za-z]*\b/g;

/**
 * Locale-aware machinery constructed without saying which locale.
 *
 * Not banned outright, because reading an area and location zone out of the
 * runtime's own time zone database is the one thing here that needs it, and
 * `stdlib.md` section 12.1 requires exactly that. Constructed with a locale
 * written down it is deterministic; constructed without one it is the machine's
 * setting wearing a constructor.
 */
const LOCALE_AWARE = /\bnew\s+Intl\s*\.\s*[A-Za-z]+\s*\(/g;
const IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function sourceFiles() {
  return filesMatching(/\.(ts|tsx|js|mjs|cjs)$/, ['src']);
}

function layerOf(file) {
  // Longest matching directory wins, so an adapter under src/adapters/charts is
  // not mistaken for whatever sits above it.
  let best = null;
  for (const layer of LAYERS) {
    if (file.startsWith(layer.dir + '/') && (!best || layer.dir.length > best.dir.length)) best = layer;
  }
  return best;
}

/** Which layer a relative import lands in, resolved against the importing file. */
function targetLayer(fromFile, spec) {
  const parts = fromFile.split('/').slice(0, -1);
  for (const segment of spec.split('/')) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return layerOf(parts.join('/'));
}

const files = sourceFiles();
let hits = 0;

for (const file of files) {
  const layer = layerOf(file);
  if (!layer) {
    hits++;
    console.error(`${file}: sits under src/ but in no declared layer. Add it to a layer in scripts/check-layering.mjs or move it.`);
    continue;
  }

  const text = readFileSync(file, 'utf8');

  if (!layer.dom) {
    const dom = DOM_GLOBALS.exec(text);
    if (dom) {
      hits++;
      console.error(`${file}: ${layer.name} touches "${dom[1]}". ${layer.why}.`);
    }
  }

  IMPORT.lastIndex = 0;
  let m;
  while ((m = IMPORT.exec(text)) !== null) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (!spec) continue;

    if (spec.startsWith('.')) {
      const to = targetLayer(file, spec);
      if (to && to.name !== layer.name && !layer.mayImportLayers.includes(to.name)) {
        hits++;
        console.error(`${file}: ${layer.name} imports ${to.name} ("${spec}"), which the layering forbids.`);
      }
      continue;
    }

    if (spec.startsWith('node:')) {
      hits++;
      console.error(`${file}: ${layer.name} imports "${spec}". Nothing here may assume a Node runtime; a browser and a worker have to run the same file.`);
      continue;
    }

    if (!layer.outside.some((allowed) => spec === allowed || spec.startsWith(allowed))) {
      hits++;
      console.error(`${file}: ${layer.name} imports the package "${spec}", which it is not allowed to know about. ${layer.why}.`);
    }
  }
}

/** The text between a bracket and its partner, or null if it is never closed. */
function balanced(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    const c = code[i];
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  return null;
}

const lineAt = (code, index) => code.slice(0, index).split('\n').length;

/**
 * The no-locale rule, over masked code so that prose about it is not it.
 *
 * Masked rather than grepped raw: this file names every construct it refuses,
 * and a check that had to exempt the file doing the checking would have a hole
 * in it exactly the shape of a check.
 */
const determinismFiles = filesMatching(/\.(ts|tsx|js|mjs|cjs)$/, DETERMINISM);

for (const file of determinismFiles) {
  const { code } = maskCode(readFileSync(file, 'utf8'));

  AMBIENT_LOCALE.lastIndex = 0;
  let m;
  while ((m = AMBIENT_LOCALE.exec(code)) !== null) {
    hits++;
    console.error(
      `${file}:${lineAt(code, m.index)}: uses "${m[0]}", whose answer is a machine setting. ` +
        `compiled-program.md 8.4: no locale, ever. Compare with < and >, which is code point ` +
        `order and the same order everywhere, and convert case with the invariant operation.`,
    );
  }

  LOCALE_AWARE.lastIndex = 0;
  while ((m = LOCALE_AWARE.exec(code)) !== null) {
    const argument = balanced(code, m.index + m[0].length - 1);
    if (argument !== null && argument.trimStart().startsWith('_STR_')) continue;
    hits++;
    console.error(
      `${file}:${lineAt(code, m.index)}: builds "${m[0].trim()}" without naming a locale, so it ` +
        `takes the machine's. compiled-program.md 8.4: pass the locale as a literal first ` +
        `argument, the way the time zone reader does, or do not use it.`,
    );
  }
}

if (hits > 0) {
  console.error(
    `\n${hits} layering violation${hits === 1 ? '' : 's'}. A platform has to be able to take the ` +
      `language without the chart, the chart without the language, and either without the editor, ` +
      `and two engines have to agree whatever machine they are running on.`,
  );
  process.exit(1);
}

console.log(
  files.length === 0
    ? `Layering check: ${nothingFound('source file under src/')}. The rule is in place; nothing exercised it.`
    : `Layering check passed: ${files.length} source files, every import inside its layer, and ` +
        `${determinismFiles.length} files of source and tooling that read no locale.`,
);
