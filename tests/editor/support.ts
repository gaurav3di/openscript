/**
 * What the editor tier's tests run over, and what "the same program" means.
 *
 * The corpus is every script the repository holds as a script: the twelve target
 * scripts of Phase 0, the six the Phase 2 gate computes against transcribed
 * reference values, and the hundred and one independently written studies the
 * Phase 3 gate reproduces. They are read from the source tree rather than copied
 * here, so a script added to a gate is in this corpus the day it is added, and
 * the tests below are about the language as it is actually written rather than
 * about fragments written to pass them.
 */
import { readFileSync, readdirSync } from 'node:fs';

import { DiagnosticBag, canonicalise, check, emit, lex, parseTokens, sourceFile } from '../../src/core/index.js';
import type { CompiledProgram, Diagnostic } from '../../src/core/index.js';

const ROOT = new URL('../../../', import.meta.url);

const DIRECTORIES = ['examples/', 'tests/gate/scripts/', 'tests/gate/studies/scripts/'];

export interface Script {
  readonly name: string;
  readonly text: string;
}

function scriptsIn(directory: string): readonly Script[] {
  const where = new URL(directory, ROOT);
  return readdirSync(where)
    .filter((name) => name.endsWith('.oscript'))
    .sort()
    .map((name) => ({ name, text: readFileSync(new URL(name, where), 'utf8') }));
}

/** Every script in the repository, in a stable order. */
export const CORPUS: readonly Script[] = DIRECTORIES.flatMap(scriptsIn);

export interface Compiled {
  readonly program: CompiledProgram | undefined;
  readonly diagnostics: readonly Diagnostic[];
}

/** The whole front end, the way a host compiles a file it is about to run. */
export function compile(script: Script): Compiled {
  const file = sourceFile(script.name, script.text);
  const bag = new DiagnosticBag();
  const tokens = lex(file, bag);
  const parsed = parseTokens(file, tokens, bag);
  const checked = check(file, parsed, bag);
  return { program: emit(file, checked, bag, {}).program, diagnostics: bag.ordered() };
}

/**
 * Two fields of a compiled program are facts about the text rather than about
 * the program, and both of them are expected to move when a file is laid out
 * again.
 *
 * `source` is the hash of the text and its line count. `pos` and `fnPos`, at the
 * top level and inside every request body, are the line and column each
 * instruction came from, which is what a runtime diagnostic points a caret with.
 * A formatter that re-indents a block moves every one of them and has changed
 * nothing about what the program computes.
 *
 * Everything else is compared: the instructions, the constant pool, the
 * registers, the frame, the cells, the state regions, the functions, the call
 * sites, the loops, the declared outputs, the inputs, the channels, the library
 * manifest, the limits, the requests and their identities, and the debug names.
 * If any of those moved, the formatter changed the program.
 */
export function meaningOf(program: CompiledProgram): string {
  return canonicalise(withoutPositions(program as unknown));
}

const DROPPED: ReadonlySet<string> = new Set(['source', 'pos', 'fnPos']);

function withoutPositions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPositions);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, held] of Object.entries(value as Record<string, unknown>)) {
    if (DROPPED.has(key)) continue;
    out[key] = withoutPositions(held);
  }
  return out;
}

/**
 * Text that is not a program, for the functions that have to answer anyway.
 *
 * A file being typed into is malformed most of the time, so this is the state
 * the editor tier is in more often than not: a half written call, a quotation
 * mark with no partner, a character the language does not have, a block comment
 * somebody brought from another language, and text that is not source at all.
 * Every one of these is something a person has actually typed into an editor.
 */
export const MALFORMED: readonly string[] = [
  '',
  '   ',
  '\n\n\n',
  '\t\n',
  'version 1\n',
  '// a comment and nothing else\n',
  'study(',
  'x = ',
  'x = ema(close,\n',
  'if\n',
  'if close > open\n',
  'x = "unterminated\n',
  "y = 'also unterminated\n",
  'a /* block comment */ b\n',
  'x = 1;y = 2\n',
  'x = 1_\n',
  'x = 0b1010\n',
  'x = #gg\n',
  '# on its own\n',
  'a && b\n',
  '!flag\n',
  'naïve = 1\n',
  '@@@ $$$ ^^^\n',
  '{"json": true}\n',
  '<html><body>hello</body></html>\n',
  'x = 1\r\ny = 2\r\n',
  '﻿version 1\nstudy("a")\n',
  'study("a")\n\tx = 1\n',
  'plot(close)      // a trailing comment with // inside it\n',
  'x = "a // not a comment"\n',
];
