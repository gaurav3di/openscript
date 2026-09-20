/**
 * Generates the compiler's view of the error catalogue from spec/errors.json.
 *
 * The catalogue is the single source of every code, every message template and
 * every fix. Nothing under src/ may retype one, because a message typed twice is
 * a message that will disagree with the documentation on the day somebody edits
 * one of the copies. So the compiler reads the catalogue through a generated
 * file, and the generated file is not kept in version control: a checked-in
 * copy is the second copy this rule exists to prevent.
 *
 * Two files come out, because they answer two different questions.
 *
 *   catalogue.generated.ts  what each code says: severity, stage, message, fix.
 *   values.generated.ts     what each code must be given: one property per
 *                           placeholder, so a call site that forgets one fails
 *                           to compile rather than rendering an empty slot to a
 *                           trader. This is the whole reason the placeholders
 *                           are generated as types and not as a runtime list.
 *
 * Run: node scripts/generate-error-catalogue.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'spec', 'errors.json');
const OUT_DIR = join(ROOT, 'src', 'core', 'catalogue');

const PLACEHOLDER = /\{([^}]*)\}/g;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/;
const CODE = /^OS\d{4}$/;

const problems = [];
const fail = (message) => problems.push(message);

const catalogue = JSON.parse(readFileSync(SOURCE, 'utf8'));

if (catalogue.catalogue !== 'openscript-errors') {
  fail(`${SOURCE} does not identify itself as the OpenScript error catalogue.`);
}
if (catalogue.placeholderSyntax !== '{name}') {
  fail(`The catalogue declares placeholder syntax "${catalogue.placeholderSyntax}"; this generator writes {name}.`);
}

const severities = Object.keys(catalogue.severities ?? {});
const stages = Object.keys(catalogue.stages ?? {});

/** Every placeholder a template uses, in order, with duplicates removed. */
function slotsIn(template) {
  const names = [];
  for (const match of String(template ?? '').matchAll(PLACEHOLDER)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

const seen = new Set();

for (const entry of catalogue.entries ?? []) {
  const where = `entry ${entry.code}`;

  if (!CODE.test(entry.code ?? '')) fail(`${where}: a code is OSNxxx.`);
  if (seen.has(entry.code)) fail(`${where}: the code appears twice.`);
  seen.add(entry.code);

  if (!severities.includes(entry.severity)) {
    fail(`${where}: severity "${entry.severity}" is not one the catalogue declares.`);
  }
  if (!stages.includes(entry.stage)) {
    fail(`${where}: stage "${entry.stage}" is not one the catalogue declares.`);
  }

  const declared = Object.keys(entry.placeholders ?? {});
  for (const name of declared) {
    if (!IDENTIFIER.test(name)) {
      fail(`${where}: placeholder "${name}" is not a name a generated property can carry.`);
    }
  }

  const used = [...slotsIn(entry.message), ...slotsIn(entry.fix)];
  for (const name of used) {
    if (!declared.includes(name)) fail(`${where}: the templates use {${name}} and the entry does not declare it.`);
  }
  for (const name of declared) {
    if (!used.includes(name)) fail(`${where}: {${name}} is declared and never used, so nothing would fill it.`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(
    `\n${problems.length} problem${problems.length === 1 ? '' : 's'} in ${SOURCE}. ` +
      `The compiler is generated from this file, so it cannot be generated until they are fixed.`,
  );
  process.exit(1);
}

// By code point, never by locale. This sort decides the order of the generated
// source, so a machine with different collation rules would produce a different
// file from the same catalogue, and the two builds would not be the same build.
const entries = [...catalogue.entries].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
const banner = (what) =>
  `// Generated from spec/errors.json by scripts/generate-error-catalogue.mjs.\n` +
  `// ${what}\n` +
  `// Edit the catalogue, not this file. It is not kept in version control, because\n` +
  `// a checked-in copy is a second source of truth waiting to drift.\n`;

const text = (value) => JSON.stringify(value);

const entryLines = entries.map((entry) => {
  const placeholders = Object.keys(entry.placeholders ?? {})
    .map(text)
    .join(', ');
  return (
    `  ${entry.code}: { code: ${text(entry.code)}, title: ${text(entry.title)}, ` +
    `severity: ${text(entry.severity)}, stage: ${text(entry.stage)}, since: ${entry.since}, ` +
    `autofix: ${entry.autofix === true}, message: ${text(entry.message)}, fix: ${text(entry.fix)}, ` +
    `placeholders: [${placeholders}] },`
  );
});

const stageLabelLines = Object.entries(catalogue.stageLabels ?? {}).map(
  ([stage, label]) => `  ${stage}: ${text(label)},`,
);

const catalogueFile = [
  banner('What each code says: its severity, its stage, its message and its fix.'),
  ``,
  `import type { CatalogueEntry, Stage } from './types.js';`,
  ``,
  `/** The shape of spec/errors.json that this file was generated from. */`,
  `export const CATALOGUE_SCHEMA_VERSION = ${catalogue.schemaVersion};`,
  ``,
  `/** The language version the catalogue describes. */`,
  `export const CATALOGUE_LANGUAGE_VERSION = ${catalogue.languageVersion};`,
  ``,
  `/** The word each stage is printed as, so a reader is told which part of the compiler spoke. */`,
  `export const STAGE_LABELS = {`,
  ...stageLabelLines,
  `} as const satisfies Readonly<Record<Stage, string>>;`,
  ``,
  `export const ENTRIES = {`,
  ...entryLines,
  `} as const satisfies Readonly<Record<string, CatalogueEntry>>;`,
  ``,
  `/** Every code the compiler and the engines may emit. Nothing else is one. */`,
  `export type DiagnosticCode = keyof typeof ENTRIES;`,
  ``,
].join('\n');

const valueLines = entries.map((entry) => {
  const names = Object.keys(entry.placeholders ?? {});
  if (names.length === 0) return `  readonly ${entry.code}: Record<string, never>;`;
  const properties = names.map((name) => `readonly ${name}: PlaceholderValue`).join('; ');
  return `  readonly ${entry.code}: { ${properties} };`;
});

const valuesFile = [
  banner('What each code must be given: one property per placeholder it declares.'),
  ``,
  `import type { PlaceholderValue } from './types.js';`,
  ``,
  `/**`,
  ` * The values that fill each code's message and fix.`,
  ` *`,
  ` * A code with no placeholders takes an empty object rather than nothing, so`,
  ` * that adding a placeholder to the catalogue later breaks every call site`,
  ` * that has to supply it instead of quietly rendering a gap.`,
  ` */`,
  `export interface DiagnosticValues {`,
  ...valueLines,
  `}`,
  ``,
].join('\n');

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'catalogue.generated.ts'), catalogueFile, 'utf8');
writeFileSync(join(OUT_DIR, 'values.generated.ts'), valuesFile, 'utf8');

console.log(
  `Error catalogue generated: ${entries.length} codes from spec/errors.json, ` +
    `every placeholder declared and used.`,
);
