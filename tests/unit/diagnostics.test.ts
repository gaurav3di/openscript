import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DiagnosticBag, diagnosticFor, entryFor, makeSpan } from '../../src/core/index.js';

const at = (offset: number, length: number, line: number, column: number) =>
  makeSpan(offset, length, line, column);

test('a diagnostic takes its words from the catalogue and its values from the stage', () => {
  const diagnostic = diagnosticFor('OS2002', at(120, 3, 14, 5), { name: 'len', line: 1 });
  const entry = entryFor('OS2002');

  assert.equal(diagnostic.severity, 'error');
  assert.equal(diagnostic.stage, 'check');
  assert.equal(diagnostic.title, entry.title);
  assert.equal(diagnostic.message.includes('{'), false);
  assert.equal(diagnostic.message.includes('len'), true);
  assert.deepEqual(diagnostic.values, { name: 'len', line: 1 });
});

test('the fix is filled too, because its slots are the same slots', () => {
  const diagnostic = diagnosticFor('OS2002', at(120, 3, 14, 5), { name: 'len', line: 1 });

  assert.equal(diagnostic.fix.includes('{'), false);
});

test('a code with no placeholders takes an empty object', () => {
  const diagnostic = diagnosticFor('OS1006', at(30, 1, 4, 8), {});

  assert.equal(diagnostic.message.includes('{'), false);
});

test('a warning is a warning, and nothing about it stops the run', () => {
  const diagnostic = diagnosticFor('OS8003', at(0, 0, 1, 1), { version: 1 });

  assert.equal(diagnostic.severity, 'warning');
});

test('the bag gathers rather than stopping at the first, so one compile shows every error', () => {
  const bag = new DiagnosticBag();
  bag.report('OS1007', at(10, 1, 2, 11), {});
  bag.report('OS1007', at(40, 1, 5, 9), {});
  bag.report('OS1019', at(60, 3, 7, 1), { word: 'for', suggestion: 'forward' });

  assert.equal(bag.all.length, 3);
  assert.equal(bag.hasErrors, true);
  assert.equal(bag.isEmpty, false);
});

test('the same code over the same span is reported once, which is what recovery produces', () => {
  const bag = new DiagnosticBag();
  bag.report('OS1012', at(10, 1, 2, 11), { bracket: '(', line: 2 });
  bag.report('OS1012', at(10, 1, 2, 11), { bracket: '(', line: 2 });

  assert.equal(bag.all.length, 1);
});

test('two different codes on one character both survive', () => {
  const bag = new DiagnosticBag();
  bag.report('OS1012', at(10, 1, 2, 11), { bracket: '(', line: 2 });
  bag.report('OS1022', at(10, 1, 2, 11), { token: '(' });

  assert.equal(bag.all.length, 2);
});

test('errors and warnings are separable, and a file of warnings still runs', () => {
  const bag = new DiagnosticBag();
  bag.report('OS8003', at(0, 0, 1, 1), { version: 1 });
  bag.report('OS8010', at(20, 3, 3, 1), { name: 'len', line: 3 });

  assert.equal(bag.hasErrors, false);
  assert.equal(bag.warnings.length, 2);
  assert.equal(bag.errors.length, 0);
});

test('ordered walks the file top to bottom, whatever order the stages ran in', () => {
  const bag = new DiagnosticBag();
  bag.report('OS1007', at(400, 1, 40, 1), {});
  bag.report('OS8010', at(20, 3, 3, 1), { name: 'len', line: 3 });

  assert.deepEqual(
    bag.ordered().map((diagnostic) => diagnostic.span.offset),
    [20, 400],
  );
  assert.deepEqual(
    bag.all.map((diagnostic) => diagnostic.span.offset),
    [400, 20],
  );
});
