/**
 * `complete`, and the one property that decides whether it is worth shipping.
 *
 * Every test names the wrong implementation it is there to catch. The first one
 * is the whole reason this function exists in the language package rather than
 * in each host: a list of names typed out by hand is right on the day it is
 * typed and wrong at the next release, and nobody reports it, because a missing
 * completion looks exactly like a completion that has not loaded.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  NAMESPACES,
  RESERVED_WORDS,
  entryFor,
  fillTemplate,
  libraryEntries,
  libraryNames,
  membersOf,
  normaliseSource,
} from '../../src/core/index.js';
import { complete } from '../../src/editor/index.js';
import { MALFORMED } from './support.js';

const HEAD = 'version 1\nstudy("t")\n';

/** The labels a position offers, in the order they are offered in. */
function labels(source: string, offset = source.length): readonly string[] {
  return complete(source, offset).map((one) => one.label);
}

/** The bare names of the library: the ones a script writes without a namespace. */
function bare(): readonly string[] {
  return libraryNames().filter((name) => !name.includes('.'));
}

// ---------------------------------------------------------------------------
// It is the manifest, not a list
// ---------------------------------------------------------------------------

test('every bare name the library holds is offered', () => {
  // Catches the implementation this would be if somebody typed out the hundred
  // functions they could remember. The manifest is the same index the checker
  // resolves against and the example check reads its globals from, so a function
  // added to the library is offered the day it is added.
  const offered = new Set(labels(HEAD));
  const missing = bare().filter((name) => !offered.has(name));
  assert.deepEqual(missing, [], 'a name the library holds that nothing offers');
  assert.ok(bare().length > 150, 'the library is the whole library, not a sample of it');
});

test('every namespace is offered, and its members are not offered bare', () => {
  // Catches a list built from `libraryNames()` alone, which would offer
  // `draw.box` as a name to type from nothing and never offer `draw`.
  const offered = labels(HEAD);
  for (const namespace of NAMESPACES) assert.ok(offered.includes(namespace), namespace);
  assert.ok(!offered.includes('draw.box'), 'a dotted name is reached through its namespace');
});

test('a namespace inserts its dot and a call does not', () => {
  const rows = complete(HEAD, HEAD.length);
  assert.equal(rows.find((one) => one.label === 'draw')?.insert, 'draw.');
  assert.equal(rows.find((one) => one.label === 'ema')?.insert, 'ema');
});

test('the detail of a call is the signature the manifest holds', () => {
  const row = complete(HEAD, HEAD.length).find((one) => one.label === 'ema');
  assert.equal(row?.detail, 'ema(src: series number, len: number) -> series number');
  assert.equal(row?.kind, 'function');
});

test('a name read without brackets is offered as a value', () => {
  const row = complete(HEAD, HEAD.length).find((one) => one.label === 'close');
  assert.equal(row?.kind, 'value');
  assert.equal(row?.detail, 'close: series number');
});

// ---------------------------------------------------------------------------
// After a dot
// ---------------------------------------------------------------------------

test('after a namespace and a dot, exactly that namespace\'s members are offered', () => {
  const source = `${HEAD}draw.`;
  assert.deepEqual([...labels(source)].sort(), [...membersOf('draw')].sort());
});

test('a partly typed member filters the members and nothing else', () => {
  const source = `${HEAD}draw.bo`;
  assert.deepEqual(labels(source), ['box']);
});

test('after a dot on something that is not a namespace, nothing is offered', () => {
  // Catches the version that falls back to the whole library after any dot,
  // which would offer `ema` where the language has no member read at all
  // (language.md 15.2) and walk a writer into a diagnostic.
  const source = `${HEAD}x = 1\nx.`;
  assert.deepEqual(labels(source), []);
});

// ---------------------------------------------------------------------------
// The file's own names
// ---------------------------------------------------------------------------

test('a name is offered below the statement that declares it and not above it', () => {
  // Catches the version that offers every binding in the file: OS2001 is "not
  // defined at this point in the file", so a name offered above its own
  // assignment is a completion that does not compile.
  const source = `${HEAD}first = 1\nsecond = 2\n`;
  const atFirstLine = source.indexOf('first = 1');
  assert.ok(!labels(source, atFirstLine).includes('second'));
  assert.ok(labels(source, source.length).includes('second'));
});

test('a name is not offered inside its own right hand side', () => {
  // Catches the version that uses the end of the name rather than the end of the
  // statement: `x = ema(x, 9)` is OS2001 on the inner x.
  //
  // The cursor sits where no word has been typed, on purpose. At a cursor inside
  // a partly typed word the list is filtered by that word, and `x` would be
  // absent whatever the scope rule said, which is a test that cannot fail.
  const source = `${HEAD}x = ema(close, )\ny = 2\n`;
  const inside = source.indexOf(', )') + 2;
  assert.equal(complete(source, inside)[0]?.replace.length, 0, 'no word is being typed here');
  assert.ok(!labels(source, inside).includes('x'), 'inside the statement that declares it');
  assert.ok(labels(source, source.length).includes('x'), 'below it');
});

test('a cursor after a space is not a cursor in the word before it', () => {
  // Catches the version that takes the last word before the cursor whether or
  // not the cursor touches it: accepting a row would then overwrite a finished
  // name two columns to the left.
  const source = `${HEAD}x = ema `;
  const row = complete(source, source.length)[0];
  assert.equal(row?.replace.offset, source.length);
  assert.equal(row?.replace.length, 0);
});

test('a block scoped name is offered inside its block and not after it', () => {
  const source = `${HEAD}if close > open\n    inner = 1\n    plot(inner, "I")\nplot(close, "C")\n`;
  const inside = source.indexOf('plot(inner') + 5;
  const after = source.lastIndexOf('plot(close') + 5;
  assert.ok(labels(source, inside).includes('inner'), 'inside its own block');
  assert.ok(!labels(source, after).includes('inner'), 'after the block has closed');
});

test('an unfinished call swallows the rest of the file, as it does for the compiler', () => {
  // Not a defect, and worth a test of its own because it looks like one. A call
  // opened and never closed makes every line below it part of one unfinished
  // statement, which is what the parser reports and what `diagnose-typing`
  // measures. A completion list that decided otherwise would disagree with the
  // diagnostics beside it.
  const source = `${HEAD}if close > open\n    inner = 1\n    plot(\nplot(close, "C")\n`;
  const below = source.lastIndexOf('plot(close') + 5;
  assert.ok(labels(source, below).includes('inner'), 'the block has not closed, so its name holds');
});

test('a declared name carries the type the checker gave it', () => {
  const source = `${HEAD}var held = 0\n`;
  const row = complete(source, source.length).find((one) => one.label === 'held');
  assert.equal(row?.kind, 'variable');
  assert.equal(row?.detail, 'var held: number');
});

// ---------------------------------------------------------------------------
// The named arguments of the call being written
// ---------------------------------------------------------------------------

test('the named arguments of the call come first, in the signature\'s order', () => {
  const source = `${HEAD}x = ema(`;
  const rows = complete(source, source.length);
  assert.deepEqual(
    rows.filter((one) => one.kind === 'argument').map((one) => one.label),
    ['src', 'len'],
  );
  assert.equal(rows[0]?.kind, 'argument', 'the arguments of the call are the first rows');
  assert.equal(rows[0]?.insert, 'src = ', 'accepting a label leaves the caret at the value');
});

test('a label already written is not offered again', () => {
  const source = `${HEAD}plot(close, "C", color = aqua, `;
  const offered = complete(source, source.length)
    .filter((one) => one.kind === 'argument')
    .map((one) => one.label);
  assert.ok(offered.includes('width'));
  assert.ok(!offered.includes('color'), 'a label written once is not written twice');
});

test('a call whose callee the language does not have offers no arguments', () => {
  const source = `${HEAD}notACall(`;
  assert.deepEqual(
    complete(source, source.length).filter((one) => one.kind === 'argument'),
    [],
  );
});

test('a reserved word is not offered, and the gap is the recorded one', () => {
  // Not an oversight and recorded in spec/editor-narrowings.json. The words are
  // a closed table the core exports, so offering them would cost nothing and
  // drift nothing; deciding where one may be written is the part that needs the
  // grammar, and a list that offered every keyword at every position is noise a
  // writer learns to dismiss.
  const offered = new Set(labels(HEAD));
  const found = RESERVED_WORDS.filter((word) => offered.has(word));
  assert.deepEqual(found, [], 'a reserved word in the completion list');
});

// ---------------------------------------------------------------------------
// A planned call
// ---------------------------------------------------------------------------

test('a planned call is offered, marked, and sorted after everything else', () => {
  // Catches both wrong answers at once: leaving a planned name out, which sends
  // the writer to the documentation to find out why their name is missing, and
  // offering it unmarked, which walks them into OS2020.
  const rows = complete(HEAD, HEAD.length);
  const planned = rows.filter((one) => one.planned);
  assert.ok(planned.length > 0, 'the library names calls it has not implemented');

  const first = rows.findIndex((one) => one.planned);
  assert.ok(
    rows.slice(first).every((one) => one.planned),
    'every planned row is after every row a script may write today',
  );
});

test('a planned row carries the catalogue\'s own refusal for that name', () => {
  // Catches a sentence typed into the editor tier. The words a writer reads here
  // are the words the compiler would produce, because they came from the same
  // catalogue entry.
  const row = complete(HEAD, HEAD.length).find((one) => one.label === 'kama');
  assert.ok(row?.planned);
  assert.equal(row?.refusal, fillTemplate(entryFor('OS2020').message, { name: 'kama' }));
  assert.ok(libraryEntries('kama')[0]?.planned, 'kama is the library\'s planned name, not ours');
});

test('a row a script may write today carries no refusal', () => {
  assert.equal(complete(HEAD, HEAD.length).find((one) => one.label === 'ema')?.refusal, undefined);
});

// ---------------------------------------------------------------------------
// The word being replaced
// ---------------------------------------------------------------------------

test('the replaced span is the word being typed', () => {
  // Catches the version that returns an insertion point at the cursor: the host
  // then inserts `ema` after `em` and the writer gets `emema`.
  const source = `${HEAD}x = em`;
  const row = complete(source, source.length)[0];
  assert.equal(row?.replace.offset, source.length - 2);
  assert.equal(row?.replace.length, 2);
  assert.equal(row?.replace.line, 3);
  assert.equal(row?.replace.column, 5);
});

test('a cursor on a space replaces nothing', () => {
  const source = `${HEAD}x = `;
  const row = complete(source, source.length)[0];
  assert.equal(row?.replace.offset, source.length);
  assert.equal(row?.replace.length, 0);
});

test('the word is matched exactly, because names are case sensitive', () => {
  // Catches a case insensitive match, which would offer `ema` for `EM` and put a
  // name that does not compile in front of somebody.
  assert.deepEqual(labels(`${HEAD}x = EM`), []);
  assert.ok(labels(`${HEAD}x = em`).includes('ema'));
});

// ---------------------------------------------------------------------------
// A file that is not a program
// ---------------------------------------------------------------------------

test('every offset of every malformed file answers with spans inside the file', () => {
  for (const source of MALFORMED) {
    const normalised = normaliseSource(source);
    for (let offset = 0; offset <= normalised.length; offset += 1) {
      for (const row of complete(source, offset)) {
        assert.ok(row.replace.offset >= 0, JSON.stringify(source));
        assert.ok(
          row.replace.offset + row.replace.length <= normalised.length,
          `${JSON.stringify(source)} at ${offset}: a span past the end of the file`,
        );
        assert.ok(row.label.length > 0, 'an empty row');
      }
    }
  }
});

test('an offset outside the file is answered rather than thrown at', () => {
  assert.ok(complete(HEAD, -5).length > 0);
  assert.ok(complete(HEAD, HEAD.length + 100).length > 0);
});
