/**
 * The canonical encoding and the two hashes taken over it.
 *
 * These exist so that a hash of a program means something: a host records both
 * against a chart, a backtest run and a live process, which is what makes a
 * result reproducible months later (`compiled-program.md` 2.14). A rule that is
 * almost followed produces a hash that is almost right, which is a hash nobody
 * can use, so each rule is tested on its own.
 *
 * The SHA-256 vectors are the published ones from FIPS 180-4 and its test
 * suite, not values this implementation produced. An implementation tested
 * against its own output is a checksum of itself.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalString,
  canonicalise,
  programHash,
  sha256,
  sourceHash,
  utf8,
} from '../../src/core/emit/index.js';
import { compileTarget, emittedTargets } from './support.js';

test('sha256 agrees with the published vectors', () => {
  assert.equal(sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(
    sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  );
  assert.equal(
    sha256(
      'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmno' +
        'ijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
    ),
    'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
  );
  assert.equal(
    sha256('a'.repeat(1_000_000)),
    'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
  );
});

/**
 * Catches a hash taken over code units instead of UTF-8 bytes.
 *
 * The two vectors below were produced by an independent implementation, so a
 * hash this one computes over the wrong bytes has nothing to agree with.
 */
test('the hash is taken over UTF-8 bytes, including outside the basic plane', () => {
  assert.deepEqual([...utf8('a')], [0x61]);
  assert.deepEqual([...utf8('\u00e9')], [0xc3, 0xa9]);
  assert.deepEqual([...utf8('\u20ac')], [0xe2, 0x82, 0xac]);
  assert.deepEqual([...utf8('\u{1d11e}')], [0xf0, 0x9d, 0x84, 0x9e]);

  assert.equal(
    sha256('\u00e9'),
    '4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c',
  );
  assert.equal(
    sha256('\u20ac\u{1d11e}'),
    'ab10577d1090ab893eedee6e43a8ae150132ddb080eab2f618d96b815334f926',
  );
});

// How a number is written is `language.md` 5.5, and `number-text.test.ts`
// holds the writer to `spec/vectors/number-text.json` in both directions. It
// is not asserted a second time here, because two lists of the same facts
// drift.

test('a string escapes what it must and nothing else', () => {
  assert.equal(canonicalString('plain'), '"plain"');
  assert.equal(canonicalString('a"b'), '"a\\"b"');
  assert.equal(canonicalString('a\\b'), '"a\\\\b"');
  assert.equal(canonicalString('a\nb'), '"a\\nb"');
  assert.equal(canonicalString('a\rb'), '"a\\rb"');
  assert.equal(canonicalString('a\tb'), '"a\\tb"');
  assert.equal(canonicalString('a\u0001b'), '"a\\u0001b"');
  // A forward slash and a non-ASCII character are not escaped.
  assert.equal(canonicalString('a/b'), '"a/b"');
  assert.equal(canonicalString('é'), '"é"');
});

/** Catches an encoder that writes keys in the order the document lists them. */
test('object keys are sorted and no whitespace separates anything', () => {
  assert.equal(canonicalise({ b: 1, a: 2, A: 3 }), '{"A":3,"a":2,"b":1}');
  assert.equal(canonicalise([1, 2, { z: null, a: true }]), '[1,2,{"a":true,"z":null}]');
  assert.ok(!/\s/.test(canonicalise({ a: [1, 2], b: 'x y' }).replace('x y', 'xy')));
});

test('a program encodes and reads back as the same program', () => {
  for (const one of emittedTargets()) {
    const text = canonicalise(one.program);
    assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(one.program)), one.name);
    assert.ok(!/[\n\t]/.test(text), `${one.name}: whitespace in the canonical form`);
  }
});

/**
 * Catches a compiler that is not a function of its input.
 *
 * Two runs over the same source must produce the same program, or the hash a
 * host recorded against a run means nothing the next time anybody asks.
 */
test('the same source compiles to the same program twice, hash and all', () => {
  for (const one of emittedTargets()) {
    const again = compileTarget(one.name);
    assert.ok(again.program !== undefined, one.name);
    const before = one.program;
    assert.ok(before !== undefined, one.name);
    assert.equal(canonicalise(again.program), canonicalise(before), one.name);
    assert.equal(programHash(again.program), programHash(before), one.name);
  }
});

test('the source hash names the source and the program hash names the program', () => {
  const one = emittedTargets()[0];
  assert.ok(one !== undefined && one.program !== undefined);
  assert.equal(one.program.source.hash, sourceHash(one.file.text));
  assert.ok(one.program.source.hash.startsWith('sha256:'));
  assert.equal(one.program.source.hash.length, 'sha256:'.length + 64);
  assert.notEqual(programHash(one.program), one.program.source.hash);
});
