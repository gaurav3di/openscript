import { readFileSync, readdirSync } from 'node:fs';

import {
  DiagnosticBag,
  isDiagnosticCode,
  lex,
  parseTokens,
  renderDiagnostics,
  sourceFile,
} from '../../src/core/index.js';
import type {
  Diagnostic,
  DiagnosticCode,
  Script,
  SourceFile,
  Token,
} from '../../src/core/index.js';

/**
 * Where the scripts these tests read live, named from the repository root.
 *
 * A test runs from the compiled tree and a script is not compiled into it, so
 * the distance between the two is worked out once here. Everything else names a
 * directory the way a reader would.
 */
const ROOT = new URL('../../../', import.meta.url);

/** The twelve target scripts. The phase gate is that every one of them parses. */
export const TARGETS = new URL('examples/', ROOT);

/** The scripts that must be refused, one per syntax code the front end raises. */
export const REJECTED = new URL('tests/examples/rejected/', ROOT);

/** The catalogue, read as the document rather than as the generated module. */
export const CATALOGUE_FILE = new URL('spec/errors.json', ROOT);

export interface Compiled {
  readonly file: SourceFile;
  readonly tokens: readonly Token[];
  readonly script: Script;
  /** Everything both stages had to say, in the order a reader walks the file. */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Reads a script the way a compile does: lex, then parse the tokens, collecting
 * diagnostics rather than stopping at the first.
 *
 * The two stages are called separately rather than through parse() so that a
 * failure names the stage that spoke, and so that a file which never reached the
 * parser is distinguishable from one the parser refused.
 */
export function compile(name: string, text: string): Compiled {
  const file = sourceFile(name, text);
  const bag = new DiagnosticBag();
  const tokens = lex(file, bag);
  const script = parseTokens(file, tokens, bag);
  return { file, tokens, script, diagnostics: bag.ordered() };
}

export function scriptsIn(directory: URL): readonly string[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.oscript'))
    .sort();
}

export function read(directory: URL, name: string): string {
  return readFileSync(new URL(name, directory), 'utf8');
}

/**
 * What a failing test prints: every diagnostic under the line it is about, with
 * its caret, exactly as a trader would see it.
 *
 * A gate that failed with nothing but a count would send whoever reads the
 * output back to the compiler to find out what happened, which is the work the
 * gate was supposed to have done.
 */
export function report(compiled: Compiled): string {
  return compiled.diagnostics.length === 0
    ? `${compiled.file.name}: nothing reported.`
    : `\n${renderDiagnostics(compiled.file, compiled.diagnostics)}\n`;
}

/**
 * One diagnostic a rejection case claims: a code and the span it covers.
 *
 * The claim lives in the script it is about, on a line above the mistake, so
 * that a case is one file a contributor can read and add to rather than a file
 * and a row in a table somewhere else that drifts away from it.
 */
export interface Expectation {
  readonly code: DiagnosticCode;
  readonly line: number;
  readonly column: number;
  readonly length: number;
}

/** `// expect OS1016 at 11:3, length 4`, which is line 11, column 3, 4 characters. */
const EXPECTATION = /^\/\/\s*expect\s+(OS\d{4})\s+at\s+(\d+):(\d+),\s*length\s+(\d+)\s*$/;

/** Anything that looks like a claim, so a misspelled one is a failure, not a comment. */
const CLAIM = /^\/\/\s*expect\b/;

export function expectationsIn(name: string, text: string): readonly Expectation[] {
  const found: Expectation[] = [];

  for (const [index, line] of text.split('\n').entries()) {
    if (!CLAIM.test(line)) continue;

    const claim = EXPECTATION.exec(line);
    if (claim === null) {
      throw new Error(
        `${name}:${index + 1}: this line states an expectation the harness cannot read. ` +
          `Write it as: // expect OS1016 at 11:3, length 4`,
      );
    }

    const [, code, atLine, column, length] = claim;
    if (code === undefined || atLine === undefined || column === undefined || length === undefined) {
      throw new Error(`${name}:${index + 1}: incomplete expectation.`);
    }
    if (!isDiagnosticCode(code)) {
      throw new Error(
        `${name}:${index + 1}: ${code} is not in the error catalogue. ` +
          `Expect a code the catalogue defines, or add the code to spec/errors.json first.`,
      );
    }

    found.push({
      code,
      line: Number(atLine),
      column: Number(column),
      length: Number(length),
    });
  }

  return found;
}

/**
 * One diagnostic as one line of text.
 *
 * Both sides of the assertion are put through this, so a mismatch is reported as
 * two readable lists rather than as two object graphs.
 */
export function asLine(one: Diagnostic | Expectation): string {
  const span = 'span' in one ? one.span : one;
  return `${one.code} at ${span.line}:${span.column}, length ${span.length}`;
}
