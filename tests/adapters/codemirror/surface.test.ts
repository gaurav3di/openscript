/**
 * The completion source, the linter, the tooltips and the format command.
 *
 * Each one is driven with the argument the component passes rather than with one
 * of this file's invention, for the reason `support.ts` states: a hook that
 * assigns to the component's type and is never called with the component's own
 * argument is the failure the chart adapter has actually made.
 *
 * The offsets are what most of these are about. Every span this package produces
 * indexes the normalised text of `language.md` 3.1, and a document written on a
 * machine that ends its lines with two characters is an ordinary document the
 * component holds exactly as it is. An adapter that handed one back untranslated
 * would put every squiggle below the first line in the wrong place, and that is
 * reported as "the underline is off" rather than as an offset defect.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { entryFor, fillTemplate } from '../../../src/core/index.js';
import {
  diagnosticsFor,
  documentOf,
  formatDocument,
  hoverLines,
  normalisedOffset,
  openscriptCompletion,
  openscriptHoverTooltip,
  openscriptLint,
  openscriptSignatureTooltip,
  signatureLines,
} from '../../../src/adapters/codemirror/index.js';
import { complete, diagnose, format } from '../../../src/editor/index.js';
import { stateOf, viewOf } from './support.js';

const HEAD = 'version 1\nstudy("t")\n';

const NARROWINGS = new URL('../../../../spec/editor-narrowings.json', import.meta.url);

// ---------------------------------------------------------------------------
// Completions
// ---------------------------------------------------------------------------

test('the completion result replaces the word being typed', () => {
  // Catches a result anchored at the cursor, which inserts `ema` after `em` and
  // leaves the writer with `emema`.
  const source = `${HEAD}x = em`;
  const result = openscriptCompletion({
    state: stateOf(source),
    pos: source.length,
    explicit: false,
  });
  assert.equal(result?.from, source.length - 2);
  assert.equal(result?.to, source.length);
});

test('the list is marked as already filtered', () => {
  // The component's own matcher is fuzzy and case insensitive, and the list has
  // been filtered exactly, because names are case sensitive. Letting it filter
  // again would put a name that does not compile in front of somebody.
  const result = openscriptCompletion({ state: stateOf(HEAD), pos: HEAD.length, explicit: true });
  assert.equal(result?.filter, false);
});

test('every row of the tier arrives as a row of the component', () => {
  const rows = complete(HEAD, HEAD.length);
  const result = openscriptCompletion({ state: stateOf(HEAD), pos: HEAD.length, explicit: true });
  assert.equal(result?.options.length, rows.length);
});

test('a planned row is pushed to the bottom and carries the catalogue\'s sentence', () => {
  const result = openscriptCompletion({ state: stateOf(HEAD), pos: HEAD.length, explicit: true });
  const row = result?.options.find((one) => one.label === 'kama');
  assert.equal(row?.info, fillTemplate(entryFor('OS2020').message, { name: 'kama' }));
  assert.equal(row?.boost, -99);
  assert.equal(
    result?.options.find((one) => one.label === 'ema')?.boost,
    undefined,
    'a call a script may write today is not moved',
  );
});

test('a row whose insertion differs from its label says so, and one that does not is silent', () => {
  const result = openscriptCompletion({ state: stateOf(HEAD), pos: HEAD.length, explicit: true });
  assert.equal(result?.options.find((one) => one.label === 'draw')?.apply, 'draw.');
  assert.equal(result?.options.find((one) => one.label === 'ema')?.apply, undefined);
});

test('a position with nothing to offer answers with nothing, not with an empty list', () => {
  // The component reads the two differently: an empty result closes the panel
  // and nothing lets another source answer, and a host with snippets of its own
  // should keep them.
  const source = `${HEAD}x = 1\nx.`;
  assert.equal(
    openscriptCompletion({ state: stateOf(source), pos: source.length, explicit: true }),
    null,
  );
});

// ---------------------------------------------------------------------------
// The linter
// ---------------------------------------------------------------------------

test('every diagnostic the compiler produces reaches the component', () => {
  const source = `${HEAD}plot(notAName, "X")\n`;
  const held = diagnose(source);
  const shown = openscriptLint(viewOf(source));
  assert.equal(shown.length, held.length);
  assert.ok(held.some((one) => one.code === 'OS2001'));
});

test('a diagnostic carries its code as the source and its fix in the message', () => {
  // The code is the one part of a diagnostic this project promises never to
  // change, so it is what a trader quotes. The fix is the half worth reading,
  // and the component shows one string.
  const source = `${HEAD}plot(notAName, "X")\n`;
  const one = diagnose(source).find((held) => held.code === 'OS2001');
  const shown = openscriptLint(viewOf(source)).find((held) => held.source === 'OS2001');
  assert.ok(one !== undefined && shown !== undefined);
  assert.equal(shown.from, one.span.offset);
  assert.equal(shown.to, one.span.offset + one.span.length);
  assert.ok(shown.message.includes(one.message));
  assert.ok(shown.message.includes(one.fix));
  assert.equal(shown.severity, one.severity);
});

test('a squiggle of no width is widened by one character', () => {
  // Catches a diagnostic that points at a position rather than at text, which
  // the compiler does for a mistake that is an absence. A squiggle of zero width
  // is a squiggle nobody sees.
  for (const shown of diagnosticsFor(`${HEAD}x = ema(close,\n`)) {
    assert.ok(shown.to > shown.from, 'an invisible squiggle');
  }
});

test('a document with two character line endings is underlined in the right place', () => {
  // Catches the defect this adapter's position map exists for. The offsets the
  // compiler produces index the normalised text; the component holds the
  // document as written.
  const source = `${HEAD}plot(notAName, "X")\n`;
  const windows = source.replace(/\n/g, '\r\n');
  const shown = diagnosticsFor(windows).find((one) => one.source === 'OS2001');
  assert.ok(shown !== undefined);
  assert.equal(
    windows.slice(shown.from, shown.to),
    'notAName',
    'the span covers the name in the document the component holds',
  );
});

test('a document with a byte order mark is underlined in the right place', () => {
  const source = `﻿${HEAD}plot(notAName, "X")\n`;
  const shown = diagnosticsFor(source).find((one) => one.source === 'OS2001');
  assert.equal(source.slice(shown?.from, shown?.to), 'notAName');
});

test('an offset of the document and an offset of the normalised text agree both ways', () => {
  const source = `${HEAD}plot(close, "C")\n`.replace(/\n/g, '\r\n');
  const held = documentOf(source);
  for (let at = 0; at <= held.text.length; at += 1) {
    assert.equal(normalisedOffset(held, held.at(at)), at, `round trip at ${at}`);
  }
});

// ---------------------------------------------------------------------------
// The tooltips
// ---------------------------------------------------------------------------

test('a hover tooltip is anchored to the word it is about', () => {
  const source = `${HEAD}x = ema(close, 9)\n`;
  const tooltip = openscriptHoverTooltip(() => ({ dom: 'x' }))(viewOf(source), source.indexOf('ema'));
  assert.equal(tooltip?.pos, source.indexOf('ema'));
  assert.equal(tooltip?.end, source.indexOf('ema') + 3);
});

test('a hover tooltip over something that is not a word is not shown', () => {
  const source = `${HEAD}x = 1 + 2\n`;
  assert.equal(
    openscriptHoverTooltip(() => ({ dom: 'x' }))(viewOf(source), source.indexOf('+')),
    null,
  );
});

test('the host\'s own renderer is what draws, when it supplies one', () => {
  const source = `${HEAD}x = ema(close, 9)\n`;
  let drawn = '';
  const tooltip = openscriptHoverTooltip((held) => {
    drawn = held.name;
    return { dom: 'mine' };
  })(viewOf(source), source.indexOf('ema'));
  assert.deepEqual(tooltip?.create(viewOf(source)), { dom: 'mine' });
  assert.equal(drawn, 'ema');
});

test('the lines of a hover are the compiler\'s answers and nothing else', () => {
  const source = `${HEAD}x = kama(close, 9)\n`;
  const tooltip = openscriptHoverTooltip((held) => {
    const lines = hoverLines(held);
    assert.ok(lines.some((line) => line.startsWith('kama(')), 'the signature');
    assert.ok(
      lines.includes(fillTemplate(entryFor('OS2020').message, { name: 'kama' })),
      'the catalogue\'s refusal, word for word',
    );
    return { dom: '' };
  })(viewOf(source), source.indexOf('kama'));
  tooltip?.create(viewOf(source));
});

test('a signature tooltip follows the cursor and names the active parameter', () => {
  const source = `${HEAD}x = ema(close, `;
  const tooltip = openscriptSignatureTooltip((held) => {
    const lines = signatureLines(held);
    assert.equal(lines[0], 'ema(src: series number, len: number) -> series number');
    assert.ok(lines[1]?.startsWith('len: number'), lines[1]);
    return { dom: '' };
  })(stateOf(source));
  assert.equal(tooltip?.pos, source.length);
  tooltip?.create(viewOf(source));
});

test('a cursor in no call shows no signature tooltip', () => {
  const source = `${HEAD}x = 1\n`;
  assert.equal(openscriptSignatureTooltip(() => ({ dom: '' }))(stateOf(source)), null);
});

// ---------------------------------------------------------------------------
// The format command
// ---------------------------------------------------------------------------

test('formatting replaces the whole document and keeps the caret', () => {
  const source = `${HEAD}x   =   1\n`;
  const view = viewOf(source, source.length - 1);
  assert.equal(formatDocument(view), true);

  const change = view.changes[0];
  assert.equal(change?.from, 0);
  assert.equal(change?.to, source.length);
  assert.equal(change?.insert, format(source));
  assert.ok((change?.anchor ?? -1) <= (change?.insert.length ?? 0), 'the caret is inside the text');
});

test('formatting a document that is already laid out changes nothing and says so', () => {
  // Catches a command that dispatches an identical change: the editor would take
  // an undo step for a press that did nothing, and the key would stop falling
  // through to whatever else is bound to it.
  const source = format(`${HEAD}x = 1\n`);
  const view = viewOf(source);
  assert.equal(formatDocument(view), false);
  assert.deepEqual(view.changes, []);
});

test('formatting a document with two character line endings normalises them', () => {
  // Recorded in spec/editor-narrowings.json: it is the one change to a file's
  // bytes that formatting makes without being asked.
  const view = viewOf(`${HEAD}x = 1\n`.replace(/\n/g, '\r\n'));
  assert.equal(formatDocument(view), true);
  assert.ok(!(view.changes[0]?.insert ?? '').includes('\r'));
});

// ---------------------------------------------------------------------------
// What is written down about all of it
// ---------------------------------------------------------------------------

test('every narrowing recorded names a test that exists', () => {
  // The same discipline as the catalogue's test pointers: a narrowing that names
  // a file nobody wrote is a narrowing nobody holds.
  const recorded = JSON.parse(readFileSync(NARROWINGS, 'utf8')) as Record<
    string,
    { narrowings?: unknown[]; gaps?: unknown[] }
  >;

  const rows = Object.values(recorded).flatMap((section) =>
    typeof section === 'object' && section !== null
      ? [...(section.narrowings ?? []), ...(section.gaps ?? [])]
      : [],
  ) as { what: string; detail: string; instead: string; test: string }[];

  assert.ok(rows.length >= 10, `only ${rows.length} narrowings are recorded`);
  for (const row of rows) {
    for (const field of ['what', 'detail', 'instead', 'test'] as const) {
      assert.ok((row[field] ?? '').length > 0, `a narrowing with no ${field}: ${row.what}`);
    }
    readFileSync(new URL(`../../../../${row.test}`, import.meta.url), 'utf8');
  }
});
