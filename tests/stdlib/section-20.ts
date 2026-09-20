/**
 * The figures `stdlib.md` section 20 prints, read out of the page.
 *
 * Section 20 is the manifest a second engine implements from, and the round
 * that wrote this found three sentences there that fixed nothing and two more
 * whose quantifier was wrong. Every one of them had been true of something once
 * and was measured by nobody since, which is the only way a sentence in a
 * normative document goes wrong.
 *
 * So the numbers now beside those refusals are not asserted against a constant
 * typed twice. They are read from the page and compared with the arithmetic run
 * here, which is the shape `tests/gate/gaps.test.ts` already uses for 20.11's
 * table: the document is the input, so rewording the claim, moving the figure or
 * changing the population fails a test instead of going on being quoted.
 *
 * A sentence this cannot find is a failure, not a skip. A figure nothing reads
 * is exactly what these tests exist to stop existing.
 */
import { readFileSync } from 'node:fs';

/** The specification page, from the source tree rather than from the build. */
const PAGE = new URL('../../../spec/stdlib.md', import.meta.url);

let held: string | undefined;

function page(): string {
  if (held === undefined) held = readFileSync(PAGE, 'utf8').replace(/\r\n/g, '\n');
  return held;
}

/**
 * The numbers one sentence of section 20 prints, in the order it prints them.
 *
 * `pattern` is matched against the page with its line breaks turned into spaces,
 * because a claim that sits across two lines is one sentence to a reader and the
 * wrapping is not a fact about it.
 */
export function figuresIn(pattern: RegExp, howMany: number): readonly number[] {
  const flat = page().replace(/\n/g, ' ');
  // A pattern loose enough to match two sentences would read one entry's figures
  // and assert them against another entry's arithmetic, which is how the first
  // draft of this file passed the wrong numbers to the wrong test. Ambiguity is
  // refused by name rather than resolved by taking the first one.
  const everywhere = [...flat.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))];
  if (everywhere.length > 1) {
    throw new Error(
      `${pattern} matches ${everywhere.length} sentences of stdlib.md, so which figures it reads ` +
        'is decided by whichever comes first. Narrow it to the one claim it is about.',
    );
  }
  const found = pattern.exec(flat);
  if (found === null) {
    throw new Error(
      `stdlib.md prints no sentence matching ${pattern}. Either the claim was reworded, in ` +
        'which case measure it again and bring this pattern with it, or it is gone, in which ' +
        'case this test goes with it. A figure nothing reads is what section 20 keeps going ' +
        'wrong by.',
    );
  }
  const numbers = found.slice(1, howMany + 1).map(Number);
  if (numbers.length !== howMany || numbers.some((one) => !Number.isFinite(one))) {
    throw new Error(`${pattern} matched and did not yield ${howMany} numbers: ${found[0]}`);
  }
  return numbers;
}

/** How many of two runs over the same arguments disagree, bit for bit. */
export function differing(
  count: number,
  one: (x: number) => number,
  other: (x: number) => number,
  at: (index: number) => number,
): number {
  let found = 0;
  for (let index = 0; index < count; index += 1) {
    const x = at(index);
    if (!Object.is(one(x), other(x))) found += 1;
  }
  return found;
}

/** How many of two runs over the same windows disagree, bit for bit. */
export function differingOver<T>(
  cases: readonly T[],
  one: (held: T) => number,
  other: (held: T) => number,
): number {
  let found = 0;
  for (const held of cases) {
    if (!Object.is(one(held), other(held))) found += 1;
  }
  return found;
}

/**
 * Every binade of the double range, in both signs, the subnormals included.
 *
 * A claim that two spellings of one step can never differ is a claim about the
 * whole range rather than about the numbers a chart happens to hold, so the
 * population it is measured over has to reach the ends: an exponent sweep that
 * stops at the smallest normal would miss exactly the place 20.1's own edge
 * case lives.
 *
 * **Every binade also carries a full length mantissa**, because the short ones
 * are the trap. A sweep of 1, 1.5 and 1.75 at every exponent is a sweep of
 * values whose products with a small whole number are all exact, so it would
 * report no difference for an arrangement that is wrong as readily as for one
 * that cannot be: the test using this asserts a known difference over the same
 * population for that reason.
 */
export function everyBinade(): readonly number[] {
  let state = 3_141_592_653 >>> 0;
  const draw = (): number => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
  // Two draws, because one is 32 bits and a binary64 mantissa is 52: a value
  // whose low twenty bits are zero multiplies by a small whole number exactly,
  // and a population of those cannot show a rounding difference at all.
  const mantissa = (): number => 1 + draw() / 2 ** 32 + draw() / 2 ** 64;
  const out: number[] = [];
  for (let exponent = -1074; exponent <= 1023; exponent += 1) {
    const base = 2 ** exponent;
    for (const held of [1, 1.5, 1.75, 1.9999999999999998, mantissa(), mantissa()]) {
      const value = base * held;
      if (!Number.isFinite(value) || value === 0) continue;
      out.push(value, -value);
    }
  }
  return out;
}

/**
 * Four bar windows of ordinary price shaped values.
 *
 * The other half of the same question. An arrangement that only parts company
 * on values no instrument has is a constraint an implementer can ignore, so a
 * refusal in section 20 is measured over values a bar actually carries: a price
 * somewhere between a hundredth and ten thousand, and four of them within a
 * percent of each other, which is what a four bar window of one instrument
 * looks like. The generator is a plain xorshift so that every machine and every
 * run counts the same windows.
 */
/**
 * A price walk of `count` bars, for the claims that are about a history rather
 * than about a window.
 *
 * 20.2.1 refuses a carried total, and what is wrong with one only appears over
 * a long run of bars: the drift grows with the history, so a fixture of eighty
 * bars would report a difference too small to distinguish from the ordinary
 * one. Each bar moves by up to a percent from the one before it, which is what
 * a minute of an instrument looks like, and the generator is a plain xorshift
 * so that every machine and every run walks the same prices.
 */
export function walk(count: number): readonly number[] {
  let state = 1_103_515_245 >>> 0;
  const draw = (): number => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
  // Two draws again, for the reason `everyBinade` gives: a price whose low
  // twenty bits are zero adds exactly to its neighbours, and a population of
  // those cannot show an accumulation difference at all.
  const next = (): number => draw() / 2 ** 32 + draw() / 2 ** 64;
  const out: number[] = [];
  let price = 100 * (1 + next());
  for (let index = 0; index < count; index += 1) {
    price = price * (1 + (next() - 0.5) / 50);
    out.push(price);
  }
  return out;
}

export function priceWindows(count: number): readonly (readonly number[])[] {
  let state = 2_166_136_261 >>> 0;
  const next = (): number => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4_294_967_296;
  };
  const out: number[][] = [];
  for (let index = 0; index < count; index += 1) {
    const base = 10 ** (Math.floor(next() * 7) - 2) * (1 + next());
    out.push([0, 1, 2, 3].map(() => base * (1 + (next() - 0.5) / 50)));
  }
  return out;
}
