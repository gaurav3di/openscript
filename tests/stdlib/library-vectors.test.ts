/**
 * The library vectors under `spec/vectors/library/`, held to the reference
 * the gate already compares this library against.
 *
 * `scripts/check-library-vectors.mjs` proves the committed vectors are what
 * this engine produces. That is a check against ourselves. What it cannot
 * prove is that the bit patterns mean what the page that teaches them says,
 * or that the generator drove the right function over the right fixture: a
 * generator that wrote every number little-endian, or fed the open in place of
 * the close, or swapped two output columns, would regenerate to the same wrong
 * bytes on every machine and pass that check for ever.
 *
 * So the vectors are decoded here by the recipe `docs/integrating/library-vectors.md`
 * gives an implementer, independently of the generator, and compared bit for
 * bit with `vectors.ts`, whose expected values came from a reference written
 * outside this library. A vector that decodes to the reference was encoded the
 * way the page says, from the function the file names, over the fixture the
 * index names.
 *
 * The third test holds the gap marking to the table it is derived from, by
 * the same reading `gaps.test.ts` uses, in both directions: a case whose call
 * reaches a gap is marked, and one whose call does not is not, including the
 * case of `ma` that reaches a gap through a string rather than a name.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import type { Value } from '../../src/core/stdlib/index.js';
import { gapRows, gapsSection } from '../gate/gaps-derivation.js';
import { assertSame, firstValueAt } from './support.js';
import {
  BARS,
  BB_BASIS,
  BB_LOWER,
  BB_UPPER,
  EMA_20,
  MACD_HISTOGRAM,
  MACD_LINE,
  MACD_SIGNAL,
  RSI_14,
  SUPERTREND_DIRECTION,
  SUPERTREND_LINE,
} from './vectors.js';

const ROOT = new URL('../../../', import.meta.url);
const DIR = 'spec/vectors/library/';
const INDEX = `${DIR}index.json`;
const SPEC = 'spec/stdlib.md';

/** One column of a vector file, as the page describes it. */
interface Column {
  readonly name?: string;
  readonly kind: string;
  readonly values: readonly (string | boolean | null)[];
  readonly warmup?: number;
}

interface Case {
  readonly id: string;
  readonly call: string;
  readonly gaps: readonly number[];
  readonly bars: number;
  readonly bar?: Readonly<Record<string, Column>>;
  readonly args: readonly Column[];
  readonly outputs: readonly Column[];
}

interface VectorFile {
  readonly name: string;
  readonly arity: number;
  readonly params: readonly string[];
  readonly cases: readonly Case[];
}

interface IndexEntry {
  readonly name: string;
  readonly arity: number;
  readonly file: string;
  readonly gaps: readonly number[];
}

function read(path: string): string {
  return readFileSync(new URL(path, ROOT), 'utf8');
}

function fileOf(name: string): VectorFile {
  return JSON.parse(read(`${DIR}${name}`)) as VectorFile;
}

/**
 * The page's recipe, written out rather than imported: sixteen hex digits are
 * the eight bytes of a binary64, sign bit first.
 */
function decode(cell: string | boolean | null): Value {
  assert.equal(typeof cell, 'string', `a number is a hex string, and this cell is ${String(cell)}`);
  const hex = cell as string;
  assert.match(hex, /^[0-9a-f]{16}$/, `a bit pattern is sixteen lower case hex digits, not "${hex}"`);
  const view = new DataView(new ArrayBuffer(8));
  view.setUint32(0, parseInt(hex.slice(0, 8), 16));
  view.setUint32(4, parseInt(hex.slice(8), 16));
  return view.getFloat64(0);
}

function numbers(column: Column): Value[] {
  return column.values.map((cell) => (cell === null ? null : decode(cell)));
}

/** The base case of one file, which is the one over the full fixture. */
function baseCase(file: VectorFile, call: string): Case {
  const found = file.cases.find((one) => one.id === 'full-0');
  assert.notEqual(found, undefined, `${file.name}/${file.arity} has no full-0 case`);
  assert.equal((found as Case).call, call, `the base case of ${file.name} is not ${call}`);
  return found as Case;
}

const index = JSON.parse(read(INDEX)) as { functions: readonly IndexEntry[] };

// Catches: an index whose entries point at files that are not there, a file
// whose columns are not all the case's length, and a warmup written from some
// other column than the one it sits beside.
test('every function the index names has a file whose cases are rectangular', () => {
  assert.notEqual(index.functions.length, 0, `${INDEX} names no function, so this test read nothing`);
  for (const entry of index.functions) {
    assert.ok(existsSync(new URL(`${DIR}${entry.file}`, ROOT)), `${INDEX} names ${entry.file}, which is not there`);
    const file = fileOf(entry.file);
    assert.equal(file.name, entry.name, `${entry.file} is not about ${entry.name}`);
    assert.equal(file.arity, entry.arity, `${entry.file} is not the ${entry.arity} argument form`);
    assert.notEqual(file.cases.length, 0, `${entry.file} holds no case`);
    const reached = new Set<number>();
    for (const one of file.cases) {
      const what = `${entry.file} ${one.id}`;
      assert.equal(one.args.length, file.params.length, `${what}: one column per parameter`);
      for (const column of [...one.args, ...one.outputs, ...Object.values(one.bar ?? {})]) {
        assert.equal(column.values.length, one.bars, `${what}: every column is ${one.bars} long`);
      }
      assert.notEqual(one.outputs.length, 0, `${what}: no output column`);
      for (const output of one.outputs) {
        const present = output.values.findIndex((cell) => cell !== null);
        assert.equal(output.warmup, present, `${what}: the warmup is the first present bar`);
      }
      for (const gap of one.gaps) reached.add(gap);
    }
    assert.deepEqual([...reached].sort(), [...entry.gaps], `${INDEX}: ${entry.name}'s gaps are the union of its cases'`);
  }
});

// Catches: an encoding that is not the page's (little-endian, or a float32),
// a generator that fed some other series than the close, a file that names one
// function and holds another, and two output columns written in the wrong
// order. Each of those regenerates to the same bytes on every machine and
// passes the byte comparison for ever.
test('the base cases decode, by the page recipe, to the reference vectors the gate holds', () => {
  const close = BARS.map((bar) => bar.close);

  const ema = baseCase(fileOf('ema-2.json'), 'ema(src, 20)');
  assertSame(numbers(ema.args[0] as Column), close, 'ema src');
  assertSame(numbers(ema.outputs[0] as Column), EMA_20, 'ema(close, 20)');
  assert.equal(ema.outputs[0]?.warmup, firstValueAt(EMA_20));

  const rsi = baseCase(fileOf('rsi-2.json'), 'rsi(src, 14)');
  assertSame(numbers(rsi.outputs[0] as Column), RSI_14, 'rsi(close, 14)');

  const macd = baseCase(fileOf('macd-4.json'), 'macd(src, 12, 26, 9)');
  assertSame(numbers(macd.outputs[0] as Column), MACD_LINE, 'macd line');
  assertSame(numbers(macd.outputs[1] as Column), MACD_SIGNAL, 'macd signal');
  assertSame(numbers(macd.outputs[2] as Column), MACD_HISTOGRAM, 'macd histogram');

  const bands = baseCase(fileOf('bollinger-3.json'), 'bollinger(src, 20, 2)');
  assertSame(numbers(bands.outputs[0] as Column), BB_BASIS, 'bollinger basis');
  assertSame(numbers(bands.outputs[1] as Column), BB_UPPER, 'bollinger upper');
  assertSame(numbers(bands.outputs[2] as Column), BB_LOWER, 'bollinger lower');

  const trend = baseCase(fileOf('supertrend-2.json'), 'supertrend(3, 10)');
  const facts = trend.bar ?? {};
  assertSame(numbers(facts.high as Column), BARS.map((bar) => bar.high), 'supertrend bar.high');
  assertSame(numbers(facts.low as Column), BARS.map((bar) => bar.low), 'supertrend bar.low');
  assertSame(numbers(facts.close as Column), close, 'supertrend bar.close');
  assertSame(
    numbers(facts.previousClose as Column),
    close.map((_value, at) => (at === 0 ? null : (close[at - 1] as number))),
    'supertrend bar.previousClose',
  );
  assertSame(numbers(trend.outputs[0] as Column), SUPERTREND_LINE, 'supertrend line');
  assertSame(numbers(trend.outputs[1] as Column), SUPERTREND_DIRECTION, 'supertrend direction');
});

// Catches: a generator that marks nothing, one that marks every case of a
// function whose name is never in the table, and one that marks by the
// function's name alone and so misses an average selected by a string, which
// the table and the harvest both count as reaching the gap.
test('a case is marked with exactly the gaps section 20.11 says its call reaches', () => {
  const section = gapsSection(read(SPEC));
  assert.notEqual(section, null, `${SPEC} holds no section 20.11`);
  const rows = gapRows(section as string);
  const reaching = new Map(rows.map((row) => [row.gap, new Set(row.names)]));
  const byName = new Set(rows.flatMap((row) => row.names));
  assert.notEqual(byName.size, 0, 'the table names nothing, so this test could mark nothing');

  let named = 0;
  let clear = 0;
  for (const entry of index.functions) {
    for (const one of fileOf(entry.file).cases) {
      const expected = rows
        .filter((row) => (reaching.get(row.gap) as Set<string>).has(entry.name))
        .map((row) => row.gap);
      if (byName.has(entry.name)) named += 1;
      else if (!one.call.includes('"')) clear += 1;
      if (!one.call.includes('"')) {
        assert.deepEqual([...one.gaps], expected, `${entry.file} ${one.id}: ${one.call}`);
      }
    }
  }
  assert.notEqual(named, 0, 'no case called a name the table lists, so the marking was never exercised');
  assert.notEqual(clear, 0, 'no case was clear of the table, so an over-marking generator would pass');

  const ma = fileOf('ma-3.json');
  const strings = ma.cases.filter((one) => one.call.includes('"'));
  assert.notEqual(strings.length, 0, 'ma has no case that selects a type by name');
  for (const one of strings) {
    const selected = (one.call.match(/"([a-z]+)"/) as RegExpMatchArray)[1] as string;
    const expected = rows.filter((row) => row.names.includes(selected)).map((row) => row.gap);
    assert.deepEqual([...one.gaps], expected, `ma ${one.id}: ${one.call} reaches ${expected.join(', ') || 'no gap'}`);
  }
  assert.ok(
    strings.some((one) => one.gaps.length > 0) && strings.some((one) => one.gaps.length === 0),
    'ma needs one type that reaches a gap and one that does not, or this proves nothing about strings',
  );
});
