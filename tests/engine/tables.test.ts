/**
 * A grid's cells against the shape its declaration fixed, `language.md` 15.3.
 *
 * A write outside the grid used to raise OS4004, which is about an array: its
 * message named a flattened element count, "Index 2, 0 is outside the array,
 * which holds 4 elements", where the declaration fixed two numbers and the fix
 * is to declare the shape the script writes. OS4008 is that code, and it had
 * been in the catalogue with nothing raising it.
 *
 * These are the tests `unit:table/cell-out-of-range` names in
 * `spec/feature-matrix.md`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { flat, running } from './support.js';

function grid(...lines: readonly string[]): string {
  return ['version 1', '', 'study("Grid")', '', 't = table("Summary", 2, 2)', ...lines].join('\n');
}

test('a cell past the last row is OS4008, naming the cell and the declared shape', () => {
  // Catches an engine that raises the array code, or that grows the grid to
  // fit the write, or that drops the cell and says nothing.
  const engine = running(grid('cell(t, 2, 0, "Total")'));
  const result = engine.append(flat(10), { isConfirmed: true });
  assert.equal(result.diagnostic?.code, 'OS4008');
  assert.equal(result.diagnostic?.span.line, 6);
  assert.deepEqual(result.diagnostic?.values, { row: 2, column: 0, rows: 2, columns: 2 });
});

test('a cell past the last column is OS4008 as well', () => {
  const engine = running(grid('cell(t, 0, 2, "Total")'));
  const result = engine.append(flat(10), { isConfirmed: true });
  assert.equal(result.diagnostic?.code, 'OS4008');
  assert.deepEqual(result.diagnostic?.values, { row: 0, column: 2, rows: 2, columns: 2 });
});

test('the last cell the shape holds is written, and nothing is raised', () => {
  // Catches the refusal landing one cell early.
  const engine = running(grid('cell(t, 1, 1, "Total")'));
  assert.equal(engine.append(flat(10), { isConfirmed: true }).diagnostic, undefined);
});
