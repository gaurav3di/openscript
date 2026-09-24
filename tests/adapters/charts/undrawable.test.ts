/**
 * What this chart cannot draw is refused before a bar runs, with OS6024.
 *
 * Issue 0011: a second declared grid and a band colour computed per bar were
 * both dropped with nothing said, because the chart has one grid hook and one
 * colour per band, and the catalogue had no code for a host that cannot draw
 * something a program declares. Each test below catches the silent drop coming
 * back, and the last one catches the refusal overreaching onto a study the
 * chart can draw whole.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { bars, context, descriptorOfSource, refusalOf } from './support.js';

function refusalFor(text: string): { code: string; line: number; name: string } {
  return refusalOf(() => descriptorOfSource(text).calc(bars(10), {}, {}, context(10)));
}

test('a second grid is refused at load, as a condition the reader can act on', () => {
  const refusal = refusalFor(`version 1
study("Two grids", overlay = true)
first = table("Summary", 1, 1)
second = table("Detail", 1, 1)
cell(first, 0, 0, "a")
cell(second, 0, 0, "b")
plot(close, "C")
`);
  assert.equal(refusal.code, 'OS6024');
  assert.equal(refusal.name, 'IndicatorInputError');
});

test('a band whose colour is computed per bar is refused at load', () => {
  const refusal = refusalFor(`version 1
study("Band", overlay = true)
a = plot(high, "H")
b = plot(low, "L")
fill(a, b, colorUp = close > open ? lime : red)
`);
  assert.equal(refusal.code, 'OS6024');
});

test('one grid and a band of one colour run, and nothing is refused', () => {
  const descriptor = descriptorOfSource(`version 1
study("Fits", overlay = true)
a = plot(high, "H")
b = plot(low, "L")
fill(a, b, colorUp = lime)
panel = table("Summary", 1, 1)
cell(panel, 0, 0, "a")
`);
  assert.doesNotThrow(() => descriptor.calc(bars(10), {}, {}, context(10)));
});
