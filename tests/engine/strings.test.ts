/**
 * The two string rules, held to the page and proved through the pipeline.
 *
 * **The trimmed set.** `stdlib.md` section 10 lists the code points `str.trim`
 * removes and `toNumber` ignores, and `code-points.ts` says why neither host's
 * own trim is that set. So the list is read out of the page, every code point
 * of the basic plane is put to the engine, and the two sets are compared in
 * both directions: a code point the engine removes and the page does not list,
 * or lists and the engine keeps, fails by name. An engine that fell back to
 * the host's trim fails on the byte order mark and on the next line character.
 *
 * **The order.** Two strings order by code point, and the host's `<` does not
 * once a string holds a symbol outside the basic plane. Proved through the
 * whole pipeline, source to table cell, because that is where a second engine
 * would disagree, and the wrong implementation is the one the host offers by
 * default.
 *
 * **The writer.** `text(x)` goes through the one writer, proved the same way,
 * with the values a host's own conversion spells differently.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { BarState } from '../../src/core/engine/index.js';
import { compareStrings, manifestEntry } from '../../src/core/engine/library/index.js';
import type { CallContext } from '../../src/core/engine/library/index.js';
import { Heap } from '../../src/core/engine/values/index.js';
import type { Value } from '../../src/core/engine/values/index.js';
import { flat, running } from './support.js';

const PAGE = new URL('../../../spec/stdlib.md', import.meta.url);
const CLOSING: BarState = { isConfirmed: true, isRealtime: true };

/** The sentence the table sits under, which is how the table is found. */
const ANCHOR = '**`str.trim` removes, and `toNumber` ignores at either end, exactly these code';
const ROW = /^\| `U\+([0-9A-F]{4})`(?: to `U\+([0-9A-F]{4})`)? \|/;

/** The code points the page lists, read out of the table rather than typed here. */
function listedOnPage(): ReadonlySet<number> {
  const page = readFileSync(PAGE, 'utf8').replace(/\r\n/g, '\n');
  const at = page.indexOf(ANCHOR);
  assert.notEqual(at, -1, 'stdlib.md section 10 no longer opens the trimmed set with the expected sentence');
  const lines = page.slice(at).split('\n');
  const table = lines.findIndex((line) => line.startsWith('| Code point'));
  assert.notEqual(table, -1, 'no table follows the sentence');
  const out = new Set<number>();
  for (let i = table + 2; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!line.startsWith('|')) break;
    const row = ROW.exec(line);
    assert.ok(row !== null, `a row of the table is not a code point: ${line}`);
    const from = Number.parseInt(row[1] ?? '', 16);
    const to = row[2] === undefined ? from : Number.parseInt(row[2], 16);
    for (let point = from; point <= to; point += 1) out.add(point);
  }
  assert.ok(out.size >= 20, `the table lists ${out.size} code points, which is too few to be the set`);
  return out;
}

/** The smallest context a text entry can be called with. */
function call(name: string, args: readonly Value[]): Value {
  const of = manifestEntry(name, args.length);
  assert.ok(of !== undefined, `the engine has no ${name} of ${args.length} arguments`);
  const context = {
    heap: new Heap(),
    span: { offset: 0, length: 0, line: 0, column: 0 },
    guard: {
      string: (_span: unknown, text: string) => text,
      chars: () => undefined,
      badArgument: (): never => {
        throw new Error('badArgument');
      },
    },
  } as unknown as CallContext;
  return of.call(context, args);
}

const HEX = (point: number): string => `U+${point.toString(16).toUpperCase().padStart(4, '0')}`;

// Catches: a trim taken from the host, which removes the byte order mark the
// page does not list and keeps the next line character it does; and a set
// typed into the engine that has drifted from the page in either direction.
test('str.trim removes exactly the code points the page lists, over the basic plane', () => {
  const listed = listedOnPage();
  const removedNotListed: string[] = [];
  const listedNotRemoved: string[] = [];
  for (let point = 1; point <= 0xffff; point += 1) {
    const character = String.fromCodePoint(point);
    const removed = call('str.trim', [`${character}x${character}`]) === 'x';
    if (removed && !listed.has(point)) removedNotListed.push(HEX(point));
    if (!removed && listed.has(point)) listedNotRemoved.push(HEX(point));
  }
  assert.deepEqual(removedNotListed, [], 'removed by the engine and not listed on the page');
  assert.deepEqual(listedNotRemoved, [], 'listed on the page and kept by the engine');
  assert.equal(call('str.trim', ['\u{1F600}x\u{1F600}']), '\u{1F600}x\u{1F600}', 'above the plane');
  assert.equal(call('str.trim', ['　　']), '', 'a string that is all whitespace');
  assert.equal(call('str.trim', ['']), '', 'the empty string');
});

// Catches: a toNumber that trims by another set than str.trim, so that a
// string one call would strip the other would refuse.
test('toNumber ignores the same set at either end and nothing else', () => {
  for (const point of listedOnPage()) {
    const pad = String.fromCodePoint(point);
    assert.equal(call('toNumber', [`${pad}42${pad}`]), 42, HEX(point));
  }
  assert.equal(call('toNumber', ['﻿42']), null, 'the byte order mark is not ignored');
  assert.equal(call('toNumber', ['42​']), null, 'the zero width space is not ignored');
  assert.equal(call('toNumber', ['\u001C42']), null, 'an information separator is not ignored');
  assert.equal(call('toNumber', [' 1e3 ']), 1000);
});

// Catches: an order taken from the host's `<`, which puts a symbol outside
// the basic plane, stored as a surrogate pair from U+D800, below U+FF01.
test('two strings order by code point, the shorter first where one is a prefix', () => {
  assert.ok(compareStrings('！', '\u{1F600}') < 0, 'U+FF01 before U+1F600');
  assert.ok(compareStrings('\u{1F600}', '！') > 0);
  assert.ok(compareStrings('a', 'ab') < 0, 'a prefix orders first');
  assert.equal(compareStrings('same', 'same'), 0);
  assert.ok(compareStrings('', 'a') < 0);
  // The host disagrees, which is why the rule is not the host's.
  assert.equal('！' < '\u{1F600}', false);
});

// Catches: a sort that ranks strings by the host's order. Source to table
// cell, so a second engine reading this script has the same thing to agree
// with.
test('sort orders strings by code point through the whole pipeline', () => {
  const engine = running(`version 1

study("Order")

names = ["\u{1F600}", "！", "a", "\u{10000}", "￿"]
sort(names, "asc")
t = table("Panel", 1, 1)
cell(t, 0, 0, str.join(names, "|"))

plot(close, "Close")
`);
  engine.append(flat(100, 1_000), CLOSING);
  const cell = engine.tables()[0]?.cells[0]?.text;
  assert.equal(cell, 'a|！|￿|\u{10000}|\u{1F600}');
});

// Catches: a trim inside the engine that is not the one the manifest test
// above drove, and an escape the lexer reads into a code point the set holds.
test('str.trim through the whole pipeline', () => {
  const engine = running(`version 1

study("Trim")

t = table("Panel", 1, 1)
cell(t, 0, 0, "[" + str.trim("\\u3000\\u0085 x \\u000A") + "][" + str.trim("\\uFEFFy") + "]")

plot(close, "Close")
`);
  engine.append(flat(100, 1_000), CLOSING);
  assert.equal(engine.tables()[0]?.cells[0]?.text, '[x][﻿y]');
});

// Catches: a text() that asks the host, which writes 1e+21, and a fixed
// conversion that writes the exact binary expansion of a large whole number
// instead of the shortest digits the rule gives it.
test('text writes a number by the one rule through the whole pipeline', () => {
  const engine = running(`version 1

study("Spelling")

t = table("Panel", 1, 1)
big = 1152921504606846976
cell(t, 0, 0, text(1e21) + " " + text(0.1 + 0.2) + " " + text(big, 0) + " " + text(1e-7) + " " + text(100))

plot(close, "Close")
`);
  engine.append(flat(100, 1_000), CLOSING);
  assert.equal(
    engine.tables()[0]?.cells[0]?.text,
    '1e21 0.30000000000000004 1152921504606847000 1e-7 100',
  );
});
