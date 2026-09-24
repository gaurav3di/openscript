import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

import { importScript } from '../../src/core/index.js';
import { CORPUS, compileErrors } from './support.js';

/**
 * The corpus: realistic scripts in the source dialect, each checked in with the
 * OpenScript it must become and the findings it must raise.
 *
 * Three things are held here, and each is aimed at a wrong importer:
 *
 * - **The output is the checked-in output, character for character.** An
 *   importer that silently changed a translation, a mapping row edited to the
 *   wrong function or an operator printed with the wrong grouping, fails here
 *   on the script that exercises it.
 * - **The findings are the checked-in findings, by code and span.** An importer
 *   that stopped reporting a difference, or reported it at the wrong place,
 *   fails here even when its text is unchanged.
 * - **Every checked-in output compiles with no error**, through the whole front
 *   end and the emitter. This is asserted against the files rather than against
 *   a fresh import, so a translation that does not compile cannot be checked in
 *   as the expectation: the expectation itself is compiled.
 */

const SOURCES = readdirSync(CORPUS)
  .filter((name) => name.endsWith('.txt') && !name.endsWith('.findings.txt'))
  .sort();

const read = (name: string): string => readFileSync(new URL(name, CORPUS), 'utf8');
const stem = (name: string): string => name.replace(/\.txt$/, '');

test('the corpus holds at least ten scripts, studies and strategies both', () => {
  assert.ok(SOURCES.length >= 10, `only ${SOURCES.length} scripts in the corpus`);
  const strategies = SOURCES.filter((name) => /^strategy\(/m.test(read(name)));
  const studies = SOURCES.filter((name) => /^indicator\(/m.test(read(name)));
  assert.ok(strategies.length >= 3, 'fewer than three strategies');
  assert.ok(studies.length >= 3, 'fewer than three studies');
  for (const name of SOURCES) {
    assert.match(read(name), /^\/\/@version=[56]$/m, `${name} carries no version 5 or 6 annotation`);
  }
});

test('every script imports to the OpenScript checked in beside it', () => {
  for (const name of SOURCES) {
    const expected = read(`${stem(name)}.oscript`);
    assert.equal(importScript(read(name), { name }).source, expected, `${name} no longer imports as checked in`);
  }
});

test('every script raises exactly the findings checked in beside it, by code and span', () => {
  for (const name of SOURCES) {
    const expected = read(`${stem(name)}.findings.txt`).split('\n').filter((line) => line !== '');
    const found = importScript(read(name), { name }).findings.map(
      (one) => `${one.code} ${one.span.line}:${one.span.column} ${one.span.length}`,
    );
    assert.deepEqual(found, expected, `${name} raises different findings`);
  }
});

test('every checked-in output compiles with no error', () => {
  for (const name of SOURCES) {
    const output = `${stem(name)}.oscript`;
    const errors = compileErrors(read(output)).map((one) => `${one.code} at ${one.span.line}:${one.span.column}`);
    assert.deepEqual(errors, [], `${output} does not compile`);
  }
});

test('the corpus exercises every code the importer can raise', () => {
  const raised = new Set<string>();
  for (const name of SOURCES) {
    for (const line of read(`${stem(name)}.findings.txt`).split('\n')) {
      if (line !== '') raised.add(line.split(' ')[0] ?? '');
    }
  }
  // OS9001 and OS9004 refuse a whole script and are held by the refusal tests,
  // because a corpus script that raised either would have no output to check.
  for (const code of ['OS9002', 'OS9003', 'OS9005', 'OS9007', 'OS9008', 'OS9009', 'OS9010', 'OS9011', 'OS9012']) {
    assert.ok(raised.has(code), `no corpus script raises ${code}`);
  }
});
