import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { checkStrategy, rawCodes } from './check-support.js';

/**
 * What a tag argument means, `stdlib.md` 17.2 and OS7016.
 *
 * **A tag that defaults to the empty string is a label the destination carries.
 * A tag that is required, or defaults to absence, is a reference to something
 * that has to exist.** The rule is visible in every signature on the order
 * surface, and the tests below are what holds the two halves of it apart: a
 * label naming nothing is an ordinary order and is never reported, and the one
 * reference the file itself can settle is reported before any bar runs.
 *
 * The defect this exists to catch is a silence. `close(tag = "entryy")` sent
 * nothing, said nothing, left the position open, and left the script believing
 * it had flattened. Every assertion here is a code and a span, never a message.
 */

const CATALOGUE = new URL('../../../spec/errors.json', import.meta.url);

interface Entry {
  readonly code: string;
  readonly example?: { readonly before: string; readonly after: string };
}

function example(code: string): { readonly before: string; readonly after: string } {
  const parsed = JSON.parse(readFileSync(CATALOGUE, 'utf8')) as { readonly entries: readonly Entry[] };
  const found = parsed.entries.find((one) => one.code === code);
  assert.ok(found?.example, `${code} has no worked example in the catalogue`);
  return found.example;
}

/** Every code a strategy body reports, in the order a reader is shown them. */
function reported(body: string): readonly string[] {
  return checkStrategy(body).diagnostics.map((one) => one.code);
}

/** The span of the one diagnostic with this code, as `line:column+length`. */
function spanFor(body: string, code: string): string | undefined {
  const found = checkStrategy(body).diagnostics.find((one) => one.code === code);
  return found === undefined ? undefined : `${found.span.line}:${found.span.column}+${found.span.length}`;
}

/** The body of a strategy, with the two header lines `checkStrategy` supplies. */
const ENTERS = 'if pos.isFlat\n    buy(qty = 1, tag = "entry")\nelse\n';

// Catches the implementation this whole entry replaced: no pass at all, so a
// mistyped tag compiles, runs to the last bar, sends nothing and says nothing.
test('a close naming a tag no order places is OS7016', () => {
  const body = `${ENTERS}    close(tag = "entries")`;
  assert.deepEqual(reported(body), ['OS7016']);
});

// Catches a pass that reports at the call, which would draw the caret under
// `close` when the word that is wrong is four characters inside the line.
test('the caret is under the tag that was written, not under the call', () => {
  const body = `${ENTERS}    close(tag = "entries")`;
  // Line 6 of the file, column 11: `tag = "entries"`, the argument and its label.
  assert.equal(spanFor(body, 'OS7016'), '6:11+15');
});

// Catches a pass that reports every close carrying a tag, which would refuse
// the ordinary shape this feature exists to protect.
test('a close naming a tag an order does place is not reported', () => {
  assert.deepEqual(reported(`${ENTERS}    close(tag = "entry")`), []);
});

// Catches a pass that treats an unwritten tag as a tag naming nothing, which
// would refuse `close()`, the commonest call on the whole surface.
test('a close that writes no tag is not reported', () => {
  assert.deepEqual(reported('buy(qty = 1, tag = "entry")\nif pos.isLong\n    close()'), []);
});

// Catches a pass that collects only the tags a call writes out. An order that
// writes no tag carries the empty one its signature states, and a close naming
// the empty tag names that order's rows.
test('the empty tag an order takes by default is a tag a close may name', () => {
  assert.deepEqual(reported('if pos.isFlat\n    buy(qty = 1)\nelse\n    close(tag = "")'), []);
});

// Catches a pass that treats a computed tag as no tag at all. What a script
// computes could be anything, so nothing in such a file is provably dead and
// refusing a close there would refuse a working script.
test('a computed tag on an order that places one silences the file', () => {
  const body = 'name = "en" + "try"\nif pos.isFlat\n    buy(qty = 1, tag = name)\nelse\n    close(tag = "entries")';
  assert.deepEqual(reported(body), []);
});

// Catches a pass that reads the source text of the argument rather than a
// written string, which would compare a name against a set of tags.
test('a computed tag on the close is not reported', () => {
  const body = 'name = "en" + "try"\nif pos.isFlat\n    buy(qty = 1, tag = "entry")\nelse\n    close(tag = name)';
  assert.deepEqual(reported(body), []);
});

// Catches a pass that collects tags from the two calls named after a side and
// forgets the general form, which would refuse a close in every script that
// computes its own direction.
test('a tag order.place writes is a tag a close may name', () => {
  const body = 'if pos.isFlat\n    order.place("buy", 1, tag = "entry")\nelse\n    close(tag = "entry")';
  assert.deepEqual(reported(body), []);
});

// Catches the same omission for the call that opens the replacement half of a
// flip, which carries its tag onto an order like any other entry.
test('a tag order.reverse writes is a tag a close may name', () => {
  assert.deepEqual(reported('order.reverse(tag = "flip")\nclose(tag = "flip")'), []);
});

// The other direction, and the whole of why a bracket is not on the list: it
// attaches a level and appends no row, so a tag only a bracket carries names no
// part of a position and a close on it can never do anything.
test('a tag only a bracket carries is not a tag a close may name', () => {
  const body = `${ENTERS}    exit(tag = "protect", loss = 10)\n    close(tag = "protect")`;
  assert.deepEqual(reported(body), ['OS7016']);
});

// Catches a pass that walks the file's top level only. A function body is
// checked whether or not anything calls it, and an order inside one places an
// order with that tag.
test('a tag is collected from an order inside a function', () => {
  const body = 'fn enter() =>\n    buy(qty = 1, tag = "entry")\nif pos.isFlat\n    enter()\nelse\n    close(tag = "entry")';
  assert.deepEqual(reported(body), []);
});

/**
 * The other half of the rule, which is the half that must not become a refusal.
 *
 * Each of these takes a tag that defaults to `""`, so the tag is a label the
 * destination carries and not a reference to an order. A label naming nothing
 * is an ordinary call, and a pass that applied the reference rule to one would
 * refuse the shape `stdlib.md` 17.2 documents.
 */
const LABELS: readonly string[] = [
  'buy(qty = 1, tag = "nothing")',
  'sell(qty = 1, tag = "nothing")',
  'exit(tag = "nothing", loss = 10)',
  'order.place("buy", 1, tag = "nothing")',
  'order.reverse(tag = "nothing")',
  'order.bracket(tag = "nothing", loss = 10)',
];

for (const source of LABELS) {
  test(`${source} carries a label, and is not OS7016`, () => {
    assert.deepEqual(reported(source), []);
  });
}

// Catches a pass that reports on a file the order surface is not available in
// at all, which would show a reader two diagnostics about one line and leave
// them to work out which to fix first. A study is told which declaration to
// change, once per call, and nothing about tags.
test('a study file is told about the declaration and nothing else', () => {
  const study = 'version 1\nstudy("T")\nbuy(qty = 1, tag = "entry")\nclose(tag = "entries")\n';
  assert.deepEqual(rawCodes(study), ['OS7001', 'OS7001']);
});

/**
 * The catalogue's own worked example for OS7016, checked rather than read.
 *
 * A before that does not produce the code it illustrates teaches a reader to
 * look for a message the compiler never sends, and an after that does not
 * compile teaches a fix that does not work. Both look authoritative on the page.
 */
test("the catalogue's before for OS7016 reports it, and nothing else", () => {
  assert.deepEqual(reported(example('OS7016').before), ['OS7016']);
});

test("the catalogue's after for OS7016 compiles clean", () => {
  assert.deepEqual(reported(example('OS7016').after), []);
});

/**
 * OS7009's worked example, which is a compiler question before it is an engine
 * one: the fix it used to offer called `order.working`, which is marked planned,
 * so the fix the catalogue handed a reader was OS2020.
 */
test("the catalogue's example for OS7009 compiles, both halves", () => {
  assert.deepEqual(reported(example('OS7009').before), []);
  assert.deepEqual(reported(example('OS7009').after), []);
});
