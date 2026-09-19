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
 * Run: node scripts/check-layering.mjs
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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
const IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function sourceFiles() {
  return execSync('git ls-files', { encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter((f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f) && f.startsWith('src/'));
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

if (hits > 0) {
  console.error(
    `\n${hits} layering violation${hits === 1 ? '' : 's'}. A platform has to be able to take the ` +
      `language without the chart, the chart without the language, and either without the editor.`,
  );
  process.exit(1);
}

console.log(
  files.length === 0
    ? 'Layering check passed: no source files yet, and the rule is in place before the first one lands.'
    : `Layering check passed: ${files.length} source files, every import inside its layer.`,
);
