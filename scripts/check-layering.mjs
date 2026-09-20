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
 * ## This check is also what enforces rule one for the artifact
 *
 * That is not a side effect of the layering and it is no longer left to be
 * noticed. Rule one of this project is that nothing builds code out of text. The
 * scan in `check-no-eval.mjs` reads source text looking for the forms that do,
 * and it has been got past four times, because a watched name can be spelled
 * arbitrarily many ways. The runtime setting the tooling runs under refuses two
 * names, the string evaluator and the function builder, and closes no other
 * door: a virtual machine module, a data URL import, a module assembled out of
 * bytes and a child process handed source text were all measured running under
 * it.
 *
 * Every one of those doors is in **the runtime's own namespace**, and this check
 * refuses an import of it anywhere under `src`, at any of its spellings, and has
 * since before the first source file existed. So the package a platform installs
 * cannot reach a virtual machine, a worker or a child process at all. Not
 * because a pattern did not match: because the module is not in the graph.
 *
 * Two rules together make that whole, and both are below:
 *
 * 1. **No module from the runtime's namespace**, prefixed or bare. The bare
 *    spelling is refused twice over, since no layer names one as an outside
 *    world it may know, but it is reported here as what it is rather than as an
 *    ordinary package.
 * 2. **No load whose specifier is not written down.** A graph is only readable
 *    if every edge in it can be read, and a specifier decided at run time cannot
 *    be shown to point anywhere in particular. What ships has no dynamic load at
 *    all, so the rule costs nothing and closes the one way round the first.
 *
 * Both are attacked with a corpus before this check reads a file, for the same
 * reason the no-eval check is: a rule nobody has attacked is a rule nobody has
 * tested, and this repository has shipped a check whose pattern could never
 * match anything.
 *
 * What this does not cover, said plainly so the claim is not read wider than it
 * is: an adopter's own process, and any code an adopter puts around the engine.
 * `docs/integrating/running-the-engine.md` says what is theirs to do.
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
import { builtinModules } from 'node:module';
import { filesMatching } from './lib/files.mjs';
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
    dom: false,
    why: 'it knows both the language intelligence and an editor component and still draws nothing: a tooltip takes its markup from the host, so the whole package loads in a worker and on a server',
  },
];

/**
 * Browser globals, matched against masked code rather than against the file.
 *
 * Against the file it reported prose. A record kept for a rolling window has a
 * comment with the word "window" in it, and that failed this check, which is the
 * reverse of the usual damage and just as bad: a rule that reports a sentence
 * gets narrowed, or turned off. The masker exists for exactly this, and the
 * no-locale rules below have used it all along.
 */
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
 * Where a specifier is written down, at every spelling that carries one.
 *
 * The first alternative is a side-effect import, `import "x";`, which has no
 * `from` in it and was matched by nothing here for as long as this check has
 * existed. It runs a module for what loading it does, which is exactly as much
 * reach as a named import, so leaving it out was a hole the width of one line.
 * It comes first so that a bare import is read as one rather than swallowed by
 * the search for the next `from`.
 */
const IMPORT =
  /(?:^|\n)\s*import\s+['"]([^'"]+)['"]|(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

// ---------------------------------------------------------------------------
// Rule one for the artifact: the runtime's namespace is not in the graph
// ---------------------------------------------------------------------------

/**
 * Every module the runtime provides, asked of the runtime rather than listed.
 *
 * A hand-written list would be one more list that only has to be beaten once: it
 * would name the virtual machine, the worker and the child process, and miss
 * whichever module the next release adds a compiler to. The runtime knows its
 * own namespace, so it is asked.
 */
const RUNTIME_MODULES = new Set(builtinModules);

/** The prefixed spelling, which is the same module with a scheme in front. */
const RUNTIME_PREFIX = /^node:/;

/** Whether a specifier names a module from the runtime's own namespace. */
const fromRuntimeNamespace = (spec) =>
  RUNTIME_PREFIX.test(spec) || RUNTIME_MODULES.has(spec.split('/')[0]);

/** Where a load begins, in masked code, whatever its specifier turns out to be. */
const LOAD = /\b(?:import|require)\s*\(/g;

/** A specifier that is written down: a string literal and nothing else. */
const LITERAL = /^_STR_[A-Za-z]*_?$/;

const runtimeDoor = (spec) =>
  `imports "${spec}" from the runtime's own namespace. Nothing under src/ may, and that is ` +
  `what enforces rule one for the package a platform installs: a virtual machine, a worker ` +
  `and a child process are all modules, so a tree that cannot import one cannot build code ` +
  `out of text however the name is spelled. A browser and a worker also have to run the same file`;

const BUILT_SPECIFIER =
  `loads a module whose specifier is not a literal. A graph is only readable if every edge in ` +
  `it can be read, and a specifier decided at run time cannot be shown not to point at the ` +
  `runtime's own namespace. Write the specifier down, or do not load it`;

/**
 * The first argument of a call, from the text between its brackets.
 *
 * String literals are markers by the time this reads them, so only nesting has
 * to be counted.
 */
function firstArgument(argument) {
  let depth = 0;
  for (let i = 0; i < argument.length; i += 1) {
    const c = argument[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth -= 1;
    else if (c === ',' && depth === 0) return argument.slice(0, i);
  }
  return argument;
}

/**
 * The two rules that carry rule one, over one file.
 *
 * Kept in one function so that the corpus below can ask them exactly the
 * question the run asks. Returns one worded line per finding.
 */
function runtimeDoors(file, text) {
  const found = [];

  IMPORT.lastIndex = 0;
  let m;
  while ((m = IMPORT.exec(text)) !== null) {
    const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (spec && fromRuntimeNamespace(spec)) found.push(`${file}: ${runtimeDoor(spec)}.`);
  }

  const { code } = maskCode(text);
  LOAD.lastIndex = 0;
  while ((m = LOAD.exec(code)) !== null) {
    const open = m.index + m[0].length - 1;
    const argument = balanced(code, open);
    if (argument === null) continue;
    if (LITERAL.test(firstArgument(argument).trim())) continue;
    found.push(`${file}:${lineAt(code, m.index)}: ${BUILT_SPECIFIER}.`);
  }

  return found;
}

/**
 * Forms the two rules must refuse, and forms they must leave alone.
 *
 * Run before a file is read, for the reason written at the top of
 * `lib/no-eval-attacks.mjs`: a rule that can no longer match anything looks
 * exactly like a rule that works, and this repository has shipped one. The
 * innocent half is as load bearing as the other, because a rule that refused an
 * ordinary relative import would be turned off inside a week.
 */
const MUST_REFUSE = [
  'import runner from "node:vm";',
  'import "node:vm";',
  'import { Worker } from "node:worker_threads";',
  'export { spawn } from "node:child_process";',
  'const runner = require("vm");',
  'const runner = await import("node:vm");',
  'const mod = await import(specifier);',
  'const mod = await import(base + "/plugin.js");',
  'const mod = require(parts.join(""));',
];

const MUST_ALLOW = [
  'import { parse } from "./parse/index.js";',
  'import type { Bar } from "../host/index.js";',
  'import "./register.js";',
  'import { plot } from "openalgo-charts";',
  'const shape = { vm: 1, fs: 2 };',
  'const mod = await import("./plugin.js");',
];

/** Both halves, before anything is read. Returns how many forms were run. */
function selfTest() {
  const wrong = [];
  for (const form of MUST_REFUSE) {
    if (runtimeDoors('<corpus>', form).length === 0) wrong.push(`not refused: ${form}`);
  }
  for (const form of MUST_ALLOW) {
    if (runtimeDoors('<corpus>', form).length > 0) wrong.push(`refused wrongly: ${form}`);
  }
  if (wrong.length === 0) return MUST_REFUSE.length + MUST_ALLOW.length;
  console.error(
    'The rules that carry rule one for the shipped package no longer do what they say:\n\n' +
      wrong.map((line) => `  ${line}`).join('\n') +
      "\n\nEvery form above really does reach the runtime's own namespace, or really does not.\n" +
      'Fix the rule rather than the corpus: this is the check an adopter is told to trust.',
  );
  process.exit(1);
}

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

// The rules that carry rule one, attacked before a file is read.
const formsRun = selfTest();

const files = sourceFiles();
let hits = 0;
let specifiers = 0;

// A check that inspected nothing reports success, which is the most expensive
// green there is, and this one is quoted at adopters. The same failure is
// written up four times over at the top of lib/files.mjs.
if (files.length === 0) {
  console.error(
    'No source file under src/ matched, so this check inspected nothing. It is what says\n' +
      "the shipped package cannot import a module from the runtime's own namespace, so\n" +
      'refusing to report a guarantee about a tree it never read.',
  );
  process.exit(1);
}

for (const file of files) {
  const layer = layerOf(file);
  if (!layer) {
    hits++;
    console.error(`${file}: sits under src/ but in no declared layer. Add it to a layer in scripts/check-layering.mjs or move it.`);
    continue;
  }

  const text = readFileSync(file, 'utf8');

  for (const line of runtimeDoors(file, text)) {
    hits++;
    console.error(line);
  }

  if (!layer.dom) {
    const { code } = maskCode(text);
    const dom = DOM_GLOBALS.exec(code);
    if (dom) {
      hits++;
      console.error(
        `${file}:${lineAt(code, dom.index)}: ${layer.name} touches "${dom[1]}". ${layer.why}.`,
      );
    }
  }

  IMPORT.lastIndex = 0;
  let m;
  while ((m = IMPORT.exec(text)) !== null) {
    const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (!spec) continue;
    specifiers++;

    // Already reported above, as what it is rather than as an ordinary package.
    if (fromRuntimeNamespace(spec)) continue;

    if (spec.startsWith('.')) {
      const to = targetLayer(file, spec);
      if (to && to.name !== layer.name && !layer.mayImportLayers.includes(to.name)) {
        hits++;
        console.error(`${file}: ${layer.name} imports ${to.name} ("${spec}"), which the layering forbids.`);
      }
      continue;
    }

    if (!layer.outside.some((allowed) => spec === allowed || spec.startsWith(allowed))) {
      hits++;
      console.error(`${file}: ${layer.name} imports the package "${spec}", which it is not allowed to know about. ${layer.why}.`);
    }
  }
}

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
  `Layering check passed: ${files.length} source files under src/ and ${specifiers} import ` +
    `specifiers, every one inside its layer, none from the runtime's own namespace, and no load ` +
    `whose specifier is not written down. ${formsRun} forms were put through those last two ` +
    `rules before a file was read, and ${determinismFiles.length} files of source and tooling ` +
    `read no locale. Those two rules are what enforces rule one for the package a platform ` +
    `installs: it cannot reach a virtual machine, a worker or a child process, because it cannot ` +
    `import one.`,
);
