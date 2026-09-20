import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CATALOGUE_LANGUAGE_VERSION,
  allCodes,
  entryFor,
  fillTemplate,
  isDiagnosticCode,
  slotsIn,
} from '../../src/core/catalogue/index.js';

test('the whole catalogue is generated, in ascending order', () => {
  const codes = allCodes();

  assert.equal(codes.length, 146);
  assert.deepEqual([...codes].sort(), [...codes]);
});

test('the catalogue describes language version 1', () => {
  assert.equal(CATALOGUE_LANGUAGE_VERSION, 1);
});

test('every entry can be rendered with no slot left showing', () => {
  for (const code of allCodes()) {
    const entry = entryFor(code);
    const values = Object.fromEntries(entry.placeholders.map((name) => [name, 'x']));

    for (const template of [entry.message, entry.fix]) {
      const rendered = fillTemplate(template, values);
      assert.equal(
        slotsIn(rendered).length,
        0,
        `${code} left a slot unfilled: ${rendered}`,
      );
    }
  }
});

test('every entry has a fix that says something other than the message', () => {
  for (const code of allCodes()) {
    const entry = entryFor(code);
    assert.notEqual(entry.fix.trim(), '', `${code} has no fix`);
    assert.notEqual(entry.fix, entry.message, `${code} restates its message as its fix`);
  }
});

test('a slot with no value is left written out rather than blanked', () => {
  assert.equal(fillTemplate('{name} is not defined.', {}), '{name} is not defined.');
});

test('a brace that is not a slot is left alone', () => {
  assert.equal(fillTemplate('{ or } opens no block.', {}), '{ or } opens no block.');
});

test('a string from a log is only a code when the catalogue has it', () => {
  assert.equal(isDiagnosticCode('OS1001'), true);
  assert.equal(isDiagnosticCode('OS9999'), false);
  assert.equal(isDiagnosticCode('toString'), false);
});
