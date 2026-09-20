/**
 * `diagnose`, which is what a trader sees while they type.
 *
 * Nothing here asserts a message. A code is a promise and wording is allowed to
 * improve, so the assertions are codes, spans, and where the sentences came
 * from. Every test names the wrong implementation it exists to catch.
 *
 * Nothing here asserts a duration either. What this costs is a number, it is in
 * the benchmark suite with a budget, and a test that said "under so many
 * milliseconds" would fail on a busy machine and teach people to rerun the suite
 * until it passed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DiagnosticBag,
  check,
  entryFor,
  fillTemplate,
  isDiagnosticCode,
  isError,
  lex,
  parseTokens,
  sourceFile,
} from '../../src/core/index.js';
import { diagnose } from '../../src/editor/index.js';
import { CORPUS, MALFORMED } from './support.js';

/** Each diagnostic as `code@line:column+length`, which is the code and the span. */
function found(source: string): readonly string[] {
  return diagnose(source).map(
    (one) => `${one.code}@${one.span.line}:${one.span.column}+${one.span.length}`,
  );
}

/** Everything the front end says without the emitter, which is what an editor is tempted to run. */
function withoutEmit(source: string): readonly string[] {
  const file = sourceFile('t.oscript', source);
  const bag = new DiagnosticBag();
  check(file, parseTokens(file, lex(file, bag), bag), bag);
  return bag.ordered().map((one) => one.code);
}

/** A file whose only fault is one the emitter is the first to find. */
const EMITTER_ONLY =
  'version 1\nstudy("a")\nsym = text(close)\nx = req.symbol(sym, "60", close, mode = "confirmed")\nplot(x)\n';

// ---------------------------------------------------------------------------
// It is the whole compile
// ---------------------------------------------------------------------------

test('a diagnostic the emitter is the first to raise is reported', () => {
  // Catches the editor that stops after the checker, which is the natural place
  // to stop: the tree has been checked, so what else is there. A trader would
  // see a clean file and then have their apply refused, with a code the panel
  // beside them never mentioned.
  assert.equal(withoutEmit(EMITTER_ONLY).includes('OS3003'), false, 'the checker does not find it');
  assert.ok(found(EMITTER_ONLY).includes('OS3003@4:16+3'), 'and diagnose does');
});

test('every script in the repository is clean, and every one of them is checked', () => {
  // Catches a pipeline wired wrongly enough to report on correct files, and a
  // corpus that quietly stopped being read.
  for (const script of CORPUS) {
    const errors = diagnose(script.text).filter(isError);
    assert.deepEqual(errors.map((one) => one.code), [], script.name);
  }
  assert.ok(CORPUS.length >= 100, 'the corpus is the repository, not a sample of it');
});

test('the diagnostics come back in the order a reader walks the file', () => {
  // Catches the order the stages report in, which is lexical errors first and a
  // checker warning about line 2 after a parse error about line 40. A panel
  // listing them in that order sends a reader up and down their file.
  const source = 'version 1\nstudy("a")\nx = ema(close,\ny = 1 ; z = 2\n';
  const offsets = diagnose(source).map((one) => one.span.offset);
  assert.deepEqual([...offsets].sort((a, b) => a - b), offsets);
  assert.ok(offsets.length > 1, 'and there is more than one to order');
});

// ---------------------------------------------------------------------------
// Where the sentences come from
// ---------------------------------------------------------------------------

test('every diagnostic carries the catalogue entry for its code', () => {
  // Catches the editor writing its own sentences, which is the drift this whole
  // tier exists to prevent: the panel and the documentation page would then say
  // different things about the same code, and the panel is the one being read
  // at the moment somebody is stuck.
  for (const source of MALFORMED) {
    for (const one of diagnose(source)) {
      assert.equal(isDiagnosticCode(one.code), true, one.code);
      const entry = entryFor(one.code);
      assert.equal(one.message, fillTemplate(entry.message, one.values), one.code);
      assert.equal(one.fix, fillTemplate(entry.fix, one.values), one.code);
      assert.equal(one.severity, entry.severity, one.code);
      assert.equal(one.stage, entry.stage, one.code);
      assert.equal(one.autofix, entry.autofix, one.code);
    }
  }
});

test('a fix is offered for every diagnostic, and it is not the message again', () => {
  // Catches an entry whose fix restates the problem. The panel puts the fix
  // under a button, and a button that says what is wrong rather than what to do
  // is a button nobody presses twice.
  let seen = 0;
  for (const source of MALFORMED) {
    for (const one of diagnose(source)) {
      assert.ok(one.fix.length > 0, one.code);
      assert.notEqual(one.fix, one.message, one.code);
      seen += 1;
    }
  }
  assert.ok(seen > 20, 'the malformed corpus produced diagnostics to look at');
});

// ---------------------------------------------------------------------------
// A source that does not parse
// ---------------------------------------------------------------------------

test('text that is not a program answers rather than throwing', () => {
  // Catches every version of this that assumes a tree. A file being typed into
  // is malformed most of the time, and an editor that throws on one is an editor
  // whose error panel goes blank exactly when it is needed.
  for (const source of MALFORMED) {
    const reported = diagnose(source);
    for (const one of reported) {
      assert.ok(one.span.offset >= 0, JSON.stringify(source));
      assert.ok(one.span.offset + one.span.length <= source.length + 1, JSON.stringify(source));
      assert.ok(one.span.line >= 1 && one.span.column >= 1, JSON.stringify(source));
    }
  }
});

test('a half typed call is reported on its own line and the lines above it are not', () => {
  // Catches a parser recovery that gives up at the first mistake: the file below
  // the half typed line would go unchecked, so a trader would fix one thing at a
  // time and rediscover the rest of their mistakes one compile apart.
  const source = 'version 1\nstudy("a")\nlen = inupt(14)\nx = ema(close,\n';
  const codes = diagnose(source).map((one) => one.code);
  assert.ok(codes.includes('OS2001'), 'the misspelled name above is still found');
  assert.ok(codes.includes('OS1022'), 'and the unfinished call is reported');
});

test('an empty file is a file, not an exception', () => {
  // Catches a pipeline that indexes the first token or the first statement. A
  // new script is empty for as long as it takes to type the first character.
  const codes = diagnose('').map((one) => one.code);
  assert.ok(codes.includes('OS2007'), 'it has no declaration, which is what is wrong with it');
});
