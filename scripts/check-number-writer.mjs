/**
 * Number writer check: a number becomes text in one place.
 *
 * Two engines compare numbers as bits (`conformance.md` section 6) and they
 * compare text everywhere else: an expected column, a case file, a table cell,
 * `text(x)`. So how a number becomes text is one rule, `language.md` 5.5, and
 * in this repository it is one function, `canonicalNumber` in the module named
 * below. Until this check existed the rule was `String(value)` in several
 * places, one of them stripping the `+` a host writes on an exponent and the
 * others not, and a case written by one and compared by another would have
 * disagreed about `1e21` without any number being wrong.
 *
 * ## What is refused
 *
 * A conversion of a number to text anywhere under `src` outside the writer:
 *
 *   - `String(n)`, and `String` handed to a caller as a function;
 *   - `n.toString()`, `n.toFixed()`, `n.toPrecision()`, `n.toExponential()`
 *     and `n.toLocaleString()`, whatever the radix or the digits asked for;
 *   - `${n}` in a template;
 *   - `s + n`, `n + s` and `s += n`, which convert without naming it;
 *   - `JSON.stringify(v)` where a number is anywhere inside `v`, and
 *     `xs.join()` where `xs` holds numbers, which convert every element.
 *
 * "A number" is what the type checker says: an expression whose type is
 * `number`, a numeric literal type, or a union holding one. A text scan cannot
 * tell `${count}` from `${name}`, which is why this check asks the compiler
 * for the type of every operand rather than reading the source as text. That
 * is also what it does not reach, said plainly: an operand typed `any` or
 * `unknown` is counted and printed as undecided rather than refused, because
 * a rule that refused every `String(thrown)` in an error handler would be
 * turned off within a week, and a value that reaches text through a callback
 * this check cannot see the type of, such as a function that receives its
 * number through a parameter typed `unknown`, is not seen.
 *
 * ## The exceptions are a list that only shrinks
 *
 * `spec/number-text-exceptions.json` records the files that still convert a
 * number outside the writer, each with the count found when it was recorded
 * and the reason: a diagnostic that prints a value for a human, a colour byte
 * written in hex, a file another stage is about to switch. The count is exact,
 * not a ceiling. A file with more conversions than recorded fails the build,
 * and so does one with fewer, because a row left at the old count is room for
 * the conversion to come back unnoticed. A file that no longer converts at all
 * has its row deleted, not left as cover.
 *
 * ## The check is attacked before it is trusted
 *
 * Every form above is handed to the rules as a fabricated source file that
 * must be refused, beside an innocent form that must pass and one the rules
 * must call undecided, before a file of the tree is read. A rule edited into
 * uselessness stops the build here rather than reporting a clean tree.
 *
 * Run: node scripts/check-number-writer.mjs [--list]
 * Exit code 1 on any hit, or when no source file was read.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

import ts from 'typescript';

import { filesMatching, nothingFound } from './lib/files.mjs';

/** The one module allowed to ask the host how a number is spelled. */
const WRITER = 'src/core/emit/canonical.ts';
const ALLOW_PATH = 'spec/number-text-exceptions.json';
const CONFIG = 'tsconfig.json';
const SOURCE = ['src'];

/** The methods of a number that produce text. */
const METHODS = new Set(['toString', 'toFixed', 'toPrecision', 'toExponential', 'toLocaleString']);

/** How deep an object handed to `JSON.stringify` is looked into before giving up. */
const DEPTH = 8;

function refuse(message) {
  console.error(message);
  process.exit(1);
}

function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

// ------------------------------------------------------------------ the rules

/** Whether a type is, or holds at its top level, a number. */
function numberAtTop(type) {
  if (type.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) return 'number';
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return 'undecided';
  if (type.isUnion() || type.isIntersection()) {
    let verdict = 'other';
    for (const member of type.types) {
      const found = numberAtTop(member);
      if (found === 'number') return 'number';
      if (found === 'undecided') verdict = 'undecided';
    }
    return verdict;
  }
  return 'other';
}

function stringAtTop(type) {
  if (type.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral | ts.TypeFlags.TemplateLiteral)) {
    return true;
  }
  if (type.isUnion()) return type.types.some(stringAtTop);
  return false;
}

/** Whether a number is anywhere inside a value of this type: an element, a property. */
function numberWithin(type, checker, node, depth, seen) {
  const top = numberAtTop(type);
  if (top !== 'other') return top;
  if (depth > DEPTH) return 'undecided';
  if (seen.has(type)) return 'other';
  seen.add(type);
  if (type.isUnion() || type.isIntersection()) {
    let verdict = 'other';
    for (const member of type.types) {
      const found = numberWithin(member, checker, node, depth + 1, seen);
      if (found === 'number') return 'number';
      if (found === 'undecided') verdict = 'undecided';
    }
    return verdict;
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    let verdict = 'other';
    for (const element of checker.getTypeArguments(type)) {
      const found = numberWithin(element, checker, node, depth + 1, seen);
      if (found === 'number') return 'number';
      if (found === 'undecided') verdict = 'undecided';
    }
    return verdict;
  }
  if (type.flags & ts.TypeFlags.Object) {
    let verdict = 'other';
    for (const property of type.getProperties()) {
      const held = checker.getTypeOfSymbolAtLocation(property, node);
      const found = numberWithin(held, checker, node, depth + 1, seen);
      if (found === 'number') return 'number';
      if (found === 'undecided') verdict = 'undecided';
    }
    return verdict;
  }
  return 'other';
}

function isJsonStringify(callee) {
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'JSON' &&
    callee.name.text === 'stringify'
  );
}

/** `String` written as a value rather than called or reached into. */
function isStringPassedAlong(node) {
  if (!ts.isIdentifier(node) || node.text !== 'String') return false;
  const parent = node.parent;
  if (parent === undefined) return false;
  if (ts.isCallExpression(parent) && parent.expression === node) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.expression === node) return false;
  if (ts.isTypeReferenceNode(parent) || ts.isTypeQueryNode(parent)) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  return true;
}

/**
 * Every conversion in one source file, and every operand the rules could not
 * decide. Each is the line, the form, and the text of the expression.
 */
export function findingsIn(sourceFile, checker) {
  const found = [];
  const undecided = [];

  const at = (node, form, verdict) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const entry = { line: line + 1, form, text: node.getText(sourceFile).replace(/\s+/g, ' ') };
    if (verdict === 'number') found.push(entry);
    else if (verdict === 'undecided') undecided.push(entry);
  };
  const shallow = (node, form) => at(node, form, numberAtTop(checker.getTypeAtLocation(node)));
  const deep = (node, form) =>
    at(node, form, numberWithin(checker.getTypeAtLocation(node), checker, node, 0, new Set()));

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const first = node.arguments[0];
      if (ts.isIdentifier(callee) && callee.text === 'String' && first !== undefined) {
        shallow(first, 'String()');
      } else if (isJsonStringify(callee) && first !== undefined) {
        deep(first, 'JSON.stringify()');
      } else if (ts.isPropertyAccessExpression(callee) && METHODS.has(callee.name.text)) {
        shallow(callee.expression, `.${callee.name.text}()`);
      } else if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'join') {
        const receiver = checker.getTypeAtLocation(callee.expression);
        if (checker.isArrayType(receiver) || checker.isTupleType(receiver)) {
          deep(callee.expression, '.join()');
        }
      }
    } else if (ts.isTemplateSpan(node)) {
      shallow(node.expression, 'template');
    } else if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.PlusToken ||
        node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken)
    ) {
      const left = checker.getTypeAtLocation(node.left);
      const right = checker.getTypeAtLocation(node.right);
      if (stringAtTop(left)) at(node.right, 'concatenation', numberAtTop(right));
      else if (stringAtTop(right)) at(node.left, 'concatenation', numberAtTop(left));
    } else if (isStringPassedAlong(node)) {
      at(node, 'String as a function', 'number');
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { found, undecided };
}

// --------------------------------------------------------------- the program

function compilerOptions() {
  const read = ts.readConfigFile(CONFIG, ts.sys.readFile);
  if (read.error !== undefined || read.config === undefined) {
    refuse(`${CONFIG} could not be read, and it is what decides how src is typed. Run this from the repository root.`);
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(resolve(CONFIG)));
  return { ...parsed.options, noEmit: true, rootDir: undefined };
}

/** A program over files that exist only in memory, for the self test. */
function programOver(files, options) {
  const host = ts.createCompilerHost(options, true);
  const fromDisk = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, onError, create) =>
    files.has(name)
      ? ts.createSourceFile(name, files.get(name), language, true)
      : fromDisk(name, language, onError, create);
  host.fileExists = (name) => files.has(name) || ts.sys.fileExists(name);
  host.readFile = (name) => files.get(name) ?? ts.sys.readFile(name);
  return ts.createProgram({ rootNames: [...files.keys()], options, host });
}

function slashed(path) {
  return path.split('\\').join('/');
}

// --------------------------------------------------------------- the self test

/**
 * Each form the rules refuse, one that they accept, and one they must call
 * undecided, as fabricated files. Fabricated rather than taken from the tree,
 * so that fixing the tree cannot disarm a rule.
 */
const REFUSED = [
  'export const a = (n: number): string => String(n);',
  'export const b = (n: number): string => n.toString();',
  'export const c = (n: number): string => n.toString(16);',
  'export const d = (n: number): string => n.toFixed(2);',
  'export const e = (n: number): string => n.toPrecision(3);',
  'export const f = (n: number): string => n.toExponential();',
  'export const g = (n: number): string => `at ${n}`;',
  'export const h = (n: number): string => "at " + n;',
  'export const i = (n: number): string => n + " units";',
  'export const j = (n: number, s: string): string => { let out = s; out += n; return out; };',
  'export const k = (v: number | boolean): string => String(v);',
  'export const l = (v: number | null): string => `${v}`;',
  'export const m = (xs: number[]): string => xs.join(",");',
  'export const n = (xs: number[]): string[] => xs.map(String);',
  'export const o = (v: { id: number; name: string }): string => JSON.stringify(v);',
  'export const p = (v: { rows: { price: number }[] }): string => JSON.stringify(v);',
  'export const q = (v: 3): string => String(v);',
];

const ACCEPTED = [
  'export const a = (s: string): string => String(s);',
  'export const b = (b: boolean): string => String(b);',
  'export const c = (n: number): number => n + 1;',
  'export const d = (a: string, b: string): string => a + b;',
  'export const e = (s: string): string => `at ${s}`;',
  'export const f = (xs: string[]): string => xs.join(",");',
  'export const g = (v: { name: string; on: boolean }): string => JSON.stringify(v);',
  'export const h = (): string => String.fromCharCode(65);',
  'export const i = (d: { toString(): string }): string => d.toString();',
  'export const j = (n: number): string => n > 1 ? "many" : "one";',
];

const UNDECIDED = [
  'export const a = (v: unknown): string => String(v);',
  'export const b = (v: unknown): string => `${v}`;',
];

function selfTest(options) {
  const files = new Map();
  REFUSED.forEach((text, i) => files.set(`/probe/refused-${i}.ts`, text));
  ACCEPTED.forEach((text, i) => files.set(`/probe/accepted-${i}.ts`, text));
  UNDECIDED.forEach((text, i) => files.set(`/probe/undecided-${i}.ts`, text));
  const program = programOver(files, options);
  const checker = program.getTypeChecker();
  const broken = [];
  for (const [name, text] of files) {
    const source = program.getSourceFile(name);
    if (source === undefined) {
      broken.push(`${name} was not read by the probe program`);
      continue;
    }
    const { found, undecided } = findingsIn(source, checker);
    const want = name.includes('refused') ? 'refused' : name.includes('accepted') ? 'accepted' : 'undecided';
    const got = found.length > 0 ? 'refused' : undecided.length > 0 ? 'undecided' : 'accepted';
    if (got !== want) broken.push(`${text}  (${got}, ${want} expected)`);
  }
  if (broken.length === 0) return;
  refuse(
    'The number writer rules no longer do what they say:\n\n' +
      broken.map((line) => `  ${line}`).join('\n') +
      '\n\nA rule that can no longer refuse its own corpus reports a clean tree over anything.',
  );
}

// ------------------------------------------------------------------- the run

const options = compilerOptions();
selfTest(options);

const files = filesMatching(/\.ts$/, SOURCE).filter((one) => !one.endsWith('.d.ts'));
if (files.length === 0) refuse(nothingFound(`source file under ${SOURCE.join(', ')}/`));

const program = ts.createProgram({ rootNames: files, options });
const checker = program.getTypeChecker();

const allowed = existsSync(ALLOW_PATH) ? JSON.parse(readFileSync(ALLOW_PATH, 'utf8')) : { sites: [] };
const recorded = new Map((allowed.sites ?? []).map((row) => [row.file, row]));

const problems = [];
const perFile = new Map();
const undecidedSites = [];
let read = 0;
let inWriter = 0;
let excepted = 0;

for (const source of program.getSourceFiles()) {
  const path = slashed(relative(process.cwd(), source.fileName));
  if (source.isDeclarationFile || !files.includes(path)) continue;
  read += 1;
  const { found, undecided } = findingsIn(source, checker);
  for (const one of undecided) undecidedSites.push({ path, ...one });
  if (found.length === 0) continue;
  perFile.set(path, found);
  if (path === WRITER) {
    inWriter += found.length;
    continue;
  }
  const row = recorded.get(path);
  if (row === undefined) {
    problems.push(
      `${path}: ${plural(found.length, 'number-to-text conversion')} outside the writer:\n` +
        found.map((one) => `    ${path}:${one.line}: ${one.form}  ${one.text}`).join('\n') +
        `\n  Route the number through canonicalNumber from ${WRITER}, or record the file in ` +
        `${ALLOW_PATH} with the reason it formats for a human rather than for a case.`,
    );
    continue;
  }
  excepted += found.length;
  if (row.count !== found.length) {
    problems.push(
      `${path}: ${found.length} conversions found and ${ALLOW_PATH} records ${row.count}. The count ` +
        'is exact so that a conversion cannot come back into the room an old count leaves: record ' +
        'the number found, or route the new one through the writer.',
    );
  }
}

for (const [path, row] of recorded) {
  if (perFile.has(path)) continue;
  problems.push(
    `${ALLOW_PATH}: ${path} is recorded with ${row.count} and converts nothing outside the writer ` +
      'now. The list only shrinks: delete the row.',
  );
}

if (files.length !== read) {
  problems.push(
    `${read} of ${files.length} source files were read by the program. A file the compiler did ` +
      'not load is a file no rule saw.',
  );
}

if (process.argv.includes('--list')) {
  for (const [path, found] of perFile) {
    for (const one of found) console.log(`${path}:${one.line}: ${one.form}  ${one.text}`);
  }
  for (const one of undecidedSites) {
    console.log(`${one.path}:${one.line}: undecided ${one.form}  ${one.text}`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(
    `\n${plural(problems.length, 'number writer problem')}. A number written by two rules is a ` +
      'case one engine writes and another fails, with no number wrong anywhere.',
  );
  process.exit(1);
}

console.log(
  `Number writer check passed: ${read} source files read under ${SOURCE.join(', ')}/, ` +
    `${inWriter} conversions inside ${WRITER} and ${excepted} in the ${recorded.size} files ` +
    `${ALLOW_PATH} records, none anywhere else. ${plural(undecidedSites.length, 'operand')} typed ` +
    'any or unknown could not be decided and were not refused; --list prints them. Not reached: ' +
    'a number that becomes text through a parameter this check sees only as unknown.',
);
