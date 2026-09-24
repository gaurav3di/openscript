/**
 * What the importer's tests share: a way to write a source script, a way to
 * read back what a finding points at, and the compiler the output is held to.
 *
 * A finding is asserted by its code and by the characters of the imported text
 * it covers, at a line and a column, never by its message, which is allowed to
 * improve (CLAUDE.md, "Tests"). The compile is the whole front end and the
 * emitter, the same pipeline `tests/emit/support.ts` runs, because "the output
 * compiles" means a host could be handed the program it produces.
 */
import assert from 'node:assert/strict';

import { DiagnosticBag, check, importScript, isError, lex, parseTokens, sourceFile } from '../../src/core/index.js';
import type { Diagnostic, ImportResult } from '../../src/core/index.js';
import { emit } from '../../src/core/emit/index.js';

const ROOT = new URL('../../../', import.meta.url);

/** The scripts in the source dialect, each with its expected output and findings. */
export const CORPUS = new URL('tests/importer/corpus/', ROOT);

/** A script in the source dialect, version 5, from its lines. */
export function v5(...lines: readonly string[]): string {
  return ['//@version=5', ...lines, ''].join('\n');
}

/** The same at version 6. */
export function v6(...lines: readonly string[]): string {
  return ['//@version=6', ...lines, ''].join('\n');
}

/** Every diagnostic the full compiler raises on a text, errors and warnings. */
export function compiled(text: string): readonly Diagnostic[] {
  const file = sourceFile('output.oscript', text);
  const bag = new DiagnosticBag();
  const tokens = lex(file, bag);
  const script = parseTokens(file, tokens, bag);
  const checked = check(file, script, bag);
  if (!bag.hasErrors) emit(file, checked, bag, {});
  return bag.ordered();
}

/** The errors alone, which a translation must never carry. */
export function compileErrors(text: string): readonly Diagnostic[] {
  return compiled(text).filter(isError);
}

/** Imports a script and insists that what comes back compiles, as the importer promises. */
export function imported(text: string): ImportResult {
  const result = importScript(text);
  if (result.source !== '') {
    const errors = compileErrors(result.source).map((one) => `${one.code} at ${one.span.line}:${one.span.column}`);
    assert.deepEqual(errors, [], `the importer returned output that does not compile:\n${result.source}`);
  }
  return result;
}

/** One finding, as a test states it: code, the text it covers, line and column. */
export interface Point {
  readonly code: string;
  readonly covers: string;
  readonly line: number;
  readonly column: number;
}

export function pointOf(text: string, finding: Diagnostic): Point {
  const covers = sourceFile('input', text).text.slice(finding.span.offset, finding.span.offset + finding.span.length);
  return { code: finding.code, covers, line: finding.span.line, column: finding.span.column };
}

/** Every finding of one code, as points. */
export function pointsOf(text: string, result: ImportResult, code: string): readonly Point[] {
  return result.findings.filter((one) => one.code === code).map((one) => pointOf(text, one));
}

/** Every code the import raised, in the order a reader meets them. */
export function codesOf(result: ImportResult): readonly string[] {
  return result.findings.map((one) => one.code);
}

/** The output's lines, without the version line and the blank after it. */
export function bodyOf(result: ImportResult): readonly string[] {
  return result.source.split('\n').filter((line) => line !== '' && line !== 'version 1');
}
