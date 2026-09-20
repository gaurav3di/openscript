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

/**
 * Catches an order that leans on a machine setting or on the sort being stable.
 *
 * `compiled-program.md` 8.4 says there is no locale: string comparison is
 * defined by the manifest and by Unicode, never by an environment setting. The
 * tie after the offset was a locale comparison, so two engines configured for
 * two collations could print the same diagnostics in two orders, and a reader
 * comparing them would have no way to say which was right.
 *
 * The span's length is in the comparison for the second half of the same
 * property: without it, two diagnostics sharing a code and an offset tie, and a
 * tie is settled by whether the runtime's sort happens to be stable, which is a
 * property of the engine rather than of the language. Reporting the same set in
 * two different orders has to be impossible, not merely unlikely.
 */
test('the order is total: offset, then span length, then code point', () => {
  const bag = new DiagnosticBag();
  bag.report('OS8010', at(20, 5, 3, 1), { name: 'len', line: 3 });
  bag.report('OS1007', at(20, 1, 3, 1), {});
  bag.report('OS1006', at(20, 5, 3, 1), {});

  assert.deepEqual(
    bag.ordered().map((diagnostic) => `${diagnostic.code}:${diagnostic.span.length}`),
    ['OS1007:1', 'OS1006:5', 'OS8010:5'],
  );
});

test('two orderings of the same reports are the same order', () => {
  const forwards = new DiagnosticBag();
  forwards.report('OS1006', at(40, 1, 5, 1), {});
  forwards.report('OS8010', at(40, 1, 5, 1), { name: 'len', line: 5 });

  const backwards = new DiagnosticBag();
  backwards.report('OS8010', at(40, 1, 5, 1), { name: 'len', line: 5 });
  backwards.report('OS1006', at(40, 1, 5, 1), {});

  assert.deepEqual(
    forwards.ordered().map((diagnostic) => diagnostic.code),
    backwards.ordered().map((diagnostic) => diagnostic.code),
  );
});
