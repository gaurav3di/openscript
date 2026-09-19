import { DiagnosticBag, check, parse, sourceFile } from '../../src/core/index.js';
import type { CheckedScript, Diagnostic, PlaceholderValue } from '../../src/core/index.js';

export interface Checked {
  readonly script: CheckedScript;
  /** Only what the checker said. A parse diagnostic would be about the test. */
  readonly diagnostics: readonly Diagnostic[];
  readonly parseDiagnostics: readonly Diagnostic[];
}

/**
 * Checks a file, keeping the parser's diagnostics apart from the checker's.
 *
 * A test about the checker that silently passed because the parser rejected the
 * snippet first would be a test of nothing, so the two lists are separate and
 * `parseCodes` is asserted empty wherever a snippet is meant to parse.
 */
export function checkRaw(text: string): Checked {
  const bag = new DiagnosticBag();
  const file = sourceFile('test.oscript', text);
  const tree = parse(file, bag);
  const parseDiagnostics = [...bag.all];
  const script = check(file, tree, bag);
  const all = bag.ordered();
  const parsed = new Set(parseDiagnostics);
  return {
    script,
    parseDiagnostics,
    diagnostics: all.filter((one) => !parsed.has(one)),
  };
}

/**
 * The same, with the two header lines every file needs.
 *
 * Without them every snippet would carry OS2007 and OS8003 and every assertion
 * would have to filter them out, which is a filter one test would eventually
 * get wrong.
 */
export function checkBody(body: string): Checked {
  return checkRaw(`version 1\nstudy("T")\n${body}\n`);
}

/** The same again, for a file that places orders. */
export function checkStrategy(body: string): Checked {
  return checkRaw(`version 1\nstrategy("T")\n${body}\n`);
}

export function codes(body: string): readonly string[] {
  return checkBody(body).diagnostics.map((one) => one.code);
}

export function rawCodes(text: string): readonly string[] {
  return checkRaw(text).diagnostics.map((one) => one.code);
}

export function strategyCodes(body: string): readonly string[] {
  return checkStrategy(body).diagnostics.map((one) => one.code);
}

/** Each diagnostic as `line:column+length`, which is what a caret is drawn from. */
export function spans(body: string): readonly string[] {
  return checkBody(body).diagnostics.map(
    (one) => `${one.span.line}:${one.span.column}+${one.span.length}`,
  );
}

/** The values a diagnostic filled its slots from, never the sentence they made. */
export function values(body: string): readonly Readonly<Record<string, PlaceholderValue>>[] {
  return checkBody(body).diagnostics.map((one) => one.values);
}

/**
 * The slot values of the one diagnostic with this code.
 *
 * Asserting `values(body)[0]` breaks the moment an unrelated warning sorts
 * above the diagnostic the test is about, and worse, it can pass against the
 * wrong diagnostic when the two happen to carry the same slots.
 */
export function valuesFor(
  body: string,
  code: string,
): Readonly<Record<string, PlaceholderValue>> | undefined {
  return checkBody(body).diagnostics.find((one) => one.code === code)?.values;
}

/** The span of the one diagnostic with this code, as `line:column+length`. */
export function spanFor(body: string, code: string): string | undefined {
  const found = checkBody(body).diagnostics.find((one) => one.code === code);
  return found === undefined ? undefined : `${found.span.line}:${found.span.column}+${found.span.length}`;
}

export function parseCodes(body: string): readonly string[] {
  return checkBody(body).parseDiagnostics.map((one) => one.code);
}

/** The type of the name, as the checker settled it. */
export function typeOfName(body: string, name: string): string | undefined {
  const { script } = checkBody(body);
  const binding = [...script.bindings].reverse().find((one) => one.name === name);
  return binding === undefined ? undefined : typeName(binding.type);
}

/** The first bar the name can produce a value for, as `at 19` or `at least 19`. */
export function warmupOfName(body: string, name: string): string | undefined {
  const { script } = checkBody(body);
  const binding = [...script.bindings].reverse().find((one) => one.name === name);
  if (binding === undefined) return undefined;
  const warmup = binding.warmup;
  if (warmup.kind === 'never') return 'never';
  return warmup.kind === 'at' ? `at ${warmup.bar}` : `at least ${warmup.bar}`;
}

export function storageOfName(body: string, name: string): string | undefined {
  const { script } = checkBody(body);
  return [...script.bindings].reverse().find((one) => one.name === name)?.storage;
}

function typeName(type: { readonly kind: string }): string {
  const shaped = type as {
    readonly kind: string;
    readonly element?: { readonly kind: string };
    readonly handle?: string;
    readonly object?: string;
  };
  if (shaped.kind === 'series' && shaped.element !== undefined) {
    return `series ${typeName(shaped.element)}`;
  }
  if (shaped.kind === 'array' && shaped.element !== undefined) {
    return `array<${typeName(shaped.element)}>`;
  }
  if (shaped.kind === 'handle') return shaped.handle ?? 'handle';
  if (shaped.kind === 'object') return shaped.object ?? 'object';
  return shaped.kind;
}
